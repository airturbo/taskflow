import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useAuth } from './hooks/useAuth'
import { useRealtimeSync } from './hooks/useRealtimeSync'
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts'
import { useSystemTheme } from './hooks/useSystemTheme'
import { usePushNotifications } from './hooks/usePushNotifications'
import { useWorkspaceData } from './hooks/useWorkspaceData'
import { useViewState } from './hooks/useViewState'
import { useModalState, type ProjectionInsightMode } from './hooks/useModalState'
import { useTaskSelection } from './hooks/useTaskSelection'
import { useFilterState } from './hooks/useFilterState'
import { useViewConfig } from './hooks/useViewConfig'
import { useNavigationState } from './hooks/useNavigationState'
import { useQuickCreate, type InlineCreateDraft, type InlineCreatePosition, type InlineCreatePositionMode, type QuickCreateFeedback, type StatusChangeFeedback } from './hooks/useQuickCreate'
import { useMobileDialogs } from './hooks/useMobileDialogs'
import { isSupabaseEnabled } from './utils/supabase'
import { useMobileUiStore } from './stores/mobileUiStore'
import { SyncIndicator } from './components/SyncIndicator'
import { ShortcutPanel } from './components/ShortcutPanel'
import { ExportPanel } from './components/ExportPanel'
import { CommandPalette } from './components/CommandPalette'
import { FolderListItem, SidebarSection, NavButton } from './components/WorkspaceSidebar'
import { AppSidebar } from './components/AppSidebar'
import { StatusBadge, StatusSelectBadge, PrioritySelectBadge, DragPreviewLayer, EmptyState } from './components/shared'
import { ReminderCenterPanel } from './components/ReminderCenterPanel'
import { ListView } from './components/views/ListView'
import { TagPicker, TagManagementDialog } from './components/TagManagementDialog'
import { NoteEditorField, TaskDetailPanel } from './components/TaskDetailPanel'
import { InlineCreatePopover } from './components/InlineCreatePopover'
import { ResponsiveDrawer, TaskBottomSheet } from './components/TaskBottomSheet'
import { CalendarView } from './components/views/CalendarView'
import { KanbanView } from './components/views/KanbanView'
import { TimelineView } from './components/views/TimelineView'
import { MatrixView } from './components/views/MatrixView'
import { StatsView, ProjectionSummary, ProjectionRecoveryPanel } from './components/views/StatsView'
import { MobileTaskDetailContent } from './mobile/MobileTaskDetailContent'
import { MobileFocusView } from './mobile/MobileFocusView'
import { MobileCalendarView } from './mobile/MobileCalendarView'
import { MobileMatrixView } from './mobile/MobileMatrixView'
import { MobileProjectsView } from './mobile/MobileProjectsView'
import { MobileMeView } from './mobile/MobileMeView'
import { MobileQuickCreateSheet, MobileConfirmSheet, MobilePromptSheet, MobileTagManagerSheet } from './mobile/MobileSheets'
import { PwaInstallBanner } from './components/PwaInstallBanner'
import { ViewErrorBoundary } from './components/ViewErrorBoundary'
import { enqueueOfflineState, flushOfflineQueue, hasPendingQueue } from './utils/offline-queue'
import type {
  CalendarMode,
  Comment,
  PersistedState,
  Priority,
  Tag,
  Task,
  TaskAttachment,
  TaskStatus,
  ThemeMode,
  TimeFieldMode,
  TimeSelectionKey,
  TimelineScale,
  TodoList,
  WorkspaceView,
} from './types/domain'
import { useReminderCenter, type ReminderFeedItem } from './hooks/useReminderCenter'
import {
  addDays,
  addMonths,
  buildMonthMatrix,
  buildWeek,
  diffDateKeys,
  formatDateTime,
  formatDayLabel,
  formatMonthLabel,
  formatWeekRange,
  getDateKey,
  getNowIso,
  isOverdue,
  isToday,
  isWithinDays,
  shiftDateTimeByDays,
} from './utils/dates'
import { collectReminderEvents, describeReminder, formatTaskWindow } from './utils/reminder-engine'
import { requestAuthScreen } from './utils/auth-events'
import { loadState, saveState, setCurrentUserId } from './utils/storage'
import { parseSmartEntry } from './utils/smart-entry'
import { getLunarDate } from './utils/lunar'
import { createNextRepeatTask, describeRepeatRule } from './utils/repeat-rule'
import { openPath } from '@tauri-apps/plugin-opener'
import {
  priorityMeta, statusMeta, statusUiMeta, TAG_COLOR_PRESETS,
  SPECIAL_TAG_IDS, type MatrixQuadrantKey,
} from '@taskflow/core'
import {
  getTasksForSelection, matchesSearch, matchesSelectedTags,
  normalizeTaskPatch, buildTaskStats, getQuadrant, getQuadrantLabel,
  getTagIdsForQuadrant, ensureSpecialTags, isTaskRiskOverdue, getTaskDisplayTimeValue,
  hasTaskSchedule, isTaskVisibleInCalendarWindow,
  getCalendarTaskAnchor, getCalendarTaskDateKey, getPreferredFocusedCalendarDate,
  groupTasksByDay, compareTasksByProjectionDistance, getProjectionAnchorDateKey,
  isTaskPlannedAfterDeadline, getTaskPrimaryScheduleAt, formatTaskDualTimeSummary,
  formatTaskDeadlineBadge, getTaskDeadlineMarkerTone, getTaskDeadlineMarkerTitle,
} from '@taskflow/core'
import {
  getTaskTimelineRange, clampTimelineRange, snapTimelineMinutes, getTimelinePercent,
  buildTimelineScaleMarks, buildTimelineCreateSlots, formatTimelineBarLabel,
  getDateTimeValueFromMs,
  buildTimelineDraftWindow, getTimelineWindowLabel, isTaskVisibleInTimelineWindow,
  TIMELINE_STEP_MINUTES,
} from '@taskflow/core'

const statusOptions: TaskStatus[] = ['todo', 'doing', 'done']

const viewMeta: { id: WorkspaceView; label: string }[] = [
  { id: 'calendar', label: '日历' },
  { id: 'list', label: '列表' },
  { id: 'kanban', label: '看板' },
  { id: 'timeline', label: '时间线' },
  { id: 'matrix', label: '四象限' },
]

const timeFieldModeLabel: Record<TimeFieldMode, string> = {
  planned: '计划',
  deadline: 'DDL',
}

const SYSTEM_TAG_IDS = Object.values(SPECIAL_TAG_IDS)

type TagMutationResult =
  | { ok: true; tagId: string }
  | { ok: false; message: string }

const normalizeTagName = (value: string) => value.trim().replace(/\s+/g, ' ')
const isSystemTagId = (tagId: string) => SYSTEM_TAG_IDS.includes(tagId as (typeof SYSTEM_TAG_IDS)[number])

const MINUTE = 60 * 1000
const DAY_MINUTES = 24 * 60
const MAX_EMBEDDED_ATTACHMENT_BYTES = 1.5 * 1024 * 1024
const REMINDER_ANCHOR_OPTIONS = ['deadline', 'planned', 'start'] as const
const REMINDER_UNIT_OPTIONS = ['m', 'h', 'd'] as const

const canUseBrowserFilePicker = () => typeof window !== 'undefined' && typeof window.FileReader !== 'undefined'

const makeId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`

const formatAttachmentSize = (size: number | null) => {
  if (!size || size <= 0) return null
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`
  return `${(size / (1024 * 1024)).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

const getAttachmentMetaLabel = (attachment: TaskAttachment) => {
  const pieces = [attachment.source === 'desktop-path' ? '本地文件' : attachment.dataUrl ? '嵌入副本' : '附件']
  const sizeLabel = formatAttachmentSize(attachment.size)
  if (sizeLabel) pieces.push(sizeLabel)
  return pieces.join(' · ')
}

const upsertTaskInCache = (items: Task[], nextTask: Task, prepend = false) => {
  const existingIndex = items.findIndex((task) => task.id === nextTask.id)
  if (existingIndex === -1) {
    return prepend ? [nextTask, ...items] : [...items, nextTask]
  }

  const nextItems = [...items]
  nextItems[existingIndex] = nextTask
  return nextItems
}


type TimelineDragMode = 'move' | 'resize-start' | 'resize-end'

type TimelineDragState = {
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

type ProjectionSummaryMetric = {
  label: string
  value: string | number
  hint?: string
  onClick?: () => void
  active?: boolean
  disabled?: boolean
}

type ProjectionRecoveryItem = {
  id: string
  title: string
  subtitle: string
  actionLabel: string
  onAction: () => void
}

type DragPreviewPayload = {
  title: string
  status: TaskStatus
  priority: Priority
  meta: string
  overdue?: boolean
}

type PointerDragPreviewState = DragPreviewPayload & {
  taskId: string
  x: number
  y: number
  deltaX: number
  deltaY: number
}

type PointerDragSession = {
  pointerId: number
  taskId: string
  startX: number
  startY: number
  dragged: boolean
  sourceElement: HTMLElement
  sourceRect: DOMRect
  preview: DragPreviewPayload
}

const POINTER_DRAG_THRESHOLD = 6
const POINTER_DRAG_BLOCK_SELECTOR = 'select, input, textarea, button, a, label'

const shouldIgnorePointerDragStart = (target: EventTarget | null, currentTarget: HTMLElement) => {
  if (!(target instanceof HTMLElement)) return false
  const blocker = target.closest<HTMLElement>(POINTER_DRAG_BLOCK_SELECTOR)
  return Boolean(blocker && blocker !== currentTarget)
}

const resolveDropZoneValueFromPoint = (clientX: number, clientY: number, selector: string, attribute: string) => {
  if (typeof document === 'undefined') return null
  const element = document.elementFromPoint(clientX, clientY)
  if (!(element instanceof HTMLElement)) return null
  return element.closest<HTMLElement>(selector)?.getAttribute(attribute) ?? null
}

const markClickSuppressed = (ref: { current: boolean }) => {
  ref.current = true
  window.setTimeout(() => {
    ref.current = false
  }, 0)
}

const handleCardKeyboardActivation = (event: React.KeyboardEvent<HTMLElement>, onActivate: () => void) => {
  if (event.target !== event.currentTarget) return
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  onActivate()
}

const buildTaskAttachment = ({
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

const buildRelativeReminderValue = (anchor: typeof REMINDER_ANCHOR_OPTIONS[number], amount: number, unit: typeof REMINDER_UNIT_OPTIONS[number]) => `${anchor}|${amount}${unit}`

const formatReminderOffsetLabel = (amount: number, unit: typeof REMINDER_UNIT_OPTIONS[number]) => {
  if (amount === 0) return '到点提醒'
  if (unit === 'm') return `提前 ${amount} 分钟`
  if (unit === 'h') return `提前 ${amount} 小时`
  return `提前 ${amount} 天`
}

const formatReminderAnchorLabel = (anchor: typeof REMINDER_ANCHOR_OPTIONS[number]) => {
  if (anchor === 'deadline') return 'DDL'
  if (anchor === 'planned') return '计划完成'
  return '开始时间'
}

const buildPointerDragPreviewState = (current: PointerDragSession, clientX: number, clientY: number): PointerDragPreviewState => ({
  taskId: current.taskId,
  ...current.preview,
  x: clientX,
  y: clientY,
  deltaX: clientX - current.startX,
  deltaY: clientY - current.startY,
})

const getPointerDragStyle = (taskId: string, dragTaskId: string | null, dragPreview: PointerDragPreviewState | null): CSSProperties | undefined => {
  if (dragTaskId !== taskId || !dragPreview || dragPreview.taskId !== taskId) return undefined

  return {
    opacity: 0.18,
    pointerEvents: 'none',
    boxShadow: 'none',
  }
}

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'))
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.readAsDataURL(file)
  })

const getTaskDeadlineAt = (task: Task) => task.deadlineAt ?? null

const buildTaskDragPreview = (task: Task, meta?: string): DragPreviewPayload => ({
  title: task.title,
  status: task.status,
  priority: task.priority,
  meta: meta ?? formatDateTime(getTaskPrimaryScheduleAt(task) ?? getTaskDeadlineAt(task) ?? ''),
  overdue: isTaskRiskOverdue(task),
})

function TaskDeadlineIndicators({ task, compact = false }: { task: Task; compact?: boolean }) {
  const deadlineBadge = formatTaskDeadlineBadge(task)
  const tone = getTaskDeadlineMarkerTone(task)
  if (!deadlineBadge || !tone) return null

  const plannedAfterDeadline = isTaskPlannedAfterDeadline(task)
  const title = getTaskDeadlineMarkerTitle(task) ?? deadlineBadge

  return (
    <div className={`task-deadline-indicators ${compact ? 'is-compact' : ''}`}>
      <span className={`time-badge ${tone === 'danger' ? 'is-danger' : tone === 'warning' ? 'is-warning' : 'is-deadline'}`} title={title} aria-label={title}>
        {compact ? 'DDL' : deadlineBadge}
      </span>
      {plannedAfterDeadline && <span className="time-badge is-warning">{compact ? '晚于 DDL' : '计划晚于 DDL'}</span>}
    </div>
  )
}

function TaskDeadlineDot({ task }: { task: Task }) {
  const tone = getTaskDeadlineMarkerTone(task)
  const title = getTaskDeadlineMarkerTitle(task)
  if (!tone || !title) return null
  return <span className={`task-deadline-dot is-${tone}`} aria-label={title} title={title} />
}

function getTaskDeadlineMarkerOffset(task: Task, windowStart: number, windowEnd: number) {
  const deadlineAt = getDateTimeMs(getTaskDeadlineAt(task), 'end')
  if (!deadlineAt || deadlineAt < windowStart || deadlineAt > windowEnd) return null
  return getTimelinePercent(deadlineAt, windowStart, windowEnd)
}

function TaskTimeSummary({ task, compact = false }: { task: Task; compact?: boolean }) {
  const deadlineBadge = formatTaskDeadlineBadge(task)
  const overdue = isTaskRiskOverdue(task)
  const plannedAfterDeadline = isTaskPlannedAfterDeadline(task)

  return (
    <div className={`task-time-summary ${compact ? 'is-compact' : ''}`}>
      <span className={`task-time-summary__primary ${overdue ? 'is-danger' : ''}`}>{formatTaskDualTimeSummary(task, { emptyLabel: '未排期' })}</span>
      {deadlineBadge && <span className={`time-badge ${overdue ? 'is-danger' : 'is-deadline'}`}>{deadlineBadge}</span>}
      {plannedAfterDeadline && <span className="time-badge is-warning">计划晚于 DDL</span>}
    </div>
  )
}

type CreateTaskPayload = {
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

type InlineCreateRequest = {
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

const INLINE_CREATE_VIEWPORT_GUTTER = 16
const INLINE_CREATE_MAX_WIDTH = 460
const INLINE_CREATE_ESTIMATED_HEIGHT = 720
const INLINE_CREATE_TOP_DOCK_THRESHOLD = 72
const INLINE_CREATE_POSITION_STORAGE_KEY = 'todo-workspace-inline-create-position-v1'
const NOTE_EDITOR_LINE_HEIGHT = 24

function clampInlineCreatePosition(x: number, y: number, width = INLINE_CREATE_MAX_WIDTH, height = INLINE_CREATE_ESTIMATED_HEIGHT) {
  return {
    x: Math.min(Math.max(INLINE_CREATE_VIEWPORT_GUTTER, x), Math.max(INLINE_CREATE_VIEWPORT_GUTTER, window.innerWidth - width - INLINE_CREATE_VIEWPORT_GUTTER)),
    y: Math.min(Math.max(INLINE_CREATE_VIEWPORT_GUTTER, y), Math.max(INLINE_CREATE_VIEWPORT_GUTTER, window.innerHeight - height - INLINE_CREATE_VIEWPORT_GUTTER)),
  }
}

function getTopDockedInlineCreatePosition(width = INLINE_CREATE_MAX_WIDTH, height = INLINE_CREATE_ESTIMATED_HEIGHT): InlineCreatePosition {
  const centered = clampInlineCreatePosition(window.innerWidth / 2 - width / 2, INLINE_CREATE_VIEWPORT_GUTTER, width, height)
  return { ...centered, mode: 'top-docked' }
}

function normalizeInlineCreatePosition(position: InlineCreatePosition, width = INLINE_CREATE_MAX_WIDTH, height = INLINE_CREATE_ESTIMATED_HEIGHT): InlineCreatePosition {
  if (position.mode === 'top-docked') return getTopDockedInlineCreatePosition(width, height)
  return { ...clampInlineCreatePosition(position.x, position.y, width, height), mode: 'floating' }
}

function readInlineCreatePositionMemory(): InlineCreatePosition | null {
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

function persistInlineCreatePositionMemory(position: InlineCreatePosition) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(INLINE_CREATE_POSITION_STORAGE_KEY, JSON.stringify(position))
  } catch {
    // noop
  }
}

function getInlineCreateInitialPosition(anchorRect: DOMRect) {
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

function resolveInlineCreateInitialPosition(anchorRect: DOMRect): InlineCreatePosition {
  const width = Math.min(INLINE_CREATE_MAX_WIDTH, window.innerWidth - INLINE_CREATE_VIEWPORT_GUTTER * 2)
  const height = Math.min(INLINE_CREATE_ESTIMATED_HEIGHT, window.innerHeight - INLINE_CREATE_VIEWPORT_GUTTER * 2)
  const rememberedPosition = readInlineCreatePositionMemory()
  if (rememberedPosition) return normalizeInlineCreatePosition(rememberedPosition, width, height)
  const anchored = getInlineCreateInitialPosition(anchorRect)
  return { ...anchored, mode: 'floating' }
}


function App() {
  const { user } = useAuth()
  const [initialState, setInitialState] = useState<PersistedState | null>(null)
  const authScopeKey = user?.id ?? 'guest'

  useEffect(() => {
    let active = true
    setInitialState(null)
    setCurrentUserId(user?.id ?? null)

    const bootstrap = async () => {
      const persisted = await loadState()
      if (active) setInitialState(persisted)
    }

    void bootstrap()

    return () => {
      active = false
    }
  }, [authScopeKey, user?.id])

  if (!initialState) {
    return (
      <div className="app-shell">
        <main className="workspace">
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">local-first bootstrap</p>
                <h3>正在载入 TaskFlow</h3>
              </div>
            </div>
            <p>先恢复本地工作区，再按网络情况补做云同步。</p>
          </section>
        </main>
      </div>
    )
  }

  return <WorkspaceApp key={authScopeKey} initialState={initialState} />
}

function WorkspaceApp({ initialState }: { initialState: PersistedState }) {
  const { user, signOut } = useAuth()
  const { isSupported: pushSupported, isSubscribed: pushSubscribed, subscribe: subscribePush, unsubscribe: unsubscribePush } = usePushNotifications(user?.id ?? null)

  // ---- 云同步（本地优先，尽力而为） ----
  const handleRemoteUpdate = (remoteState: Partial<PersistedState>) => {
    // newer-wins：远端有更新时，用远端数据覆盖对应字段
    // tasks 字段做增量合并：以 updatedAt 更新的任务胜出
    if (remoteState.tasks) {
      const remoteTasks = remoteState.tasks
      setTasks(localTasks => {
        const localMap = new Map(localTasks.map(t => [t.id, t]))
        const merged = [...localTasks]
        for (const remoteTask of remoteTasks) {
          const local = localMap.get(remoteTask.id)
          if (!local || remoteTask.updatedAt > local.updatedAt) {
            const idx = merged.findIndex(t => t.id === remoteTask.id)
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

  const { syncStatus, lastSyncedAt, forceSync, pauseSync, resumeSync } = useRealtimeSync({
    userId: user?.id ?? null,
    onRemoteUpdate: handleRemoteUpdate,
  })

  const handleManualSync = useCallback(async () => {
    if (user?.id && hasPendingQueue()) {
      await flushOfflineQueue()
    }
    await forceSync()
  }, [forceSync, user?.id])

  // 网络恢复时 flush 离线队列
  useEffect(() => {
    const handleOnline = async () => {
      if (hasPendingQueue() && user?.id) {
        await flushOfflineQueue()
      }
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [user?.id])

  // Tab 可见性变化时暂停 / 恢复 Realtime 订阅，节省服务端连接
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        pauseSync()
      } else {
        resumeSync()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [pauseSync, resumeSync])

  // 云同步不可用时将当前快照加入队列，确保后续仍可补同步
  useEffect(() => {
    if ((syncStatus === 'offline' || syncStatus === 'error') && user?.id) {
      enqueueOfflineState(user.id, {
        folders, lists, tags, filters, tasks, theme,
        activeSelection, selectedTagIds, selectionTimeModes: selectionTimeModes ?? {},
        currentView, calendarMode, calendarShowCompleted,
        timelineScale, firedReminderKeys, onboarding: initialState.onboarding,
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncStatus])
  // desktopMode 已废弃：App 端和 Web 端统一使用 localStorage 存储
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const desktopMode = false

  // ---- Navigation ----
  const nav = useNavigationState(initialState)
  const { activeSelection, setActiveSelection, selectionKind, selectionId, isToolSelection } = nav

  // ---- View Config ----
  const viewConfig = useViewConfig(initialState)
  const {
    currentView, setCurrentView, calendarMode, setCalendarMode,
    calendarShowCompleted, setCalendarShowCompleted, timelineScale, setTimelineScale,
    calendarAnchor, setCalendarAnchor, theme, setTheme,
    selectionTimeModes, setSelectionTimeModes, updateSelectionTimeMode,
  } = viewConfig

  // ---- Filter ----
  const filterState = useFilterState(nav.migratedSelectedTagIds)
  const {
    selectedTagIds, setSelectedTagIds, searchInput, setSearchInput,
    searchKeyword, setSearchKeyword, searchInputRef, toggleSelectedTag,
  } = filterState

  // ---- Task Selection ----
  const selection = useTaskSelection(
    initialState.tasks.find((t: Task) => !t.deleted)?.id ?? null,
  )
  const {
    selectedTaskId, setSelectedTaskId, bulkSelectedIds, setBulkSelectedIds,
    bulkMode, setBulkMode, toggleBulkSelect, clearBulkSelect,
  } = selection

  // ---- UI Modals ----
  const modals = useModalState()
  const {
    tagManagerOpen, setTagManagerOpen, shortcutPanelOpen, setShortcutPanelOpen,
    commandPaletteOpen, setCommandPaletteOpen, exportPanelOpen, setExportPanelOpen,
    navigationDrawerOpen, setNavigationDrawerOpen, utilityDrawerOpen, setUtilityDrawerOpen,
    taskSheetOpen, setTaskSheetOpen, sidebarExpanded, setSidebarExpanded,
    projectionInsightMode, setProjectionInsightMode,
  } = modals

  // ---- Data (stays inline — cross-domain) ----
  const [folders, setFolders] = useState(initialState.folders)
  const [lists, setLists] = useState(initialState.lists)
  const [tags, setTags] = useState(() => ensureSpecialTags(initialState.tags))
  const [filters, setFilters] = useState(initialState.filters)
  const [tasks, setTasks] = useState(initialState.tasks)
  const { resolvedTheme, cycleTheme, themeIcon, themeLabel } = useSystemTheme(theme, setTheme)

  // ---- Quick Create + Inline Create ----
  const {
    quickEntry, setQuickEntry, quickListId, setQuickListId,
    quickPriority, setQuickPriority, quickTagIds, setQuickTagIds,
    quickCreateInputRef,
    inlineCreate, setInlineCreate,
    createFeedback, setCreateFeedback,
    statusChangeFeedback, setStatusChangeFeedback,
    toggleQuickTag, toggleInlineCreateTag,
  } = useQuickCreate()
  const [firedReminderKeys, setFiredReminderKeys] = useState(initialState.firedReminderKeys)
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth)

  // ---- 移动端专属状态（通过 mobileUiStore Zustand store 管理，减少主组件 re-render）----
  type MobileTab = 'focus' | 'calendar' | 'matrix' | 'me'
  const {
    mobileTab, setMobileTab,
    mobileTabFading, setMobileTabFading,
    mobileFocusScope, mobileFocusScopeListId, setMobileFocusScope: _setMobileFocusScopeStore, mobileFocusScopeMenuOpen, setMobileFocusScopeMenuOpen,
    mobileFocusUpcomingCollapsed, setMobileFocusUpcomingCollapsed,
    mobileCalendarModeMenuOpen, setMobileCalendarModeMenuOpen,
    quickCreateOpen: mobileQuickCreateOpen, openQuickCreate: _openQuickCreate, closeQuickCreate,
    completionToast: mobileCompletionToast, showCompletionToast, hideCompletionToast,
  } = useMobileUiStore()

  // 代理函数（保持调用方接口不变）
  const setMobileQuickCreateOpen = (open: boolean) => open ? _openQuickCreate() : closeQuickCreate()
  const setMobileCompletionToast = (toast: { taskId: string; title: string } | null) =>
    toast ? showCompletionToast(toast) : hideCompletionToast()
  const setMobileFocusScope = (scope: 'all' | 'today' | 'week' | 'list') =>
    _setMobileFocusScopeStore(scope, mobileFocusScopeListId)
  const setMobileFocusScopeListId = (listId: string | null) =>
    _setMobileFocusScopeStore(mobileFocusScope, listId)
  // completionToastTimerRef — toast timer managed by store; keep ref for compat with direct clearTimeout
  const completionToastTimerRef = useRef<number | null>(null)
  // Cleanup toast timer on unmount (UX-01)
  useEffect(() => {
    return () => {
      if (completionToastTimerRef.current) window.clearTimeout(completionToastTimerRef.current)
    }
  }, [])

  // Track which list is selected in the projects tab (null = project list view)
  const [mobileProjectListId, setMobileProjectListId] = useState<string | null>(null)
  // Track view mode within a project list on mobile
  type MobileListViewMode = 'list' | 'kanban' | 'matrix'
  const [_mobileListViewMode, _setMobileListViewMode] = useState<MobileListViewMode>('list')
  const [mobileMatrixViewMode, setMobileMatrixViewMode] = useState<'matrix' | 'kanban' | 'timeline'>('matrix')
  // Focus page sort mode
  const [mobileFocusSortMode, setMobileFocusSortMode] = useState<'planned' | 'deadline'>('planned')
  // v3: matrix mode menu in topbar (需求3)
  const [mobileMatrixModeMenuOpen, setMobileMatrixModeMenuOpen] = useState(false)
  // v3: "我的"页 projects sub-view
  const [meShowProjects, setMeShowProjects] = useState(false)

  // ---- 清单/文件夹编辑状态 moved to AppSidebar ----

  const {
    reminderFeed,
    notificationPermission,
    appendReminderFeed,
    notifySurface,
    requestNotificationPermission,
    dismissReminderFeedItem,
    clearReminderFeed,
    markReminderSnoozed,
  } = useReminderCenter()

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme
  }, [resolvedTheme])

  useEffect(() => {
    void saveState({
      folders,
      lists,
      tags,
      filters,
      tasks,
      theme,
      activeSelection,
      selectedTagIds,
      selectionTimeModes,
      currentView,
      calendarMode,
      calendarShowCompleted,
      timelineScale,
      firedReminderKeys,
      onboarding: initialState.onboarding,
    })
  }, [activeSelection, calendarMode, calendarShowCompleted, currentView, filters, firedReminderKeys, folders, lists, selectedTagIds, selectionTimeModes, tags, tasks, theme, timelineScale])

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // 全局快捷键
  useGlobalShortcuts([
    {
      key: 'n', meta: 'cmdOrCtrl',
      description: '新建任务',
      action: () => quickCreateInputRef.current?.focus(),
    },
    {
      key: 'k', meta: 'cmdOrCtrl',
      description: '命令面板',
      action: () => setCommandPaletteOpen(prev => !prev),
    },
    {
      key: 'Escape',
      description: '取消选中',
      action: () => { setSelectedTaskId(null); searchInputRef.current?.blur() },
    },
    {
      key: '1', description: '切换到日历视图',
      action: () => setCurrentView('calendar'),
    },
    {
      key: '2', description: '切换到列表视图',
      action: () => setCurrentView('list'),
    },
    {
      key: '3', description: '切换到看板视图',
      action: () => setCurrentView('kanban'),
    },
    {
      key: '4', description: '切换到时间线视图',
      action: () => setCurrentView('timeline'),
    },
    {
      key: '5', description: '切换到四象限视图',
      action: () => setCurrentView('matrix'),
    },
    {
      key: '?', description: '快捷键面板',
      action: () => setShortcutPanelOpen(prev => !prev),
    },
  ])

  useEffect(() => {
    if (viewportWidth > 960) setNavigationDrawerOpen(false)
    if (viewportWidth > 1280) setUtilityDrawerOpen(false)
  }, [viewportWidth])

  useEffect(() => {
    if (!selectedTaskId) return
    const exists = tasks.some((task) => task.id === selectedTaskId && !task.deleted)
    if (!exists) {
      const fallback = tasks.find((task) => !task.deleted)
      setSelectedTaskId(fallback?.id ?? null)
    }
  }, [selectedTaskId, tasks])

  useEffect(() => {
    if (!createFeedback) return
    const timer = window.setTimeout(() => setCreateFeedback(null), 4800)
    return () => window.clearTimeout(timer)
  }, [createFeedback])

  useEffect(() => {
    if (!statusChangeFeedback) return
    const timer = window.setTimeout(() => setStatusChangeFeedback(null), 3000)
    return () => window.clearTimeout(timer)
  }, [statusChangeFeedback])

  useEffect(() => {
    if (!inlineCreate) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setInlineCreate(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [inlineCreate])

  useEffect(() => {
    setInlineCreate(null)
    setNavigationDrawerOpen(false)
    setProjectionInsightMode(null)
  }, [activeSelection, calendarMode, currentView, searchKeyword, selectedTagIds, timelineScale])

  useEffect(() => {
    let cancelled = false

    const tickReminders = async () => {
      if (cancelled) return
      const { events, nextKeys } = collectReminderEvents(tasks, firedReminderKeys)
      if (events.length === 0) return
      events.forEach((event) => { void notifySurface(event) })
      setFiredReminderKeys(nextKeys)
    }

    void tickReminders()
    const timer = window.setInterval(() => { void tickReminders() }, 15000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [firedReminderKeys, notifySurface, tasks])

  const currentSelectionTimeMode: TimeFieldMode =
    selectionKind === 'system' && (selectionId === 'today' || selectionId === 'upcoming')
      ? selectionTimeModes?.[selectionId] ?? 'planned'
      : 'planned'

  const doesTaskMatchWorkspace = (task: Task, includeCompleted = false) => {
    const inSelection = getTasksForSelection({ tasks: [task], selectionKind, selectionId, filters, selectionTimeModes, includeCompleted }).some((item) => item.id === task.id)
    if (!inSelection) return false
    if (!matchesSelectedTags(task, selectedTagIds)) return false
    const keyword = searchKeyword.trim().toLowerCase()
    return matchesSearch(task, keyword, tags)
  }

  const getTaskByIdFromCache = (taskId: string) => tasks.find((task) => task.id === taskId) ?? null

  const compareTaskCards = (left: Task, right: Task) => {
    if (left.completed !== right.completed) return Number(left.completed) - Number(right.completed)
    const priorityRank = { urgent: 0, high: 1, normal: 2, low: 3 }
    const priorityDiff = priorityRank[left.priority] - priorityRank[right.priority]
    if (priorityDiff !== 0) return priorityDiff
    const leftDate = getTaskPrimaryScheduleAt(left) ?? getTaskDeadlineAt(left) ?? '9999-12-31'
    const rightDate = getTaskPrimaryScheduleAt(right) ?? getTaskDeadlineAt(right) ?? '9999-12-31'
    const dateDiff = leftDate.localeCompare(rightDate)
    if (dateDiff !== 0) return dateDiff
    const updatedDiff = right.updatedAt.localeCompare(left.updatedAt)
    if (updatedDiff !== 0) return updatedDiff
    return left.id.localeCompare(right.id)
  }

  const sortVisibleTasks = (items: Task[]) => [...items].sort(compareTaskCards)

  const applyTaskMutation = (taskId: string, transform: (task: Task) => Task | null) => {
    const current = getTaskByIdFromCache(taskId)
    if (!current) return null

    const nextTask = transform(current)
    if (!nextTask) return null

    setTasks((items) => items.map((task) => (task.id === taskId ? nextTask : task)))
    return nextTask
  }

  const countsBySelection = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase()
    const getScopedSelectionCount = (selectionKindValue: string, selectionIdValue: string) => {
      let scopedTasks = getTasksForSelection({
        tasks,
        selectionKind: selectionKindValue,
        selectionId: selectionIdValue,
        filters,
        selectionTimeModes,
      })
      if (selectedTagIds.length > 0) {
        scopedTasks = scopedTasks.filter((task) => matchesSelectedTags(task, selectedTagIds))
      }
      if (keyword) {
        scopedTasks = scopedTasks.filter((task) => matchesSearch(task, keyword, tags))
      }
      return scopedTasks.length
    }
    const map: Record<string, number> = {
      'system:all': getScopedSelectionCount('system', 'all'),
      'system:today': getScopedSelectionCount('system', 'today'),
      'system:upcoming': getScopedSelectionCount('system', 'upcoming'),
      'system:inbox': getScopedSelectionCount('system', 'inbox'),
      'system:completed': getScopedSelectionCount('system', 'completed'),
      'system:trash': getScopedSelectionCount('system', 'trash'),
    }
    lists.forEach((list) => { map[`list:${list.id}`] = getScopedSelectionCount('list', list.id) })
    tags.forEach((tag) => { map[`tag:${tag.id}`] = getScopedSelectionCount('tag', tag.id) })
    filters.forEach((filter) => { map[`filter:${filter.id}`] = getScopedSelectionCount('filter', filter.id) })
    return map
  }, [filters, lists, searchKeyword, selectedTagIds, selectionTimeModes, tags, tasks])

  const visibleTasks = useMemo(() => {
    let base = getTasksForSelection({ tasks, selectionKind, selectionId, filters, selectionTimeModes })
    if (selectedTagIds.length > 0) {
      base = base.filter((task) => matchesSelectedTags(task, selectedTagIds))
    }
    const keyword = searchKeyword.trim().toLowerCase()
    if (keyword) {
      base = base.filter((task) => matchesSearch(task, keyword, tags))
    }
    return sortVisibleTasks(base)
  }, [filters, searchKeyword, selectedTagIds, selectionId, selectionKind, selectionTimeModes, tags, tasks])

  const calendarTasks = useMemo(() => {
    let base = getTasksForSelection({ tasks, selectionKind, selectionId, filters, selectionTimeModes, includeCompleted: calendarShowCompleted })
    if (selectedTagIds.length > 0) {
      base = base.filter((task) => matchesSelectedTags(task, selectedTagIds))
    }
    const keyword = searchKeyword.trim().toLowerCase()
    if (keyword) {
      base = base.filter((task) => matchesSearch(task, keyword, tags))
    }
    return sortVisibleTasks(base)
  }, [calendarShowCompleted, filters, searchKeyword, selectedTagIds, selectionId, selectionKind, selectionTimeModes, tags, tasks])

  // 移动端月历：不受侧边栏选中项限制，显示所有清单中有日期的任务
  // 但跟随焦点 Tab 的范围筛选（清单/全部），以保持跨 Tab 一致性
  const mobileCalendarTasks = useMemo(() => {
    let base = tasks.filter(t => !t.deleted && (calendarShowCompleted || !t.completed) && (t.dueAt || t.startAt))
    // 若焦点 Tab 选的是某个清单，日历也只显示该清单的任务
    if (mobileFocusScope === 'list' && mobileFocusScopeListId) {
      base = base.filter(t => t.listId === mobileFocusScopeListId)
    }
    return sortVisibleTasks(base)
  }, [tasks, calendarShowCompleted, mobileFocusScope, mobileFocusScopeListId])

  // 移动端矩阵/看板/时间线：同样跟随焦点 Tab 的清单范围，其余与 visibleTasks 一致
  const mobileVisibleTasks = useMemo(() => {
    let base: Task[]
    if (mobileFocusScope === 'list' && mobileFocusScopeListId) {
      // 用指定清单过滤，排除已删除和已完成
      base = tasks.filter(t => !t.deleted && !t.completed && t.listId === mobileFocusScopeListId)
    } else if (mobileFocusScope === 'today') {
      const todayKey = getDateKey()
      base = tasks.filter(t => {
        if (t.deleted || t.completed) return false
        const dueDate = t.dueAt?.slice(0, 10)
        const dlDate = t.deadlineAt?.slice(0, 10)
        return (dueDate && dueDate <= todayKey) || (dlDate && dlDate <= todayKey)
      })
    } else if (mobileFocusScope === 'week') {
      const todayKey = getDateKey()
      const weekEndKey = addDays(todayKey, 7)
      base = tasks.filter(t => {
        if (t.deleted || t.completed) return false
        const dueDate = t.dueAt?.slice(0, 10)
        const dlDate = t.deadlineAt?.slice(0, 10)
        return (dueDate && dueDate <= weekEndKey) || (dlDate && dlDate <= weekEndKey)
      })
    } else {
      // 全部：复用 visibleTasks（走桌面侧边栏选择逻辑）
      return visibleTasks
    }
    const keyword = searchKeyword.trim().toLowerCase()
    if (keyword) {
      base = base.filter(t => matchesSearch(t, keyword, tags))
    }
    return sortVisibleTasks(base)
  }, [mobileFocusScope, mobileFocusScopeListId, tasks, visibleTasks, searchKeyword, tags])

  const timelineTasks = visibleTasks

  // ---- 移动端焦点页任务分段 ----
  const mobileFocusSegments = useMemo(() => {
    const todayKey = getDateKey()
    const tomorrowKey = addDays(todayKey, 1)
    const threeDaysKey = addDays(todayKey, 3)
    const weekEndKey = addDays(todayKey, 7)
    let activeTasks = tasks.filter(t => !t.deleted && !t.completed)

    // Apply search filter
    const keyword = searchKeyword.trim().toLowerCase()
    if (keyword) {
      activeTasks = activeTasks.filter(t => matchesSearch(t, keyword, tags))
    }

    // Apply scope filter (fix: mobileFocusScope was only passed to MobileFocusView
    // as props but never applied here — tasks were always computed for 'all' scope)
    if (mobileFocusScope === 'list' && mobileFocusScopeListId) {
      activeTasks = activeTasks.filter(t => t.listId === mobileFocusScopeListId)
    } else if (mobileFocusScope === 'today') {
      activeTasks = activeTasks.filter(t => {
        const dueDate = t.dueAt?.slice(0, 10)
        const dlDate = t.deadlineAt?.slice(0, 10)
        // Include tasks that are today or overdue (so overdue bucket still shows)
        return (dueDate && dueDate <= todayKey) || (dlDate && dlDate <= todayKey)
      })
    } else if (mobileFocusScope === 'week') {
      activeTasks = activeTasks.filter(t => {
        const dueDate = t.dueAt?.slice(0, 10)
        const dlDate = t.deadlineAt?.slice(0, 10)
        // Include tasks within the next 7 days (plus overdue)
        return (dueDate && dueDate <= weekEndKey) || (dlDate && dlDate <= weekEndKey)
      })
    }

    const overdue: Task[] = []
    const todayPlanned: Task[] = []
    const todayDeadline: Task[] = []
    const inbox: Task[] = []
    const upcoming: Task[] = []

    for (const task of activeTasks) {
      const dueDate = task.dueAt?.slice(0, 10) ?? null
      const dlDate = (task.deadlineAt ?? null)?.slice(0, 10) ?? null

      // Check overdue: either deadline or dueAt has passed
      const isDeadlineOverdue = dlDate && dlDate < todayKey
      const isDueOverdue = dueDate && dueDate < todayKey
      if (isDeadlineOverdue || isDueOverdue) {
        overdue.push(task)
        continue
      }

      // Today planned: dueAt = today
      if (dueDate === todayKey) {
        todayPlanned.push(task)
        continue
      }

      // Today deadline: deadlineAt = today but dueAt ≠ today
      if (dlDate === todayKey && dueDate !== todayKey) {
        todayDeadline.push(task)
        continue
      }

      // Upcoming: dueAt in next 2-3 days (or up to weekEnd for week scope)
      const upcomingEnd = mobileFocusScope === 'week' ? weekEndKey : threeDaysKey
      if (dueDate && dueDate >= tomorrowKey && dueDate <= upcomingEnd) {
        upcoming.push(task)
        continue
      }

      // Inbox: no schedule (inbox items or items without dates)
      if (task.listId === 'inbox' && !dueDate && !dlDate) {
        inbox.push(task)
        continue
      }
    }

    return { overdue, todayPlanned, todayDeadline, inbox, upcoming }
  }, [tasks, searchKeyword, tags, mobileFocusScope, mobileFocusScopeListId])

  // 今天已完成的任务数（用于空状态区分「全部完成」vs「没有安排」）
  const mobileCompletedTodayCount = useMemo(() => {
    const todayKey = getDateKey()
    return tasks.filter(t => !t.deleted && t.completed && (
      t.dueAt?.slice(0, 10) === todayKey ||
      t.deadlineAt?.slice(0, 10) === todayKey
    )).length
  }, [tasks])

  const renderedWorkspaceTasks = isToolSelection
    ? tasks.filter((task) => !task.deleted)
    : currentView === 'calendar'
      ? calendarTasks
      : currentView === 'timeline'
        ? timelineTasks
        : visibleTasks

  const selectedTask = useMemo(
    () => (selectedTaskId ? (tasks.find((task) => task.id === selectedTaskId && !task.deleted) ?? null) : null),
    [selectedTaskId, tasks],
  )

  const selectedTagObjects = useMemo(
    () => selectedTagIds.map((tagId) => tags.find((item) => item.id === tagId)).filter(Boolean) as Tag[],
    [selectedTagIds, tags],
  )

  const specialTagIds = [SPECIAL_TAG_IDS.urgent, SPECIAL_TAG_IDS.important] as string[]
  const primaryTags = useMemo(() => tags.filter((tag) => specialTagIds.includes(tag.id)), [specialTagIds, tags])
  const secondaryTags = useMemo(() => tags.filter((tag) => !specialTagIds.includes(tag.id)), [specialTagIds, tags])

  const workspaceLabel = useMemo(() => {
    if (selectionKind === 'system') {
      const labelMap: Record<string, string> = {
        all: '全部',
        today: '今日',
        upcoming: '未来 7 天',
        inbox: '收件箱',
        completed: '已完成',
        trash: '回收站',
      }
      const baseLabel = labelMap[selectionId] ?? 'TaskFlow'
      if (selectionId === 'today' || selectionId === 'upcoming') {
        return `${baseLabel} · ${timeFieldModeLabel[currentSelectionTimeMode]}`
      }
      return baseLabel
    }
    if (selectionKind === 'list') return lists.find((item) => item.id === selectionId)?.name ?? '清单'
    if (selectionKind === 'tag') return `#${tags.find((item) => item.id === selectionId)?.name ?? '标签'}`
    if (selectionKind === 'filter') return filters.find((item) => item.id === selectionId)?.name ?? '智能清单'
    if (selectionKind === 'tool') return selectionId === 'stats' ? '统计' : 'TaskFlow'
    return 'TaskFlow'
  }, [currentSelectionTimeMode, filters, lists, selectionId, selectionKind, tags])

  const currentViewLabel = viewMeta.find((view) => view.id === currentView)?.label ?? '列表'

  // 布局断点体系（对标 Linear / Todoist / Things 3）
  const isPhoneViewport     = viewportWidth <= 680        // 手机：底部导航 + 全屏视图
  const isNavigationDrawerMode = viewportWidth <= 960     // 平板/小窗：导航变抽屉
  const isCompactSidebar    = viewportWidth > 960 && viewportWidth <= 1200  // 中宽屏：侧边栏折叠为图标栏
  const isUtilityDrawerMode = viewportWidth <= 1280       // 详情面板变抽屉

  // ---- Mobile Dialogs ----
  const {
    mobileConfirmDialog, setMobileConfirmDialog,
    mobilePromptDialog, setMobilePromptDialog,
    mobilePromptValue, setMobilePromptValue,
    mobileConfirm, mobilePrompt,
  } = useMobileDialogs(isPhoneViewport)

  const weekDates = useMemo(() => buildWeek(calendarAnchor), [calendarAnchor])
  const monthDates = useMemo(() => buildMonthMatrix(calendarAnchor), [calendarAnchor])
  const calendarNavLabel = useMemo(
    () => (calendarMode === 'month' ? formatMonthLabel(calendarAnchor) : formatWeekRange(calendarAnchor)),
    [calendarAnchor, calendarMode],
  )

  const stats = useMemo(() => buildTaskStats(renderedWorkspaceTasks), [renderedWorkspaceTasks])

  const projectionContextTasks = useMemo(() => {
    if (isToolSelection || (currentView !== 'calendar' && currentView !== 'timeline')) return []
    return currentView === 'calendar' ? calendarTasks : visibleTasks
  }, [calendarTasks, currentView, isToolSelection, visibleTasks])

  const projectionWorkspaceStats = useMemo(() => {
    if (isToolSelection || (currentView !== 'calendar' && currentView !== 'timeline')) return null
    return buildTaskStats(projectionContextTasks)
  }, [currentView, isToolSelection, projectionContextTasks])

  const calendarProjectionDates = useMemo(() => (calendarMode === 'month' ? monthDates : weekDates), [calendarMode, monthDates, weekDates])
  const calendarVisibleTasks = useMemo(
    () => calendarTasks.filter((task) => isTaskVisibleInCalendarWindow(task, calendarProjectionDates)),
    [calendarProjectionDates, calendarTasks],
  )

  const timelineWindowBounds = useMemo(() => {
    const windowDates = timelineScale === 'day' ? [calendarAnchor] : buildWeek(calendarAnchor)
    return {
      start: getDateTimeMs(`${windowDates[0]}T00:00`, 'start') ?? Date.now(),
      end: getDateTimeMs(`${windowDates[windowDates.length - 1]}T23:59`, 'end') ?? Date.now(),
    }
  }, [calendarAnchor, timelineScale])
  const timelineVisibleTasks = useMemo(
    () => timelineTasks.filter((task) => isTaskVisibleInTimelineWindow(task, timelineWindowBounds.start, timelineWindowBounds.end)),
    [timelineTasks, timelineWindowBounds.end, timelineWindowBounds.start],
  )
  const projectionScheduledTasks = useMemo(() => projectionContextTasks.filter((task) => hasTaskSchedule(task)), [projectionContextTasks])
  const projectionUnscheduledTasks = useMemo(() => projectionContextTasks.filter((task) => !hasTaskSchedule(task)), [projectionContextTasks])
  const projectionOutsideTasks = useMemo(() => {
    if (currentView === 'calendar') {
      return projectionScheduledTasks.filter((task) => !isTaskVisibleInCalendarWindow(task, calendarProjectionDates))
    }
    if (currentView === 'timeline') {
      return projectionScheduledTasks.filter((task) => !isTaskVisibleInTimelineWindow(task, timelineWindowBounds.start, timelineWindowBounds.end))
    }
    return []
  }, [calendarProjectionDates, currentView, projectionScheduledTasks, timelineWindowBounds.end, timelineWindowBounds.start])
  const projectionOutsideTasksSorted = useMemo(
    () => [...projectionOutsideTasks].sort((left, right) => compareTasksByProjectionDistance(left, right, calendarAnchor, currentView)),
    [calendarAnchor, currentView, projectionOutsideTasks],
  )
  const projectionWindowLabel = currentView === 'calendar' ? calendarNavLabel : getTimelineWindowLabel(calendarAnchor, timelineScale)
  const projectionVisibleCount = currentView === 'calendar' ? calendarVisibleTasks.length : currentView === 'timeline' ? timelineVisibleTasks.length : 0
  const projectionWorkspaceTotal = projectionWorkspaceStats ? projectionWorkspaceStats.active + projectionWorkspaceStats.completed : projectionContextTasks.length
  const projectionScheduledCount = projectionWorkspaceStats?.scheduled ?? projectionScheduledTasks.length
  const projectionUnscheduledCount = Math.max(projectionWorkspaceTotal - projectionScheduledCount, 0)
  const projectionOutsideCount = Math.max(projectionScheduledCount - projectionVisibleCount, 0)
  const nearestProjectionOutsideAnchor = projectionOutsideTasksSorted[0] ? getProjectionAnchorDateKey(projectionOutsideTasksSorted[0], currentView) : null
  const summaryScopeChips = useMemo(() => {
    if (isToolSelection) return []
    const chips: string[] = []

    if (currentView === 'calendar' || currentView === 'timeline') {
      chips.push(`${currentView === 'calendar' ? '窗口' : '时间窗'} · ${projectionWindowLabel}`)
    }

    if (selectedTagObjects.length === 1) {
      chips.push(`#${selectedTagObjects[0].name}`)
    } else if (selectedTagObjects.length > 1) {
      chips.push(`交集 · ${selectedTagObjects.map((tag) => `#${tag.name}`).join(' · ')}`)
    }

    if (searchKeyword.trim()) {
      chips.push(`搜索 · ${searchKeyword.trim()}`)
    }

    return chips
  }, [currentView, isToolSelection, projectionWindowLabel, searchKeyword, selectedTagObjects])
  const projectionSummaryTitle = currentView === 'calendar'
    ? `${workspaceLabel} · ${calendarMode === 'month' ? '月视图' : calendarMode === 'week' ? '周视图' : '日程列表'}`
    : `${workspaceLabel} · 时间线`
  const projectionSummaryDescription = ''
  const genericSummaryMetrics = useMemo<ProjectionSummaryMetric[]>(
    () => [
      { label: '总数', value: renderedWorkspaceTasks.length, hint: '当前结果' },
      { label: '活跃', value: stats.active },
      { label: '已完成', value: stats.completed },
      { label: '已逾期', value: stats.overdue, hint: stats.overdue > 0 ? '优先处理' : '暂无' },
    ],
    [renderedWorkspaceTasks.length, stats.active, stats.completed, stats.overdue],
  )
  const workspaceSummaryEyebrow = ''
  const workspaceSummaryTitle = currentView === 'calendar' || currentView === 'timeline' ? projectionSummaryTitle : `${workspaceLabel} · ${currentViewLabel}`
  const workspaceSummaryDescription = currentView === 'calendar'
    ? projectionSummaryDescription
    : currentView === 'timeline'
      ? projectionSummaryDescription
      : ''

  const commitTask = ({
    title,
    note = '',
    listId,
    priority,
    tagIds = [],
    status = 'todo',
    dueAt = null,
    startAt = null,
    deadlineAt = null,
    activityLabel,
  }: CreateTaskPayload) => {
    const cleanTitle = title.trim()
    if (!cleanTitle) return false

    const now = getNowIso()
    const reminderAt = startAt ?? dueAt ?? null
    const nextTask: Task = {
      id: makeId('task'),
      title: cleanTitle,
      note: note.trim(),
      listId,
      tagIds: Array.from(new Set(tagIds)),
      priority,
      status,
      startAt,
      dueAt,
      deadlineAt,
      repeatRule: '不重复',
      reminders: reminderAt ? [{ id: makeId('rem'), label: '开始时提醒', value: reminderAt, kind: 'absolute' }] : [],
      subtasks: [],
      attachments: [],
      assignee: '我',
      collaborators: [],
      comments: [],
      activity: [{ id: makeId('act'), content: activityLabel, createdAt: now }],
      estimatedPomodoros: 0,
      completedPomodoros: 0,
      focusMinutes: 0,
      completed: status === 'done',
      deleted: false,
      createdAt: now,
      updatedAt: now,
    }

    const visibleInWorkspace = doesTaskMatchWorkspace(nextTask, currentView === 'calendar' ? calendarShowCompleted : false)

    setTasks((items) => upsertTaskInCache(items, nextTask, true))
    setSelectedTaskId(nextTask.id)
    setQuickListId(listId)
    setQuickPriority(priority)
    setCreateFeedback({
      title: nextTask.title,
      listId,
      listName: lists.find((item) => item.id === listId)?.name ?? '未知清单',
      visibleInWorkspace,
      workspaceLabel,
    })
    // 手机端 3 秒后自动清除创建反馈
    if (isPhoneViewport) {
      setTimeout(() => setCreateFeedback(null), 3000)
    }
    return true
  }

  const openInlineCreate = ({
    view,
    anchorRect,
    dateKey = '',
    listId,
    priority,
    tagIds = [],
    status,
    guidance,
    time = '',
  }: InlineCreateRequest) => {
    const fallbackListId = selectionKind === 'list' ? selectionId : quickListId

    setInlineCreate({
      view,
      title: '',
      note: '',
      listId: listId ?? fallbackListId,
      priority: priority ?? quickPriority,
      tagIds,
      status: status ?? 'todo',
      dateKey,
      time,
      guidance: guidance ?? '',
      position: resolveInlineCreateInitialPosition(anchorRect),
    })
  }

  const resolveTagIdsFromNames = (tagNames: string[]): string[] => {
    if (!tagNames.length) return []
    return tagNames
      .map(name => tags.find(t => t.name === name)?.id)
      .filter((id): id is string => Boolean(id))
  }

  const submitInlineCreate = () => {
    if (!inlineCreate) return
    const parsed = parseSmartEntry(inlineCreate.title)
    const explicitDueAt = inlineCreate.dateKey
      ? inlineCreate.time
        ? `${inlineCreate.dateKey}T${inlineCreate.time}`
        : inlineCreate.dateKey
      : null
    const resolvedDueAt = explicitDueAt ?? parsed.dueAt
    const schedule = inlineCreate.view === 'timeline' ? buildTimelineDraftWindow(resolvedDueAt) : { startAt: null, dueAt: resolvedDueAt }
    // 合并：内联创建已选标签 + 自然语言识别标签
    const resolvedTagIds = Array.from(new Set([...inlineCreate.tagIds, ...resolveTagIdsFromNames(parsed.tagNames)]))
    const resolvedPriority = parsed.priority ?? inlineCreate.priority

    const created = commitTask({
      title: parsed.title,
      note: inlineCreate.note,
      listId: inlineCreate.listId,
      priority: resolvedPriority,
      tagIds: resolvedTagIds,
      status: inlineCreate.status,
      startAt: schedule.startAt,
      dueAt: schedule.dueAt,
      activityLabel: `通过${viewMeta.find((item) => item.id === inlineCreate.view)?.label ?? '当前视图'}内联创建录入任务`,
      markOnboardingScheduleComplete:
        Boolean(schedule.startAt || schedule.dueAt) && (inlineCreate.view === 'calendar' || inlineCreate.view === 'timeline'),
    })

    if (created) setInlineCreate(null)
  }

  const createTask = () => {
    const raw = quickEntry.trim()
    if (!raw) return

    const parsed = parseSmartEntry(raw)
    // 合并：快速创建已选标签 + 自然语言识别标签
    const resolvedTagIds = Array.from(new Set([...quickTagIds, ...resolveTagIdsFromNames(parsed.tagNames)]))
    const resolvedPriority = parsed.priority ?? quickPriority
    const created = commitTask({
      title: parsed.title,
      listId: selectionKind === 'list' ? selectionId : quickListId,
      priority: resolvedPriority,
      tagIds: resolvedTagIds,
      dueAt: parsed.dueAt,
      activityLabel: '通过快速创建录入任务',
    })

    if (created) {
      setQuickEntry('')
      setQuickTagIds([])
    }
  }

  // ---- 移动端快速创建 (逻辑已内联到 MobileQuickCreateSheet) ----


  const validateTagMutation = (name: string, excludeId?: string) => {
    const normalized = normalizeTagName(name)
    if (!normalized) return '标签名不能为空'
    const duplicate = tags.some((tag) => normalizeTagName(tag.name).toLowerCase() === normalized.toLowerCase() && tag.id !== excludeId)
    if (duplicate) return `标签"${normalized}"已存在`
    return null
  }

  // ---- 文件夹 CRUD ----

  const createFolder = (name: string, color = '#6c63ff') => {
    const trimmed = name.trim()
    if (!trimmed) return
    const id = makeId('folder')
    setFolders(prev => [...prev, { id, name: trimmed, color }])
  }

  const renameFolder = (folderId: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, name: trimmed } : f))
  }

  const updateFolderColor = (folderId: string, color: string) => {
    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, color } : f))
  }

  const deleteFolder = (folderId: string) => {
    // 文件夹下的清单移到顶层（folderId = null）
    setLists(prev => prev.map(l => l.folderId === folderId ? { ...l, folderId: null } : l))
    setFolders(prev => prev.filter(f => f.id !== folderId))
  }

  // ---- 清单 CRUD ----

  const createList = (name: string, folderId: string | null = null, color = '#6c63ff') => {
    const trimmed = name.trim()
    if (!trimmed) return
    const id = makeId('list')
    setLists(prev => [...prev, { id, name: trimmed, color, folderId, kind: 'custom' }])
  }

  const renameList = (listId: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setLists(prev => prev.map(l => l.id === listId ? { ...l, name: trimmed } : l))
  }

  const updateListColor = (listId: string, color: string) => {
    setLists(prev => prev.map(l => l.id === listId ? { ...l, color } : l))
  }

  const updateListFolder = (listId: string, folderId: string | null) => {
    setLists(prev => prev.map(l => l.id === listId ? { ...l, folderId } : l))
  }

  const deleteList = (listId: string) => {
    // 该清单下的任务移到收件箱
    const now = getNowIso()
    setTasks(prev => prev.map(t =>
      t.listId === listId ? { ...t, listId: 'inbox', updatedAt: now } : t
    ))
    setLists(prev => prev.filter(l => l.id !== listId))
    // 如果当前选中的就是这个清单，切换回全部
    if (activeSelection === `list:${listId}`) setActiveSelection('system:all')
  }

  const createTagDefinition = (name: string, color: string): TagMutationResult => {
    const normalized = normalizeTagName(name)
    const validationError = validateTagMutation(normalized)
    if (validationError) return { ok: false, message: validationError }

    const nextTagId = makeId('tag')
    setTags((current) => [...current, { id: nextTagId, name: normalized, color }])
    return { ok: true, tagId: nextTagId }
  }

  const updateTagDefinition = (tagId: string, name: string, color: string): TagMutationResult => {
    if (isSystemTagId(tagId)) {
      return { ok: false, message: '系统标签暂不支持重命名或改色' }
    }

    const normalized = normalizeTagName(name)
    const validationError = validateTagMutation(normalized, tagId)
    if (validationError) return { ok: false, message: validationError }

    setTags((current) => current.map((tag) => (tag.id === tagId ? { ...tag, name: normalized, color } : tag)))
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
    setSelectedTagIds((current) => current.filter((item) => item !== tagId))
    setQuickTagIds((current) => current.filter((item) => item !== tagId))
    setInlineCreate((current) =>
      current
        ? {
            ...current,
            tagIds: current.tagIds.filter((item) => item !== tagId),
          }
        : current,
    )
    setTasks((current) =>
      current.map((task) =>
        task.tagIds.includes(tagId)
          ? {
              ...task,
              tagIds: task.tagIds.filter((item) => item !== tagId),
              updatedAt: now,
            }
          : task,
      ),
    )
    return { ok: true, tagId }
  }

  const updateTask = (taskId: string, patch: Partial<Task>) => {
    const currentTask = getTaskByIdFromCache(taskId)
    if (!currentTask) return


    applyTaskMutation(taskId, (task) => normalizeTaskPatch(task, patch))
  }

  const toggleTaskComplete = (taskId: string) => {
    const currentTask = getTaskByIdFromCache(taskId)
    if (!currentTask) return

    const completing = !currentTask.completed

    applyTaskMutation(taskId, (task) => {
      return normalizeTaskPatch(task, {
        completed: completing,
        activity: [
          { id: makeId('act'), content: completing ? '完成任务' : '重新打开任务', createdAt: getNowIso() },
          ...task.activity,
        ],
      })
    })

    // 重复任务：完成时自动生成下一周期
    if (completing && currentTask.repeatRule) {
      const nextTaskData = createNextRepeatTask(currentTask)
      if (nextTaskData) {
        const nextTask: Task = {
          ...nextTaskData,
          id: makeId('task'),
          createdAt: getNowIso(),
          updatedAt: getNowIso(),
          activity: [
            { id: makeId('act'), content: `由重复任务自动生成（${describeRepeatRule(currentTask.repeatRule)}）`, createdAt: getNowIso() },
          ],
        }
        setTasks(prev => [...prev, nextTask])
      }
    }
  }

  /** Mobile-optimized toggle: immediate completion + Undo Toast (UX-01) */
  const mobileToggleComplete = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId)
    if (task && !task.completed) {
      setMobileCompletionToast({ taskId, title: task.title })
      if (completionToastTimerRef.current) window.clearTimeout(completionToastTimerRef.current)
      completionToastTimerRef.current = window.setTimeout(() => setMobileCompletionToast(null), 3000)
    }
    toggleTaskComplete(taskId)
  }

  const moveTaskToStatus = (taskId: string, status: TaskStatus) => {
    applyTaskMutation(taskId, (task) =>
      normalizeTaskPatch(task, {
        status,
        activity:
          task.status === status
            ? task.activity
            : [{ id: makeId('act'), content: `将状态调整为${statusMeta[status]}`, createdAt: getNowIso() }, ...task.activity],
      }),
    )
  }

  const applyStatusChangeFeedback = (taskId: string, status: TaskStatus) => {
    const task = getTaskByIdFromCache(taskId)
    if (!task || task.status === status) return
    moveTaskToStatus(taskId, status)
    setStatusChangeFeedback({
      taskId,
      title: task.title,
      fromStatus: task.status,
      toStatus: status,
    })
  }

  const applyKanbanDropFeedback = (taskId: string, status: TaskStatus) => {
    applyStatusChangeFeedback(taskId, status)
  }

  const updateTaskPriority = (taskId: string, priority: Priority) => {
    const task = getTaskByIdFromCache(taskId)
    if (!task || task.priority === priority) return

    applyTaskMutation(taskId, (current) =>
      normalizeTaskPatch(current, {
        priority,
        activity: [{ id: makeId('act'), content: `将优先级调整为${priorityMeta[priority].label}`, createdAt: getNowIso() }, ...current.activity],
      }),
    )
  }

  const moveTaskToQuadrant = (taskId: string, quadrant: MatrixQuadrantKey) => {
    applyTaskMutation(taskId, (task) => {
      const nextTagIds = getTagIdsForQuadrant(task.tagIds, quadrant)
      if (nextTagIds.length === task.tagIds.length && nextTagIds.every((tagId, index) => tagId === task.tagIds[index])) {
        return task
      }

      return normalizeTaskPatch(task, {
        tagIds: nextTagIds,
        activity: [{ id: makeId('act'), content: `通过四象限拖动调整为${getQuadrantLabel(quadrant)}`, createdAt: getNowIso() }, ...task.activity],
      })
    })
  }

  const undoStatusChange = () => {
    if (!statusChangeFeedback) return
    moveTaskToStatus(statusChangeFeedback.taskId, statusChangeFeedback.fromStatus)
    setStatusChangeFeedback(null)
  }

  const rescheduleTask = (taskId: string, startAt: string, dueAt: string) => {
    applyTaskMutation(taskId, (task) =>
      normalizeTaskPatch(task, {
        startAt,
        dueAt,
        activity: [{ id: makeId('act'), content: `通过时间线调整为 ${formatTaskWindow(startAt, dueAt)}`, createdAt: getNowIso() }, ...task.activity],
      }),
    )
  }

  const moveTaskToDate = (taskId: string, fromDateKey: string, toDateKey: string) => {
    if (fromDateKey === toDateKey) return

    const offsetDays = diffDateKeys(fromDateKey, toDateKey)
    applyTaskMutation(taskId, (task) =>
      normalizeTaskPatch(task, {
        startAt: shiftDateTimeByDays(task.startAt, offsetDays),
        dueAt: shiftDateTimeByDays(task.dueAt, offsetDays),
        activity: [{ id: makeId('act'), content: `通过日历拖动改期到 ${formatDayLabel(toDateKey)}`, createdAt: getNowIso() }, ...task.activity],
      }),
    )
  }

  // ---- 批量操作 ----

  const selectAllVisibleBulk = () => {
    selection.selectAllBulk(visibleTasks.map(t => t.id))
  }

  const bulkComplete = () => {
    const now = getNowIso()
    setTasks(prev => prev.map(t =>
      bulkSelectedIds.has(t.id)
        ? { ...t, completed: true, status: 'done', updatedAt: now }
        : t
    ))
    clearBulkSelect()
  }

  const bulkDelete = () => {
    const now = getNowIso()
    setTasks(prev => prev.map(t =>
      bulkSelectedIds.has(t.id)
        ? { ...t, deleted: true, updatedAt: now }
        : t
    ))
    clearBulkSelect()
  }

  const bulkMoveToList = (listId: string) => {
    const now = getNowIso()
    setTasks(prev => prev.map(t =>
      bulkSelectedIds.has(t.id)
        ? { ...t, listId, updatedAt: now }
        : t
    ))
    clearBulkSelect()
  }

  const bulkAddTag = (tagId: string) => {
    const now = getNowIso()
    setTasks(prev => prev.map(t =>
      bulkSelectedIds.has(t.id) && !t.tagIds.includes(tagId)
        ? { ...t, tagIds: [...t.tagIds, tagId], updatedAt: now }
        : t
    ))
    clearBulkSelect()
  }

  const softDeleteTask = (taskId: string) => {
    applyTaskMutation(taskId, (task) => ({
      ...task,
      deleted: true,
      updatedAt: getNowIso(),
      activity: [{ id: makeId('act'), content: '移入回收站', createdAt: getNowIso() }, ...task.activity],
    }))
    if (selectedTaskId === taskId) setSelectedTaskId(null)
  }

  const restoreTask = (taskId: string) => {
    const task = getTaskByIdFromCache(taskId)
    if (!task) return

    const todayProbe = getTaskDisplayTimeValue(task, selectionTimeModes?.today ?? 'planned')
    const upcomingProbe = getTaskDisplayTimeValue(task, selectionTimeModes?.upcoming ?? 'planned')

    updateTask(taskId, { deleted: false })
    setSelectedTaskId(taskId)
    setCurrentView('list')

    if (task.completed) {
      setActiveSelection('system:completed')
    } else if (isToday(todayProbe) || isOverdue(todayProbe)) {
      setActiveSelection('system:today')
    } else if (isWithinDays(upcomingProbe, 7)) {
      setActiveSelection('system:upcoming')
    } else {
      setActiveSelection(`list:${task.listId}`)
    }
  }

  const duplicateTask = (taskId: string) => {
    const current = getTaskByIdFromCache(taskId)
    if (!current) return
    const now = getNowIso()
    const duplicate: Task = {
      ...current,
      id: makeId('task'),
      title: `${current.title}（副本）`,
      comments: [],
      activity: [{ id: makeId('act'), content: '从原任务复制而来', createdAt: now }],
      completed: false,
      deleted: false,
      completedPomodoros: 0,
      focusMinutes: 0,
      createdAt: now,
      updatedAt: now,
    }
    setTasks((items) => upsertTaskInCache(items, duplicate, true))
    setSelectedTaskId(duplicate.id)
  }

  const addReminder = (taskId: string, label: string, value: string, kind: 'relative' | 'absolute') => {
    const task = getTaskByIdFromCache(taskId)
    if (!task) return

    const duplicated = task.reminders.some((item) => item.label === label && item.value === value && item.kind === kind)
    if (duplicated) return

    updateTask(taskId, {
      reminders: [...task.reminders, { id: makeId('rem'), label, value, kind }],
      activity: [{ id: makeId('act'), content: `新增提醒：${label}`, createdAt: getNowIso() }, ...task.activity],
    })
  }

  const removeReminder = (taskId: string, reminderId: string) => {
    const task = getTaskByIdFromCache(taskId)
    if (!task) return
    const reminder = task.reminders.find((item) => item.id === reminderId)
    if (!reminder) return
    updateTask(taskId, {
      reminders: task.reminders.filter((item) => item.id !== reminderId),
      activity: [{ id: makeId('act'), content: `移除提醒：${reminder.label}`, createdAt: getNowIso() }, ...task.activity],
    })
  }

  const snoozeReminder = (feedId: string, taskId: string, minutes: number) => {
    const task = getTaskByIdFromCache(taskId)
    if (!task) return

    const reminderAt = getDateTimeValueFromMs(Date.now() + minutes * MINUTE)
    markReminderSnoozed(feedId)
    updateTask(taskId, {
      reminders: [...task.reminders, { id: makeId('rem'), label: `稍后 ${formatSnoozeLabel(minutes)}`, value: reminderAt, kind: 'absolute' }],
      activity: [{ id: makeId('act'), content: `将提醒稍后 ${formatSnoozeLabel(minutes)}`, createdAt: getNowIso() }, ...task.activity],
    })
    appendReminderFeed({
      title: `已稍后提醒 · ${task.title}`,
      body: `将在 ${formatDateTime(reminderAt)} 再次提醒你。`,
      tone: 'success',
    })
  }

  const addSubtask = (taskId: string, title: string) => {
    const task = getTaskByIdFromCache(taskId)
    if (!task || !title.trim()) return
    updateTask(taskId, {
      subtasks: [...task.subtasks, { id: makeId('sub'), title: title.trim(), completed: false }],
      activity: [{ id: makeId('act'), content: `新增子任务：${title.trim()}`, createdAt: getNowIso() }, ...task.activity],
    })
  }

  const toggleSubtask = (taskId: string, subtaskId: string) => {
    const task = getTaskByIdFromCache(taskId)
    if (!task) return
    updateTask(taskId, {
      subtasks: task.subtasks.map((subtask) =>
        subtask.id === subtaskId ? { ...subtask, completed: !subtask.completed } : subtask,
      ),
    })
  }

  const addComment = (taskId: string, comment: Comment) => {
    const task = getTaskByIdFromCache(taskId)
    if (!task) return
    updateTask(taskId, {
      comments: [comment, ...task.comments],
      activity: [{ id: makeId('act'), content: '添加了一条评论', createdAt: getNowIso() }, ...task.activity],
    })
  }

  const addAttachments = (taskId: string, attachments: TaskAttachment[]) => {
    const task = getTaskByIdFromCache(taskId)
    const nextAttachments = attachments.filter((attachment) => attachment.name.trim())
    if (!task || nextAttachments.length === 0) return
    updateTask(taskId, {
      attachments: [...task.attachments, ...nextAttachments],
      activity: [{ id: makeId('act'), content: `添加了 ${nextAttachments.length} 个附件`, createdAt: getNowIso() }, ...task.activity],
    })
  }

  const removeAttachment = (taskId: string, attachmentId: string) => {
    const task = getTaskByIdFromCache(taskId)
    if (!task) return
    const attachment = task.attachments.find((item) => item.id === attachmentId)
    if (!attachment) return
    updateTask(taskId, {
      attachments: task.attachments.filter((item) => item.id !== attachmentId),
      activity: [{ id: makeId('act'), content: `移除了附件：${attachment.name}`, createdAt: getNowIso() }, ...task.activity],
    })
  }

  const openAttachment = async (attachment: TaskAttachment) => {
    if (attachment.path) {
      try {
        await openPath(attachment.path)
        return
      } catch {
        // continue to fallback below
      }
    }

    if (attachment.dataUrl && typeof window !== 'undefined') {
      const anchor = document.createElement('a')
      anchor.href = attachment.dataUrl
      anchor.download = attachment.name
      anchor.rel = 'noreferrer'
      anchor.target = '_blank'
      anchor.click()
    }
  }

  const contextTasks = useMemo(
    () => tasks.filter((task) => !task.deleted),
    [tasks],
  )

  const sidebarProps = {
    folders, lists, tags, filters, countsBySelection,
    primaryTags, secondaryTags, selectedTagObjects,
    activeSelection, selectedTagIds, selectionTimeModes,
    themeIcon, themeLabel, onCycleTheme: cycleTheme,
    pushSupported, pushSubscribed,
    onSubscribePush: subscribePush, onUnsubscribePush: unsubscribePush,
    onSetActiveSelection: setActiveSelection,
    onUpdateSelectionTimeMode: updateSelectionTimeMode,
    onToggleSelectedTag: toggleSelectedTag,
    onClearSelectedTags: () => setSelectedTagIds([]),
    onOpenTagManager: () => setTagManagerOpen(true),
    onOpenExportPanel: () => setExportPanelOpen(true),
    onOpenShortcutPanel: () => setShortcutPanelOpen(true),
    onCreateFolder: createFolder, onCreateList: createList,
    onRenameFolder: renameFolder, onRenameList: renameList,
    onUpdateFolderColor: updateFolderColor, onUpdateListColor: updateListColor,
    onUpdateListFolder: updateListFolder,
    onDeleteFolder: deleteFolder, onDeleteList: deleteList,
    mobileConfirm, mobilePrompt,
  }

  const navigationContent = <AppSidebar {...sidebarProps} />

  const shouldShowProjectionSummary = !isToolSelection && (currentView === 'calendar' || currentView === 'timeline')

  // ---- 统一任务选中逻辑 ----
  // 按设备尺寸自动触发正确的详情展示方式：
  //   手机（≤680px）   → 底部 Sheet
  //   平板/中屏（≤1280px）→ 右侧 400px 抽屉自动滑出
  //   宽屏（>1280px）  → 右侧固定 rail（已在布局中，无需额外操作）
  const selectTask = (taskId: string) => {
    setSelectedTaskId(taskId)
    if (isPhoneViewport) {
      setTaskSheetOpen(true)
    } else if (isUtilityDrawerMode) {
      setUtilityDrawerOpen(true)
    }
    // 宽屏：右侧 rail 常驻，无需操作
  }

  const openProjectionTaskDetail = (taskId: string) => {
    selectTask(taskId)
  }

  const jumpToProjectionTask = (task: Task) => {
    const nextAnchor = getProjectionAnchorDateKey(task, currentView)
    if (nextAnchor) {
      setCalendarAnchor(nextAnchor)
    }
    setProjectionInsightMode(null)
    selectTask(task.id)
  }

  const jumpToNearestProjectionOutside = () => {
    if (!nearestProjectionOutsideAnchor) return
    setCalendarAnchor(nearestProjectionOutsideAnchor)
    setProjectionInsightMode(null)
  }

  const projectionSummaryMetrics: ProjectionSummaryMetric[] = shouldShowProjectionSummary
    ? [
        {
          label: '工作区',
          value: projectionWorkspaceTotal,
          hint: searchKeyword.trim() || selectedTagObjects.length > 0 ? '筛选后' : '全部',
        },
        {
          label: '已排期',
          value: projectionScheduledCount,
          hint: currentView === 'calendar' ? '进入日历' : '进入时间线',
        },
        { label: '窗口内', value: projectionVisibleCount, hint: currentView === 'calendar' ? '当前窗口' : '当前时间窗' },
        {
          label: '未排期',
          value: projectionUnscheduledCount,
          hint: projectionUnscheduledCount > 0 ? '点开安排' : '已排满',
          onClick:
            projectionUnscheduledCount > 0
              ? () => setProjectionInsightMode((current) => (current === 'unscheduled' ? null : 'unscheduled'))
              : undefined,
          active: projectionInsightMode === 'unscheduled',
          disabled: projectionUnscheduledCount === 0,
        },
        {
          label: '窗口外',
          value: projectionOutsideCount,
          hint: projectionOutsideCount > 0 ? '点开跳转' : '当前可见',
          onClick:
            projectionOutsideCount > 0
              ? () => setProjectionInsightMode((current) => (current === 'outside' ? null : 'outside'))
              : undefined,
          active: projectionInsightMode === 'outside',
          disabled: projectionOutsideCount === 0,
        },
      ]
    : []

  const projectionRecoveryItems: ProjectionRecoveryItem[] =
    projectionInsightMode === 'unscheduled'
      ? projectionUnscheduledTasks.slice(0, 5).map((task) => ({
          id: task.id,
          title: task.title,
          subtitle: `${lists.find((item) => item.id === task.listId)?.name ?? '未知清单'} · 还没安排到时间轴里`,
          actionLabel: '打开详情去安排',
          onAction: () => openProjectionTaskDetail(task.id),
        }))
      : projectionInsightMode === 'outside'
        ? projectionOutsideTasksSorted.slice(0, 5).map((task) => ({
            id: task.id,
            title: task.title,
            subtitle:
              currentView === 'calendar'
                ? `${lists.find((item) => item.id === task.listId)?.name ?? '未知清单'} · ${formatDateTime(getCalendarTaskAnchor(task))}`
                : `${lists.find((item) => item.id === task.listId)?.name ?? '未知清单'} · ${formatTaskWindow(task.startAt, task.dueAt)}`,
            actionLabel: '跳到这里',
            onAction: () => jumpToProjectionTask(task),
          }))
        : []

  const projectionRecoveryFooterAction =
    projectionInsightMode === 'unscheduled'
      ? {
          label: '切到列表查看全部',
          onClick: () => {
            setCurrentView('list')
            setProjectionInsightMode(null)
          },
        }
      : nearestProjectionOutsideAnchor
        ? {
            label: '最近安排',
            onClick: jumpToNearestProjectionOutside,
          }
        : undefined

  const workspaceSummaryToolbar = !isToolSelection ? (
    <>
      <input
        type="search"
        className="search-input"
        aria-label="搜索当前工作区"
        ref={searchInputRef}
        value={searchInput}
        onChange={(event) => setSearchInput(event.target.value)}
        placeholder="搜索当前结果…"
      />
      {selectedTagObjects.length > 0 && (
        <button className="ghost-button small" onClick={() => setSelectedTagIds([])}>
          清空标签
        </button>
      )}
    </>
  ) : null

  const utilityContent = (
    <>
      <ReminderCenterPanel
        permission={notificationPermission}
        reminderFeed={reminderFeed}
        selectedTask={selectedTask}
        onRequestPermission={requestNotificationPermission}
        onSnooze={snoozeReminder}
        onDismiss={dismissReminderFeedItem}
        onClear={clearReminderFeed}
      />

      <TaskDetailPanel
        task={selectedTask}
        lists={lists}
        tags={tags}
        members={[]}
        desktopMode={desktopMode}
        onUpdateTask={updateTask}
        onChangeStatus={applyStatusChangeFeedback}
        onToggleComplete={toggleTaskComplete}
        onAddReminder={addReminder}
        onRemoveReminder={removeReminder}
        onAddSubtask={addSubtask}
        onToggleSubtask={toggleSubtask}
        onAddComment={addComment}
        onAddAttachments={addAttachments}
        onRemoveAttachment={removeAttachment}
        onOpenAttachment={openAttachment}
        onManageTags={() => setTagManagerOpen(true)}
      />
    </>
  )

  return (
    <div className={`app-shell ${isNavigationDrawerMode ? 'is-navigation-drawer' : ''} ${isNavigationDrawerMode && navigationDrawerOpen ? 'is-nav-open' : ''} ${isUtilityDrawerMode ? 'is-utility-drawer' : ''} ${isPhoneViewport ? 'is-phone' : ''} ${isCompactSidebar ? 'is-compact-sidebar' : ''} ${isCompactSidebar && sidebarExpanded ? 'has-expanded-sidebar' : ''}`}>
      {/* 侧边栏 */}
      {(!isNavigationDrawerMode || navigationDrawerOpen) && !isPhoneViewport && (
        <aside className={`sidebar panel ${isCompactSidebar ? `sidebar--compact ${sidebarExpanded ? 'is-expanded' : ''}` : ''} ${isNavigationDrawerMode ? 'sidebar--push' : ''}`}>
          {/* 折叠模式顶部 toggle 按钮 */}
          {isCompactSidebar && (
            <button
              className="sidebar-collapse-toggle"
              onClick={() => setSidebarExpanded(v => !v)}
              title={sidebarExpanded ? '折叠侧边栏' : '展开侧边栏'}
            >
              {sidebarExpanded ? '←' : '→'}
            </button>
          )}
          {/* 窄屏推开模式：顶部关闭按钮 */}
          {isNavigationDrawerMode && (
            <button
              className="sidebar-push-close"
              onClick={() => setNavigationDrawerOpen(false)}
              title="收起侧边栏"
            >
              ✕
            </button>
          )}
          {navigationContent}
        </aside>
      )}
      {/* 手机端：仍使用抽屉 */}
      {isPhoneViewport && !isNavigationDrawerMode && (
        <aside className="sidebar panel">
          {navigationContent}
        </aside>
      )}

      <main className="main-stage">
        {/* 移动端顶部标题栏 — 精致紧凑，对标 Things 3 */}
        {isNavigationDrawerMode && (
          <header className="mobile-topbar">
            <div className="mobile-topbar__left" style={{ position: 'relative' }}>
              {/* #10 — 手机端隐藏汉堡菜单 (CSS already hides it, also skip render) */}
              {!isPhoneViewport && (
                <button
                  className="mobile-topbar__menu-btn"
                  onClick={() => setNavigationDrawerOpen(true)}
                  aria-label="打开导航"
                >
                  <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
                    <rect x="0" y="0" width="18" height="2" rx="1" fill="currentColor"/>
                    <rect x="0" y="6" width="14" height="2" rx="1" fill="currentColor"/>
                    <rect x="0" y="12" width="18" height="2" rx="1" fill="currentColor"/>
                  </svg>
                </button>
              )}
              {isPhoneViewport && mobileTab === 'focus' ? (
                /* #4 — 焦点 Tab：scope 切换按钮 */
                <>
                  <button className="mobile-topbar-scope-btn" onClick={() => setMobileFocusScopeMenuOpen(v => !v)}>
                    {mobileFocusScope === 'all' ? '全部' : mobileFocusScope === 'today' ? '今日' : mobileFocusScope === 'week' ? '未来 7 天' : lists.find(l => l.id === mobileFocusScopeListId)?.name ?? '清单'} <span className="mobile-topbar-scope-arrow">▾</span>
                  </button>
                  {(mobileFocusScope === 'today' || mobileFocusScope === 'week') && (
                    <button className="mobile-topbar-sort-pill" onClick={() => setMobileFocusSortMode(m => m === 'planned' ? 'deadline' : 'planned')}>
                      {mobileFocusSortMode === 'planned' ? '按计划' : '按DDL'}
                    </button>
                  )}
                  {/* #8 — Scope 菜单 + 遮罩 */}
                  {mobileFocusScopeMenuOpen && (
                    <>
                      <div className="mobile-scope-overlay" onClick={() => setMobileFocusScopeMenuOpen(false)} />
                      <div className="mobile-focus-scope-menu" style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100 }}>
                        <button className={mobileFocusScope === 'all' ? 'is-active' : ''} onClick={() => { setMobileFocusScope('all'); setMobileFocusScopeMenuOpen(false) }}>全部</button>
                        <button className={mobileFocusScope === 'today' ? 'is-active' : ''} onClick={() => { setMobileFocusScope('today'); setMobileFocusScopeMenuOpen(false) }}>今日</button>
                        <button className={mobileFocusScope === 'week' ? 'is-active' : ''} onClick={() => { setMobileFocusScope('week'); setMobileFocusScopeMenuOpen(false) }}>未来 7 天</button>
                        <div className="mobile-focus-scope-divider" />
                        {lists.filter(l => l.id !== 'inbox').map(list => (
                          <button key={list.id} className={mobileFocusScope === 'list' && mobileFocusScopeListId === list.id ? 'is-active' : ''} onClick={() => { setMobileFocusScope('list'); setMobileFocusScopeListId(list.id); setMobileFocusScopeMenuOpen(false) }}>
                            {list.name}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </>
              ) : isPhoneViewport && mobileTab === 'calendar' ? (
                /* #14 — 日历 Tab：视图切换下拉 */
                <>
                  <button className="mobile-topbar-calendar-mode-btn" onClick={() => setMobileCalendarModeMenuOpen(v => !v)}>
                    {calendarMode === 'month' ? '📋 月历' : calendarMode === 'week' ? '📋 周历' : '📋 日历'} <span className="mobile-topbar-scope-arrow">▾</span>
                  </button>
                  {mobileCalendarModeMenuOpen && (
                    <>
                      <div className="mobile-scope-overlay" onClick={() => setMobileCalendarModeMenuOpen(false)} />
                      <div className="mobile-topbar-calendar-mode-menu" style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100 }}>
                        <button className={calendarMode === 'month' ? 'is-active' : ''} onClick={() => { setCalendarMode('month'); setMobileCalendarModeMenuOpen(false) }}>月历</button>
                        <button className={calendarMode === 'week' ? 'is-active' : ''} onClick={() => { setCalendarMode('week'); setMobileCalendarModeMenuOpen(false) }}>周历</button>
                        <button className={calendarMode === 'agenda' ? 'is-active' : ''} onClick={() => { setCalendarMode('agenda'); setMobileCalendarModeMenuOpen(false) }}>日历</button>
                      </div>
                    </>
                  )}
                </>
              ) : isPhoneViewport && mobileTab === 'matrix' ? (
                /* #需求3 — 象限 Tab：视图切换下拉 */
                <>
                  <button className="mobile-topbar-calendar-mode-btn" onClick={() => setMobileMatrixModeMenuOpen(v => !v)}>
                    {mobileMatrixViewMode === 'matrix' ? '📊 四象限' : mobileMatrixViewMode === 'kanban' ? '📊 看板' : '📊 时间线'} <span className="mobile-topbar-scope-arrow">▾</span>
                  </button>
                  {mobileMatrixModeMenuOpen && (
                    <>
                      <div className="mobile-scope-overlay" onClick={() => setMobileMatrixModeMenuOpen(false)} />
                      <div className="mobile-topbar-calendar-mode-menu" style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100 }}>
                        <button className={mobileMatrixViewMode === 'matrix' ? 'is-active' : ''} onClick={() => { setMobileMatrixViewMode('matrix'); setMobileMatrixModeMenuOpen(false) }}>四象限</button>
                        <button className={mobileMatrixViewMode === 'kanban' ? 'is-active' : ''} onClick={() => { setMobileMatrixViewMode('kanban'); setMobileMatrixModeMenuOpen(false) }}>看板</button>
                        <button className={mobileMatrixViewMode === 'timeline' ? 'is-active' : ''} onClick={() => { setMobileMatrixViewMode('timeline'); setMobileMatrixModeMenuOpen(false) }}>时间线</button>
                      </div>
                    </>
                  )}
                </>
              ) : isPhoneViewport ? (
                <span className="mobile-topbar__title">
                  {mobileTab === 'me' ? '我的' : ''}
                </span>
              ) : (
                <>
                  <button
                    className="mobile-topbar__menu-btn"
                    onClick={() => setNavigationDrawerOpen(true)}
                    aria-label="打开导航"
                    style={{ display: 'none' }}
                  >≡</button>
                  <span className="mobile-topbar__title">{workspaceLabel}</span>
                </>
              )}
              {/* 搜索功能已移除 */}
            </div>
            <div className="mobile-topbar__right">
              {/* 搜索图标已移除 */}
              {isSupabaseEnabled() && user && (
                <SyncIndicator status={syncStatus} lastSyncedAt={lastSyncedAt} onForceSync={handleManualSync} />
              )}
              <button
                className="mobile-topbar__icon-btn"
                onClick={cycleTheme}
                title={themeLabel}
                aria-label={themeLabel}
              >
                {themeIcon}
              </button>
              {isSupabaseEnabled() && (user ? (
                <button
                  className="mobile-topbar__avatar"
                  onClick={() => signOut()}
                  title={`${user.displayName ?? user.email} · 退出`}
                >
                  {(user.displayName ?? user.email).slice(0, 1).toUpperCase()}
                </button>
              ) : (
                <button
                  className="ghost-button small"
                  onClick={requestAuthScreen}
                  title="登录后开启云同步与跨设备恢复"
                >
                  登录
                </button>
              ))}
            </div>
          </header>
        )}

        {/* 中宽屏顶栏（仅右侧工具，无导航按钮）*/}
        {isUtilityDrawerMode && !isNavigationDrawerMode && (
          <section className="topbar panel topbar--actions-only">
            <div className="topbar-actions">
              <button className="ghost-button small" onClick={() => setUtilityDrawerOpen(true)}>
                {selectedTask ? '提醒 / 详情' : '提醒面板'}
              </button>
              {isSupabaseEnabled() && user && (
                <SyncIndicator status={syncStatus} lastSyncedAt={lastSyncedAt} onForceSync={handleManualSync} />
              )}
              {isSupabaseEnabled() && (
                user ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: '50%',
                      background: 'linear-gradient(135deg, #6c63ff, #4f46e5)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0,
                    }}>
                      {(user.displayName ?? user.email).slice(0, 1).toUpperCase()}
                    </div>
                    <button className="ghost-button small" onClick={() => signOut()} style={{ fontSize: 11, opacity: 0.6 }}>
                      退出
                    </button>
                  </div>
                ) : (
                  <button
                    className="ghost-button small"
                    onClick={requestAuthScreen}
                    style={{ fontSize: 11 }}
                    title="登录后开启云同步与跨设备恢复"
                  >
                    登录
                  </button>
                )
              )}
            </div>
          </section>
        )}

        {!isToolSelection && (
          <ProjectionSummary
            eyebrow={workspaceSummaryEyebrow}
            title={workspaceSummaryTitle}
            description={workspaceSummaryDescription}
            scopes={summaryScopeChips}
            metrics={shouldShowProjectionSummary ? projectionSummaryMetrics : genericSummaryMetrics}
            toolbar={workspaceSummaryToolbar}
            auxiliaryAction={
              shouldShowProjectionSummary && projectionOutsideCount > 0 && nearestProjectionOutsideAnchor
                ? { label: '最近安排', onClick: jumpToNearestProjectionOutside }
                : undefined
            }
          />
        )}

        {shouldShowProjectionSummary && projectionInsightMode && (
          <ProjectionRecoveryPanel
            mode={projectionInsightMode}
            title={projectionInsightMode === 'unscheduled' ? `还有 ${projectionUnscheduledCount} 条未排期任务` : `还有 ${projectionOutsideCount} 条安排不在当前窗口`}
            description={
              projectionInsightMode === 'unscheduled'
                ? currentView === 'calendar'
                  ? '这些任务仍在当前工作区里，只是还没进日历；打开详情即可补时间。'
                  : '这些任务仍在当前工作区里，只是还没形成任务条；打开详情即可补时间。'
                : currentView === 'calendar'
                  ? `它们仍属于当前工作区，但月 / 周 / 列表只会展示 ${projectionWindowLabel} 内的日程锚点。`
                  : `它们仍属于当前工作区，但时间线当前只展示与 ${projectionWindowLabel} 相交的任务条。`
            }
            items={projectionRecoveryItems}
            footerAction={projectionRecoveryFooterAction}
            onClose={() => setProjectionInsightMode(null)}
          />
        )}

        {/* 批量操作工具栏 */}
        {!isToolSelection && currentView === 'list' && (
          <section className="bulk-toolbar panel" style={{
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            padding: '8px 14px', minHeight: 40,
          }}>
            {!bulkMode ? (
              <button className="ghost-button small" style={{ opacity: 0.5 }} onClick={() => setBulkMode(true)}>
                ☑ 批量操作
              </button>
            ) : (
              <>
                <button className="ghost-button small" onClick={selectAllVisibleBulk}>全选</button>
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                  已选 {bulkSelectedIds.size} / {visibleTasks.length}
                </span>
                {bulkSelectedIds.size > 0 && (
                  <>
                    <button className="ghost-button small" onClick={bulkComplete}>✓ 批量完成</button>
                    <select
                      className="ghost-button small"
                      style={{ cursor: 'pointer', padding: '3px 8px' }}
                      defaultValue=""
                      onChange={e => { if (e.target.value) { bulkMoveToList(e.target.value); e.target.value = '' } }}
                    >
                      <option value="" disabled>移动到清单…</option>
                      {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                    <select
                      className="ghost-button small"
                      style={{ cursor: 'pointer', padding: '3px 8px' }}
                      defaultValue=""
                      onChange={e => { if (e.target.value) { bulkAddTag(e.target.value); e.target.value = '' } }}
                    >
                      <option value="" disabled>打标签…</option>
                      {tags.map(t => <option key={t.id} value={t.id}>#{t.name}</option>)}
                    </select>
                    <button className="ghost-button small danger" onClick={bulkDelete}>🗑 批量删除</button>
                  </>
                )}
                <button className="ghost-button small" style={{ marginLeft: 'auto' }} onClick={clearBulkSelect}>退出</button>
              </>
            )}
          </section>
        )}

        <section className="composer-bar panel" data-onboarding-anchor="quick-add">
          <div className="composer-bar__main">
            <input
              ref={quickCreateInputRef}
              value={quickEntry}
              onChange={(event) => setQuickEntry(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') createTask()
              }}
              placeholder="例如：明天下午 3 点产品评审"
            />
            <select value={quickListId} onChange={(event) => setQuickListId(event.target.value)}>
              {lists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
            <select value={quickPriority} onChange={(event) => setQuickPriority(event.target.value as Priority)}>
              {Object.entries(priorityMeta).map(([value, meta]) => (
                <option key={value} value={value}>
                  {meta.label}
                </option>
              ))}
            </select>
            <button className="primary-button" onClick={createTask}>
              立即创建
            </button>
          </div>
          <TagPicker
            title="标签"
            tags={tags}
            selectedTagIds={quickTagIds}
            onToggleTag={toggleQuickTag}
            onManageTags={() => setTagManagerOpen(true)}
            manageLabel="管理标签"
          />
        </section>

        {createFeedback && (
          <section className={`quick-feedback panel ${createFeedback.visibleInWorkspace ? 'is-positive' : 'is-warning'}`}>
            <div>
              <p className="eyebrow">{createFeedback.visibleInWorkspace ? 'created in current context' : 'created outside current context'}</p>
              <h3>已创建"{createFeedback.title}"</h3>
              <p>
                {createFeedback.visibleInWorkspace
                  ? `仍停留在"${createFeedback.workspaceLabel}"，并已把新任务放进当前工作流。`
                  : `任务已进入"${createFeedback.listName}"，你仍停留在"${createFeedback.workspaceLabel}"。这条任务暂时不在当前结果里。`}
              </p>
            </div>
            <div className="action-row">
              {!createFeedback.visibleInWorkspace && (
                <button
                  className="ghost-button small"
                  onClick={() => {
                    setActiveSelection(`list:${createFeedback.listId}`)
                    setCurrentView('list')
                    setCreateFeedback(null)
                  }}
                >
                  查看任务
                </button>
              )}
              <button className="ghost-button small" onClick={() => setCreateFeedback(null)}>
                知道了
              </button>
            </div>
          </section>
        )}

        {!isToolSelection && (
          <section className="view-switcher panel">
            <div className="segmented-control">
              {viewMeta.map((view) => (
                <button key={view.id} className={currentView === view.id ? 'is-active' : ''} onClick={() => setCurrentView(view.id)}>
                  {view.label}
                </button>
              ))}
            </div>
            {currentView === 'calendar' && (
              <div className="calendar-nav">
                <div className="calendar-modes">
                  {(['month', 'week', 'agenda'] as CalendarMode[]).map((mode) => (
                    <button key={mode} className={calendarMode === mode ? 'is-active' : ''} onClick={() => setCalendarMode(mode)}>
                      {mode === 'month' ? '月' : mode === 'week' ? '周' : '列表'}
                    </button>
                  ))}
                </div>
                <div className="calendar-controls">
                  <div className="calendar-window-label">
                    <strong>{calendarNavLabel}</strong>
                    <span>{calendarMode === 'month' ? '按月浏览' : '按周浏览'}</span>
                  </div>
                  <button
                    className={`calendar-visibility-toggle ${calendarShowCompleted ? 'is-active' : ''}`}
                    onClick={() => setCalendarShowCompleted((value) => !value)}
                  >
                    {calendarShowCompleted ? '隐藏已完成' : '显示已完成'}
                  </button>
                  <button className="ghost-button small" onClick={() => setCalendarAnchor(calendarMode === 'month' ? addMonths(calendarAnchor, -1) : addDays(calendarAnchor, -7))}>‹</button>
                  <button className="ghost-button small" onClick={() => setCalendarAnchor(getDateKey())}>今天</button>
                  <button className="ghost-button small" onClick={() => setCalendarAnchor(calendarMode === 'month' ? addMonths(calendarAnchor, 1) : addDays(calendarAnchor, 7))}>›</button>
                  <input type="date" className="date-picker-input" value={calendarAnchor} onChange={(e) => e.target.value && setCalendarAnchor(e.target.value)} />
                </div>
              </div>
            )}
          </section>
        )}

        {statusChangeFeedback && !isPhoneViewport && (
          <section className="action-toast panel" aria-live="polite">
            <div>
              <p className="eyebrow">status updated</p>
              <strong>已移到"{statusMeta[statusChangeFeedback.toStatus]}"</strong>
              <p>{statusChangeFeedback.title}</p>
            </div>
            <button className="ghost-button small" onClick={undoStatusChange}>
              撤销
            </button>
          </section>
        )}

        {inlineCreate && (
          <InlineCreatePopover
            draft={inlineCreate}
            lists={lists}
            tags={tags}
            onClose={() => setInlineCreate(null)}
            onSubmit={submitInlineCreate}
            onChange={(patch) => setInlineCreate((current) => (current ? { ...current, ...patch } : current))}
            onToggleTag={toggleInlineCreateTag}
            onManageTags={() => setTagManagerOpen(true)}
          />
        )}

        {tagManagerOpen && (
          isPhoneViewport ? (
            <MobileTagManagerSheet
              tags={tags}
              onClose={() => setTagManagerOpen(false)}
              onCreateTag={createTagDefinition}
              onUpdateTag={updateTagDefinition}
              onDeleteTag={deleteTagDefinition}
            />
          ) : (
          <TagManagementDialog
            tags={tags}
            onClose={() => setTagManagerOpen(false)}
            onCreateTag={createTagDefinition}
            onUpdateTag={updateTagDefinition}
            onDeleteTag={deleteTagDefinition}
          />
          )
        )}

        {shortcutPanelOpen && (
          <ShortcutPanel onClose={() => setShortcutPanelOpen(false)} />
        )}

        {exportPanelOpen && (
          <ExportPanel
            state={{ folders, lists, tags, filters, tasks, theme, activeSelection, selectedTagIds,
              selectionTimeModes: selectionTimeModes ?? {}, currentView, calendarMode,
              calendarShowCompleted, timelineScale, firedReminderKeys,
              onboarding: initialState.onboarding }}
            onClose={() => setExportPanelOpen(false)}
          />
        )}

        <section className={`workspace panel ${isPhoneViewport ? 'is-phone' : ''} ${mobileTabFading ? 'is-fading' : ''}`}>
          {isPhoneViewport ? (
            /* ======== 手机端：按 mobileTab 渲染 ======== */
            mobileTab === 'focus' ? (
              <ViewErrorBoundary viewName="MobileFocusView">
              <MobileFocusView
                segments={mobileFocusSegments}
                sortMode={mobileFocusSortMode}
                onToggleSortMode={() => setMobileFocusSortMode(m => m === 'planned' ? 'deadline' : 'planned')}
                upcomingCollapsed={mobileFocusUpcomingCollapsed}
                onToggleUpcoming={() => setMobileFocusUpcomingCollapsed(v => !v)}
                lists={lists}
                tags={tags}
                onSelectTask={selectTask}
                onUpdateTask={updateTask}
                onToggleComplete={mobileToggleComplete}
                focusScope={mobileFocusScope}
                focusScopeListId={mobileFocusScopeListId}
                completedTodayCount={mobileCompletedTodayCount}
              />
              </ViewErrorBoundary>
            ) : mobileTab === 'calendar' ? (
              <ViewErrorBoundary viewName="MobileCalendarView">
              <MobileCalendarView
                tasks={mobileCalendarTasks}
                lists={lists}
                tags={tags}
                calendarMode={calendarMode}
                calendarAnchor={calendarAnchor}
                monthDates={monthDates}
                weekDates={weekDates}
                showCompletedTasks={calendarShowCompleted}
                selectedTaskId={selectedTaskId}
                onSelectTask={selectTask}
                onOpenInlineCreate={openInlineCreate}
                onMoveTaskToDate={moveTaskToDate}
                onChangeMode={setCalendarMode}
                onToggleComplete={mobileToggleComplete}
                onChangeAnchor={setCalendarAnchor}
              />
              </ViewErrorBoundary>
            ) : mobileTab === 'matrix' ? (
              <>
                {/* 需求3：顶栏下拉模式已在topbar实现，此处去掉segmented control */}
                {mobileMatrixViewMode === 'matrix' ? (
                  <ViewErrorBoundary viewName="MobileMatrixView">
                  <MobileMatrixView
                    tasks={mobileVisibleTasks}
                    lists={lists}
                    tags={tags}
                    selectedTaskId={selectedTaskId}
                    onSelectTask={selectTask}
                    onChangeStatus={applyStatusChangeFeedback}
                    onChangePriority={updateTaskPriority}
                    onMoveToQuadrant={moveTaskToQuadrant}
                    onOpenInlineCreate={openInlineCreate}
                  />
                  </ViewErrorBoundary>
                ) : mobileMatrixViewMode === 'kanban' ? (
                  <KanbanView
                    tasks={mobileVisibleTasks}
                    lists={lists}
                    tags={tags}
                    selectedTaskId={selectedTaskId}
                    onSelectTask={selectTask}
                    onChangeStatus={applyStatusChangeFeedback}
                    onChangePriority={updateTaskPriority}
                    onDropStatusChange={applyKanbanDropFeedback}
                    onOpenInlineCreate={openInlineCreate}
                  />
                ) : (
                  <TimelineView
                    tasks={mobileVisibleTasks}
                    selectedTaskId={selectedTaskId}
                    calendarAnchor={calendarAnchor}
                    timelineScale={timelineScale}
                    onSelectTask={selectTask}
                    onUpdateSchedule={rescheduleTask}
                    onOpenInlineCreate={openInlineCreate}
                    onChangeAnchor={setCalendarAnchor}
                    onChangeScale={setTimelineScale}
                  />
                )}
              </>
            ) : (
              /* me tab — #11: includes projects sub-view */
              meShowProjects ? (
                <ViewErrorBoundary viewName="MobileProjectsView">
                <MobileProjectsView
                  folders={folders}
                  lists={lists}
                  tasks={tasks}
                  countsBySelection={countsBySelection}
                  onSelectList={(listId) => {
                    // 跳转到焦点页，scope 切换为该清单
                    setActiveSelection(`list:${listId}`)
                    setMobileFocusScope('list')
                    setMobileFocusScopeListId(listId)
                    setMeShowProjects(false)
                    setMobileTab('focus')
                  }}
                  onRenameList={async (listId) => {
                    const list = lists.find(l => l.id === listId)
                    if (!list) return
                    const name = await mobilePrompt('重命名清单', list.name)
                    if (name) renameList(listId, name)
                  }}
                  onDeleteList={async (listId) => {
                    const list = lists.find(l => l.id === listId)
                    if (!list) return
                    if (await mobileConfirm(`删除清单「${list.name}」？其中的任务会移到收件箱。`)) {
                      deleteList(listId)
                    }
                  }}
                  onChangeListColor={(listId, color) => {
                    updateListColor(listId, color)
                  }}
                  onCreateList={async (folderId) => {
                    const name = await mobilePrompt('清单名称')
                    if (name) createList(name, folderId)
                  }}
                  onCreateFolder={async () => {
                    const name = await mobilePrompt('文件夹名称')
                    if (name) createFolder(name)
                  }}
                  onMoveListToFolder={(listId, folderId) => {
                    updateListFolder(listId, folderId)
                  }}
                  presetColors={PRESET_COLORS}
                />
                </ViewErrorBoundary>
              ) : (
              <ViewErrorBoundary viewName="MobileMeView">
              <MobileMeView
                tasks={tasks}
                user={user ?? null}
                syncStatus={syncStatus}
                lastSyncedAt={lastSyncedAt}
                theme={theme}
                themeLabel={themeLabel}
                themeIcon={themeIcon}
                onCycleTheme={cycleTheme}
                onSignOut={signOut}
                onRequestAuth={requestAuthScreen}
                onManualSync={handleManualSync}
                onOpenTagManager={() => setTagManagerOpen(true)}
                onGoToCompleted={() => { setActiveSelection('system:completed'); setMobileTab('focus') }}
                onGoToTrash={() => { setActiveSelection('system:trash'); setMobileTab('focus') }}
                onGoToProjects={() => setMeShowProjects(true)}
              />
              </ViewErrorBoundary>
              )
            )
          ) : (
            /* ======== 桌面端：保持原有逻辑 ======== */
            isToolSelection ? (
            <ViewErrorBoundary viewName="StatsView">
            <StatsView
              tasks={contextTasks}
              tags={tags}
              stats={null}
              priorityDistribution={null}
              tagDistribution={null}
            />
            </ViewErrorBoundary>
          ) : currentView === 'list' ? (
            <ViewErrorBoundary viewName="ListView">
            <ListView
              tasks={visibleTasks}
              lists={lists}
              tags={tags}
              selectedTaskId={selectedTaskId}
              onSelectTask={selectTask}
              onToggleTaskComplete={toggleTaskComplete}
              onDelete={softDeleteTask}
              onRestore={restoreTask}
              onDuplicate={duplicateTask}
              bulkMode={bulkMode}
              bulkSelectedIds={bulkSelectedIds}
              onToggleBulkSelect={toggleBulkSelect}
            />
            </ViewErrorBoundary>
          ) : currentView === 'calendar' ? (
            <ViewErrorBoundary viewName="CalendarView">
            <CalendarView
              tasks={calendarTasks}
              lists={lists}
              tags={tags}
              calendarMode={calendarMode}
              calendarAnchor={calendarAnchor}
              monthDates={monthDates}
              weekDates={weekDates}
              showCompletedTasks={calendarShowCompleted}
              selectedTaskId={selectedTaskId}
              onSelectTask={selectTask}
              onOpenInlineCreate={openInlineCreate}
              onMoveTaskToDate={moveTaskToDate}
            />
            </ViewErrorBoundary>
          ) : currentView === 'kanban' ? (
            <ViewErrorBoundary viewName="KanbanView">
            <KanbanView
              tasks={visibleTasks}
              lists={lists}
              tags={tags}
              selectedTaskId={selectedTaskId}
              onSelectTask={selectTask}
              onChangeStatus={applyStatusChangeFeedback}
              onChangePriority={updateTaskPriority}
              onDropStatusChange={applyKanbanDropFeedback}
              onOpenInlineCreate={openInlineCreate}
            />
            </ViewErrorBoundary>
          ) : currentView === 'timeline' ? (
            <ViewErrorBoundary viewName="TimelineView">
            <TimelineView
              tasks={timelineTasks}
              selectedTaskId={selectedTaskId}
              calendarAnchor={calendarAnchor}
              timelineScale={timelineScale}
              onSelectTask={selectTask}
              onUpdateSchedule={rescheduleTask}
              onOpenInlineCreate={openInlineCreate}
              onChangeAnchor={setCalendarAnchor}
              onChangeScale={setTimelineScale}
            />
            </ViewErrorBoundary>
          ) : (
            <ViewErrorBoundary viewName="MatrixView">
            <MatrixView
              tasks={visibleTasks}
              lists={lists}
              tags={tags}
              selectedTaskId={selectedTaskId}
              onSelectTask={selectTask}
              onChangeStatus={applyStatusChangeFeedback}
              onChangePriority={updateTaskPriority}
              onMoveToQuadrant={moveTaskToQuadrant}
              onOpenInlineCreate={openInlineCreate}
            />
            </ViewErrorBoundary>
          )
          )}
        </section>

        {/* #5 — 手机端项目页返回导航 (from me > projects) */}
        {isPhoneViewport && mobileTab === 'me' && meShowProjects && mobileProjectListId && (
          <div className="mobile-project-nav">
            <button className="ghost-button small" onClick={() => { setMobileProjectListId(null); setActiveSelection('system:all') }}>
              ← 返回清单
            </button>
            <span className="mobile-project-nav__title">{lists.find(l => l.id === mobileProjectListId)?.name ?? '清单'}</span>
          </div>
        )}
        {isPhoneViewport && mobileTab === 'me' && meShowProjects && !mobileProjectListId && (
          <div className="mobile-project-nav">
            <button className="ghost-button small" onClick={() => setMeShowProjects(false)}>
              ← 返回
            </button>
          </div>
        )}

        {/* #14 — 日历视图模式已移到顶栏，此处不再渲染 */}
      </main>

      {!isUtilityDrawerMode && <aside className="right-rail">{utilityContent}</aside>}

      {/* 移动端底部标签栏 — 4 Tab + FAB */}
      {isPhoneViewport && (
        <>
          <nav className="mobile-tab-bar" aria-label="主导航">
            {([
              { id: 'focus' as MobileTab, icon: '◎', label: '焦点' },
              { id: 'calendar' as MobileTab, icon: '📅', label: '日历' },
              { id: 'matrix' as MobileTab, icon: '⊞', label: '象限' },
              { id: 'me' as MobileTab, icon: '👤', label: '我的' },
            ]).map(tab => (
              <button
                key={tab.id}
                className={`mobile-tab-item ${mobileTab === tab.id ? 'is-active' : ''}`}
                onClick={() => {
                  if (mobileTab !== tab.id) {
                    // #19 — Tab 切换淡入淡出
                    setMobileTabFading(true)
                    setTimeout(() => {
                      setMobileTab(tab.id)
                      if (tab.id === 'me') { setMeShowProjects(false) }
                      if (tab.id === 'calendar') {
                        setCurrentView('calendar')
                        if (activeSelection === 'tool:stats') setActiveSelection('system:all')
                      }
                      setMobileTabFading(false)
                    }, 150)
                  }
                }}
              >
                <span className="mobile-tab-item__icon">{tab.icon}</span>
                <span className="mobile-tab-item__label">{tab.label}</span>
              </button>
            ))}
          </nav>
          {/* FAB — 快速创建 */}
          <button
            className="mobile-fab"
            onClick={() => setMobileQuickCreateOpen(true)}
            aria-label="快速创建任务"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </button>
        </>
      )}

      {/* 手机端：导航仍使用抽屉 */}
      {isPhoneViewport && navigationDrawerOpen && (
        <ResponsiveDrawer title="工作区导航" side="left" onClose={() => setNavigationDrawerOpen(false)}>
          <div className="sidebar panel sidebar--drawer">{navigationContent}</div>
        </ResponsiveDrawer>
      )}

      {/* 平板/中屏：右侧 400px 详情抽屉，点任务自动打开 */}
      {isUtilityDrawerMode && !isPhoneViewport && utilityDrawerOpen && (
        <ResponsiveDrawer title="提醒与详情" side="right" width={400} onClose={() => setUtilityDrawerOpen(false)}>
          <div className="drawer-rail">{utilityContent}</div>
        </ResponsiveDrawer>
      )}

      {/* 手机：底部 Sheet，点任务自动弹出 */}
      {isPhoneViewport && taskSheetOpen && selectedTask && (
        <TaskBottomSheet
          key={selectedTask.id}
          onClose={() => setTaskSheetOpen(false)}
        >
          <MobileTaskDetailContent
            task={selectedTask}
            lists={lists}
            tags={tags}
            onUpdateTask={updateTask}
            onToggleComplete={mobileToggleComplete}
            onClose={() => setTaskSheetOpen(false)}
          />
        </TaskBottomSheet>
      )}

      {/* 手机端：快速创建 Sheet */}
      {isPhoneViewport && mobileQuickCreateOpen && (
        <MobileQuickCreateSheet
          onClose={() => setMobileQuickCreateOpen(false)}
          onSubmit={(title, listId, startAt, dueAt, deadlineAt, priority, tagIds) => {
            if (!title.trim()) return
            const parsed = parseSmartEntry(title)
            commitTask({
              title: parsed.title,
              listId,
              priority: parsed.priority ?? priority,
              tagIds,
              startAt: startAt,
              dueAt: dueAt,
              deadlineAt: deadlineAt,
              activityLabel: '通过移动端快速创建录入',
            })
            setMobileQuickCreateOpen(false)
          }}
          contextLabel={
            mobileTab === 'focus' ? '焦点 → 今天' :
            mobileTab === 'calendar' ? `日历 → ${calendarAnchor}` :
            mobileTab === 'matrix' ? '四象限' :
            '收件箱'
          }
          lists={lists}
          tags={tags}
          defaultListId={mobileFocusScopeListId ?? 'inbox'}
          defaultDueAt={mobileTab === 'focus' ? getDateKey() : mobileTab === 'calendar' ? calendarAnchor : null}
        />
      )}

      {/* 手机端：自定义确认对话框 */}
      {isPhoneViewport && mobileConfirmDialog && (
        <MobileConfirmSheet
          message={mobileConfirmDialog.message}
          onConfirm={() => { mobileConfirmDialog.onConfirm(); setMobileConfirmDialog(null) }}
          onCancel={() => { mobileConfirmDialog.onCancel(); setMobileConfirmDialog(null) }}
        />
      )}

      {/* 手机端：自定义输入对话框 */}
      {isPhoneViewport && mobilePromptDialog && (
        <MobilePromptSheet
          message={mobilePromptDialog.message}
          value={mobilePromptValue}
          onChange={setMobilePromptValue}
          onSubmit={() => {
            mobilePromptDialog.onSubmit(mobilePromptValue)
            setMobilePromptDialog(null)
            setMobilePromptValue('')
          }}
          onCancel={() => {
            mobilePromptDialog.onSubmit(null)
            setMobilePromptDialog(null)
            setMobilePromptValue('')
          }}
        />
      )}

      {/* #23 — 完成撤销 Toast */}
      {isPhoneViewport && mobileCompletionToast && (
        <div className="mobile-completion-toast" role="status" aria-live="polite" aria-label="任务已完成">
          <span className="mobile-completion-toast__label">已完成「{mobileCompletionToast.title}」</span>
          <div className="mobile-completion-toast__actions">
            <button
              className="mobile-completion-toast__snooze"
              onClick={() => {
                // 推迟到明天：把 dueAt（或 deadlineAt）往后移一天，同时撤销完成
                const task = tasks.find(t => t.id === mobileCompletionToast.taskId)
                if (task) {
                  const newDueAt = task.dueAt
                    ? shiftDateTimeByDays(task.dueAt, 1)
                    : `${addDays(getDateKey(), 1)}T09:00:00`
                  // 先撤销完成，再更新时间
                  if (task.completed) toggleTaskComplete(mobileCompletionToast.taskId)
                  updateTask(mobileCompletionToast.taskId, { dueAt: newDueAt })
                }
                setMobileCompletionToast(null)
                if (completionToastTimerRef.current) window.clearTimeout(completionToastTimerRef.current)
              }}
            >明天再做</button>
            <button
              className="mobile-completion-toast__undo"
              onClick={() => {
                toggleTaskComplete(mobileCompletionToast.taskId)
                setMobileCompletionToast(null)
                if (completionToastTimerRef.current) window.clearTimeout(completionToastTimerRef.current)
              }}
            >撤销</button>
          </div>
        </div>
      )}

      {/* PWA install prompt — shown only on mobile browsers that support installation */}
      {isPhoneViewport && <PwaInstallBanner />}

      {/* Cmd+K 命令面板 */}
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        tasks={tasks}
        lists={lists}
        tags={tags}
        onSelectTask={(id) => {
          selectTask(id)
        }}
        onSelectList={(id) => {
          setActiveSelection(`list:${id}`)
        }}
      />
    </div>
  )
}

// 颜色预设（用于清单/文件夹颜色循环）
const PRESET_COLORS = [
  '#6c63ff', '#4f46e5', '#0ea5e9', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#8b5cf6', '#06b6d4', '#84cc16',
]
















function formatSnoozeLabel(minutes: number) {
  if (minutes < 60) return `${minutes} 分钟`
  const hours = minutes / 60
  return Number.isInteger(hours) ? `${hours} 小时` : `${hours.toFixed(1)} 小时`
}

function getDateTimeMs(value: string | null, boundary: 'start' | 'end' = 'start') {
  if (!value) return null
  const normalized = value.includes('T') ? value : `${value}T${boundary === 'end' ? '23:59' : '09:00'}`
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date.getTime()
}

function toLocalInputValue(value: string | null) {
  if (!value) return ''
  return value.length === 10 ? `${value}T09:00` : value.slice(0, 16)
}

export default App

