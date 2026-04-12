/**
 * useRealtimeSync — 云同步降级 hook（本地优先 + 尽力同步）
 *
 * 功能：
 * 1. 登录后按需从云端拉取最新 workspace 快照
 * 2. 网络恢复时自动重试，避免阻塞本地使用
 * 3. 订阅 Supabase Realtime postgres_changes，实现推送驱动同步
 * 4. 定时轮询（90s）作为 Realtime 不可用时的降级备份
 * 5. 暴露同步状态（idle / syncing / synced / offline / error）
 * 6. 指数退避重连（初始 1s，最大 60s，factor 2）
 * 7. 页面隐藏时暂停订阅，重新可见时恢复（节省服务端连接）
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel, RealtimePostgresUpdatePayload } from '@supabase/supabase-js'
import { supabase, isSupabaseEnabled } from '../utils/supabase'
import { getDeviceId } from '../utils/sync-shared'
import type { PersistedState } from '../types/domain'
import type { Database } from '../types/supabase'

type WorkspaceStateRow = Database['public']['Tables']['workspace_states']['Row']

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error'

interface UseRealtimeSyncOptions {
  userId: string | null
  onRemoteUpdate: (remoteState: Partial<PersistedState>) => void
}

interface UseRealtimeSyncReturn {
  syncStatus: SyncStatus
  lastSyncedAt: Date | null
  /** 手动触发一次全量拉取（用于冲突恢复） */
  forceSync: () => Promise<void>
  /** Tab 隐藏时暂停 Realtime 订阅，降低服务端连接压力 */
  pauseSync: () => void
  /** Tab 重新可见时恢复订阅并立即执行 forceSync */
  resumeSync: () => void
}

const POLL_INTERVAL_MS = 90_000
/** 指数退避重连参数 */
const RECONNECT_INITIAL_MS = 1_000
const RECONNECT_MAX_MS = 60_000
const RECONNECT_FACTOR = 2

export const useRealtimeSync = ({
  userId,
  onRemoteUpdate,
}: UseRealtimeSyncOptions): UseRealtimeSyncReturn => {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)
  const deviceId = useRef(getDeviceId())
  const onRemoteUpdateRef = useRef(onRemoteUpdate)
  onRemoteUpdateRef.current = onRemoteUpdate

  // ── Reconnect / pause state ────────────────────────────────────────────────
  const channelRef = useRef<RealtimeChannel | null>(null)
  const reconnectAttemptRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** true: 手动暂停中（Tab 隐藏），不触发自动重连 */
  const pausedRef = useRef(false)
  /** true: useEffect 已 cleanup，不再创建新连接 */
  const destroyedRef = useRef(false)

  const forceSync = useCallback(async () => {
    if (!supabase || !userId) {
      setSyncStatus('idle')
      return
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setSyncStatus('offline')
      return
    }

    setSyncStatus('syncing')

    try {
      const { data, error } = await supabase
        .from('workspace_states')
        .select('state_json, updated_at, device_id')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(10)

      if (error) {
        setSyncStatus('error')
        return
      }

      type WorkspaceRow = { device_id: string; state_json: unknown; updated_at: string }
      const rows = (data ?? []) as WorkspaceRow[]
      const remoteRows = rows.filter((row) => row.device_id !== deviceId.current)

      if (remoteRows.length > 0) {
        onRemoteUpdateRef.current(remoteRows[0].state_json as Partial<PersistedState>)
      }

      setLastSyncedAt(new Date())
      setSyncStatus('synced')
    } catch {
      setSyncStatus('error')
    }
  }, [userId])

  // ── Channel setup with backoff subscribe callback ──────────────────────────
  const setupChannel = useCallback(() => {
    if (!isSupabaseEnabled() || !supabase || !userId || pausedRef.current || destroyedRef.current) {
      return
    }
    const client = supabase

    // Remove stale channel before creating a new one
    if (channelRef.current) {
      void client.removeChannel(channelRef.current)
      channelRef.current = null
    }

    const channel: RealtimeChannel = client
      .channel('workspace-sync')
      .on<WorkspaceStateRow>(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'workspace_states',
          filter: `user_id=eq.${userId}`,
        },
        (payload: RealtimePostgresUpdatePayload<WorkspaceStateRow>) => {
          const row = payload.new
          // 忽略本设备自身写入触发的通知，防止回环
          if (row.device_id === deviceId.current) return
          onRemoteUpdateRef.current(row.state_json as Partial<PersistedState>)
          setLastSyncedAt(new Date())
          setSyncStatus('synced')
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // 连接成功，重置退避计数
          reconnectAttemptRef.current = 0
          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current)
            reconnectTimerRef.current = null
          }
          return
        }

        if (
          (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') &&
          !pausedRef.current &&
          !destroyedRef.current
        ) {
          // 已有定时器挂起则跳过（避免重复调度）
          if (reconnectTimerRef.current) return

          const attempt = reconnectAttemptRef.current
          const delay = Math.min(
            RECONNECT_INITIAL_MS * Math.pow(RECONNECT_FACTOR, attempt),
            RECONNECT_MAX_MS,
          )
          reconnectAttemptRef.current += 1
          console.debug(`[RealtimeSync] 重连 attempt=${attempt + 1} delay=${delay}ms status=${status}`)

          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null
            setupChannel()
          }, delay)
        }
      })

    channelRef.current = channel
  }, [userId])

  // ── Public pause / resume ──────────────────────────────────────────────────
  const pauseSync = useCallback(() => {
    pausedRef.current = true
    // 取消待定的重连计时
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    // 断开当前 Realtime 连接
    if (channelRef.current && supabase) {
      void supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
  }, [])

  const resumeSync = useCallback(() => {
    if (!pausedRef.current) return
    pausedRef.current = false
    reconnectAttemptRef.current = 0
    // 重建连接并立即拉取
    setupChannel()
    void forceSync()
  }, [setupChannel, forceSync])

  useEffect(() => {
    destroyedRef.current = false
    pausedRef.current = false

    if (!isSupabaseEnabled() || !supabase || !userId) {
      setSyncStatus('idle')
      return
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setSyncStatus('offline')
      return
    }

    // 初始全量拉取
    void forceSync()

    // ── Supabase Realtime 订阅（推送驱动，主路径）────────────────────────
    setupChannel()

    // ── 90s 轮询（降级备份：Realtime 断连时保障同步）──────────────────────
    const timer = window.setInterval(() => {
      if (navigator.onLine && !pausedRef.current) {
        void forceSync()
      }
    }, POLL_INTERVAL_MS)

    return () => {
      destroyedRef.current = true
      window.clearInterval(timer)
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      if (channelRef.current && supabase) {
        void supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [userId, forceSync, setupChannel])

  useEffect(() => {
    const handleOnline = () => {
      void forceSync()
    }
    const handleOffline = () => setSyncStatus('offline')

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    if (!navigator.onLine) setSyncStatus('offline')

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [forceSync])

  return { syncStatus, lastSyncedAt, forceSync, pauseSync, resumeSync }
}
