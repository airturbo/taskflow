/**
 * Pure helper functions, constants, and types extracted from App.tsx.
 * These have no React dependencies and are safe to import anywhere.
 */
import type { CSSProperties } from 'react'
import { getNowIso, formatDateTime } from './dates'
import { getTimelinePercent } from '@taskflow/core'
import type {
  Priority,
  Task,
  TaskAttachment,
  TaskStatus,
  TimeFieldMode,
  WorkspaceView,
} from '../types/domain'
import {
  isTaskRiskOverdue,
  getTaskPrimaryScheduleAt,
  formatTaskDeadlineBadge,
  getTaskDeadlineMarkerTone,
  getTaskDeadlineMarkerTitle,
  isTaskPlannedAfterDeadline,
  formatTaskDualTimeSummary,
} from '@taskflow/core'

// ---- Constants ----

export const statusOptions: TaskStatus[] = ['todo', 'doing', 'done']

export const viewMeta: { id: WorkspaceView; label: string }[] = [
  { id: 'calendar', label: '\u65E5\u5386' },
  { id: 'list', label: '\u5217\u8868' },
  { id: 'kanban', label: '\u770B\u677F' },
  { id: 'timeline', label: '\u65F6\u95F4\u7EBF' },
  { id: 'matrix', label: '\u56DB\u8C61\u9650' },
]

export const timeFieldModeLabel: Record<TimeFieldMode, string> = {
  planned: '\u8BA1\u5212',
  deadline: 'DDL',
}

export const MINUTE = 60 * 1000
export const DAY_MINUTES = 24 * 60
export const MAX_EMBEDDED_ATTACHMENT_BYTES = 1.5 * 1024 * 1024
export const REMINDER_ANCHOR_OPTIONS = ['deadline', 'planned', 'start'] as const
export const REMINDER_UNIT_OPTIONS = ['m', 'h', 'd'] as const

export const POINTER_DRAG_THRESHOLD = 6
export const POINTER_DRAG_BLOCK_SELECTOR = 'select, input, textarea, button, a, label'

export const INLINE_CREATE_VIEWPORT_GUTTER = 16
export const INLINE_CREATE_MAX_WIDTH = 460
export const INLINE_CREATE_ESTIMATED_HEIGHT = 720
export const INLINE_CREATE_TOP_DOCK_THRESHOLD = 72
export const INLINE_CREATE_POSITION_STORAGE_KEY = 'todo-workspace-inline-create-position-v1'
export const NOTE_EDITOR_LINE_HEIGHT = 24

export const PRESET_COLORS = [
  '#6c63ff', '#4f46e5', '#0ea5e9', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#8b5cf6', '#06b6d4', '#84cc16',
]

// ---- Types ----

export type TagMutationResult =
  | { ok: true; tagId: string }
  | { ok: false; message: string }

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

export type CreateTaskPayload = {
  title: string
  note?: string
  listId: string
  priority: Priority
  tagIds?: string[]
  status?: TaskStatus
  dueAt?: string | null
  startAt?: string | null
  deadlineAt?: string | null
  activityLabel: string
  markOnboardingScheduleComplete?: boolean
}

export type InlineCreateRequest = {
  view: WorkspaceView
  anchorRect: DOMRect
  dateKey?: string
  listId?: string
  priority?: Priority
  tagIds?: string[]
  status?: TaskStatus
  guidance?: string
  time?: string
}

// ---- Helper Functions ----

export const makeId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`

export const canUseBrowserFilePicker = () => typeof window !== 'undefined' && typeof window.FileReader !== 'undefined'

export const normalizeTagName = (value: string) => value.trim().replace(/\s+/g, ' ')

export const formatAttachmentSize = (size: number | null) => {
  if (!size || size <= 0) return null
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`
  return `${(size / (1024 * 1024)).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

export const getAttachmentMetaLabel = (attachment: TaskAttachment) => {
  const pieces = [attachment.source === 'desktop-path' ? '\u672C\u5730\u6587\u4EF6' : attachment.dataUrl ? '\u5D4C\u5165\u526F\u672C' : '\u9644\u4EF6']
  const sizeLabel = formatAttachmentSize(attachment.size)
  if (sizeLabel) pieces.push(sizeLabel)
  return pieces.join(' \u00B7 ')
}

export const upsertTaskInCache = (items: Task[], nextTask: Task, prepend = false) => {
  const existingIndex = items.findIndex((task) => task.id === nextTask.id)
  if (existingIndex === -1) {
    return prepend ? [nextTask, ...items] : [...items, nextTask]
  }

  const nextItems = [...items]
  nextItems[existingIndex] = nextTask
  return nextItems
}

export const shouldIgnorePointerDragStart = (target: EventTarget | null, currentTarget: HTMLElement) => {
  if (!(target instanceof HTMLElement)) return false
  const blocker = target.closest<HTMLElement>(POINTER_DRAG_BLOCK_SELECTOR)
  return Boolean(blocker && blocker !== currentTarget)
}

export const resolveDropZoneValueFromPoint = (clientX: number, clientY: number, selector: string, attribute: string) => {
  if (typeof document === 'undefined') return null
  const element = document.elementFromPoint(clientX, clientY)
  if (!(element instanceof HTMLElement)) return null
  return element.closest<HTMLElement>(selector)?.getAttribute(attribute) ?? null
}

export const markClickSuppressed = (ref: { current: boolean }) => {
  ref.current = true
  window.setTimeout(() => {
    ref.current = false
  }, 0)
}

export const handleCardKeyboardActivation = (event: React.KeyboardEvent<HTMLElement>, onActivate: () => void) => {
  if (event.target !== event.currentTarget) return
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  onActivate()
}

export const buildTaskAttachment = ({
  name,
  source,
  path = null,
  dataUrl = null,
  mimeType = null,
  size = null,
}: {
  name: string
  source: TaskAttachment['source']
  path?: string | null
  dataUrl?: string | null
  mimeType?: string | null
  size?: number | null
}): TaskAttachment => ({
  id: makeId('att'),
  name,
  source,
  path,
  dataUrl,
  mimeType,
  size,
  addedAt: getNowIso(),
})

export const buildRelativeReminderValue = (anchor: typeof REMINDER_ANCHOR_OPTIONS[number], amount: number, unit: typeof REMINDER_UNIT_OPTIONS[number]) => `${anchor}|${amount}${unit}`

export const formatReminderOffsetLabel = (amount: number, unit: typeof REMINDER_UNIT_OPTIONS[number]) => {
  if (amount === 0) return '\u5230\u70B9\u63D0\u9192'
  if (unit === 'm') return `\u63D0\u524D ${amount} \u5206\u949F`
  if (unit === 'h') return `\u63D0\u524D ${amount} \u5C0F\u65F6`
  return `\u63D0\u524D ${amount} \u5929`
}

export const formatReminderAnchorLabel = (anchor: typeof REMINDER_ANCHOR_OPTIONS[number]) => {
  if (anchor === 'deadline') return 'DDL'
  if (anchor === 'planned') return '\u8BA1\u5212\u5B8C\u6210'
  return '\u5F00\u59CB\u65F6\u95F4'
}

export const buildPointerDragPreviewState = (current: PointerDragSession, clientX: number, clientY: number): PointerDragPreviewState => ({
  taskId: current.taskId,
  ...current.preview,
  x: clientX,
  y: clientY,
  deltaX: clientX - current.startX,
  deltaY: clientY - current.startY,
})

export const getPointerDragStyle = (taskId: string, dragTaskId: string | null, dragPreview: PointerDragPreviewState | null): CSSProperties | undefined => {
  if (dragTaskId !== taskId || !dragPreview || dragPreview.taskId !== taskId) return undefined

  return {
    opacity: 0.18,
    pointerEvents: 'none',
    boxShadow: 'none',
  }
}

export const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('\u8BFB\u53D6\u6587\u4EF6\u5931\u8D25'))
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.readAsDataURL(file)
  })

export const getTaskDeadlineAt = (task: Task) => task.deadlineAt ?? null

export const buildTaskDragPreview = (task: Task, meta?: string): DragPreviewPayload => ({
  title: task.title,
  status: task.status,
  priority: task.priority,
  meta: meta ?? formatDateTime(getTaskPrimaryScheduleAt(task) ?? getTaskDeadlineAt(task) ?? ''),
  overdue: isTaskRiskOverdue(task),
})

export function formatSnoozeLabel(minutes: number) {
  if (minutes < 60) return `${minutes} \u5206\u949F`
  const hours = minutes / 60
  return Number.isInteger(hours) ? `${hours} \u5C0F\u65F6` : `${hours.toFixed(1)} \u5C0F\u65F6`
}

export function getDateTimeMs(value: string | null, boundary: 'start' | 'end' = 'start') {
  if (!value) return null
  const normalized = value.includes('T') ? value : `${value}T${boundary === 'end' ? '23:59' : '09:00'}`
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date.getTime()
}

export function toLocalInputValue(value: string | null) {
  if (!value) return ''
  return value.length === 10 ? `${value}T09:00` : value.slice(0, 16)
}

// ---- Inline Create Position Helpers ----

export function clampInlineCreatePosition(x: number, y: number, width = INLINE_CREATE_MAX_WIDTH, height = INLINE_CREATE_ESTIMATED_HEIGHT) {
  return {
    x: Math.min(Math.max(INLINE_CREATE_VIEWPORT_GUTTER, x), Math.max(INLINE_CREATE_VIEWPORT_GUTTER, window.innerWidth - width - INLINE_CREATE_VIEWPORT_GUTTER)),
    y: Math.min(Math.max(INLINE_CREATE_VIEWPORT_GUTTER, y), Math.max(INLINE_CREATE_VIEWPORT_GUTTER, window.innerHeight - height - INLINE_CREATE_VIEWPORT_GUTTER)),
  }
}

export function getTopDockedInlineCreatePosition(width = INLINE_CREATE_MAX_WIDTH, height = INLINE_CREATE_ESTIMATED_HEIGHT) {
  const centered = clampInlineCreatePosition(window.innerWidth / 2 - width / 2, INLINE_CREATE_VIEWPORT_GUTTER, width, height)
  return { ...centered, mode: 'top-docked' as const }
}

export function normalizeInlineCreatePosition(position: { x: number; y: number; mode: string }, width = INLINE_CREATE_MAX_WIDTH, height = INLINE_CREATE_ESTIMATED_HEIGHT) {
  if (position.mode === 'top-docked') return getTopDockedInlineCreatePosition(width, height)
  return { ...clampInlineCreatePosition(position.x, position.y, width, height), mode: 'floating' as const }
}

export function readInlineCreatePositionMemory() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(INLINE_CREATE_POSITION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { mode?: string; x?: number; y?: number }
    if (parsed.mode === 'top-docked') return { x: 0, y: INLINE_CREATE_VIEWPORT_GUTTER, mode: 'top-docked' as const }
    if (parsed.mode === 'floating' && Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
      return { x: Number(parsed.x), y: Number(parsed.y), mode: 'floating' as const }
    }
  } catch {
    return null
  }
  return null
}

export function persistInlineCreatePositionMemory(position: { x: number; y: number; mode: string }) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(INLINE_CREATE_POSITION_STORAGE_KEY, JSON.stringify(position))
  } catch {
    // noop
  }
}

export function getInlineCreateInitialPosition(anchorRect: DOMRect) {
  const width = Math.min(INLINE_CREATE_MAX_WIDTH, window.innerWidth - INLINE_CREATE_VIEWPORT_GUTTER * 2)
  const height = Math.min(INLINE_CREATE_ESTIMATED_HEIGHT, window.innerHeight - INLINE_CREATE_VIEWPORT_GUTTER * 2)
  const centeredX = anchorRect.left + anchorRect.width / 2 - width / 2
  const spaceAbove = anchorRect.top - INLINE_CREATE_VIEWPORT_GUTTER
  const spaceBelow = window.innerHeight - anchorRect.bottom - INLINE_CREATE_VIEWPORT_GUTTER
  const shouldOpenAbove = spaceBelow < 420 && spaceAbove > spaceBelow
  const anchoredY = shouldOpenAbove ? anchorRect.top - height - 14 : anchorRect.bottom + 14
  const fallbackY = window.innerHeight / 2 - height / 2
  const y = spaceAbove < 240 && spaceBelow < 240 ? fallbackY : anchoredY
  return clampInlineCreatePosition(centeredX, y, width, height)
}

export function resolveInlineCreateInitialPosition(anchorRect: DOMRect) {
  const width = Math.min(INLINE_CREATE_MAX_WIDTH, window.innerWidth - INLINE_CREATE_VIEWPORT_GUTTER * 2)
  const height = Math.min(INLINE_CREATE_ESTIMATED_HEIGHT, window.innerHeight - INLINE_CREATE_VIEWPORT_GUTTER * 2)
  const rememberedPosition = readInlineCreatePositionMemory()
  if (rememberedPosition) return normalizeInlineCreatePosition(rememberedPosition, width, height)
  const anchored = getInlineCreateInitialPosition(anchorRect)
  return { ...anchored, mode: 'floating' as const }
}

// ---- Task Deadline Widget Helpers ----

export function getTaskDeadlineMarkerOffset(task: Task, windowStart: number, windowEnd: number) {
  const deadlineAt = getDateTimeMs(getTaskDeadlineAt(task), 'end')
  if (!deadlineAt || deadlineAt < windowStart || deadlineAt > windowEnd) return null
  return getTimelinePercent(deadlineAt, windowStart, windowEnd)
}

export { isTaskRiskOverdue, getTaskPrimaryScheduleAt, formatTaskDeadlineBadge, getTaskDeadlineMarkerTone, getTaskDeadlineMarkerTitle, isTaskPlannedAfterDeadline, formatTaskDualTimeSummary }
