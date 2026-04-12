/**
 * useWorkspaceData — workspace CRUD hook
 *
 * Manages tasks, lists, tags, folders, filters state and all CRUD operations.
 * Extracted from App.tsx to reduce its size. No JSX here — pure logic.
 *
 * Usage:
 *   const { tasks, lists, tags, folders, filters, ...handlers } = useWorkspaceData(initialState)
 */
import { useState } from 'react'
import type {
  Folder,
  PersistedState,
  Priority,
  SavedFilter,
  Tag,
  Task,
  TaskStatus,
  TodoList,
} from '../types/domain'
import { getNowIso } from '../utils/dates'
import { normalizeTaskPatch, ensureSpecialTags } from '@taskflow/core'
import { SPECIAL_TAG_IDS } from '@taskflow/core'

// ---- shared helpers (duplicated from App.tsx to avoid circular deps) ----

const SYSTEM_TAG_IDS = Object.values(SPECIAL_TAG_IDS)

const makeId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`

const normalizeTagName = (value: string) => value.trim().replace(/\s+/g, ' ')

const isSystemTagId = (tagId: string) =>
  SYSTEM_TAG_IDS.includes(tagId as (typeof SYSTEM_TAG_IDS)[number])

const upsertTaskInCache = (items: Task[], nextTask: Task, prepend = false) => {
  const existingIndex = items.findIndex((task) => task.id === nextTask.id)
  if (existingIndex === -1) {
    return prepend ? [nextTask, ...items] : [...items, nextTask]
  }
  const nextItems = [...items]
  nextItems[existingIndex] = nextTask
  return nextItems
}

// ---- types ----

export type TagMutationResult =
  | { ok: true; tagId: string }
  | { ok: false; message: string }

// ---- hook ----

export function useWorkspaceData(initialState: PersistedState) {
  const [folders, setFolders] = useState<Folder[]>(initialState.folders)
  const [lists, setLists] = useState<TodoList[]>(initialState.lists)
  const [tags, setTags] = useState<Tag[]>(() => ensureSpecialTags(initialState.tags))
  const [filters, setFilters] = useState<SavedFilter[]>(initialState.filters)
  const [tasks, setTasks] = useState<Task[]>(initialState.tasks)

  // ---- internal helpers ----

  const getTaskById = (taskId: string): Task | null =>
    tasks.find((task) => task.id === taskId) ?? null

  const applyTaskMutation = (
    taskId: string,
    transform: (task: Task) => Task | null,
  ): Task | null => {
    const current = getTaskById(taskId)
    if (!current) return null
    const nextTask = transform(current)
    if (!nextTask) return null
    setTasks((items) => items.map((task) => (task.id === taskId ? nextTask : task)))
    return nextTask
  }

  // ---- tag validation ----

  const validateTagMutation = (name: string, excludeId?: string): string | null => {
    const normalized = normalizeTagName(name)
    if (!normalized) return '标签名不能为空'
    const duplicate = tags.some(
      (tag) =>
        normalizeTagName(tag.name).toLowerCase() === normalized.toLowerCase() &&
        tag.id !== excludeId,
    )
    if (duplicate) return `标签"${normalized}"已存在`
    return null
  }

  // ---- folder CRUD ----

  const createFolder = (name: string, color = '#6c63ff') => {
    const trimmed = name.trim()
    if (!trimmed) return
    const id = makeId('folder')
    setFolders((prev) => [...prev, { id, name: trimmed, color }])
  }

  const renameFolder = (folderId: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setFolders((prev) =>
      prev.map((f) => (f.id === folderId ? { ...f, name: trimmed } : f)),
    )
  }

  const updateFolderColor = (folderId: string, color: string) => {
    setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, color } : f)))
  }

  const deleteFolder = (folderId: string) => {
    // move lists in this folder to top level
    setLists((prev) =>
      prev.map((l) => (l.folderId === folderId ? { ...l, folderId: null } : l)),
    )
    setFolders((prev) => prev.filter((f) => f.id !== folderId))
  }

  // ---- list CRUD ----

  const createList = (
    name: string,
    folderId: string | null = null,
    color = '#6c63ff',
  ) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const id = makeId('list')
    setLists((prev) => [
      ...prev,
      { id, name: trimmed, color, folderId, kind: 'custom' },
    ])
  }

  const renameList = (listId: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setLists((prev) =>
      prev.map((l) => (l.id === listId ? { ...l, name: trimmed } : l)),
    )
  }

  const updateListColor = (listId: string, color: string) => {
    setLists((prev) => prev.map((l) => (l.id === listId ? { ...l, color } : l)))
  }

  const updateListFolder = (listId: string, folderId: string | null) => {
    setLists((prev) =>
      prev.map((l) => (l.id === listId ? { ...l, folderId } : l)),
    )
  }

  /** Delete list — moves its tasks to inbox. Returns the listId for callers
   *  to check if activeSelection needs updating. */
  const deleteList = (
    listId: string,
    onSelectionInvalidated?: (listId: string) => void,
  ) => {
    const now = getNowIso()
    setTasks((prev) =>
      prev.map((t) =>
        t.listId === listId ? { ...t, listId: 'inbox', updatedAt: now } : t,
      ),
    )
    setLists((prev) => prev.filter((l) => l.id !== listId))
    onSelectionInvalidated?.(listId)
  }

  // ---- tag CRUD ----

  const createTagDefinition = (name: string, color: string): TagMutationResult => {
    const normalized = normalizeTagName(name)
    const error = validateTagMutation(normalized)
    if (error) return { ok: false, message: error }
    const nextTagId = makeId('tag')
    setTags((current) => [...current, { id: nextTagId, name: normalized, color }])
    return { ok: true, tagId: nextTagId }
  }

  const updateTagDefinition = (
    tagId: string,
    name: string,
    color: string,
  ): TagMutationResult => {
    if (isSystemTagId(tagId)) {
      return { ok: false, message: '系统标签暂不支持重命名或改色' }
    }
    const normalized = normalizeTagName(name)
    const error = validateTagMutation(normalized, tagId)
    if (error) return { ok: false, message: error }
    setTags((current) =>
      current.map((tag) =>
        tag.id === tagId ? { ...tag, name: normalized, color } : tag,
      ),
    )
    return { ok: true, tagId }
  }

  const deleteTagDefinition = (tagId: string): TagMutationResult => {
    if (isSystemTagId(tagId)) {
      return { ok: false, message: '系统标签暂不支持删除' }
    }
    const tagExists = tags.some((tag) => tag.id === tagId)
    if (!tagExists) {
      return { ok: false, message: '要删除的标签不存在' }
    }
    const now = getNowIso()
    setTags((current) => current.filter((tag) => tag.id !== tagId))
    // callers are responsible for clearing selectedTagIds/quickTagIds from view state
    setTasks((current) =>
      current.map((task) =>
        task.tagIds.includes(tagId)
          ? { ...task, tagIds: task.tagIds.filter((id) => id !== tagId), updatedAt: now }
          : task,
      ),
    )
    return { ok: true, tagId }
  }

  // ---- task CRUD ----

  const updateTask = (taskId: string, patch: Partial<Task>) => {
    const current = getTaskById(taskId)
    if (!current) return
    applyTaskMutation(taskId, (task) => normalizeTaskPatch(task, patch))
  }

  const toggleTaskComplete = (taskId: string) => {
    const currentTask = getTaskById(taskId)
    if (!currentTask) return
    const completing = !currentTask.completed
    applyTaskMutation(taskId, (task) =>
      normalizeTaskPatch(task, {
        completed: completing,
        activity: [
          {
            id: makeId('act'),
            content: completing ? '完成任务' : '重新打开任务',
            createdAt: getNowIso(),
          },
          ...task.activity,
        ],
      }),
    )
    return { completing, task: currentTask }
  }

  const moveTaskToStatus = (taskId: string, status: TaskStatus) => {
    applyTaskMutation(taskId, (task) => {
      const { statusMeta } = require('@taskflow/core') as { statusMeta: Record<string, string> }
      return normalizeTaskPatch(task, {
        status,
        activity:
          task.status === status
            ? task.activity
            : [
                {
                  id: makeId('act'),
                  content: `将状态调整为${statusMeta[status]}`,
                  createdAt: getNowIso(),
                },
                ...task.activity,
              ],
      })
    })
  }

  const softDeleteTask = (taskId: string) => {
    applyTaskMutation(taskId, (task) => ({
      ...task,
      deleted: true,
      updatedAt: getNowIso(),
      activity: [
        { id: makeId('act'), content: '移入回收站', createdAt: getNowIso() },
        ...task.activity,
      ],
    }))
  }

  /** Append tasks directly (used by repeat-task logic and realtime sync) */
  const appendTask = (task: Task) => {
    setTasks((prev) => [...prev, task])
  }

  /** Upsert a task by id (prepend = true places it at top of list) */
  const upsertTask = (task: Task, prepend = false) => {
    setTasks((items) => upsertTaskInCache(items, task, prepend))
  }

  // ---- filter CRUD ----

  const createFilter = (filter: SavedFilter) => {
    setFilters((prev) => [...prev, filter])
  }

  const updateFilter = (filterId: string, patch: Partial<SavedFilter>) => {
    setFilters((prev) =>
      prev.map((f) => (f.id === filterId ? { ...f, ...patch } : f)),
    )
  }

  const deleteFilter = (filterId: string) => {
    setFilters((prev) => prev.filter((f) => f.id !== filterId))
  }

  // ---- realtime sync helpers ----

  /**
   * Merge remote state (newer-wins strategy for tasks, replace for others).
   * Called by useRealtimeSync's onRemoteUpdate callback.
   */
  const mergeRemoteState = (remoteState: Partial<PersistedState>) => {
    if (remoteState.tasks) {
      const remoteTasks = remoteState.tasks
      setTasks((localTasks) => {
        const localMap = new Map(localTasks.map((t) => [t.id, t]))
        const merged = [...localTasks]
        for (const remoteTask of remoteTasks) {
          const local = localMap.get(remoteTask.id)
          if (!local || remoteTask.updatedAt > local.updatedAt) {
            const idx = merged.findIndex((t) => t.id === remoteTask.id)
            if (idx >= 0) merged[idx] = remoteTask
            else merged.push(remoteTask)
          }
        }
        return merged
      })
    }
    if (remoteState.folders) setFolders(remoteState.folders)
    if (remoteState.lists) setLists(remoteState.lists)
    if (remoteState.tags) setTags(remoteState.tags)
    if (remoteState.filters) setFilters(remoteState.filters)
  }

  return {
    // ---- state ----
    folders,
    setFolders,
    lists,
    setLists,
    tags,
    setTags,
    filters,
    setFilters,
    tasks,
    setTasks,

    // ---- internal helpers exposed for App ----
    getTaskById,
    applyTaskMutation,
    upsertTask,
    appendTask,
    makeTaskId: () => makeId('task'),

    // ---- folder handlers ----
    createFolder,
    renameFolder,
    updateFolderColor,
    deleteFolder,

    // ---- list handlers ----
    createList,
    renameList,
    updateListColor,
    updateListFolder,
    deleteList,

    // ---- tag handlers ----
    createTagDefinition,
    updateTagDefinition,
    deleteTagDefinition,

    // ---- task handlers ----
    updateTask,
    toggleTaskComplete,
    moveTaskToStatus,
    softDeleteTask,

    // ---- filter handlers ----
    createFilter,
    updateFilter,
    deleteFilter,

    // ---- sync ----
    mergeRemoteState,
  }
}
