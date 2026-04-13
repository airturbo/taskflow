import type {
  Task,
  Tag,
  SavedFilter,
  PersistedState,
  TimeFieldMode,
  WorkspaceView,
} from './domain'
import { getNowIso, getDateKey, isToday, isOverdue, isWithinDays, diffDateKeys, formatDateTime } from './dates'
import { SPECIAL_TAG_IDS, SPECIAL_TAG_META, type MatrixQuadrantKey } from './meta'

// ─── Task time helpers ───────────────────────────────────────────────

const getTaskPlannedAt = (task: Task) => task.dueAt
const getTaskDeadlineAt = (task: Task) => task.deadlineAt ?? null
const getTaskRiskAt = (task: Task) => getTaskDeadlineAt(task) ?? getTaskPlannedAt(task)

export const getTaskDisplayTimeValue = (task: Task, mode: TimeFieldMode = 'planned') =>
  mode === 'deadline' ? getTaskDeadlineAt(task) : getTaskPlannedAt(task)

export const isTaskRiskOverdue = (task: Task) => !task.completed && isOverdue(getTaskRiskAt(task))

export const getTaskPrimaryScheduleAt = (task: Task) => getTaskPlannedAt(task) ?? task.startAt

export const isTaskPlannedAfterDeadline = (task: Task) => {
  const planned = getTaskPlannedAt(task)
  const deadline = getTaskDeadlineAt(task)
  if (!planned || !deadline) return false
  const plannedAt = new Date(planned.includes('T') ? planned : `${planned}T23:59`).getTime()
  const deadlineAt = new Date(deadline.includes('T') ? deadline : `${deadline}T23:59`).getTime()
  if (Number.isNaN(plannedAt) || Number.isNaN(deadlineAt)) return false
  return plannedAt > deadlineAt
}

// ─── Selection / filtering ───────────────────────────────────────────

export function getTasksForSelection({
  tasks,
  selectionKind,
  selectionId,
  filters,
  selectionTimeModes,
  includeCompleted = false,
}: {
  tasks: Task[]
  selectionKind: string
  selectionId: string
  filters: SavedFilter[]
  selectionTimeModes?: PersistedState['selectionTimeModes']
  includeCompleted?: boolean
}) {
  const includeIfActive = (task: Task) => !task.deleted && (includeCompleted || !task.completed)
  const selectionTimeMode: TimeFieldMode =
    selectionKind === 'system' && (selectionId === 'today' || selectionId === 'upcoming')
      ? selectionTimeModes?.[selectionId] ?? 'planned'
      : 'planned'

  if (selectionKind === 'system') {
    if (selectionId === 'all') {
      return tasks.filter(includeIfActive)
    }
    if (selectionId === 'today') {
      return tasks.filter((task) => {
        if (!includeIfActive(task)) return false
        const timeValue = getTaskDisplayTimeValue(task, selectionTimeMode)
        return Boolean(timeValue && (isToday(timeValue) || isOverdue(timeValue)))
      })
    }
    if (selectionId === 'upcoming') {
      return tasks.filter((task) => {
        if (!includeIfActive(task)) return false
        const timeValue = getTaskDisplayTimeValue(task, selectionTimeMode)
        return Boolean(timeValue && isWithinDays(timeValue, 7))
      })
    }
    if (selectionId === 'inbox') {
      return tasks.filter((task) => includeIfActive(task) && task.listId === 'inbox')
    }
    if (selectionId === 'completed') {
      return tasks.filter((task) => !task.deleted && task.completed)
    }
    if (selectionId === 'trash') {
      return tasks.filter((task) => task.deleted)
    }
  }

  if (selectionKind === 'list') {
    return tasks.filter((task) => includeIfActive(task) && task.listId === selectionId)
  }

  if (selectionKind === 'tag') {
    return tasks.filter((task) => includeIfActive(task) && task.tagIds.includes(selectionId))
  }

  if (selectionKind === 'filter') {
    const filter = filters.find((item) => item.id === selectionId)
    return filter ? applySavedFilter(tasks.filter((task) => !task.deleted), filter, includeCompleted) : tasks.filter(includeIfActive)
  }

  if (selectionKind === 'tool') {
    return tasks.filter((task) => !task.deleted)
  }

  return tasks.filter(includeIfActive)
}

export function matchesSearch(task: Task, keyword: string, tags: Tag[]) {
  if (!keyword) return true
  const tagText = task.tagIds
    .map((tagId) => tags.find((item) => item.id === tagId)?.name ?? '')
    .join(' ')
    .toLowerCase()
  const text = `${task.title} ${task.note} ${tagText}`.toLowerCase()
  return text.includes(keyword)
}

export function matchesSelectedTags(task: Task, selectedTagIds: string[]) {
  if (selectedTagIds.length === 0) return true
  return selectedTagIds.every((tagId) => task.tagIds.includes(tagId))
}

export function applySavedFilter(tasks: Task[], filter: SavedFilter, includeCompleted = false) {
  return tasks.filter((task) => {
    const matchList = filter.listIds.length === 0 || filter.listIds.includes(task.listId)
    const matchTags = filter.tagIds.length === 0 || filter.tagIds.every((tagId) => task.tagIds.includes(tagId))
    const matchPriority = filter.priority.length === 0 || filter.priority.includes(task.priority)
    const matchDue =
      filter.due === 'none'
        ? true
        : filter.due === 'today'
          ? isToday(task.dueAt)
          : filter.due === 'week'
            ? isWithinDays(task.dueAt, 7)
            : isOverdue(task.dueAt)
    return matchList && matchTags && matchPriority && matchDue && (includeCompleted || !task.completed)
  })
}

// ─── Special tags ────────────────────────────────────────────────────

export function ensureSpecialTags(tags: Tag[]) {
  const existing = new Set(tags.map((tag) => tag.id))
  const next = [...tags]

  if (!existing.has(SPECIAL_TAG_IDS.urgent)) {
    next.unshift(SPECIAL_TAG_META.urgent)
  }

  if (!existing.has(SPECIAL_TAG_IDS.important)) {
    next.splice(next.findIndex((tag) => tag.id === SPECIAL_TAG_IDS.urgent) + 1, 0, SPECIAL_TAG_META.important)
  }

  return next
}

// ─── Task schedule helpers ───────────────────────────────────────────

export function hasTaskSchedule(task: Task) {
  return Boolean(task.startAt || getTaskPlannedAt(task))
}

export function getCalendarTaskAnchor(task: Task) {
  return task.dueAt ?? task.startAt
}

export function getCalendarTaskDateKey(task: Task) {
  return getCalendarTaskAnchor(task)?.slice(0, 10) ?? null
}

export function getPreferredFocusedCalendarDate(windowDates: string[], calendarAnchor: string) {
  const today = getDateKey()
  if (windowDates.includes(today)) return today
  if (windowDates.includes(calendarAnchor)) return calendarAnchor
  return windowDates.find((value) => value.slice(0, 7) === calendarAnchor.slice(0, 7)) ?? windowDates[0] ?? null
}

export function groupTasksByDay(tasks: Task[]) {
  return tasks.reduce<Record<string, Task[]>>((acc, task) => {
    const dateKey = getCalendarTaskDateKey(task) ?? '未安排'
    if (!acc[dateKey]) acc[dateKey] = []
    acc[dateKey].push(task)
    return acc
  }, {})
}

export function getProjectionAnchorDateKey(task: Task, view: WorkspaceView) {
  if (view === 'timeline') {
    return task.startAt?.slice(0, 10) ?? task.dueAt?.slice(0, 10) ?? null
  }
  return getCalendarTaskDateKey(task) ?? task.startAt?.slice(0, 10) ?? task.dueAt?.slice(0, 10) ?? null
}

export function compareTasksByProjectionDistance(left: Task, right: Task, anchorDateKey: string, view: WorkspaceView) {
  const leftAnchor = getProjectionAnchorDateKey(left, view)
  const rightAnchor = getProjectionAnchorDateKey(right, view)

  if (leftAnchor && rightAnchor) {
    const distance = Math.abs(diffDateKeys(anchorDateKey, leftAnchor)) - Math.abs(diffDateKeys(anchorDateKey, rightAnchor))
    if (distance !== 0) return distance
    return leftAnchor.localeCompare(rightAnchor)
  }

  if (leftAnchor) return -1
  if (rightAnchor) return 1
  return left.title.localeCompare(right.title, 'zh-CN')
}

// ─── Task patch normalization ────────────────────────────────────────

function syncAutoStartReminder(reminders: Task['reminders'], anchorAt: string | null) {
  return reminders
    .filter((reminder) => anchorAt || !(reminder.kind === 'absolute' && reminder.label === '开始时提醒'))
    .map((reminder) =>
      reminder.kind === 'absolute' && reminder.label === '开始时提醒' && anchorAt
        ? { ...reminder, value: anchorAt }
        : reminder,
    )
}

export function normalizeTaskPatch(task: Task, patch: Partial<Task>) {
  const now = getNowIso()
  // SYNC-03: stamp fieldVersions for each mutated field
  const prevVersions = task.fieldVersions ?? {}
  const newVersions: Record<string, string> = { ...prevVersions }
  for (const key of Object.keys(patch) as Array<keyof Task>) {
    if (key === 'fieldVersions' || key === 'updatedAt' || key === 'createdAt' || key === 'id') continue
    newVersions[key] = now
  }

  const next = {
    ...task,
    ...patch,
    fieldVersions: newVersions,
    updatedAt: now,
  }

  if (patch.status) {
    next.completed = patch.status === 'done'
  } else if (typeof patch.completed === 'boolean') {
    next.status = patch.completed ? 'done' : task.status === 'done' ? 'todo' : task.status
  }

  if ('startAt' in patch || 'dueAt' in patch || 'reminders' in patch) {
    next.reminders = syncAutoStartReminder(next.reminders, next.startAt ?? next.dueAt)
  }

  return next
}

// ─── Matrix quadrant helpers ─────────────────────────────────────────

export function getQuadrant(task: Task): MatrixQuadrantKey {
  const urgent = task.isUrgent
  const important = task.isImportant
  if (urgent && important) return 'q1'
  if (!urgent && important) return 'q2'
  if (urgent && !important) return 'q3'
  return 'q4'
}

/** Returns the isUrgent/isImportant field values for a given quadrant. */
export function getFieldsForQuadrant(quadrant: MatrixQuadrantKey): { isUrgent: boolean; isImportant: boolean } {
  return {
    isUrgent: quadrant === 'q1' || quadrant === 'q3',
    isImportant: quadrant === 'q1' || quadrant === 'q2',
  }
}

/**
 * @deprecated Use getFieldsForQuadrant instead.
 * Kept for backward compatibility — strips special tags from tagIds but no longer adds them.
 */
export function getTagIdsForQuadrant(tagIds: string[], _quadrant: MatrixQuadrantKey) {
  return tagIds.filter((tagId) => !Object.values(SPECIAL_TAG_IDS).includes(tagId as (typeof SPECIAL_TAG_IDS)[keyof typeof SPECIAL_TAG_IDS]))
}

export function getQuadrantLabel(quadrant: MatrixQuadrantKey) {
  const labelMap: Record<MatrixQuadrantKey, string> = {
    q1: '紧急且重要',
    q2: '重要不紧急',
    q3: '紧急不重要',
    q4: '不紧急不重要',
  }
  return labelMap[quadrant]
}

// ─── Stats ───────────────────────────────────────────────────────────

export function buildTaskStats(tasks: Task[]) {
  const scopedTasks = tasks.filter((task) => !task.deleted)
  return {
    active: scopedTasks.filter((task) => !task.completed).length,
    completed: scopedTasks.filter((task) => task.completed).length,
    overdue: scopedTasks.filter((task) => isTaskRiskOverdue(task)).length,
    scheduled: scopedTasks.filter((task) => Boolean(task.startAt || task.dueAt)).length,
  }
}

// ─── Deadline display helpers ────────────────────────────────────────

export type TaskDeadlineMarkerTone = 'neutral' | 'warning' | 'danger'

export function formatTaskDualTimeSummary(task: Task, options?: { mode?: TimeFieldMode; includeDeadlineLabel?: boolean; emptyLabel?: string }) {
  const mode = options?.mode ?? 'planned'
  const includeDeadlineLabel = options?.includeDeadlineLabel ?? true
  const emptyLabel = options?.emptyLabel ?? '未设置'
  const planned = getTaskPlannedAt(task)
  const deadline = getTaskDeadlineAt(task)

  if (mode === 'deadline') {
    if (!deadline) return emptyLabel
    return includeDeadlineLabel ? `DDL ${formatDateTime(deadline)}` : formatDateTime(deadline)
  }

  if (planned) return formatDateTime(planned)
  if (deadline) return includeDeadlineLabel ? `DDL ${formatDateTime(deadline)}` : formatDateTime(deadline)
  return emptyLabel
}

export function formatDueAtBadge(task: Task) {
  const planned = getTaskPlannedAt(task)
  if (!planned) return null
  return formatDateTime(planned)
}

export function formatTaskDeadlineBadge(task: Task) {
  const deadline = getTaskDeadlineAt(task)
  if (!deadline) return null
  return formatDateTime(deadline)
}

export function getTaskDeadlineMarkerTone(task: Task): TaskDeadlineMarkerTone | null {
  if (!getTaskDeadlineAt(task)) return null
  if (isTaskRiskOverdue(task)) return 'danger'
  if (isTaskPlannedAfterDeadline(task)) return 'warning'
  return 'neutral'
}

export function getTaskDeadlineMarkerTitle(task: Task) {
  const deadlineBadge = formatTaskDeadlineBadge(task)
  if (!deadlineBadge) return null
  if (isTaskRiskOverdue(task)) return `${deadlineBadge} 已到`
  if (isTaskPlannedAfterDeadline(task)) return `${deadlineBadge}，当前计划完成已晚于 DDL`
  return deadlineBadge
}

// ─── Calendar/Timeline visibility ────────────────────────────────────

export { getTaskTimelineRange } from './timeline'

export function isTaskVisibleInCalendarWindow(task: Task, windowDates: string[]) {
  const dateKey = getCalendarTaskDateKey(task)
  return Boolean(dateKey && windowDates.includes(dateKey))
}
