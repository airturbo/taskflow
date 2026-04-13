/**
 * Storage Layer — 统一数据存储
 *
 * 架构原则：
 * - 离线优先：所有读写先走 localStorage，异步同步到 Supabase
 * - 渐进增强：Supabase 未配置时，纯 localStorage 运行（访客/demo 模式）
 * - 多账户隔离：STORAGE_KEY 包含 userId 前缀，多账户互不干扰
 *
 * 同步策略：
 *   write: 先写 localStorage → 异步 upsert Supabase（不阻塞 UI）
 *   read:  优先 Supabase 拉取最新 → 写 localStorage 缓存 → 返回
 *          若 Supabase 不可用，fallback 到 localStorage
 *
 * 未来路线图：
 *   Phase 2：接入 Supabase Realtime，实现多设备实时广播
 *   Phase 3：引入 CRDT 操作队列，支持字段级 merge
 */
import type { PersistedState, Task, TaskAttachment } from '../types/domain'
import { seedState } from '../data/seed'
import { enqueueOfflineState } from './offline-queue'
import { supabase, isSupabaseEnabled } from './supabase'
import { getDeviceId, SCHEMA_VERSION_CONST } from './sync-shared'

export { getDeviceId, SCHEMA_VERSION_CONST } from './sync-shared'

// ---- 存储键管理 ----

const BASE_KEY = 'taskflow-v2'

/** 根据 userId 生成隔离的存储键（未登录时使用 guest） */
export const getStorageKey = (userId?: string | null): string =>
  userId ? `${BASE_KEY}-${userId}` : `${BASE_KEY}-guest`

/** @deprecated 旧键名，仅用于一次性迁移读取 */
export const LEGACY_STORAGE_KEY = 'ticktick-parity-demo-v2'

// ---- 当前活跃用户（由 App 初始化时注入） ----

let _currentUserId: string | null = null

export const setCurrentUserId = (userId: string | null) => {
  _currentUserId = userId
}

export const getCurrentUserId = (): string | null => _currentUserId

// ---- 规范化辅助 ----

const normalizeAttachmentRecord = (attachment: unknown): TaskAttachment | null => {
  if (!attachment) return null

  if (typeof attachment === 'string') {
    const normalizedName = attachment.split(/[\\/]/).pop()?.trim() ?? attachment.trim()
    if (!normalizedName) return null
    return {
      id: `att-legacy-${normalizedName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name: normalizedName,
      source: 'embedded',
      path: null,
      dataUrl: null,
      mimeType: null,
      size: null,
      addedAt: new Date().toISOString(),
    }
  }

  if (typeof attachment === 'object') {
    const record = attachment as Partial<TaskAttachment> & { name?: unknown; source?: unknown }
    const normalizedName = typeof record.name === 'string' ? record.name.trim() : ''
    if (!normalizedName) return null
    return {
      id: typeof record.id === 'string' && record.id.trim() ? record.id : `att-${normalizedName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name: normalizedName,
      source: record.source === 'desktop-path' ? 'desktop-path' : 'embedded',
      path: typeof record.path === 'string' && record.path.trim() ? record.path : null,
      dataUrl: typeof record.dataUrl === 'string' && record.dataUrl.trim() ? record.dataUrl : null,
      mimeType: typeof record.mimeType === 'string' && record.mimeType.trim() ? record.mimeType : null,
      size: typeof record.size === 'number' && Number.isFinite(record.size) ? record.size : null,
      addedAt: typeof record.addedAt === 'string' && record.addedAt.trim() ? record.addedAt : new Date().toISOString(),
    }
  }

  return null
}

const mergePersistedState = (parsed?: Partial<PersistedState> | null): PersistedState => {
  if (!parsed?.tasks || !parsed?.lists) return seedState

  return {
    ...seedState,
    ...parsed,
    tasks: parsed.tasks.map((task) => {
      // Migration: infer isUrgent/isImportant from legacy tagIds if fields absent
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = task as any
      const tagIds: string[] = Array.isArray(raw.tagIds) ? raw.tagIds : []
      const isUrgent: boolean = raw.isUrgent !== undefined ? Boolean(raw.isUrgent) : tagIds.includes('tag-urgent')
      const isImportant: boolean = raw.isImportant !== undefined ? Boolean(raw.isImportant) : tagIds.includes('tag-important')
      const cleanTagIds = tagIds.filter((id) => id !== 'tag-urgent' && id !== 'tag-important')
      return {
        ...task,
        isUrgent,
        isImportant,
        tagIds: cleanTagIds,
        deadlineAt: task.deadlineAt ?? null,
        attachments: Array.isArray(task.attachments)
          ? (task.attachments.map(normalizeAttachmentRecord).filter(Boolean) as TaskAttachment[])
          : [],
      } as Task
    }),
    selectedTagIds: Array.isArray(parsed.selectedTagIds) ? parsed.selectedTagIds : seedState.selectedTagIds,
    selectionTimeModes:
      parsed.selectionTimeModes && typeof parsed.selectionTimeModes === 'object'
        ? { ...seedState.selectionTimeModes, ...parsed.selectionTimeModes }
        : seedState.selectionTimeModes,
    firedReminderKeys: Array.isArray(parsed.firedReminderKeys) ? parsed.firedReminderKeys : seedState.firedReminderKeys,
    onboarding:
      parsed.onboarding && typeof parsed.onboarding === 'object'
        ? {
            ...seedState.onboarding,
            ...parsed.onboarding,
            completedStepIds: Array.isArray(parsed.onboarding.completedStepIds)
              ? parsed.onboarding.completedStepIds.filter(
                  (value): value is PersistedState['onboarding']['completedStepIds'][number] => typeof value === 'string',
                )
              : seedState.onboarding.completedStepIds,
          }
        : { ...seedState.onboarding, status: 'dismissed', seedScenarioVersion: 'legacy' },
  }
}

// ---- localStorage 读写 ----

const readLocalState = (userId?: string | null): Partial<PersistedState> | null => {
  if (typeof window === 'undefined') return null
  try {
    const key = getStorageKey(userId)
    const raw = window.localStorage.getItem(key)
    if (raw) return JSON.parse(raw) as Partial<PersistedState>

    // 兼容旧键名（首次迁移）
    const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY)
    if (legacyRaw) return JSON.parse(legacyRaw) as Partial<PersistedState>

    return null
  } catch {
    return null
  }
}

const writeLocalState = (state: PersistedState, userId?: string | null) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(getStorageKey(userId), JSON.stringify(state))
  } catch {
    // localStorage 满或不可用时静默忽略
  }
}

// ---- Supabase 云端读写 ----

/** 从云端拉取最新状态（失败时返回 null） */
const fetchCloudState = async (userId: string): Promise<Partial<PersistedState> | null> => {
  if (!supabase) return null
  if (typeof navigator !== 'undefined' && !navigator.onLine) return null

  try {
    const { data, error } = await supabase
      .from('workspace_states')
      .select('state_json, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()

    if (error || !data) return null
    return (data as { state_json: unknown; updated_at: string }).state_json as Partial<PersistedState>
  } catch {
    return null
  }
}

/** 异步将状态写入云端；失败时返回 false，由调用方决定是否排队重试 */
const syncToCloud = async (state: PersistedState, userId: string): Promise<boolean> => {
  if (!supabase) return false
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false

  try {
    const deviceId = getDeviceId()
    // NOTE: Supabase 自定义 Database 类型在 upsert 时参数类型推断为 never，
    // 这是已知的 @supabase/supabase-js 类型限制；用 unknown 中转规避。
    const payload = {
      user_id: userId,
      device_id: deviceId,
      state_json: JSON.parse(JSON.stringify(state)),
      schema_version: SCHEMA_VERSION_CONST,
      updated_at: new Date().toISOString(),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('workspace_states') as any).upsert(payload, {
      onConflict: 'user_id,device_id',
    })
    return true
  } catch {
    return false
  }
}

// ---- 公开 API ----

/**
 * 加载持久化状态。
 * 本地优先：优先返回 localStorage；仅在当前账户没有本地缓存时才阻塞式拉云端。
 */
export const loadState = async (): Promise<PersistedState> => {
  const userId = _currentUserId
  const localState = readLocalState(userId)

  if (localState) {
    return mergePersistedState(localState)
  }

  if (isSupabaseEnabled() && userId) {
    const cloudState = await fetchCloudState(userId)
    if (cloudState) {
      const merged = mergePersistedState(cloudState)
      writeLocalState(merged, userId)
      return merged
    }
  }

  return mergePersistedState(localState)
}

/** 节流控制：防止 saveState 调用过于频繁时触发太多云端请求 */
let _saveTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 保存持久化状态。
 * 立即写 localStorage，400ms 后尽力同步到云端；失败时写入离线队列等待后续重试。
 */
export const saveState = async (state: PersistedState): Promise<void> => {
  const userId = _currentUserId

  // 立即写本地（不阻塞）
  writeLocalState(state, userId)

  // 节流同步到云端
  if (isSupabaseEnabled() && userId) {
    if (_saveTimer) clearTimeout(_saveTimer)
    _saveTimer = setTimeout(() => {
      void syncToCloud(state, userId).then((success) => {
        if (!success) enqueueOfflineState(userId, state)
      })
      _saveTimer = null
    }, 400)
  }
}

/**
 * 检查本地是否有未同步的旧数据（迁移向导用）
 */
export const hasLegacyLocalData = (): boolean => {
  if (typeof window === 'undefined') return false
  try {
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY)
    if (legacy) {
      const parsed = JSON.parse(legacy) as Partial<PersistedState>
      return Array.isArray(parsed.tasks) && parsed.tasks.length > 0
    }
    return false
  } catch {
    return false
  }
}

/**
 * 读取旧版 localStorage 数据（迁移向导用）
 */
export const readLegacyState = (): PersistedState => {
  if (typeof window === 'undefined') return seedState
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return seedState
    return mergePersistedState(JSON.parse(raw) as Partial<PersistedState>)
  } catch {
    return seedState
  }
}

/**
 * 清除旧版本地缓存（迁移完成后调用）
 */
export const clearLegacyLocalData = (): void => {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(LEGACY_STORAGE_KEY)
}

// ---- 兼容桩（过渡期） ----

/** @deprecated 统一走 saveState */
export const saveDesktopWorkspaceState = async (_state: unknown): Promise<void> => {}
/** @deprecated 统一走 saveState */
export const saveDesktopTask = async (_task: unknown): Promise<void> => {}
/** @deprecated 无需等待 */
export const waitForDesktopPersistence = async (): Promise<void> => {}
