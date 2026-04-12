/**
 * useRealtimeSync — 云同步降级 hook（本地优先 + 尽力同步）
 *
 * 功能：
 * 1. 登录后按需从云端拉取最新 workspace 快照
 * 2. 网络恢复时自动重试，避免阻塞本地使用
 * 3. 订阅 Supabase Realtime postgres_changes，实现推送驱动同步
 * 4. 定时轮询（90s）作为 Realtime 不可用时的降级备份
 * 5. 暴露同步状态（idle / syncing / synced / offline / error）
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
}

const POLL_INTERVAL_MS = 90_000

export const useRealtimeSync = ({
  userId,
  onRemoteUpdate,
}: UseRealtimeSyncOptions): UseRealtimeSyncReturn => {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)
  const deviceId = useRef(getDeviceId())
  const onRemoteUpdateRef = useRef(onRemoteUpdate)
  onRemoteUpdateRef.current = onRemoteUpdate

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

  useEffect(() => {
    // supabase 实例在 isSupabaseEnabled() 为 true 时保证非 null，
    // 用局部变量承接以满足 TypeScript 的 narrowing
    if (!isSupabaseEnabled() || !supabase || !userId) {
      setSyncStatus('idle')
      return
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setSyncStatus('offline')
      return
    }

    const client = supabase // 局部引用，供 cleanup 闭包安全使用

    // 初始全量拉取
    void forceSync()

    // ── Supabase Realtime 订阅（推送驱动，主路径）──────────────────────
    // 仅监听 UPDATE 事件（INSERT 由首次 forceSync 覆盖）。
    // filter 限定当前 user_id，避免接收无关行的通知。
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
        (payload) => {
          const row = payload.new
          // 忽略本设备自身写入触发的通知，防止回环
          if (row.device_id === deviceId.current) return
          // last-write-wins：直接将远端最新行传给上层 merge 逻辑（复用现有策略）
          onRemoteUpdateRef.current(row.state_json as Partial<PersistedState>)
          setLastSyncedAt(new Date())
          setSyncStatus('synced')
        },
      )
      .subscribe()

    // ── 90s 轮询（降级备份：Realtime 断连时保障同步）────────────────────
    const timer = window.setInterval(() => {
      if (navigator.onLine) {
        void forceSync()
      }
    }, POLL_INTERVAL_MS)

    return () => {
      window.clearInterval(timer)
      void client.removeChannel(channel)
    }
  }, [userId, forceSync])

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

  return { syncStatus, lastSyncedAt, forceSync }
}
