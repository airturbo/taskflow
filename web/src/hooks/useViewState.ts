/**
 * useViewState — workspace UI / navigation state hook
 *
 * Manages view-level state: current view, selected task, search keyword,
 * active selection (list/tag/folder/filter), sidebar visibility, and panel toggles.
 * Extracted from App.tsx to reduce its size. No JSX here — pure logic.
 *
 * Usage:
 *   const viewState = useViewState(initialState)
 */
import { useRef, useState } from 'react'
import type {
  CalendarMode,
  PersistedState,
  Priority,
  Task,
  TimeFieldMode,
  TimeSelectionKey,
  TimelineScale,
  ThemeMode,
  WorkspaceView,
} from '../types/domain'

// ---- local types ----

export type ActiveSelection =
  | { type: 'inbox' }
  | { type: 'today' }
  | { type: 'upcoming' }
  | { type: 'list'; listId: string }
  | { type: 'tag'; tagId: string }
  | { type: 'folder'; folderId: string }
  | { type: 'filter'; filterId: string }
  | { type: 'all' }
  | { type: 'done' }
  | { type: 'trash' }

export type InlineCreateDraft = {
  listId: string
  tagIds: string[]
  position: { x: number; y: number; mode: 'anchored' | 'floating' }
} | null

export type QuickCreateFeedback = {
  taskId: string
  title: string
  timestamp: number
}

export type StatusChangeFeedback = {
  taskId: string
  status: string
  timestamp: number
}

export type EditingTarget =
  | { type: 'task-title'; taskId: string }
  | { type: 'subtask-title'; taskId: string; subtaskId: string }
  | null

export type CtxMenu = {
  taskId: string
  x: number
  y: number
} | null

export type MobileListViewMode = 'list' | 'detail'
export type ProjectionInsightMode = 'daily' | 'weekly' | 'projection'

const DEFAULT_SELECTION_TIME_MODES: Record<TimeSelectionKey, TimeFieldMode> = {
  today: 'planned',
  upcoming: 'planned',
}

// ---- hook ----

export function useViewState(initialState: PersistedState) {
  // ---- navigation / view ----
  const [currentView, setCurrentView] = useState<WorkspaceView>(initialState.currentView)
  const [calendarMode, setCalendarMode] = useState<CalendarMode>(initialState.calendarMode)
  const [calendarShowCompleted, setCalendarShowCompleted] = useState(
    initialState.calendarShowCompleted,
  )
  const [timelineScale, setTimelineScale] = useState<TimelineScale>(initialState.timelineScale)
  const [calendarAnchor, setCalendarAnchor] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  })

  // ---- selection (sidebar active item) ----
  const [activeSelection, setActiveSelection] = useState<ActiveSelection>(
    (initialState as unknown as { activeSelection?: ActiveSelection }).activeSelection ?? {
      type: 'inbox',
    },
  )
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(
    (initialState as unknown as { selectedTagIds?: string[] }).selectedTagIds ?? [],
  )
  const [selectionTimeModes, setSelectionTimeModes] = useState<
    Record<TimeSelectionKey, TimeFieldMode>
  >({
    ...DEFAULT_SELECTION_TIME_MODES,
    ...(initialState.selectionTimeModes ?? {}),
  })

  // ---- task selection / detail ----
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(
    initialState.tasks.find((t: Task) => !t.deleted)?.id ?? null,
  )

  // ---- search ----
  const [searchInput, setSearchInput] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // ---- quick create ----
  const [quickEntry, setQuickEntry] = useState('')
  const [quickListId, setQuickListId] = useState('inbox')
  const [quickPriority, setQuickPriority] = useState<Priority>('normal')
  const [quickTagIds, setQuickTagIds] = useState<string[]>([])
  const quickCreateInputRef = useRef<HTMLInputElement>(null)
  const [inlineCreate, setInlineCreate] = useState<InlineCreateDraft>(null)

  // ---- feedback toasts ----
  const [createFeedback, setCreateFeedback] = useState<QuickCreateFeedback | null>(null)
  const [statusChangeFeedback, setStatusChangeFeedback] = useState<StatusChangeFeedback | null>(
    null,
  )

  // ---- panels / drawers ----
  const [tagManagerOpen, setTagManagerOpen] = useState(false)
  const [navigationDrawerOpen, setNavigationDrawerOpen] = useState(false)
  const [utilityDrawerOpen, setUtilityDrawerOpen] = useState(false)
  const [taskSheetOpen, setTaskSheetOpen] = useState(false)
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const [projectionInsightMode, setProjectionInsightMode] =
    useState<ProjectionInsightMode | null>(null)
  const [shortcutPanelOpen, setShortcutPanelOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [exportPanelOpen, setExportPanelOpen] = useState(false)

  // ---- bulk actions ----
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(new Set())
  const [bulkMode, setBulkMode] = useState(false)

  // ---- inline editing / context menus ----
  const [editingTarget, setEditingTarget] = useState<EditingTarget>(null)
  const [ctxMenu, setCtxMenu] = useState<CtxMenu>(null)

  // ---- theme ----
  const [theme, setTheme] = useState<ThemeMode>(initialState.theme)

  // ---- misc ----
  const [firedReminderKeys, setFiredReminderKeys] = useState(initialState.firedReminderKeys)
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1024,
  )

  // ---- mobile-specific ----
  const [mobileConfirmDialog, setMobileConfirmDialog] = useState<{
    message: string
    onConfirm: () => void
    onCancel: () => void
  } | null>(null)
  const [mobilePromptDialog, setMobilePromptDialog] = useState<{
    message: string
    defaultValue?: string
    onSubmit: (value: string | null) => void
  } | null>(null)
  const [mobilePromptValue, setMobilePromptValue] = useState('')
  const [mobileProjectListId, setMobileProjectListId] = useState<string | null>(null)
  const [_mobileListViewMode, _setMobileListViewMode] = useState<MobileListViewMode>('list')
  const [mobileMatrixViewMode, setMobileMatrixViewMode] = useState<
    'matrix' | 'kanban' | 'timeline'
  >('matrix')
  const [mobileFocusSortMode, setMobileFocusSortMode] = useState<'planned' | 'deadline'>(
    'planned',
  )
  const [mobileMatrixModeMenuOpen, setMobileMatrixModeMenuOpen] = useState(false)
  const [meShowProjects, setMeShowProjects] = useState(false)

  // ---- helpers ----

  const updateSelectionTimeMode = (key: TimeSelectionKey, mode: TimeFieldMode) => {
    setSelectionTimeModes((prev) => ({ ...prev, [key]: mode }))
  }

  const toggleBulkSelect = (taskId: string) => {
    setBulkSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  const clearBulkSelection = () => {
    setBulkSelectedIds(new Set())
    setBulkMode(false)
  }

  return {
    // ---- navigation / view ----
    currentView,
    setCurrentView,
    calendarMode,
    setCalendarMode,
    calendarShowCompleted,
    setCalendarShowCompleted,
    timelineScale,
    setTimelineScale,
    calendarAnchor,
    setCalendarAnchor,

    // ---- selection ----
    activeSelection,
    setActiveSelection,
    selectedTagIds,
    setSelectedTagIds,
    selectionTimeModes,
    setSelectionTimeModes,
    updateSelectionTimeMode,

    // ---- task selection / detail ----
    selectedTaskId,
    setSelectedTaskId,

    // ---- search ----
    searchInput,
    setSearchInput,
    searchKeyword,
    setSearchKeyword,
    searchInputRef,

    // ---- quick create ----
    quickEntry,
    setQuickEntry,
    quickListId,
    setQuickListId,
    quickPriority,
    setQuickPriority,
    quickTagIds,
    setQuickTagIds,
    quickCreateInputRef,
    inlineCreate,
    setInlineCreate,

    // ---- feedback toasts ----
    createFeedback,
    setCreateFeedback,
    statusChangeFeedback,
    setStatusChangeFeedback,

    // ---- panels / drawers ----
    tagManagerOpen,
    setTagManagerOpen,
    navigationDrawerOpen,
    setNavigationDrawerOpen,
    utilityDrawerOpen,
    setUtilityDrawerOpen,
    taskSheetOpen,
    setTaskSheetOpen,
    sidebarExpanded,
    setSidebarExpanded,
    projectionInsightMode,
    setProjectionInsightMode,
    shortcutPanelOpen,
    setShortcutPanelOpen,
    commandPaletteOpen,
    setCommandPaletteOpen,
    exportPanelOpen,
    setExportPanelOpen,

    // ---- bulk actions ----
    bulkSelectedIds,
    setBulkSelectedIds,
    bulkMode,
    setBulkMode,
    toggleBulkSelect,
    clearBulkSelection,

    // ---- inline editing / context menus ----
    editingTarget,
    setEditingTarget,
    ctxMenu,
    setCtxMenu,

    // ---- theme ----
    theme,
    setTheme,

    // ---- misc ----
    firedReminderKeys,
    setFiredReminderKeys,
    viewportWidth,
    setViewportWidth,

    // ---- mobile ----
    mobileConfirmDialog,
    setMobileConfirmDialog,
    mobilePromptDialog,
    setMobilePromptDialog,
    mobilePromptValue,
    setMobilePromptValue,
    mobileProjectListId,
    setMobileProjectListId,
    mobileListViewMode: _mobileListViewMode,
    setMobileListViewMode: _setMobileListViewMode,
    mobileMatrixViewMode,
    setMobileMatrixViewMode,
    mobileFocusSortMode,
    setMobileFocusSortMode,
    mobileMatrixModeMenuOpen,
    setMobileMatrixModeMenuOpen,
    meShowProjects,
    setMeShowProjects,
  }
}
