export type Priority = 'urgent' | 'high' | 'normal' | 'low'
export type TaskStatus = 'todo' | 'doing' | 'done'
export type ThemeMode = 'midnight' | 'paper' | 'system'
export type ThemeResolved = 'midnight' | 'paper'
export type WorkspaceView = 'list' | 'calendar' | 'kanban' | 'timeline' | 'matrix'
export type CalendarMode = 'month' | 'week' | 'agenda'
export type TimelineScale = 'day' | 'week'
export type TimeFieldMode = 'planned' | 'deadline'
export type TimeSelectionKey = 'today' | 'upcoming'
export type OnboardingStatus = 'not_started' | 'in_progress' | 'completed' | 'dismissed'
export type OnboardingStepId = 'create-task' | 'schedule-task' | 'drag-task' | 'detail-task' | 'complete-task'
export type OnboardingScenarioVersion = 'v1' | 'legacy'

export interface Folder {
  id: string
  name: string
  color: string
}

export interface TodoList {
  id: string
  name: string
  color: string
  folderId: string | null
  kind: 'system' | 'custom'
}

export interface Tag {
  id: string
  name: string
  color: string
}

export interface Reminder {
  id: string
  label: string
  value: string
  kind: 'relative' | 'absolute'
}

export interface Subtask {
  id: string
  title: string
  completed: boolean
}

export interface Comment {
  id: string
  author: string
  content: string
  createdAt: string
}

export interface ActivityItem {
  id: string
  content: string
  createdAt: string
}

export interface TaskAttachment {
  id: string
  name: string
  source: 'embedded' | 'desktop-path'
  path: string | null
  dataUrl: string | null
  mimeType: string | null
  size: number | null
  addedAt: string
}

export interface Task {
  id: string
  title: string
  note: string
  listId: string
  tagIds: string[]
  isUrgent: boolean
  isImportant: boolean
  priority: Priority
  status: TaskStatus
  startAt: string | null
  dueAt: string | null
  deadlineAt?: string | null
  repeatRule: string
  reminders: Reminder[]
  subtasks: Subtask[]
  attachments: TaskAttachment[]
  assignee: string | null
  collaborators: string[]
  comments: Comment[]
  activity: ActivityItem[]
  estimatedPomodoros: number
  completedPomodoros: number
  focusMinutes: number
  completed: boolean
  deleted: boolean
  sortOrder?: number
  createdAt: string
  updatedAt: string
}

export interface SavedFilter {
  id: string
  name: string
  icon: string
  listIds: string[]
  tagIds: string[]
  priority: Priority[]
  due: 'overdue' | 'today' | 'week' | 'none'
}

export interface OnboardingState {
  version: 'v1'
  status: OnboardingStatus
  currentStepId: OnboardingStepId | null
  completedStepIds: OnboardingStepId[]
  lastSeenAt: string | null
  seedScenarioVersion: OnboardingScenarioVersion
}

export interface PersistedState {
  folders: Folder[]
  lists: TodoList[]
  tags: Tag[]
  filters: SavedFilter[]
  tasks: Task[]
  theme: ThemeMode
  activeSelection: string
  selectedTagIds: string[]
  selectionTimeModes?: Partial<Record<TimeSelectionKey, TimeFieldMode>>
  currentView: WorkspaceView
  calendarMode: CalendarMode
  calendarShowCompleted: boolean
  timelineScale: TimelineScale
  firedReminderKeys: string[]
  onboarding: OnboardingState
}
