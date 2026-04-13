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
import { useWorkspaceComputed } from './hooks/useWorkspaceComputed'
import { useMobileUiStore } from './stores/mobileUiStore'
import { WorkspaceShell } from './components/WorkspaceShell'
import { enqueueOfflineState, flushOfflineQueue, hasPendingQueue } from './utils/offline-queue'
import type {
  PersistedState,
  Task,
} from './types/domain'
import { useReminderCenter } from './hooks/useReminderCenter'
import { getNowIso } from './utils/dates'
import { collectReminderEvents } from './utils/reminder-engine'
import { loadState, saveState, setCurrentUserId } from './utils/storage'
import { parseSmartEntry } from './utils/smart-entry'
import { ensureSpecialTags } from '@taskflow/core'
import { buildTimelineDraftWindow } from '@taskflow/core'
import {
  viewMeta,
  makeId, upsertTaskInCache, resolveInlineCreateInitialPosition,
  type CreateTaskPayload, type InlineCreateRequest,
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

  // ---- Computed/Derived State (extracted to useWorkspaceComputed) ----
  const computed = useWorkspaceComputed({
    tasks, tags, lists, filters,
    selectionKind, selectionId, isToolSelection,
    selectedTagIds, searchKeyword, selectionTimeModes,
    calendarShowCompleted, calendarMode, calendarAnchor,
    timelineScale, currentView,
    mobileFocusScope, mobileFocusScopeListId,
  })
  const {
    doesTaskMatchWorkspace,
    countsBySelection, visibleTasks, calendarTasks, mobileCalendarTasks,
    mobileVisibleTasks, mobileFocusSegments, mobileCompletedTodayCount,
    selectedTagObjects, primaryTags, secondaryTags,
    workspaceLabel, weekDates, monthDates, calendarNavLabel,
    contextTasks,
    projectionUnscheduledTasks, projectionOutsideTasksSorted,
    projectionWindowLabel, projectionUnscheduledCount, projectionOutsideCount,
    projectionWorkspaceTotal, projectionScheduledCount, projectionVisibleCount,
    nearestProjectionOutsideAnchor, summaryScopeChips,
    shouldShowProjectionSummary, genericSummaryMetrics,
    workspaceSummaryEyebrow, workspaceSummaryTitle, workspaceSummaryDescription,
  } = computed

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

  const selectedTask = useMemo(
    () => (selectedTaskId ? (tasks.find((task) => task.id === selectedTaskId && !task.deleted) ?? null) : null),
    [selectedTaskId, tasks],
  )

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

  // Layout breakpoints
  const isPhoneViewport = viewportWidth <= 680
  const isNavigationDrawerMode = viewportWidth <= 960
  const isCompactSidebar = viewportWidth > 960 && viewportWidth <= 1200
  const isUtilityDrawerMode = viewportWidth <= 1280

  const { mobileConfirmDialog, setMobileConfirmDialog, mobilePromptDialog, setMobilePromptDialog, mobilePromptValue, setMobilePromptValue, mobileConfirm, mobilePrompt } = useMobileDialogs(isPhoneViewport)

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

  return (
    <WorkspaceShell
      user={user ?? null} signOut={signOut}
      folders={folders} lists={lists} tags={tags} filters={filters} tasks={tasks}
      theme={theme} resolvedTheme={resolvedTheme}
      activeSelection={activeSelection} setActiveSelection={setActiveSelection}
      selectedTagIds={selectedTagIds} setSelectedTagIds={setSelectedTagIds}
      selectionTimeModes={selectionTimeModes} updateSelectionTimeMode={updateSelectionTimeMode}
      selectedTaskId={selectedTaskId} setSelectedTaskId={setSelectedTaskId}
      selectedTask={selectedTask}
      currentView={currentView} setCurrentView={setCurrentView}
      calendarMode={calendarMode} setCalendarMode={setCalendarMode}
      calendarShowCompleted={calendarShowCompleted} setCalendarShowCompleted={setCalendarShowCompleted}
      calendarAnchor={calendarAnchor} setCalendarAnchor={setCalendarAnchor}
      timelineScale={timelineScale} setTimelineScale={setTimelineScale}
      viewportWidth={viewportWidth}
      isPhoneViewport={isPhoneViewport} isNavigationDrawerMode={isNavigationDrawerMode}
      isCompactSidebar={isCompactSidebar} isUtilityDrawerMode={isUtilityDrawerMode}
      tagManagerOpen={tagManagerOpen} setTagManagerOpen={setTagManagerOpen}
      shortcutPanelOpen={shortcutPanelOpen} setShortcutPanelOpen={setShortcutPanelOpen}
      commandPaletteOpen={commandPaletteOpen} setCommandPaletteOpen={setCommandPaletteOpen}
      exportPanelOpen={exportPanelOpen} setExportPanelOpen={setExportPanelOpen}
      navigationDrawerOpen={navigationDrawerOpen} setNavigationDrawerOpen={setNavigationDrawerOpen}
      utilityDrawerOpen={utilityDrawerOpen} setUtilityDrawerOpen={setUtilityDrawerOpen}
      taskSheetOpen={taskSheetOpen} setTaskSheetOpen={setTaskSheetOpen}
      sidebarExpanded={sidebarExpanded} setSidebarExpanded={setSidebarExpanded}
      projectionInsightMode={projectionInsightMode} setProjectionInsightMode={setProjectionInsightMode}
      quickEntry={quickEntry} setQuickEntry={setQuickEntry}
      quickListId={quickListId} setQuickListId={setQuickListId}
      quickPriority={quickPriority} setQuickPriority={setQuickPriority}
      quickTagIds={quickTagIds} toggleQuickTag={toggleQuickTag}
      quickCreateInputRef={quickCreateInputRef} searchInputRef={searchInputRef}
      searchInput={searchInput} setSearchInput={setSearchInput} searchKeyword={searchKeyword}
      toggleSelectedTag={toggleSelectedTag}
      inlineCreate={inlineCreate} setInlineCreate={setInlineCreate} toggleInlineCreateTag={toggleInlineCreateTag}
      createFeedback={createFeedback} setCreateFeedback={setCreateFeedback}
      statusChangeFeedback={statusChangeFeedback}
      mobileTab={mobileTab} setMobileTab={setMobileTab}
      mobileTabFading={mobileTabFading}
      mobileFocusScope={mobileFocusScope} mobileFocusScopeListId={mobileFocusScopeListId}
      setMobileFocusScope={setMobileFocusScope} setMobileFocusScopeListId={setMobileFocusScopeListId}
      mobileFocusScopeMenuOpen={mobileFocusScopeMenuOpen} setMobileFocusScopeMenuOpen={setMobileFocusScopeMenuOpen}
      mobileFocusUpcomingCollapsed={mobileFocusUpcomingCollapsed} setMobileFocusUpcomingCollapsed={setMobileFocusUpcomingCollapsed}
      mobileCalendarModeMenuOpen={mobileCalendarModeMenuOpen} setMobileCalendarModeMenuOpen={setMobileCalendarModeMenuOpen}
      mobileMatrixViewMode={mobileMatrixViewMode} setMobileMatrixViewMode={setMobileMatrixViewMode}
      mobileMatrixModeMenuOpen={mobileMatrixModeMenuOpen} setMobileMatrixModeMenuOpen={setMobileMatrixModeMenuOpen}
      mobileFocusSortMode={mobileFocusSortMode} setMobileFocusSortMode={setMobileFocusSortMode}
      meShowProjects={meShowProjects} setMeShowProjects={setMeShowProjects}
      mobileProjectListId={mobileProjectListId} setMobileProjectListId={setMobileProjectListId}
      mobileQuickCreateOpen={mobileQuickCreateOpen} setMobileQuickCreateOpen={setMobileQuickCreateOpen}
      mobileCompletionToast={mobileCompletionToast} setMobileCompletionToast={setMobileCompletionToast}
      completionToastTimerRef={completionToastTimerRef}
      mobileConfirmDialog={mobileConfirmDialog} setMobileConfirmDialog={setMobileConfirmDialog}
      mobilePromptDialog={mobilePromptDialog} setMobilePromptDialog={setMobilePromptDialog}
      mobilePromptValue={mobilePromptValue} setMobilePromptValue={setMobilePromptValue}
      mobileConfirm={mobileConfirm} mobilePrompt={mobilePrompt}
      syncStatus={syncStatus} lastSyncedAt={lastSyncedAt} handleManualSync={handleManualSync}
      themeIcon={themeIcon} themeLabel={themeLabel} cycleTheme={cycleTheme}
      pushSupported={pushSupported} pushSubscribed={pushSubscribed}
      subscribePush={subscribePush} unsubscribePush={unsubscribePush}
      notificationPermission={notificationPermission} reminderFeed={reminderFeed}
      requestNotificationPermission={requestNotificationPermission}
      dismissReminderFeedItem={dismissReminderFeedItem} clearReminderFeed={clearReminderFeed}
      countsBySelection={countsBySelection}
      visibleTasks={visibleTasks} calendarTasks={calendarTasks}
      mobileCalendarTasks={mobileCalendarTasks} mobileVisibleTasks={mobileVisibleTasks}
      mobileFocusSegments={mobileFocusSegments} mobileCompletedTodayCount={mobileCompletedTodayCount}
      selectedTagObjects={selectedTagObjects} primaryTags={primaryTags} secondaryTags={secondaryTags}
      workspaceLabel={workspaceLabel} weekDates={weekDates} monthDates={monthDates} calendarNavLabel={calendarNavLabel}
      contextTasks={contextTasks}
      projectionUnscheduledTasks={projectionUnscheduledTasks} projectionOutsideTasksSorted={projectionOutsideTasksSorted}
      projectionWindowLabel={projectionWindowLabel} projectionUnscheduledCount={projectionUnscheduledCount}
      projectionOutsideCount={projectionOutsideCount} projectionWorkspaceTotal={projectionWorkspaceTotal}
      projectionScheduledCount={projectionScheduledCount} projectionVisibleCount={projectionVisibleCount}
      nearestProjectionOutsideAnchor={nearestProjectionOutsideAnchor} summaryScopeChips={summaryScopeChips}
      shouldShowProjectionSummary={shouldShowProjectionSummary} genericSummaryMetrics={genericSummaryMetrics}
      workspaceSummaryEyebrow={workspaceSummaryEyebrow} workspaceSummaryTitle={workspaceSummaryTitle}
      workspaceSummaryDescription={workspaceSummaryDescription}
      doesTaskMatchWorkspace={doesTaskMatchWorkspace}
      updateTask={updateTask} toggleTaskComplete={toggleTaskComplete} mobileToggleComplete={mobileToggleComplete}
      applyStatusChangeFeedback={applyStatusChangeFeedback} applyKanbanDropFeedback={applyKanbanDropFeedback}
      updateTaskPriority={updateTaskPriority} moveTaskToQuadrant={moveTaskToQuadrant}
      undoStatusChange={undoStatusChange} rescheduleTask={rescheduleTask} moveTaskToDate={moveTaskToDate}
      bulkMode={bulkMode} setBulkMode={setBulkMode}
      bulkSelectedIds={bulkSelectedIds} toggleBulkSelect={toggleBulkSelect} clearBulkSelect={clearBulkSelect}
      selectAllVisibleBulk={selectAllVisibleBulk}
      bulkComplete={bulkComplete} bulkDelete={bulkDelete} bulkMoveToList={bulkMoveToList} bulkAddTag={bulkAddTag}
      softDeleteTask={softDeleteTask} restoreTask={restoreTask} duplicateTask={duplicateTask}
      addReminder={addReminder} removeReminder={removeReminder} snoozeReminder={snoozeReminder}
      addSubtask={addSubtask} toggleSubtask={toggleSubtask} addComment={addComment}
      addAttachments={addAttachments} removeAttachment={removeAttachment} openAttachment={openAttachment}
      createTagDefinition={createTagDefinition} updateTagDefinition={updateTagDefinition} deleteTagDefinition={deleteTagDefinition}
      createFolder={createFolder} renameFolder={renameFolder} updateFolderColor={updateFolderColor} deleteFolder={deleteFolder}
      createList={createList} renameList={renameList} updateListColor={updateListColor} updateListFolder={updateListFolder} deleteList={deleteList}
      commitTask={commitTask} openInlineCreate={openInlineCreate} submitInlineCreate={submitInlineCreate} createTask={createTask}
      selectionKind={selectionKind} selectionId={selectionId} isToolSelection={isToolSelection}
      initialState={initialState} desktopMode={desktopMode}
    />
  )
}

export default App

