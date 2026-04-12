import type { KeyboardEvent } from 'react'
import type { TaskAttachment, Task } from '../types/domain'
import type { PointerDragSession, PointerDragPreviewState, InlineCreatePosition, DragPreviewPayload } from '../types/workspace'
import { getNowIso, formatDateTime } from './dates'
import { isTaskRiskOverdue, getTaskPrimaryScheduleAt } from '@taskflow/core'
import type { CSSProperties } from 'react'

// ----------------------------------------------------------------
// Tag helpers
// ----------------------------------------------------------------

export const getTagToneStyle = (color: string) => ({
  borderColor: `${color}22`,
  background: `${color}12`,
})

export const normalizeTagName = (value: string) => value.trim().replace(/\s+/g, ' ')

export const isSystemTagId = (tagId: string, systemTagIds: string[]) => systemTagIds.includes(tagId)

// ----------------------------------------------------------------
// Time constants
// ----------------------------------------------------------------

export const MINUTE = 60 * 1000
export const DAY_MINUTES = 24 * 60
export const WEEK_MINUTES = 7 * DAY_MINUTES
export const MAX_EMBEDDED_ATTACHMENT_BYTES = 1.5 * 1024 * 1024
export const REMINDER_ANCHOR_OPTIONS = ['deadline', 'planned', 'start'] as const
export const REMINDER_UNIT_OPTIONS = ['m', 'h', 'd'] as const

export const canUseBrowserFilePicker = () => typeof window !== 'undefined' && typeof window.FileReader !== 'undefined'

export const makeId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`

// ----------------------------------------------------------------
// Attachment helpers
// ----------------------------------------------------------------

export const formatAttachmentSize = (size: number | null) => {
  if (!size || size <= 0) return null
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`
  return `${(size / (1024 * 1024)).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

export const getAttachmentMetaLabel = (attachment: TaskAttachment) => {
  const pieces = [attachment.source === 'desktop-path' ? '本地文件' : attachment.dataUrl ? '嵌入副本' : '附件']
  const sizeLabel = formatAttachmentSize(attachment.size)
  if (sizeLabel) pieces.push(sizeLabel)
  return pieces.join(' · ')
}

// ----------------------------------------------------------------
// Task cache helpers
// ----------------------------------------------------------------

export const upsertTaskInCache = (items: Task[], nextTask: Task, prepend = false) => {
  const existingIndex = items.findIndex((task) => task.id === nextTask.id)
  if (existingIndex === -1) {
    return prepend ? [nextTask, ...items] : [...items, nextTask]
  }

  const nextItems = [...items]
  nextItems[existingIndex] = nextTask
  return nextItems
}

// ----------------------------------------------------------------
// Pointer drag constants & helpers
// ----------------------------------------------------------------

export const POINTER_DRAG_THRESHOLD = 6
export const POINTER_DRAG_BLOCK_SELECTOR = 'select, input, textarea, button, a, label'
export const SEARCH_QUERY_DEBOUNCE_MS = 140

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

export const handleCardKeyboardActivation = (event: KeyboardEvent<HTMLElement>, onActivate: () => void) => {
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
  if (amount === 0) return '到点提醒'
  if (unit === 'm') return `提前 ${amount} 分钟`
  if (unit === 'h') return `提前 ${amount} 小时`
  return `提前 ${amount} 天`
}

export const formatReminderAnchorLabel = (anchor: typeof REMINDER_ANCHOR_OPTIONS[number]) => {
  if (anchor === 'deadline') return 'DDL'
  if (anchor === 'planned') return '计划完成'
  return '开始时间'
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
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'))
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

// ----------------------------------------------------------------
// Inline create position helpers
// ----------------------------------------------------------------

export const INLINE_CREATE_VIEWPORT_GUTTER = 16
export const INLINE_CREATE_MAX_WIDTH = 460
export const INLINE_CREATE_ESTIMATED_HEIGHT = 720
export const INLINE_CREATE_TOP_DOCK_THRESHOLD = 72
export const INLINE_CREATE_POSITION_STORAGE_KEY = 'todo-workspace-inline-create-position-v1'
export const NOTE_EDITOR_LINE_HEIGHT = 24

export function clampInlineCreatePosition(x: number, y: number, width = INLINE_CREATE_MAX_WIDTH, height = INLINE_CREATE_ESTIMATED_HEIGHT) {
  return {
    x: Math.min(Math.max(INLINE_CREATE_VIEWPORT_GUTTER, x), Math.max(INLINE_CREATE_VIEWPORT_GUTTER, window.innerWidth - width - INLINE_CREATE_VIEWPORT_GUTTER)),
    y: Math.min(Math.max(INLINE_CREATE_VIEWPORT_GUTTER, y), Math.max(INLINE_CREATE_VIEWPORT_GUTTER, window.innerHeight - height - INLINE_CREATE_VIEWPORT_GUTTER)),
  }
}

export function getTopDockedInlineCreatePosition(width = INLINE_CREATE_MAX_WIDTH, height = INLINE_CREATE_ESTIMATED_HEIGHT): InlineCreatePosition {
  const centered = clampInlineCreatePosition(window.innerWidth / 2 - width / 2, INLINE_CREATE_VIEWPORT_GUTTER, width, height)
  return { ...centered, mode: 'top-docked' }
}

export function normalizeInlineCreatePosition(position: InlineCreatePosition, width = INLINE_CREATE_MAX_WIDTH, height = INLINE_CREATE_ESTIMATED_HEIGHT): InlineCreatePosition {
  if (position.mode === 'top-docked') return getTopDockedInlineCreatePosition(width, height)
  return { ...clampInlineCreatePosition(position.x, position.y, width, height), mode: 'floating' }
}

export function readInlineCreatePositionMemory(): InlineCreatePosition | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(INLINE_CREATE_POSITION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<InlineCreatePosition>
    if (parsed.mode === 'top-docked') return { x: 0, y: INLINE_CREATE_VIEWPORT_GUTTER, mode: 'top-docked' }
    if (parsed.mode === 'floating' && Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
      return { x: Number(parsed.x), y: Number(parsed.y), mode: 'floating' }
    }
  } catch {
    return null
  }
  return null
}

export function persistInlineCreatePositionMemory(position: InlineCreatePosition) {
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

export function resolveInlineCreateInitialPosition(anchorRect: DOMRect): InlineCreatePosition {
  const width = Math.min(INLINE_CREATE_MAX_WIDTH, window.innerWidth - INLINE_CREATE_VIEWPORT_GUTTER * 2)
  const height = Math.min(INLINE_CREATE_ESTIMATED_HEIGHT, window.innerHeight - INLINE_CREATE_VIEWPORT_GUTTER * 2)
  const rememberedPosition = readInlineCreatePositionMemory()
  if (rememberedPosition) return normalizeInlineCreatePosition(rememberedPosition, width, height)
  const anchored = getInlineCreateInitialPosition(anchorRect)
  return { ...anchored, mode: 'floating' }
}

// ----------------------------------------------------------------
// Date/time helpers
// ----------------------------------------------------------------

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

export function formatSnoozeLabel(minutes: number) {
  if (minutes < 60) return `${minutes} 分钟`
  const hours = minutes / 60
  return Number.isInteger(hours) ? `${hours} 小时` : `${hours.toFixed(1)} 小时`
}

// ----------------------------------------------------------------
// Color presets
// ----------------------------------------------------------------

export const PRESET_COLORS = [
  '#6c63ff', '#4f46e5', '#0ea5e9', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#8b5cf6', '#06b6d4', '#84cc16',
]
