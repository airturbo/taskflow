import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './hooks/useAuth'
import { useRealtimeSync } from './hooks/useRealtimeSync'
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts'
import { useSystemTheme } from './hooks/useSystemTheme'
import { usePushNotifications } from './hooks/usePushNotifications'
import { useModalState } from './hooks/useModalState'
import { useTaskSelection } from './hooks/useTaskSelection'
import { useFilterState } from './hooks/useFilterState'
import { useViewConfig } from './hooks/useViewConfig'
import { useNavigationState } from './hooks/useNavigationState'
import { useQuickCreate } from './hooks/useQuickCreate'
import { useMobileDialogs } from './hooks/useMobileDialogs'
import { useTaskActions } from './hooks/useTaskActions'
import { useMobileUiStore, type MobileTab } from './stores/mobileUiStore'
import { ShortcutPanel } from './components/ShortcutPanel'
import { ExportPanel } from './components/ExportPanel'
import { CommandPalette } from './components/CommandPalette'
import { AppSidebar } from './components/AppSidebar'
import { AppTopBar } from './components/AppTopBar'
import { MobileTabBar } from './components/MobileTabBar'
import { ReminderCenterPanel } from './components/ReminderCenterPanel'
import { ListView } from './components/views/ListView'
import { TagPicker, TagManagementDialog } from './components/TagManagementDialog'
import { TaskDetailPanel } from './components/TaskDetailPanel'
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
  PersistedState,
  Priority,
  Tag,
  Task,
  TimeFieldMode,
} from './types/domain'
import { useReminderCenter } from './hooks/useReminderCenter'
import {
  addDays,
  addMonths,
  buildMonthMatrix,
  buildWeek,
  formatDateTime,
  formatMonthLabel,
  formatWeekRange,
  getDateKey,
  getNowIso,
  shiftDateTimeByDays,
} from './utils/dates'
import { collectReminderEvents, formatTaskWindow } from './utils/reminder-engine'
import { requestAuthScreen } from './utils/auth-events'
import { loadState, saveState, setCurrentUserId } from './utils/storage'
import { parseSmartEntry } from './utils/smart-entry'
import {
  priorityMeta, statusMeta,
  SPECIAL_TAG_IDS,
} from '@taskflow/core'
import {
  getTasksForSelection, matchesSearch, matchesSelectedTags,
  buildTaskStats, ensureSpecialTags,
  hasTaskSchedule, isTaskVisibleInCalendarWindow,
  getCalendarTaskAnchor,
  compareTasksByProjectionDistance, getProjectionAnchorDateKey,
  getTaskPrimaryScheduleAt,
} from '@taskflow/core'
import {
  buildTimelineDraftWindow, getTimelineWindowLabel, isTaskVisibleInTimelineWindow,
} from '@taskflow/core'
import {
  viewMeta, timeFieldModeLabel, PRESET_COLORS,
  makeId, upsertTaskInCache,
  getDateTimeMs, getTaskDeadlineAt, resolveInlineCreateInitialPosition,
  type CreateTaskPayload, type InlineCreateRequest,
  type ProjectionSummaryMetric, type ProjectionRecoveryItem,
} from './utils/app-helpers'


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
    selectionTimeModes, updateSelectionTimeMode,
  } = viewConfig

  // ---- Filter ----
  const filterState = useFilterState(nav.migratedSelectedTagIds)
  const {
    selectedTagIds, setSelectedTagIds, searchInput, setSearchInput,
    searchKeyword, searchInputRef, toggleSelectedTag,
  } = filterState

  // ---- Task Selection ----
  const selection = useTaskSelection(
    initialState.tasks.find((t: Task) => !t.deleted)?.id ?? null,
  )
  const {
    selectedTaskId, setSelectedTaskId, bulkSelectedIds,
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
  const {
    mobileTab, setMobileTab,
    mobileTabFading,
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

  // ---- Task/Tag/Folder/List Actions (extracted to useTaskActions) ----
  const actions = useTaskActions({
    tasks, setTasks, tags, setTags, lists, setLists, folders, setFolders,
    filters, selectedTaskId, setSelectedTaskId, selectedTagIds, setSelectedTagIds,
    activeSelection, setActiveSelection, setCurrentView, selectionTimeModes,
    bulkSelectedIds, clearBulkSelect,
    setStatusChangeFeedback, statusChangeFeedback,
    setQuickTagIds, setInlineCreate,
    markReminderSnoozed, appendReminderFeed,
  })
  const {
    updateTask, toggleTaskComplete, applyStatusChangeFeedback, applyKanbanDropFeedback,
    updateTaskPriority, moveTaskToQuadrant, undoStatusChange, rescheduleTask, moveTaskToDate,
    bulkComplete, bulkDelete, bulkMoveToList, bulkAddTag,
    softDeleteTask, restoreTask, duplicateTask,
    addReminder, removeReminder, snoozeReminder,
    addSubtask, toggleSubtask, addComment, addAttachments, removeAttachment, openAttachment,
    createTagDefinition, updateTagDefinition, deleteTagDefinition,
    createFolder, renameFolder, updateFolderColor, deleteFolder,
    createList, renameList, updateListColor, updateListFolder, deleteList,
  } = actions

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

  const selectAllVisibleBulk = () => {
    selection.selectAllBulk(visibleTasks.map(t => t.id))
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

  // ---- 移动端 Tab 切换 ----
  const handleMobileTabChange = (tab: MobileTab) => {
    setMobileTab(tab)
    if (tab === 'me') { setMeShowProjects(false) }
    if (tab === 'calendar') {
      setCurrentView('calendar')
      if (activeSelection === 'tool:stats') setActiveSelection('system:all')
    }
  }

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
        <AppTopBar
          isNavigationDrawerMode={isNavigationDrawerMode}
          isPhoneViewport={isPhoneViewport}
          isUtilityDrawerMode={isUtilityDrawerMode}
          workspaceLabel={workspaceLabel}
          mobileTab={mobileTab}
          calendarMode={calendarMode}
          mobileMatrixViewMode={mobileMatrixViewMode}
          mobileFocusScope={mobileFocusScope}
          mobileFocusScopeListId={mobileFocusScopeListId}
          mobileFocusScopeMenuOpen={mobileFocusScopeMenuOpen}
          mobileFocusSortMode={mobileFocusSortMode}
          mobileCalendarModeMenuOpen={mobileCalendarModeMenuOpen}
          mobileMatrixModeMenuOpen={mobileMatrixModeMenuOpen}
          lists={lists}
          syncStatus={syncStatus}
          lastSyncedAt={lastSyncedAt}
          user={user}
          themeIcon={themeIcon}
          themeLabel={themeLabel}
          selectedTask={selectedTask}
          onOpenNavDrawer={() => setNavigationDrawerOpen(true)}
          onOpenUtilityDrawer={() => setUtilityDrawerOpen(true)}
          onSetMobileFocusScope={setMobileFocusScope}
          onSetMobileFocusScopeListId={setMobileFocusScopeListId}
          onSetMobileFocusScopeMenuOpen={(v) => setMobileFocusScopeMenuOpen(typeof v === 'function' ? v(mobileFocusScopeMenuOpen) : v)}
          onSetMobileFocusSortMode={setMobileFocusSortMode}
          onSetCalendarMode={setCalendarMode}
          onSetMobileCalendarModeMenuOpen={(v) => setMobileCalendarModeMenuOpen(typeof v === 'function' ? v(mobileCalendarModeMenuOpen) : v)}
          onSetMobileMatrixViewMode={setMobileMatrixViewMode}
          onSetMobileMatrixModeMenuOpen={(v) => setMobileMatrixModeMenuOpen(typeof v === 'function' ? v(mobileMatrixModeMenuOpen) : v)}
          onCycleTheme={cycleTheme}
          onSignOut={() => signOut()}
          onForceSync={handleManualSync}
        />

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
                onToggleUpcoming={() => setMobileFocusUpcomingCollapsed(!mobileFocusUpcomingCollapsed)}
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
        <MobileTabBar
          mobileTab={mobileTab}
          onChangeTab={handleMobileTabChange}
          onOpenQuickCreate={() => setMobileQuickCreateOpen(true)}
        />
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

export default App

