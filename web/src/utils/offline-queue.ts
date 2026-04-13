/**
 * OfflineQueue — 离线操作队列 (PERF-03: IndexedDB + 指数退避重试)
 *
 * 升级说明：
 * - 存储从 localStorage 迁移到 IndexedDB（容量更大，不阻塞主线程）
 * - 自动从旧版 localStorage 迁移数据（首次运行时一次性）
 * - flush 失败时使用指数退避重试（base=2s, factor=2, max=5min）
 * - 队列条目包含 retryCount 和 nextRetryAt，支持跨页面会话持久重试
 *
 * 设计原则：
 * - 按 taskId 去重：同一任务多次更新只保留最新一条
 * - flush 失败时保留队列并更新重试时间，下次 online 事件或主动调用再试
 * - 所有函数均为 async，调用方无需关心底层存储实现
 */
import { openDB } from 'idb'
import type { IDBPDatabase } from 'idb'
import type { PersistedState } from '../types/domain'
import { supabase } from './supabase'
import { getDeviceId, SCHEMA_VERSION_CONST } from './sync-shared'

// ── Constants ────────────────────────────────────────────────────────────────

const DB_NAME = 'taskflow-offline-db'
const DB_VERSION = 1
const STORE_NAME = 'offline-queue'

/** Legacy localStorage key — used for one-time migration */
const LEGACY_QUEUE_KEY = 'taskflow-offline-queue'

const MAX_QUEUE_SIZE = 500
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

/** Exponential backoff parameters */
const RETRY_BASE_MS = 2_000
const RETRY_FACTOR = 2
const RETRY_MAX_MS = 5 * 60 * 1000 // 5 minutes

// ── Types ────────────────────────────────────────────────────────────────────

interface QueueEntry {
  userId: string
  state: PersistedState
  enqueuedAt: string
  retryCount: number
  nextRetryAt: string | null
}

// ── DB Singleton ─────────────────────────────────────────────────────────────

let dbPromise: Promise<IDBPDatabase> | null = null

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'userId' })
        }
      },
    })
  }
  return dbPromise
}

// ── Migration: localStorage → IndexedDB ─────────────────────────────────────

async function migrateLegacyQueue(): Promise<void> {
  if (typeof window === 'undefined') return
  const raw = window.localStorage.getItem(LEGACY_QUEUE_KEY)
  if (!raw) return

  try {
    const legacy = JSON.parse(raw) as Omit<QueueEntry, 'retryCount' | 'nextRetryAt'>
    const db = await getDb()
    const existing = await db.get(STORE_NAME, legacy.userId)
    if (!existing) {
      const entry: QueueEntry = { ...legacy, retryCount: 0, nextRetryAt: null }
      await db.put(STORE_NAME, entry)
    }
    window.localStorage.removeItem(LEGACY_QUEUE_KEY)
  } catch {
    // 静默忽略：旧数据无法迁移也不影响新逻辑
  }
}

// Kick off migration eagerly (fire-and-forget)
if (typeof window !== 'undefined') {
  void migrateLegacyQueue()
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function computeNextRetryAt(retryCount: number): string {
  const delayMs = Math.min(RETRY_BASE_MS * Math.pow(RETRY_FACTOR, retryCount), RETRY_MAX_MS)
  return new Date(Date.now() + delayMs).toISOString()
}

function mergeTasks(
  prevTasks: PersistedState['tasks'],
  nextTasks: PersistedState['tasks'],
): PersistedState['tasks'] {
  const prevMap: Record<string, PersistedState['tasks'][number]> = {}
  for (const t of prevTasks ?? []) prevMap[t.id] = t

  const nextMap: Record<string, PersistedState['tasks'][number]> = {}
  for (const t of nextTasks ?? []) nextMap[t.id] = t

  const merged: PersistedState['tasks'] = []
  const allIds = new Set([...Object.keys(prevMap), ...Object.keys(nextMap)])

  for (const id of allIds) {
    const p = prevMap[id]
    const n = nextMap[id]
    if (!p) merged.push(n)
    else if (!n) merged.push(p)
    else merged.push((n.updatedAt ?? '') >= (p.updatedAt ?? '') ? n : p)
  }

  // Capacity: keep MAX_QUEUE_SIZE newest
  if (merged.length > MAX_QUEUE_SIZE) {
    merged.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
    merged.length = MAX_QUEUE_SIZE
  }

  return merged
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * 将状态加入离线队列。
 * 若队列中已存在同一 userId 的记录，则合并（任务级别按 updatedAt 去重）。
 */
export const enqueueOfflineState = async (userId: string, state: PersistedState): Promise<void> => {
  if (typeof window === 'undefined') return
  try {
    const db = await getDb()
    const existing = (await db.get(STORE_NAME, userId)) as QueueEntry | undefined

    let entry: QueueEntry
    if (existing) {
      const mergedTasks = mergeTasks(existing.state.tasks ?? [], state.tasks ?? [])
      entry = {
        userId,
        state: {
          ...existing.state,
          ...state,
          tasks: mergedTasks,
        },
        enqueuedAt: existing.enqueuedAt,
        retryCount: existing.retryCount,
        nextRetryAt: existing.nextRetryAt,
      }
    } else {
      entry = { userId, state, enqueuedAt: new Date().toISOString(), retryCount: 0, nextRetryAt: null }
    }

    await db.put(STORE_NAME, entry)
  } catch {
    // 静默忽略
  }
}

/** 检查队列是否有待 flush 的数据 */
export const hasPendingQueue = async (): Promise<boolean> => {
  if (typeof window === 'undefined') return false
  try {
    const db = await getDb()
    const count = await db.count(STORE_NAME)
    return count > 0
  } catch {
    return false
  }
}

/** flush 离线队列到 Supabase，支持指数退避重试 */
export const flushOfflineQueue = async (): Promise<boolean> => {
  if (!supabase || typeof window === 'undefined') return false
  if (!navigator.onLine) return false

  try {
    const db = await getDb()
    const all = (await db.getAll(STORE_NAME)) as QueueEntry[]
    if (all.length === 0) return true

    const entry = all[0] // single entry per user

    // 退避检查：若距离 nextRetryAt 还早，跳过本次 flush
    if (entry.nextRetryAt && new Date(entry.nextRetryAt) > new Date()) {
      return false
    }

    // 过期检查
    const ageMs = Date.now() - new Date(entry.enqueuedAt).getTime()
    if (ageMs > MAX_AGE_MS) {
      await db.delete(STORE_NAME, entry.userId)
      return true
    }

    const deviceId = getDeviceId()

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('workspace_states') as any).upsert({
        user_id: entry.userId,
        device_id: deviceId,
        state_json: JSON.parse(JSON.stringify(entry.state)),
        schema_version: SCHEMA_VERSION_CONST,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,device_id' })

      // 成功：删除队列条目
      await db.delete(STORE_NAME, entry.userId)
      return true
    } catch {
      // 失败：更新重试元数据，等待下次 flush
      const updated: QueueEntry = {
        ...entry,
        retryCount: entry.retryCount + 1,
        nextRetryAt: computeNextRetryAt(entry.retryCount),
      }
      await db.put(STORE_NAME, updated)
      return false
    }
  } catch {
    return false
  }
}

/** 清除队列（用于退出登录时清理） */
export const clearOfflineQueue = async (): Promise<void> => {
  if (typeof window === 'undefined') return
  try {
    const db = await getDb()
    await db.clear(STORE_NAME)
  } catch {
    // 静默忽略
  }
}

/** 获取队列诊断信息 */
export const getQueueStats = async (): Promise<{ size: number; ageMs: number; retryCount: number } | null> => {
  if (typeof window === 'undefined') return null
  try {
    const db = await getDb()
    const all = (await db.getAll(STORE_NAME)) as QueueEntry[]
    if (all.length === 0) return null
    const entry = all[0]
    return {
      size: entry.state.tasks?.length ?? 0,
      ageMs: Date.now() - new Date(entry.enqueuedAt).getTime(),
      retryCount: entry.retryCount,
    }
  } catch {
    return null
  }
}
