import type { Priority, TaskStatus, WorkspaceView, Task, TodoList, Tag, CalendarMode, TimelineScale } from './domain'

// Suppress unused import warnings — these are re-exported for use in other modules
export type { Priority, TaskStatus, WorkspaceView, Task, TodoList, Tag, CalendarMode, TimelineScale }

export type TagMutationResult =
  | { ok: true; tagId: string }
  | { ok: false; message: string }

export type QuickCreateFeedback = {
  title: string
  listId: string
  listName: string
  visibleInWorkspace: boolean
  workspaceLabel: string
}

export type TimelineDragMode = 'move' | 'resize-start' | 'resize-end'

export type TimelineDragState = {
  taskId: string
  mode: TimelineDragMode
  originX: number
  laneWidth: number
  originStart: number
  originEnd: number
  previewStart: number
  previewEnd: number
  windowStart: number
  windowEnd: number
  totalMinutes: number
  stepMinutes: number
}

export type ProjectionInsightMode = 'unscheduled' | 'outside'

export type ProjectionSummaryMetric = {
  label: string
  value: string | number
  hint?: string
  onClick?: () => void
  active?: boolean
  disabled?: boolean
}

export type ProjectionRecoveryItem = {
  id: string
  title: string
  subtitle: string
  actionLabel: string
  onAction: () => void
}

export type DragPreviewPayload = {
  title: string
  status: TaskStatus
  priority: Priority
  meta: string
  overdue?: boolean
}

export type PointerDragPreviewState = DragPreviewPayload & {
  taskId: string
  x: number
  y: number
  deltaX: number
  deltaY: number
}

export type PointerDragSession = {
  pointerId: number
  taskId: string
  startX: number
  startY: number
  dragged: boolean
  sourceElement: HTMLElement
  sourceRect: DOMRect
  preview: DragPreviewPayload
}

export type StatusChangeFeedback = {
  taskId: string
  title: string
  fromStatus: TaskStatus
  toStatus: TaskStatus
}

export type CreateTaskPayload = {
  title: string
  note?: string
  listId: string
  priority: Priority
  tagIds?: string[]
  isUrgent?: boolean
  isImportant?: boolean
  status?: TaskStatus
  dueAt?: string | null
  startAt?: string | null
  deadlineAt?: string | null
  activityLabel: string
  markOnboardingScheduleComplete?: boolean
}

export type InlineCreatePositionMode = 'floating' | 'top-docked'

export type InlineCreatePosition = {
  x: number
  y: number
  mode: InlineCreatePositionMode
}

export type InlineCreateDraft = {
  view: WorkspaceView
  title: string
  note: string
  listId: string
  priority: Priority
  tagIds: string[]
  isUrgent: boolean
  isImportant: boolean
  status: TaskStatus
  dateKey: string
  time: string
  guidance: string
  position: InlineCreatePosition
}

export type InlineCreateRequest = {
  view: WorkspaceView
  anchorRect: DOMRect
  dateKey?: string
  listId?: string
  priority?: Priority
  tagIds?: string[]
  isUrgent?: boolean
  isImportant?: boolean
  status?: TaskStatus
  guidance?: string
  time?: string
}
