/**
 * OfflineQueue — 离线操作队列
 *
 * 断网时，saveState 的云端请求会进入队列持久化到 localStorage。
 * 网络恢复时自动 flush，保证数据最终一致。
 *
 * 设计原则：
 * - 队列只保留最新一条（后写覆盖前写），避免累积大量重复状态
 * - flush 失败时保留队列，下次网络恢复再试
 * - 队列数据使用独立 key，不污染主 state
 */
import type { PersistedState } from '../types/domain'
import { supabase } from './supabase'
import { getDeviceId, SCHEMA_VERSION_CONST } from './sync-shared'

const QUEUE_KEY = 'taskflow-offline-queue'

interface QueueEntry {
  userId: string
  state: PersistedState
  enqueuedAt: string
}

/** 将状态加入离线队列（覆盖写，只保留最新） */
export const enqueueOfflineState = (userId: string, state: PersistedState): void => {
  if (typeof window === 'undefined') return
  try {
    const entry: QueueEntry = {
      userId,
      state,
      enqueuedAt: new Date().toISOString(),
    }
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(entry))
  } catch {
    // 静默忽略
  }
}

/** 检查队列是否有待 flush 的数据 */
export const hasPendingQueue = (): boolean => {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(QUEUE_KEY) !== null
}

/** flush 离线队列到 Supabase */
export const flushOfflineQueue = async (): Promise<boolean> => {
  if (!supabase || typeof window === 'undefined') return false
  if (!navigator.onLine) return false

  const raw = window.localStorage.getItem(QUEUE_KEY)
  if (!raw) return true // 队列为空，算成功

  try {
    const entry = JSON.parse(raw) as QueueEntry
    const deviceId = getDeviceId()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('workspace_states') as any).upsert({
      user_id: entry.userId,
      device_id: deviceId,
      state_json: JSON.parse(JSON.stringify(entry.state)),
      schema_version: SCHEMA_VERSION_CONST,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,device_id' })

    // flush 成功，清除队列
    window.localStorage.removeItem(QUEUE_KEY)
    return true
  } catch {
    // flush 失败，保留队列等下次重试
    return false
  }
}

/** 清除队列（用于退出登录时清理） */
export const clearOfflineQueue = (): void => {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(QUEUE_KEY)
}
