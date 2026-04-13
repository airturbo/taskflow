/**
 * field-merge.ts — Field-level merge engine (SYNC-01)
 *
 * Algorithm:
 *   For each task field, compare fieldVersions timestamps:
 *   - Only local changed  → local value wins  (no conflict)
 *   - Only remote changed → remote value wins (no conflict)
 *   - Both changed with different values → CONFLICT (collected for UI)
 *   - Neither changed / same value → keep current (no conflict)
 *
 * New tasks (remote only) are added.
 * Tasks that exist only locally are kept (deletion is handled separately).
 */
import type { Task } from '../types/domain'

// ── Types ────────────────────────────────────────────────────────────────────

export interface FieldConflict {
  taskId: string
  taskTitle: string
  field: string
  localValue: unknown
  remoteValue: unknown
  localVersion: string
  remoteVersion: string
}

export interface MergeResult {
  /** Fully merged task (conflicts already resolved for non-conflicting fields) */
  merged: Task
  /** Fields that could not be auto-resolved */
  conflicts: FieldConflict[]
}

export interface MergeListResult {
  tasks: Task[]
  conflicts: FieldConflict[]
}

// ── Scalar fields subject to field-level merge ────────────────────────────────

/**
 * Fields where single-writer auto-merge is applied.
 * Array/object fields (subtasks, reminders, attachments, comments, activity)
 * are excluded — they use whole-task updatedAt fallback to avoid complexity.
 */
const MERGEABLE_FIELDS: ReadonlyArray<keyof Task> = [
  'title',
  'note',
  'status',
  'priority',
  'completed',
  'deleted',
  'listId',
  'isUrgent',
  'isImportant',
  'startAt',
  'dueAt',
  'deadlineAt',
  'repeatRule',
  'assignee',
  'estimatedPomodoros',
  'sortOrder',
]

// ── Stamp helper ─────────────────────────────────────────────────────────────

/**
 * Returns a new task with fieldVersions updated for every key in `patch`.
 * Call this whenever a task field is mutated locally.
 */
export function stampFieldVersions(task: Task, patch: Partial<Task>): Task {
  const now = new Date().toISOString()
  const prevVersions = task.fieldVersions ?? {}
  const newVersions: Record<string, string> = { ...prevVersions }

  for (const key of Object.keys(patch) as Array<keyof Task>) {
    if (key === 'fieldVersions' || key === 'updatedAt' || key === 'createdAt' || key === 'id') continue
    newVersions[key] = now
  }

  return { ...task, ...patch, fieldVersions: newVersions }
}

// ── Core merge logic ─────────────────────────────────────────────────────────

/**
 * Merge a single remote task into the local task.
 * Returns merged task + any unresolvable conflicts.
 */
export function mergeTask(local: Task, remote: Task): MergeResult {
  const localVersions = local.fieldVersions ?? {}
  const remoteVersions = remote.fieldVersions ?? {}

  const mergedTask: Task = { ...local }
  const conflicts: FieldConflict[] = []

  for (const field of MERGEABLE_FIELDS) {
    const localVal = local[field]
    const remoteVal = remote[field]

    // Fast path: same value → no conflict regardless of versions
    if (localVal === remoteVal) continue

    const localV = localVersions[field] ?? ''
    const remoteV = remoteVersions[field] ?? ''

    if (remoteV > localV) {
      // Remote is newer → take remote value
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(mergedTask as any)[field] = remoteVal
    } else if (localV > remoteV) {
      // Local is newer → keep local value (already in mergedTask)
    } else {
      // Same version string (both empty or equal timestamp) but different values
      // → genuine conflict, collect for user resolution
      conflicts.push({
        taskId: local.id,
        taskTitle: local.title,
        field,
        localValue: localVal,
        remoteValue: remoteVal,
        localVersion: localV,
        remoteVersion: remoteV,
      })
    }
  }

  // Merge fieldVersions: take max timestamp per field
  const mergedVersions: Record<string, string> = { ...localVersions }
  for (const [k, v] of Object.entries(remoteVersions)) {
    if (!mergedVersions[k] || v > mergedVersions[k]) {
      mergedVersions[k] = v
    }
  }
  mergedTask.fieldVersions = mergedVersions

  // updatedAt: take the later of local/remote
  if (remote.updatedAt > local.updatedAt) {
    mergedTask.updatedAt = remote.updatedAt
  }

  return { merged: mergedTask, conflicts }
}

/**
 * Merge a list of remote tasks into a list of local tasks.
 * - Remote-only tasks are added.
 * - Local-only tasks are kept (remote deletions handled separately).
 * - Common tasks go through field-level merge.
 */
export function mergeTaskList(localTasks: Task[], remoteTasks: Task[]): MergeListResult {
  const localMap = new Map(localTasks.map((t) => [t.id, t]))
  const remoteMap = new Map(remoteTasks.map((t) => [t.id, t]))

  const resultTasks: Task[] = []
  const allConflicts: FieldConflict[] = []

  // Process all local tasks (merge with remote counterpart if exists)
  for (const local of localTasks) {
    const remote = remoteMap.get(local.id)
    if (!remote) {
      // Only local — keep as-is
      resultTasks.push(local)
    } else {
      const { merged, conflicts } = mergeTask(local, remote)
      resultTasks.push(merged)
      allConflicts.push(...conflicts)
    }
  }

  // Add remote-only tasks (new tasks from remote)
  for (const remote of remoteTasks) {
    if (!localMap.has(remote.id)) {
      resultTasks.push(remote)
    }
  }

  return { tasks: resultTasks, conflicts: allConflicts }
}

/**
 * Apply user conflict resolutions.
 * `resolutions`: maps `"taskId:field"` → `'local' | 'remote'`.
 * Returns the updated task list with resolved values applied.
 */
export function applyConflictResolutions(
  tasks: Task[],
  conflicts: FieldConflict[],
  resolutions: Record<string, 'local' | 'remote'>,
  remoteTasks: Task[],
): Task[] {
  if (conflicts.length === 0) return tasks

  const remoteMap = new Map(remoteTasks.map((t) => [t.id, t]))
  const conflictsByTaskId = new Map<string, FieldConflict[]>()

  for (const c of conflicts) {
    const existing = conflictsByTaskId.get(c.taskId) ?? []
    existing.push(c)
    conflictsByTaskId.set(c.taskId, existing)
  }

  return tasks.map((task) => {
    const taskConflicts = conflictsByTaskId.get(task.id)
    if (!taskConflicts) return task

    const remote = remoteMap.get(task.id)
    let updated = { ...task }
    const updatedVersions = { ...(task.fieldVersions ?? {}) }
    const now = new Date().toISOString()

    for (const conflict of taskConflicts) {
      const key = `${conflict.taskId}:${conflict.field}`
      const choice = resolutions[key]

      if (choice === 'remote' && remote) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(updated as any)[conflict.field] = (remote as any)[conflict.field]
        updatedVersions[conflict.field] = conflict.remoteVersion || now
      } else {
        // 'local' or unresolved — keep current value, stamp new version
        updatedVersions[conflict.field] = now
      }
    }

    updated.fieldVersions = updatedVersions
    updated.updatedAt = now
    return updated
  })
}
