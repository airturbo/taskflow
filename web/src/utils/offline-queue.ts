/**
 * OfflineQueue — 离线操作队列
 *
 * 断网时，saveState 的云端请求会进入队列持久化到 localStorage。
 * 网络恢复时自动 flush，保证数据最终一致。
 *
 * 设计原则：
 * - 按 taskId 去重：同一任务多次更新只保留最新一条（Map 后写覆盖前写）
 * - 整体 state 快照走 "meta" 键，独立于任务级别更新
 * - flush 失败时保留队列，下次网络恢复再试
 * - 队列数据使用独立 key，不污染主 state
 */
import type { PersistedState } from '../types/domain'
import { supabase } from './supabase'
import { getDeviceId, SCHEMA_VERSION_CONST } from './sync-shared'

const QUEUE_KEY = 'taskflow-offline-queue'
const MAX_QUEUE_SIZE = 500
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

interface QueueEntry {
  userId: string
  state: PersistedState
  enqueuedAt: string
  /** 按 taskId 去重的增量更新时间戳（taskId → ISO string），用于决策哪条记录最新 */
  taskTimestamps?: Record<string, string>
}

/** 将状态加入离线队列。
 *
 * 若队列中已存在同一 userId 的记录，则合并：
 * - 任务级别：以 updatedAt 较新者为准（per-taskId 去重）
 * - 其他顶层字段（lists/tags/folders 等）：后写覆盖
 */
export const enqueueOfflineState = (userId: string, state: PersistedState): void => {
  if (typeof window === 'undefined') return
  try {
    const existing = window.localStorage.getItem(QUEUE_KEY)
    let merged: QueueEntry

    if (existing) {
      const prev = JSON.parse(existing) as QueueEntry
      if (prev.userId === userId) {
        // 按 taskId 去重：保留 updatedAt 较新的任务
        const prevTaskMap: Record<string, (typeof state.tasks)[number]> = {}
        for (const t of prev.state.tasks ?? []) {
          prevTaskMap[t.id] = t
        }
        const nextTaskMap: Record<string, (typeof state.tasks)[number]> = {}
        for (const t of state.tasks ?? []) {
          nextTaskMap[t.id] = t
        }

        // Merge: for each taskId keep the entry with the newer updatedAt
        const mergedTasks: (typeof state.tasks)[number][] = []
        const allIds = new Set([...Object.keys(prevTaskMap), ...Object.keys(nextTaskMap)])
        for (const id of allIds) {
          const p = prevTaskMap[id]
          const n = nextTaskMap[id]
          if (!p) {
            mergedTasks.push(n)
          } else if (!n) {
            mergedTasks.push(p)
          } else {
            // Compare updatedAt (ISO strings compare lexicographically)
            mergedTasks.push((n.updatedAt ?? '') >= (p.updatedAt ?? '') ? n : p)
          }
        }

        // Capacity enforcement: keep newest MAX_QUEUE_SIZE tasks
        if (mergedTasks.length > MAX_QUEUE_SIZE) {
          mergedTasks.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
          mergedTasks.length = MAX_QUEUE_SIZE
        }

        merged = {
          userId,
          state: {
            ...prev.state,
            // Non-task fields: newer state wins
            ...state,
            tasks: mergedTasks,
          },
          enqueuedAt: new Date().toISOString(),
        }
      } else {
        // Different user — overwrite
        merged = { userId, state, enqueuedAt: new Date().toISOString() }
      }
    } else {
      merged = { userId, state, enqueuedAt: new Date().toISOString() }
    }

    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(merged))
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

    // Expiry check: discard queue if too old
    const ageMs = Date.now() - new Date(entry.enqueuedAt).getTime()
    if (ageMs > MAX_AGE_MS) {
      window.localStorage.removeItem(QUEUE_KEY)
      return true // expired, treat as flushed
    }

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

/** Get queue metadata for diagnostics */
export const getQueueStats = (): { size: number; ageMs: number } | null => {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(QUEUE_KEY)
  if (!raw) return null
  try {
    const entry = JSON.parse(raw) as QueueEntry
    return {
      size: entry.state.tasks?.length ?? 0,
      ageMs: Date.now() - new Date(entry.enqueuedAt).getTime(),
    }
  } catch { return null }
}
