import type Database from '@tauri-apps/plugin-sql'
import type {
  ActivityItem,
  Comment,
  Folder,
  PersistedState,
  Priority,
  Reminder,
  SavedFilter,
  Subtask,
  Tag,
  Task,
  TaskAttachment,
  TimeFieldMode,
  TodoList,
} from '../types/domain'
import { addDays, getDateKey, getNowIso } from './dates'
import { getDesktopDatabase } from './desktop-sqlite'

type WorkspaceStateRow = {
  theme: PersistedState['theme']
  active_selection: string
  selected_tag_ids_json: string
  selection_time_modes_json: string
  current_view: PersistedState['currentView']
  calendar_mode: PersistedState['calendarMode']
  calendar_show_completed: number
  timeline_scale: PersistedState['timelineScale']
  fired_reminder_keys_json: string
  onboarding_json: string
}

type FolderRow = Folder & {
  sort_order: number
}

type ListRow = {
  id: string
  name: string
  color: string
  folder_id: string | null
  kind: TodoList['kind']
  sort_order: number
}

type TagRow = Tag & {
  sort_order: number
}

type FilterRow = {
  id: string
  name: string
  icon: string
  list_ids_json: string
  tag_ids_json: string
  priority_json: string
  due: SavedFilter['due']
  sort_order: number
}

type TaskRow = {
  id: string
  title: string
  note: string
  list_id: string
  tag_ids_json: string
  priority: Task['priority']
  status: Task['status']
  start_at: string | null
  due_at: string | null
  deadline_at: string | null
  repeat_rule: string
  reminders_json: string
  subtasks_json: string
  attachments_json: string
  assignee: string | null
  collaborators_json: string
  comments_json: string
  activity_json: string
  estimated_pomodoros: number
  completed_pomodoros: number
  focus_minutes: number
  completed: number
  deleted: number
  created_at: string
  updated_at: string
  sort_order: number
}

type TaskTagRow = {
  task_id: string
  tag_id: string
  sort_order: number
}

type TaskReminderRow = {
  task_id: string
  id: string
  label: string
  value: string
  kind: Reminder['kind']
  sort_order: number
}

type TaskSubtaskRow = {
  task_id: string
  id: string
  title: string
  completed: number
  sort_order: number
}

type TaskAttachmentRow = {
  task_id: string
  attachment: string
  sort_order: number
}

type TaskCollaboratorRow = {
  task_id: string
  collaborator: string
  sort_order: number
}

type TaskCommentRow = {
  task_id: string
  id: string
  author: string
  content: string
  created_at: string
  sort_order: number
}

type TaskActivityRow = {
  task_id: string
  id: string
  content: string
  created_at: string
  sort_order: number
}

type CountRow = {
  count: number
}

type StatsRow = {
  active: number | null
  completed: number | null
  overdue: number | null
  scheduled: number | null
}

type PriorityDistributionRow = {
  priority: Priority
  count: number
}

type TagDistributionRow = {
  id: string
  name: string
  color: string
  sort_order: number
  count: number
}


export type DesktopTaskQuery = {
  taskIds?: string[]
  listId?: string
  listIds?: string[]
  statuses?: Task['status'][]
  priorities?: Task['priority'][]
  completed?: boolean
  includeDeleted?: boolean
  deleted?: boolean
  dueBefore?: string
  dueAfter?: string
  dueMode?: SavedFilter['due'] | 'today_or_overdue'
  timeFieldMode?: TimeFieldMode
  tagIds?: string[]
  keyword?: string
  hasReminders?: boolean
  attentionOnly?: boolean
  scheduledOnly?: boolean
  calendarWindowStart?: string
  calendarWindowEnd?: string
  timelineWindowStart?: string
  timelineWindowEnd?: string
  limit?: number
  offset?: number
  sortBy?: 'default' | 'calendar' | 'timeline'
}

export type DesktopTaskSelectionQuery = {
  selectionKind: string
  selectionId: string
  selectedTagIds?: string[]
  selectionTimeModes?: PersistedState['selectionTimeModes']
  includeCompleted?: boolean
  keyword?: string
  filters?: SavedFilter[]
  scheduledOnly?: boolean
  calendarWindowStart?: string
  calendarWindowEnd?: string
  timelineWindowStart?: string
  timelineWindowEnd?: string
  limit?: number
  offset?: number
  sortBy?: 'default' | 'calendar' | 'timeline'
}

export type DesktopTaskStats = {
  active: number
  completed: number
  overdue: number
  scheduled: number
}

export type DesktopPriorityDistribution = Record<Priority, number>

export type DesktopTagDistributionItem = {
  tag: Tag
  count: number
}

export type DesktopWorkspaceStateInput = Pick<
  PersistedState,
  'theme' | 'activeSelection' | 'selectedTagIds' | 'selectionTimeModes' | 'currentView' | 'calendarMode' | 'calendarShowCompleted' | 'timelineScale' | 'firedReminderKeys' | 'onboarding'
>

export type DesktopWorkspaceShellState = Omit<PersistedState, 'tasks'> & {
  tasks: Task[]
}

const WORKSPACE_ROW_ID = 1
const TASK_DUE_COMPARABLE_SQL = `CASE
  WHEN tasks.due_at IS NULL THEN NULL
  WHEN INSTR(tasks.due_at, 'T') > 0 THEN tasks.due_at
  ELSE tasks.due_at || 'T23:59'
END`
const TASK_DEADLINE_COMPARABLE_SQL = `CASE
  WHEN tasks.deadline_at IS NULL THEN NULL
  WHEN INSTR(tasks.deadline_at, 'T') > 0 THEN tasks.deadline_at
  ELSE tasks.deadline_at || 'T23:59'
END`
const TASK_START_COMPARABLE_SQL = `CASE
  WHEN tasks.start_at IS NULL THEN NULL
  WHEN INSTR(tasks.start_at, 'T') > 0 THEN tasks.start_at
  ELSE tasks.start_at || 'T09:00'
END`
const TASK_SCHEDULE_END_COMPARABLE_SQL = `CASE
  WHEN tasks.due_at IS NULL THEN NULL
  WHEN INSTR(tasks.due_at, 'T') > 0 THEN tasks.due_at
  ELSE tasks.due_at || 'T18:00'
END`
const TASK_RISK_COMPARABLE_SQL = `COALESCE(${TASK_DEADLINE_COMPARABLE_SQL}, ${TASK_DUE_COMPARABLE_SQL})`
const TASK_TIMELINE_START_COMPARABLE_SQL = `CASE
  WHEN ${TASK_START_COMPARABLE_SQL} IS NOT NULL THEN ${TASK_START_COMPARABLE_SQL}
  WHEN tasks.due_at IS NOT NULL AND INSTR(tasks.due_at, 'T') > 0 THEN STRFTIME('%Y-%m-%dT%H:%M', DATETIME(REPLACE(tasks.due_at, 'T', ' '), '-60 minutes'))
  WHEN tasks.due_at IS NOT NULL THEN tasks.due_at || 'T09:00'
  ELSE NULL
END`
const TASK_TIMELINE_END_COMPARABLE_SQL = `CASE
  WHEN ${TASK_START_COMPARABLE_SQL} IS NOT NULL AND ${TASK_SCHEDULE_END_COMPARABLE_SQL} IS NOT NULL AND ${TASK_SCHEDULE_END_COMPARABLE_SQL} > ${TASK_START_COMPARABLE_SQL}
    THEN ${TASK_SCHEDULE_END_COMPARABLE_SQL}
  WHEN ${TASK_START_COMPARABLE_SQL} IS NOT NULL
    THEN STRFTIME('%Y-%m-%dT%H:%M', DATETIME(REPLACE(${TASK_START_COMPARABLE_SQL}, 'T', ' '), '+60 minutes'))
  WHEN ${TASK_SCHEDULE_END_COMPARABLE_SQL} IS NOT NULL
    THEN ${TASK_SCHEDULE_END_COMPARABLE_SQL}
  ELSE NULL
END`
const TASK_CALENDAR_SORT_DATE_SQL = `COALESCE(SUBSTR(tasks.start_at, 1, 10), SUBSTR(tasks.due_at, 1, 10), SUBSTR(tasks.updated_at, 1, 10))`
const resolveComparableTimeSql = (mode: TimeFieldMode = 'planned') => (mode === 'deadline' ? TASK_DEADLINE_COMPARABLE_SQL : TASK_DUE_COMPARABLE_SQL)
const resolveDateFieldSql = (mode: TimeFieldMode = 'planned') => (mode === 'deadline' ? 'tasks.deadline_at' : 'tasks.due_at')
const TASK_TAG_TEXT_SQL = `COALESCE((
  SELECT GROUP_CONCAT(tags.name, ' ')
  FROM task_tags
  INNER JOIN tags ON tags.id = task_tags.tag_id
  WHERE task_tags.task_id = tasks.id
), '')`

const TASK_SELECT_SQL = `SELECT
  id,
  title,
  note,
  list_id,
  tag_ids_json,
  priority,
  status,
  start_at,
  due_at,
  deadline_at,
  repeat_rule,
  reminders_json,
  subtasks_json,
  attachments_json,
  assignee,
  collaborators_json,
  comments_json,
  activity_json,
  estimated_pomodoros,
  completed_pomodoros,
  focus_minutes,
  completed,
  deleted,
  created_at,
  updated_at,
  sort_order
 FROM tasks`

const parseJson = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback

  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

const normalizeTaskAttachment = (attachment: unknown): TaskAttachment | null => {
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
      addedAt: getNowIso(),
    }
  }

  if (typeof attachment === 'object') {
    const record = attachment as Partial<TaskAttachment>
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
      addedAt: typeof record.addedAt === 'string' && record.addedAt.trim() ? record.addedAt : getNowIso(),
    }
  }

  return null
}

const parseTaskAttachments = (value: string | null | undefined): TaskAttachment[] => {
  if (!value) return []
  const raw = parseJson<unknown[]>(value, [])
  return raw.map(normalizeTaskAttachment).filter((item): item is TaskAttachment => Boolean(item))
}

const encodeTaskAttachment = (attachment: TaskAttachment) => JSON.stringify(attachment)

const toInteger = (value: boolean) => (value ? 1 : 0)

const buildPlaceholders = (count: number, offset = 0) =>
  Array.from({ length: count }, (_, index) => `$${offset + index + 1}`).join(', ')

const appendMapValue = <T>(map: Map<string, T[]>, key: string, value: T) => {
  const bucket = map.get(key)
  if (bucket) {
    bucket.push(value)
    return
  }

  map.set(key, [value])
}

const unique = <T>(values: T[]) => Array.from(new Set(values))

const escapeLikePattern = (value: string) => value.replace(/([%_\\])/g, '\\$1')

const normalizeTaskTagIds = (tagIds: string[]) => unique(tagIds)

const buildTaskSignature = (task: Task, sortOrder: number) =>
  JSON.stringify({
    id: task.id,
    title: task.title,
    note: task.note,
    listId: task.listId,
    tagIds: normalizeTaskTagIds(task.tagIds),
    priority: task.priority,
    status: task.status,
    startAt: task.startAt,
    dueAt: task.dueAt,
    deadlineAt: task.deadlineAt ?? null,
    repeatRule: task.repeatRule,
    reminders: task.reminders,
    subtasks: task.subtasks,
    attachments: task.attachments,
    assignee: task.assignee,
    collaborators: task.collaborators,
    comments: task.comments,
    activity: task.activity,
    estimatedPomodoros: task.estimatedPomodoros,
    completedPomodoros: task.completedPomodoros,
    focusMinutes: task.focusMinutes,
    completed: task.completed,
    deleted: task.deleted,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    sortOrder,
  })

const loadTaskRelations = async (db: Database, taskIds: string[]) => {
  if (taskIds.length === 0) {
    return {
      tagIdsByTaskId: new Map<string, string[]>(),
      remindersByTaskId: new Map<string, Reminder[]>(),
      subtasksByTaskId: new Map<string, Subtask[]>(),
      attachmentsByTaskId: new Map<string, TaskAttachment[]>(),
      collaboratorsByTaskId: new Map<string, string[]>(),
      commentsByTaskId: new Map<string, Comment[]>(),
      activityByTaskId: new Map<string, ActivityItem[]>(),
    }
  }

  const placeholders = buildPlaceholders(taskIds.length)
  const filterClause = ` WHERE task_id IN (${placeholders})`

  const [taskTagRows, taskReminderRows, taskSubtaskRows, taskAttachmentRows, taskCollaboratorRows, taskCommentRows, taskActivityRows] =
    await Promise.all([
      db.select<TaskTagRow[]>(
        `SELECT task_id, tag_id, sort_order
         FROM task_tags${filterClause}
         ORDER BY task_id ASC, sort_order ASC, tag_id ASC`,
        taskIds,
      ),
      db.select<TaskReminderRow[]>(
        `SELECT task_id, id, label, value, kind, sort_order
         FROM task_reminders${filterClause}
         ORDER BY task_id ASC, sort_order ASC, id ASC`,
        taskIds,
      ),
      db.select<TaskSubtaskRow[]>(
        `SELECT task_id, id, title, completed, sort_order
         FROM task_subtasks${filterClause}
         ORDER BY task_id ASC, sort_order ASC, id ASC`,
        taskIds,
      ),
      db.select<TaskAttachmentRow[]>(
        `SELECT task_id, attachment, sort_order
         FROM task_attachments${filterClause}
         ORDER BY task_id ASC, sort_order ASC`,
        taskIds,
      ),
      db.select<TaskCollaboratorRow[]>(
        `SELECT task_id, collaborator, sort_order
         FROM task_collaborators${filterClause}
         ORDER BY task_id ASC, sort_order ASC`,
        taskIds,
      ),
      db.select<TaskCommentRow[]>(
        `SELECT task_id, id, author, content, created_at, sort_order
         FROM task_comments${filterClause}
         ORDER BY task_id ASC, sort_order ASC, created_at DESC, id ASC`,
        taskIds,
      ),
      db.select<TaskActivityRow[]>(
        `SELECT task_id, id, content, created_at, sort_order
         FROM task_activity${filterClause}
         ORDER BY task_id ASC, sort_order ASC, created_at DESC, id ASC`,
        taskIds,
      ),
    ])

  const tagIdsByTaskId = new Map<string, string[]>()
  const remindersByTaskId = new Map<string, Reminder[]>()
  const subtasksByTaskId = new Map<string, Subtask[]>()
  const attachmentsByTaskId = new Map<string, TaskAttachment[]>()
  const collaboratorsByTaskId = new Map<string, string[]>()
  const commentsByTaskId = new Map<string, Comment[]>()
  const activityByTaskId = new Map<string, ActivityItem[]>()

  taskTagRows.forEach((row) => appendMapValue(tagIdsByTaskId, row.task_id, row.tag_id))
  taskReminderRows.forEach((row) =>
    appendMapValue(remindersByTaskId, row.task_id, {
      id: row.id,
      label: row.label,
      value: row.value,
      kind: row.kind,
    }),
  )
  taskSubtaskRows.forEach((row) =>
    appendMapValue(subtasksByTaskId, row.task_id, {
      id: row.id,
      title: row.title,
      completed: Boolean(row.completed),
    }),
  )
  taskAttachmentRows.forEach((row) => {
    const attachment = normalizeTaskAttachment(parseJson<unknown>(row.attachment, row.attachment))
    if (attachment) {
      appendMapValue(attachmentsByTaskId, row.task_id, attachment)
    }
  })
  taskCollaboratorRows.forEach((row) => appendMapValue(collaboratorsByTaskId, row.task_id, row.collaborator))
  taskCommentRows.forEach((row) =>
    appendMapValue(commentsByTaskId, row.task_id, {
      id: row.id,
      author: row.author,
      content: row.content,
      createdAt: row.created_at,
    }),
  )
  taskActivityRows.forEach((row) =>
    appendMapValue(activityByTaskId, row.task_id, {
      id: row.id,
      content: row.content,
      createdAt: row.created_at,
    }),
  )

  return {
    tagIdsByTaskId,
    remindersByTaskId,
    subtasksByTaskId,
    attachmentsByTaskId,
    collaboratorsByTaskId,
    commentsByTaskId,
    activityByTaskId,
  }
}

const hydrateTaskRows = async (db: Database, taskRows: TaskRow[]): Promise<Task[]> => {
  const {
    tagIdsByTaskId,
    remindersByTaskId,
    subtasksByTaskId,
    attachmentsByTaskId,
    collaboratorsByTaskId,
    commentsByTaskId,
    activityByTaskId,
  } = await loadTaskRelations(db, taskRows.map((row) => row.id))

  return taskRows.map(
    ({
      id,
      title,
      note,
      list_id,
      tag_ids_json,
      priority,
      status,
      start_at,
      due_at,
      deadline_at,
      repeat_rule,
      reminders_json,
      subtasks_json,
      attachments_json,
      assignee,
      collaborators_json,
      comments_json,
      activity_json,
      estimated_pomodoros,
      completed_pomodoros,
      focus_minutes,
      completed,
      deleted,
      created_at,
      updated_at,
    }) => ({
      id,
      title,
      note,
      listId: list_id,
      tagIds: tagIdsByTaskId.get(id) ?? parseJson<string[]>(tag_ids_json, []),
      priority,
      status,
      startAt: start_at,
      dueAt: due_at,
      deadlineAt: deadline_at,
      repeatRule: repeat_rule,
      reminders: remindersByTaskId.get(id) ?? parseJson<Reminder[]>(reminders_json, []),
      subtasks: subtasksByTaskId.get(id) ?? parseJson<Subtask[]>(subtasks_json, []),
      attachments: attachmentsByTaskId.get(id) ?? parseTaskAttachments(attachments_json),
      assignee,
      collaborators: collaboratorsByTaskId.get(id) ?? parseJson<string[]>(collaborators_json, []),
      comments: commentsByTaskId.get(id) ?? parseJson<Comment[]>(comments_json, []),
      activity: activityByTaskId.get(id) ?? parseJson<ActivityItem[]>(activity_json, []),
      estimatedPomodoros: estimated_pomodoros,
      completedPomodoros: completed_pomodoros,
      focusMinutes: focus_minutes,
      completed: Boolean(completed),
      deleted: Boolean(deleted),
      createdAt: created_at,
      updatedAt: updated_at,
    }),
  )
}

const buildTaskWhere = (query: DesktopTaskQuery = {}) => {
  const params: unknown[] = []
  const clauses: string[] = []

  if (query.taskIds && query.taskIds.length > 0) {
    const normalizedTaskIds = unique(query.taskIds)
    clauses.push(`tasks.id IN (${buildPlaceholders(normalizedTaskIds.length, params.length)})`)
    params.push(...normalizedTaskIds)
  }

  const normalizedListIds = unique([...(query.listIds ?? []), ...(query.listId ? [query.listId] : [])])
  if (normalizedListIds.length === 1) {
    clauses.push(`tasks.list_id = $${params.length + 1}`)
    params.push(normalizedListIds[0])
  } else if (normalizedListIds.length > 1) {
    clauses.push(`tasks.list_id IN (${buildPlaceholders(normalizedListIds.length, params.length)})`)
    params.push(...normalizedListIds)
  }

  if (query.statuses && query.statuses.length > 0) {
    const normalizedStatuses = unique(query.statuses)
    clauses.push(`tasks.status IN (${buildPlaceholders(normalizedStatuses.length, params.length)})`)
    params.push(...normalizedStatuses)
  }

  if (query.priorities && query.priorities.length > 0) {
    const normalizedPriorities = unique(query.priorities)
    clauses.push(`tasks.priority IN (${buildPlaceholders(normalizedPriorities.length, params.length)})`)
    params.push(...normalizedPriorities)
  }

  if (typeof query.completed === 'boolean') {
    clauses.push(`tasks.completed = $${params.length + 1}`)
    params.push(toInteger(query.completed))
  }

  if (typeof query.deleted === 'boolean') {
    clauses.push(`tasks.deleted = $${params.length + 1}`)
    params.push(toInteger(query.deleted))
  } else if (!query.includeDeleted) {
    clauses.push(`tasks.deleted = $${params.length + 1}`)
    params.push(0)
  }

  if (query.dueBefore) {
    clauses.push(`tasks.due_at IS NOT NULL AND tasks.due_at <= $${params.length + 1}`)
    params.push(query.dueBefore)
  }

  if (query.dueAfter) {
    clauses.push(`tasks.due_at IS NOT NULL AND tasks.due_at >= $${params.length + 1}`)
    params.push(query.dueAfter)
  }

  if (query.dueMode) {
    const todayKey = getDateKey()
    const weekEndKey = addDays(todayKey, 7)
    const nowIso = getNowIso()
    const dateFieldSql = resolveDateFieldSql(query.timeFieldMode)
    const comparableFieldSql = resolveComparableTimeSql(query.timeFieldMode)

    if (query.dueMode === 'today') {
      clauses.push(`SUBSTR(${dateFieldSql}, 1, 10) = $${params.length + 1}`)
      params.push(todayKey)
    }

    if (query.dueMode === 'week') {
      clauses.push(`SUBSTR(${dateFieldSql}, 1, 10) >= $${params.length + 1} AND SUBSTR(${dateFieldSql}, 1, 10) <= $${params.length + 2}`)
      params.push(todayKey, weekEndKey)
    }

    if (query.dueMode === 'overdue') {
      clauses.push(`${comparableFieldSql} < $${params.length + 1}`)
      params.push(nowIso)
    }

    if (query.dueMode === 'today_or_overdue') {
      clauses.push(`(SUBSTR(${dateFieldSql}, 1, 10) = $${params.length + 1} OR ${comparableFieldSql} < $${params.length + 2})`)
      params.push(todayKey, nowIso)
    }
  }

  if (query.tagIds && query.tagIds.length > 0) {
    const normalizedTagIds = unique(query.tagIds)
    const tagPlaceholders = buildPlaceholders(normalizedTagIds.length, params.length)
    clauses.push(`tasks.id IN (
      SELECT task_id
      FROM task_tags
      WHERE tag_id IN (${tagPlaceholders})
      GROUP BY task_id
      HAVING COUNT(DISTINCT tag_id) = ${normalizedTagIds.length}
    )`)
    params.push(...normalizedTagIds)
  }

  if (query.keyword) {
    const normalizedKeyword = query.keyword.trim().toLowerCase()
    if (normalizedKeyword) {
      clauses.push(`LOWER(tasks.title || ' ' || tasks.note || ' ' || ${TASK_TAG_TEXT_SQL}) LIKE $${params.length + 1} ESCAPE '\\'`)
      params.push(`%${escapeLikePattern(normalizedKeyword)}%`)
    }
  }

  if (query.hasReminders) {
    clauses.push('EXISTS (SELECT 1 FROM task_reminders WHERE task_reminders.task_id = tasks.id LIMIT 1)')
  }

  if (query.attentionOnly) {
    clauses.push(`(tasks.due_at IS NOT NULL OR tasks.deadline_at IS NOT NULL OR EXISTS (SELECT 1 FROM task_reminders WHERE task_reminders.task_id = tasks.id LIMIT 1))`)
  }

  if (query.scheduledOnly) {
    clauses.push('(tasks.start_at IS NOT NULL OR tasks.due_at IS NOT NULL)')
  }

  if (query.calendarWindowStart && query.calendarWindowEnd) {
    clauses.push(`(
      (tasks.start_at IS NOT NULL AND SUBSTR(tasks.start_at, 1, 10) >= $${params.length + 1} AND SUBSTR(tasks.start_at, 1, 10) <= $${params.length + 2})
      OR
      (tasks.due_at IS NOT NULL AND SUBSTR(tasks.due_at, 1, 10) >= $${params.length + 1} AND SUBSTR(tasks.due_at, 1, 10) <= $${params.length + 2})
    )`)
    params.push(query.calendarWindowStart, query.calendarWindowEnd)
  }

  if (query.timelineWindowStart && query.timelineWindowEnd) {
    clauses.push(`(
      ${TASK_TIMELINE_START_COMPARABLE_SQL} IS NOT NULL
      AND ${TASK_TIMELINE_END_COMPARABLE_SQL} IS NOT NULL
      AND ${TASK_TIMELINE_START_COMPARABLE_SQL} < $${params.length + 2}
      AND ${TASK_TIMELINE_END_COMPARABLE_SQL} > $${params.length + 1}
    )`)
    params.push(query.timelineWindowStart, query.timelineWindowEnd)
  }

  return {
    params,
    whereSql: clauses.length > 0 ? ` WHERE ${clauses.join('\n   AND ')}` : '',
  }
}

const buildTaskSelectQuery = (query: DesktopTaskQuery = {}) => {
  const { params, whereSql } = buildTaskWhere(query)
  const normalizedLimit =
    typeof query.limit === 'number' && Number.isFinite(query.limit) && query.limit > 0 ? Math.floor(query.limit) : null
  const normalizedOffset =
    typeof query.offset === 'number' && Number.isFinite(query.offset) && query.offset > 0 ? Math.floor(query.offset) : 0
  const nextParams = [...params]

  const orderBySql =
    query.sortBy === 'timeline'
      ? `${TASK_TIMELINE_START_COMPARABLE_SQL} ASC, ${TASK_TIMELINE_END_COMPARABLE_SQL} ASC, tasks.sort_order ASC, tasks.updated_at DESC, tasks.id ASC`
      : query.sortBy === 'calendar'
        ? `${TASK_CALENDAR_SORT_DATE_SQL} ASC, tasks.sort_order ASC, tasks.updated_at DESC, tasks.id ASC`
        : 'tasks.sort_order ASC, tasks.updated_at DESC, tasks.id ASC'

  let paginationSql = ''
  if (normalizedLimit) {
    paginationSql += ` LIMIT $${nextParams.length + 1}`
    nextParams.push(normalizedLimit)

    if (normalizedOffset > 0) {
      paginationSql += ` OFFSET $${nextParams.length + 1}`
      nextParams.push(normalizedOffset)
    }
  } else if (normalizedOffset > 0) {
    paginationSql += ` LIMIT -1 OFFSET $${nextParams.length + 1}`
    nextParams.push(normalizedOffset)
  }

  return {
    params: nextParams,
    sql: `${TASK_SELECT_SQL}${whereSql}
 ORDER BY ${orderBySql}${paginationSql}`,
  }
}

const buildSelectionTaskQuery = ({
  selectionKind,
  selectionId,
  selectedTagIds = [],
  selectionTimeModes,
  includeCompleted = false,
  keyword,
  filters = [],
  scheduledOnly,
  calendarWindowStart,
  calendarWindowEnd,
  timelineWindowStart,
  timelineWindowEnd,
  limit,
  offset,
  sortBy,
}: DesktopTaskSelectionQuery): DesktopTaskQuery => {
  const query: DesktopTaskQuery = {
    keyword,
    scheduledOnly,
    calendarWindowStart,
    calendarWindowEnd,
    timelineWindowStart,
    timelineWindowEnd,
    limit,
    offset,
    sortBy,
  }
  const selectionTimeMode =
    selectionKind === 'system' && (selectionId === 'today' || selectionId === 'upcoming')
      ? selectionTimeModes?.[selectionId] ?? 'planned'
      : 'planned'

  const applySelectedTags = (existingTagIds?: string[]) => {
    const merged = unique([...(existingTagIds ?? []), ...selectedTagIds])
    if (merged.length > 0) {
      query.tagIds = merged
    }
  }

  if (selectionKind === 'system') {
    if (selectionId === 'completed') {
      query.completed = true
    } else if (selectionId === 'trash') {
      query.deleted = true
      query.includeDeleted = true
    } else {
      query.completed = includeCompleted ? undefined : false

      if (selectionId === 'today') {
        query.dueMode = 'today_or_overdue'
        query.timeFieldMode = selectionTimeMode
      }

      if (selectionId === 'upcoming') {
        query.dueMode = 'week'
        query.timeFieldMode = selectionTimeMode
      }

      if (selectionId === 'inbox') {
        query.listId = 'inbox'
      }
    }
  } else if (selectionKind === 'list') {
    query.listId = selectionId
    query.completed = includeCompleted ? undefined : false
  } else if (selectionKind === 'tag') {
    applySelectedTags([selectionId])
    query.completed = includeCompleted ? undefined : false
  } else if (selectionKind === 'filter') {
    const filter = filters.find((item) => item.id === selectionId)
    if (filter) {
      if (filter.listIds.length > 0) query.listIds = filter.listIds
      if (filter.priority.length > 0) query.priorities = filter.priority
      if (filter.due !== 'none') query.dueMode = filter.due
      applySelectedTags(filter.tagIds)
    } else {
      applySelectedTags()
    }
    query.completed = includeCompleted ? undefined : false
  } else if (selectionKind === 'tool') {
    query.completed = undefined
    applySelectedTags()
  } else {
    query.completed = includeCompleted ? undefined : false
    applySelectedTags()
  }

  if (selectionKind !== 'tag' && selectionKind !== 'filter') {
    applySelectedTags(query.tagIds)
  }

  return query
}

const insertTaskRelations = async (db: Database, task: Task) => {
  for (const [index, tagId] of normalizeTaskTagIds(task.tagIds).entries()) {
    await db.execute('INSERT INTO task_tags (task_id, tag_id, sort_order) VALUES ($1, $2, $3)', [task.id, tagId, index])
  }

  for (const [index, reminder] of task.reminders.entries()) {
    await db.execute(
      `INSERT INTO task_reminders (task_id, id, label, value, kind, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [task.id, reminder.id, reminder.label, reminder.value, reminder.kind, index],
    )
  }

  for (const [index, subtask] of task.subtasks.entries()) {
    await db.execute(
      `INSERT INTO task_subtasks (task_id, id, title, completed, sort_order)
       VALUES ($1, $2, $3, $4, $5)`,
      [task.id, subtask.id, subtask.title, toInteger(subtask.completed), index],
    )
  }

  for (const [index, attachment] of task.attachments.entries()) {
    await db.execute(
      `INSERT INTO task_attachments (task_id, sort_order, attachment)
       VALUES ($1, $2, $3)`,
      [task.id, index, encodeTaskAttachment(attachment)],
    )
  }

  for (const [index, collaborator] of task.collaborators.entries()) {
    await db.execute(
      `INSERT INTO task_collaborators (task_id, sort_order, collaborator)
       VALUES ($1, $2, $3)`,
      [task.id, index, collaborator],
    )
  }

  for (const [index, comment] of task.comments.entries()) {
    await db.execute(
      `INSERT INTO task_comments (task_id, id, author, content, created_at, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [task.id, comment.id, comment.author, comment.content, comment.createdAt, index],
    )
  }

  for (const [index, activityItem] of task.activity.entries()) {
    await db.execute(
      `INSERT INTO task_activity (task_id, id, content, created_at, sort_order)
       VALUES ($1, $2, $3, $4, $5)`,
      [task.id, activityItem.id, activityItem.content, activityItem.createdAt, index],
    )
  }
}

const deleteTaskRelations = async (db: Database, taskId: string) => {
  await db.execute('DELETE FROM task_activity WHERE task_id = $1', [taskId])
  await db.execute('DELETE FROM task_comments WHERE task_id = $1', [taskId])
  await db.execute('DELETE FROM task_collaborators WHERE task_id = $1', [taskId])
  await db.execute('DELETE FROM task_attachments WHERE task_id = $1', [taskId])
  await db.execute('DELETE FROM task_subtasks WHERE task_id = $1', [taskId])
  await db.execute('DELETE FROM task_reminders WHERE task_id = $1', [taskId])
  await db.execute('DELETE FROM task_tags WHERE task_id = $1', [taskId])
}


const upsertTaskRow = async (db: Database, task: Task, sortOrder: number) => {
  await db.execute(
    `INSERT INTO tasks (
      id,
      title,
      note,
      list_id,
      tag_ids_json,
      priority,
      status,
      start_at,
      due_at,
      deadline_at,
      repeat_rule,
      reminders_json,
      subtasks_json,
      attachments_json,
      assignee,
      collaborators_json,
      comments_json,
      activity_json,
      estimated_pomodoros,
      completed_pomodoros,
      focus_minutes,
      completed,
      deleted,
      created_at,
      updated_at,
      sort_order
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      note = excluded.note,
      list_id = excluded.list_id,
      tag_ids_json = excluded.tag_ids_json,
      priority = excluded.priority,
      status = excluded.status,
      start_at = excluded.start_at,
      due_at = excluded.due_at,
      deadline_at = excluded.deadline_at,
      repeat_rule = excluded.repeat_rule,
      reminders_json = excluded.reminders_json,
      subtasks_json = excluded.subtasks_json,
      attachments_json = excluded.attachments_json,
      assignee = excluded.assignee,
      collaborators_json = excluded.collaborators_json,
      comments_json = excluded.comments_json,
      activity_json = excluded.activity_json,
      estimated_pomodoros = excluded.estimated_pomodoros,
      completed_pomodoros = excluded.completed_pomodoros,
      focus_minutes = excluded.focus_minutes,
      completed = excluded.completed,
      deleted = excluded.deleted,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      sort_order = excluded.sort_order`,
    [
      task.id,
      task.title,
      task.note,
      task.listId,
      JSON.stringify(normalizeTaskTagIds(task.tagIds)),
      task.priority,
      task.status,
      task.startAt,
      task.dueAt,
      task.deadlineAt ?? null,
      task.repeatRule,
      JSON.stringify(task.reminders),
      JSON.stringify(task.subtasks),
      JSON.stringify(task.attachments),
      task.assignee,
      JSON.stringify(task.collaborators),
      JSON.stringify(task.comments),
      JSON.stringify(task.activity),
      task.estimatedPomodoros,
      task.completedPomodoros,
      task.focusMinutes,
      toInteger(task.completed),
      toInteger(task.deleted),
      task.createdAt,
      task.updatedAt,
      sortOrder,
    ],
  )
}

export const queryDesktopRepositoryTasks = async (query: DesktopTaskQuery = {}): Promise<Task[]> => {
  const db = await getDesktopDatabase()
  const { sql, params } = buildTaskSelectQuery(query)
  const taskRows = await db.select<TaskRow[]>(sql, params)
  return hydrateTaskRows(db, taskRows)
}

export const countDesktopRepositoryTasks = async (query: DesktopTaskQuery = {}) => {
  const db = await getDesktopDatabase()
  const { whereSql, params } = buildTaskWhere(query)
  const rows = await db.select<CountRow[]>(`SELECT COUNT(*) as count FROM tasks${whereSql}`, params)
  return rows[0]?.count ?? 0
}

export const queryDesktopRepositoryTaskStats = async (query: DesktopTaskQuery = {}): Promise<DesktopTaskStats> => {
  const db = await getDesktopDatabase()
  const { whereSql, params } = buildTaskWhere(query)
  const nowIso = getNowIso()
  const rows = await db.select<StatsRow[]>(
    `SELECT
      SUM(CASE WHEN tasks.completed = 0 THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN tasks.completed = 1 THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN tasks.completed = 0 AND ${TASK_RISK_COMPARABLE_SQL} < $${params.length + 1} THEN 1 ELSE 0 END) as overdue,
      SUM(CASE WHEN tasks.start_at IS NOT NULL OR tasks.due_at IS NOT NULL THEN 1 ELSE 0 END) as scheduled
     FROM tasks${whereSql}`,
    [...params, nowIso],
  )
  const stats = rows[0]

  return {
    active: stats?.active ?? 0,
    completed: stats?.completed ?? 0,
    overdue: stats?.overdue ?? 0,
    scheduled: stats?.scheduled ?? 0,
  }
}

export const queryDesktopRepositoryPriorityDistribution = async (
  query: DesktopTaskQuery = {},
): Promise<DesktopPriorityDistribution> => {
  const db = await getDesktopDatabase()
  const { whereSql, params } = buildTaskWhere(query)
  const rows = await db.select<PriorityDistributionRow[]>(
    `SELECT tasks.priority as priority, COUNT(*) as count
     FROM tasks${whereSql}
     GROUP BY tasks.priority
     ORDER BY CASE tasks.priority
       WHEN 'urgent' THEN 0
       WHEN 'high' THEN 1
       WHEN 'normal' THEN 2
       ELSE 3
     END ASC`,
    params,
  )

  const distribution: DesktopPriorityDistribution = {
    urgent: 0,
    high: 0,
    normal: 0,
    low: 0,
  }

  rows.forEach((row) => {
    distribution[row.priority] = row.count ?? 0
  })

  return distribution
}

export const queryDesktopRepositoryTagDistribution = async (
  query: DesktopTaskQuery = {},
): Promise<DesktopTagDistributionItem[]> => {
  const db = await getDesktopDatabase()
  const { whereSql, params } = buildTaskWhere(query)
  const rows = await db.select<TagDistributionRow[]>(
    `SELECT
      tags.id as id,
      tags.name as name,
      tags.color as color,
      tags.sort_order as sort_order,
      COUNT(DISTINCT tasks.id) as count
     FROM tasks
     INNER JOIN task_tags ON task_tags.task_id = tasks.id
     INNER JOIN tags ON tags.id = task_tags.tag_id${whereSql}
     GROUP BY tags.id, tags.name, tags.color, tags.sort_order
     ORDER BY count DESC, tags.sort_order ASC, tags.id ASC`,
    params,
  )

  return rows.map((row) => ({
    tag: {
      id: row.id,
      name: row.name,
      color: row.color,
    },
    count: row.count ?? 0,
  }))
}

export const queryDesktopRepositoryTasksBySelection = async (query: DesktopTaskSelectionQuery) =>
  queryDesktopRepositoryTasks(buildSelectionTaskQuery(query))

export const queryDesktopRepositoryTaskStatsBySelection = async (query: DesktopTaskSelectionQuery) =>
  queryDesktopRepositoryTaskStats(buildSelectionTaskQuery(query))

export const queryDesktopRepositoryPriorityDistributionBySelection = async (query: DesktopTaskSelectionQuery) =>
  queryDesktopRepositoryPriorityDistribution(buildSelectionTaskQuery(query))

export const queryDesktopRepositoryTagDistributionBySelection = async (query: DesktopTaskSelectionQuery) =>
  queryDesktopRepositoryTagDistribution(buildSelectionTaskQuery(query))

export const queryDesktopRepositorySelectionCounts = async ({
  lists,
  tags,
  filters,
  selectedTagIds = [],
  selectionTimeModes,
  keyword,
}: {
  lists: TodoList[]
  tags: Tag[]
  filters: SavedFilter[]
  selectedTagIds?: string[]
  selectionTimeModes?: PersistedState['selectionTimeModes']
  keyword?: string
}) => {
  const entries = [
    ['system:all', buildSelectionTaskQuery({ selectionKind: 'system', selectionId: 'all', filters, selectedTagIds, selectionTimeModes, keyword })],
    ['system:today', buildSelectionTaskQuery({ selectionKind: 'system', selectionId: 'today', filters, selectedTagIds, selectionTimeModes, keyword })],
    ['system:upcoming', buildSelectionTaskQuery({ selectionKind: 'system', selectionId: 'upcoming', filters, selectedTagIds, selectionTimeModes, keyword })],
    ['system:inbox', buildSelectionTaskQuery({ selectionKind: 'system', selectionId: 'inbox', filters, selectedTagIds, selectionTimeModes, keyword })],
    ['system:completed', buildSelectionTaskQuery({ selectionKind: 'system', selectionId: 'completed', filters, selectedTagIds, selectionTimeModes, keyword })],
    ['system:trash', buildSelectionTaskQuery({ selectionKind: 'system', selectionId: 'trash', filters, selectedTagIds, selectionTimeModes, keyword })],
    ...lists.map((list) => [`list:${list.id}`, buildSelectionTaskQuery({ selectionKind: 'list', selectionId: list.id, filters, selectedTagIds, selectionTimeModes, keyword })] as const),
    ...tags.map((tag) => [`tag:${tag.id}`, buildSelectionTaskQuery({ selectionKind: 'tag', selectionId: tag.id, filters, selectedTagIds, selectionTimeModes, keyword })] as const),
    ...filters.map((filter) => [`filter:${filter.id}`, buildSelectionTaskQuery({ selectionKind: 'filter', selectionId: filter.id, filters, selectedTagIds, selectionTimeModes, keyword })] as const),
  ] as const

  const counts = await Promise.all(entries.map(async ([key, query]) => [key, await countDesktopRepositoryTasks(query)] as const))
  return Object.fromEntries(counts) as Record<string, number>
}

export const queryDesktopReminderCandidateTasks = async () =>
  queryDesktopRepositoryTasks({ completed: false, attentionOnly: true })

export const loadDesktopRepositoryTask = async (taskId: string): Promise<Task | null> => {
  const tasks = await queryDesktopRepositoryTasks({ taskIds: [taskId], includeDeleted: true, limit: 1 })
  return tasks[0] ?? null
}

const loadDesktopWorkspaceMetadata = async (db: Database) => {
  const workspaceRows = await db.select<WorkspaceStateRow[]>(
    `SELECT
      theme,
      active_selection,
      selected_tag_ids_json,
      selection_time_modes_json,
      current_view,
      calendar_mode,
      calendar_show_completed,
      timeline_scale,
      fired_reminder_keys_json,
      onboarding_json
    FROM workspace_state
    WHERE id = $1
    LIMIT 1`,
    [WORKSPACE_ROW_ID],
  )


  const workspace = workspaceRows[0]
  if (!workspace) return null

  const [folderRows, listRows, tagRows, filterRows] = await Promise.all([
    db.select<FolderRow[]>('SELECT id, name, color, sort_order FROM folders ORDER BY sort_order ASC, id ASC'),
    db.select<ListRow[]>(
      'SELECT id, name, color, folder_id, kind, sort_order FROM lists ORDER BY sort_order ASC, id ASC',
    ),
    db.select<TagRow[]>('SELECT id, name, color, sort_order FROM tags ORDER BY sort_order ASC, id ASC'),
    db.select<FilterRow[]>(
      `SELECT
        id,
        name,
        icon,
        list_ids_json,
        tag_ids_json,
        priority_json,
        due,
        sort_order
       FROM filters
       ORDER BY sort_order ASC, id ASC`,
    ),
  ])

  return {
    folders: folderRows.map(({ id, name, color }) => ({ id, name, color })),
    lists: listRows.map(({ id, name, color, folder_id, kind }) => ({
      id,
      name,
      color,
      folderId: folder_id,
      kind,
    })),
    tags: tagRows.map(({ id, name, color }) => ({ id, name, color })),
    filters: filterRows.map(({ id, name, icon, list_ids_json, tag_ids_json, priority_json, due }) => ({
      id,
      name,
      icon,
      listIds: parseJson<string[]>(list_ids_json, []),
      tagIds: parseJson<string[]>(tag_ids_json, []),
      priority: parseJson<SavedFilter['priority']>(priority_json, []),
      due,
    })),
    theme: workspace.theme,
    activeSelection: workspace.active_selection,
    selectedTagIds: parseJson<string[]>(workspace.selected_tag_ids_json, []),
    selectionTimeModes: parseJson<PersistedState['selectionTimeModes']>(workspace.selection_time_modes_json, { today: 'planned', upcoming: 'planned' }),
    currentView: workspace.current_view,
    calendarMode: workspace.calendar_mode,
    calendarShowCompleted: Boolean(workspace.calendar_show_completed),
    timelineScale: workspace.timeline_scale,
    firedReminderKeys: parseJson<string[]>(workspace.fired_reminder_keys_json, []),
    onboarding: parseJson<PersistedState['onboarding']>(workspace.onboarding_json, {
      version: 'v1',
      status: 'dismissed',
      currentStepId: null,
      completedStepIds: [],
      lastSeenAt: null,
      seedScenarioVersion: 'legacy',
    }),
  }
}

const saveWorkspaceStateRow = async (db: Database, state: DesktopWorkspaceStateInput) => {
  await db.execute(
    `INSERT INTO workspace_state (
      id,
      theme,
      active_selection,
      selected_tag_ids_json,
      selection_time_modes_json,
      current_view,
      calendar_mode,
      calendar_show_completed,
      timeline_scale,
      fired_reminder_keys_json,
      onboarding_json,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT(id) DO UPDATE SET
      theme = excluded.theme,
      active_selection = excluded.active_selection,
      selected_tag_ids_json = excluded.selected_tag_ids_json,
      selection_time_modes_json = excluded.selection_time_modes_json,
      current_view = excluded.current_view,
      calendar_mode = excluded.calendar_mode,
      calendar_show_completed = excluded.calendar_show_completed,
      timeline_scale = excluded.timeline_scale,
      fired_reminder_keys_json = excluded.fired_reminder_keys_json,
      onboarding_json = excluded.onboarding_json,
      updated_at = excluded.updated_at`,
    [
      WORKSPACE_ROW_ID,
      state.theme,
      state.activeSelection,
      JSON.stringify(state.selectedTagIds),
      JSON.stringify(state.selectionTimeModes ?? { today: 'planned', upcoming: 'planned' }),
      state.currentView,
      state.calendarMode,
      toInteger(state.calendarShowCompleted),
      state.timelineScale,
      JSON.stringify(state.firedReminderKeys),
      JSON.stringify(state.onboarding),
      getNowIso(),
    ],
  )
}

const resolveTaskSortOrder = async (db: Database, taskId: string) => {
  const existing = await db.select<Array<{ sort_order: number }>>('SELECT sort_order FROM tasks WHERE id = $1 LIMIT 1', [taskId])
  if (existing[0]) return existing[0].sort_order

  const rows = await db.select<Array<{ sort_order: number | null }>>('SELECT MIN(sort_order) as sort_order FROM tasks')
  const minSortOrder = rows[0]?.sort_order
  return typeof minSortOrder === 'number' ? minSortOrder - 1 : 0
}

export const loadDesktopWorkspaceShellState = async (): Promise<DesktopWorkspaceShellState | null> => {
  const db = await getDesktopDatabase()
  const metadata = await loadDesktopWorkspaceMetadata(db)
  if (!metadata) return null

  return {
    ...metadata,
    tasks: [],
  }
}

export const saveDesktopWorkspaceShellState = async (state: DesktopWorkspaceStateInput) => {
  const db = await getDesktopDatabase()
  await saveWorkspaceStateRow(db, state)
}

export const upsertDesktopRepositoryTask = async (task: Task) => {
  const db = await getDesktopDatabase()
  const sortOrder = await resolveTaskSortOrder(db, task.id)

  try {
    await db.execute('BEGIN TRANSACTION')
    await upsertTaskRow(db, task, sortOrder)
    await deleteTaskRelations(db, task.id)
    await insertTaskRelations(db, task)
    await db.execute('COMMIT')
  } catch (error) {
    try {
      await db.execute('ROLLBACK')
    } catch {
      // ignore rollback errors triggered after failed transaction setup
    }

    throw error
  }
}

export const loadDesktopRepositoryState = async (): Promise<PersistedState | null> => {
  const db = await getDesktopDatabase()
  const metadata = await loadDesktopWorkspaceMetadata(db)
  if (!metadata) return null
  const tasks = await queryDesktopRepositoryTasks({ includeDeleted: true })

  return {
    ...metadata,
    tasks,
  }
}

export const saveDesktopRepositoryState = async (state: PersistedState) => {
  // ⚠️ 此函数用于迁移场景（snapshot/legacy → repository）。
  // 已移除全量 diff + DELETE 逻辑——只做 upsert，永不删除已有任务。
  console.warn('[PLOG][FULL-SYNC] saveDesktopRepositoryState called with', state.tasks.length, 'tasks (DELETE disabled)', new Error().stack?.split('\n').slice(1, 4).join(' ← '))
  const db = await getDesktopDatabase()

  const existingTaskSignatureById = new Map<string, string>()
  const existingTasks = await queryDesktopRepositoryTasks({ includeDeleted: true })
  existingTasks.forEach((task, index) => existingTaskSignatureById.set(task.id, buildTaskSignature(task, index)))
  const changedTasks = state.tasks.filter((task, index) => existingTaskSignatureById.get(task.id) !== buildTaskSignature(task, index))

  try {
    await db.execute('BEGIN TRANSACTION')

    await db.execute(
      `INSERT INTO workspace_state (
        id,
        theme,
        active_selection,
        selected_tag_ids_json,
        selection_time_modes_json,
        current_view,
        calendar_mode,
        calendar_show_completed,
        timeline_scale,
        fired_reminder_keys_json,
        onboarding_json,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT(id) DO UPDATE SET
        theme = excluded.theme,
        active_selection = excluded.active_selection,
        selected_tag_ids_json = excluded.selected_tag_ids_json,
        selection_time_modes_json = excluded.selection_time_modes_json,
        current_view = excluded.current_view,
        calendar_mode = excluded.calendar_mode,
        calendar_show_completed = excluded.calendar_show_completed,
        timeline_scale = excluded.timeline_scale,
        fired_reminder_keys_json = excluded.fired_reminder_keys_json,
        onboarding_json = excluded.onboarding_json,
        updated_at = excluded.updated_at`,
      [
        WORKSPACE_ROW_ID,
        state.theme,
        state.activeSelection,
        JSON.stringify(state.selectedTagIds),
        JSON.stringify(state.selectionTimeModes ?? { today: 'planned', upcoming: 'planned' }),
        state.currentView,
        state.calendarMode,
        toInteger(state.calendarShowCompleted),
        state.timelineScale,
        JSON.stringify(state.firedReminderKeys),
        JSON.stringify(state.onboarding),
        getNowIso(),
      ],
    )

    for (const [index, folder] of state.folders.entries()) {
      await db.execute(
        `INSERT INTO folders (id, name, color, sort_order)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           color = excluded.color,
           sort_order = excluded.sort_order`,
        [folder.id, folder.name, folder.color, index],
      )
    }

    for (const [index, list] of state.lists.entries()) {
      await db.execute(
        `INSERT INTO lists (id, name, color, folder_id, kind, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           color = excluded.color,
           folder_id = excluded.folder_id,
           kind = excluded.kind,
           sort_order = excluded.sort_order`,
        [list.id, list.name, list.color, list.folderId, list.kind, index],
      )
    }

    for (const [index, tag] of state.tags.entries()) {
      await db.execute(
        `INSERT INTO tags (id, name, color, sort_order)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           color = excluded.color,
           sort_order = excluded.sort_order`,
        [tag.id, tag.name, tag.color, index],
      )
    }

    for (const [index, filter] of state.filters.entries()) {
      await db.execute(
        `INSERT INTO filters (
          id,
          name,
          icon,
          list_ids_json,
          tag_ids_json,
          priority_json,
          due,
          sort_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          icon = excluded.icon,
          list_ids_json = excluded.list_ids_json,
          tag_ids_json = excluded.tag_ids_json,
          priority_json = excluded.priority_json,
          due = excluded.due,
          sort_order = excluded.sort_order`,
        [
          filter.id,
          filter.name,
          filter.icon,
          JSON.stringify(filter.listIds),
          JSON.stringify(filter.tagIds),
          JSON.stringify(filter.priority),
          filter.due,
          index,
        ],
      )
    }

    // 不再删除任务——只 upsert 有变化的任务
    for (const [index, task] of state.tasks.entries()) {
      if (!changedTasks.some((item) => item.id === task.id)) continue
      await upsertTaskRow(db, task, index)
      await deleteTaskRelations(db, task.id)
      await insertTaskRelations(db, task)
    }

    await db.execute('COMMIT')
  } catch (error) {
    try {
      await db.execute('ROLLBACK')
    } catch {
      // ignore rollback errors triggered after failed transaction setup
    }

    throw error
  }
}
