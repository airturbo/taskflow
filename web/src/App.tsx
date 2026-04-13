import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { useRealtimeSync } from './hooks/useRealtimeSync'
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
import { useWorkspaceEffects } from './hooks/useWorkspaceEffects'
import { useRouterSync } from './hooks/useRouterSync'
import { useMobileUiStore } from './stores/mobileUiStore'
import { WorkspaceShell } from './components/WorkspaceShell'
import { enqueueOfflineState, flushOfflineQueue, hasPendingQueue } from './utils/offline-queue'
import type {
  PersistedState,
  Task,
} from './types/domain'
import { useReminderCenter } from './hooks/useReminderCenter'
import { loadState, setCurrentUserId } from './utils/storage'
import { ensureSpecialTags } from '@taskflow/core'


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

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/focus" replace />} />
      <Route path="/*" element={<WorkspaceApp key={authScopeKey} initialState={initialState} />} />
    </Routes>
  )
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

  useEffect(() => {
    if ((syncStatus === 'offline' || syncStatus === 'error') && user?.id) {
      enqueueOfflineState(user.id, { folders, lists, tags, filters, tasks, theme, activeSelection, selectedTagIds, selectionTimeModes: selectionTimeModes ?? {}, currentView, calendarMode, calendarShowCompleted, timelineScale, firedReminderKeys, onboarding: initialState.onboarding })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncStatus])
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const desktopMode = false

  const nav = useNavigationState(initialState)
  const { activeSelection, setActiveSelection, selectionKind, selectionId, isToolSelection } = nav
  const viewConfig = useViewConfig(initialState)
  const { currentView, setCurrentView, calendarMode, setCalendarMode, calendarShowCompleted, setCalendarShowCompleted, timelineScale, setTimelineScale, calendarAnchor, setCalendarAnchor, theme, setTheme, selectionTimeModes, updateSelectionTimeMode } = viewConfig
  const filterState = useFilterState(nav.migratedSelectedTagIds)
  const { selectedTagIds, setSelectedTagIds, searchInput, setSearchInput, searchKeyword, searchInputRef, toggleSelectedTag } = filterState
  const _urlTaskId = (() => {
    const hash = window.location.hash
    const qs = hash.includes('?') ? hash.slice(hash.indexOf('?')) : ''
    return new URLSearchParams(qs).get('task') ?? null
  })()
  const _initialTaskId = _urlTaskId
    ?? initialState.tasks.find((t: Task) => !t.deleted)?.id
    ?? null
  const selection = useTaskSelection(_initialTaskId)
  const { selectedTaskId, setSelectedTaskId, bulkSelectedIds, bulkMode, setBulkMode, toggleBulkSelect, clearBulkSelect } = selection
  const modals = useModalState()
  const { tagManagerOpen, setTagManagerOpen, shortcutPanelOpen, setShortcutPanelOpen, commandPaletteOpen, setCommandPaletteOpen, exportPanelOpen, setExportPanelOpen, navigationDrawerOpen, setNavigationDrawerOpen, utilityDrawerOpen, setUtilityDrawerOpen, taskSheetOpen, setTaskSheetOpen, sidebarExpanded, setSidebarExpanded, projectionInsightMode, setProjectionInsightMode } = modals

  const [folders, setFolders] = useState(initialState.folders)
  const [lists, setLists] = useState(initialState.lists)
  const [tags, setTags] = useState(() => ensureSpecialTags(initialState.tags))
  const [filters, setFilters] = useState(initialState.filters)
  const [tasks, setTasks] = useState(initialState.tasks)
  const { resolvedTheme, cycleTheme, themeIcon, themeLabel } = useSystemTheme(theme, setTheme)
  const { quickEntry, setQuickEntry, quickListId, setQuickListId, quickPriority, setQuickPriority, quickTagIds, setQuickTagIds, quickCreateInputRef, inlineCreate, setInlineCreate, createFeedback, setCreateFeedback, statusChangeFeedback, setStatusChangeFeedback, toggleQuickTag, toggleInlineCreateTag } = useQuickCreate()
  const [firedReminderKeys, setFiredReminderKeys] = useState(initialState.firedReminderKeys)
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth)

  const { mobileTab, setMobileTab, mobileTabFading, mobileFocusScope, mobileFocusScopeListId, setMobileFocusScope: _setMobileFocusScopeStore, mobileFocusScopeMenuOpen, setMobileFocusScopeMenuOpen, mobileFocusUpcomingCollapsed, setMobileFocusUpcomingCollapsed, mobileCalendarModeMenuOpen, setMobileCalendarModeMenuOpen, quickCreateOpen: mobileQuickCreateOpen, openQuickCreate: _openQuickCreate, closeQuickCreate, completionToast: mobileCompletionToast, showCompletionToast, hideCompletionToast } = useMobileUiStore()
  const setMobileQuickCreateOpen = (open: boolean) => open ? _openQuickCreate() : closeQuickCreate()
  const setMobileCompletionToast = (toast: { taskId: string; title: string } | null) => toast ? showCompletionToast(toast) : hideCompletionToast()
  const setMobileFocusScope = (scope: 'all' | 'today' | 'week' | 'list') => _setMobileFocusScopeStore(scope, mobileFocusScopeListId)
  const setMobileFocusScopeListId = (listId: string | null) => _setMobileFocusScopeStore(mobileFocusScope, listId)
  const completionToastTimerRef = useRef<number | null>(null)
  // Cleanup toast timer on unmount (UX-01)
  useEffect(() => {
    return () => {
      if (completionToastTimerRef.current) window.clearTimeout(completionToastTimerRef.current)
    }
  }, [])

  const [mobileProjectListId, setMobileProjectListId] = useState<string | null>(null)
  const [mobileMatrixViewMode, setMobileMatrixViewMode] = useState<'matrix' | 'kanban' | 'timeline'>('matrix')
  const [mobileFocusSortMode, setMobileFocusSortMode] = useState<'planned' | 'deadline'>('planned')
  const [mobileMatrixModeMenuOpen, setMobileMatrixModeMenuOpen] = useState(false)
  const [meShowProjects, setMeShowProjects] = useState(false)

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

  // ---- Router Sync (URL ↔ state) ----
  const { navigateTo, syncToUrl } = useRouterSync(
    {
      setActiveSelection,
      setCurrentView,
      setSearchInput,
      setCalendarMode,
      setCalendarAnchor,
      setTimelineScale,
      setSelectedTagIds,
      setSelectedTaskId,
      setCalendarShowCompleted,
    },
    {
      activeSelection,
      currentView,
      searchKeyword,
      calendarMode,
      calendarAnchor,
      timelineScale,
      selectedTagIds,
      selectedTaskId,
      calendarShowCompleted,
    },
  )

  // Sync state → URL whenever relevant state changes (replaceState)
  useEffect(() => {
    syncToUrl({
      activeSelection,
      currentView,
      searchKeyword,
      calendarMode,
      calendarAnchor,
      timelineScale,
      selectedTagIds,
      selectedTaskId,
      calendarShowCompleted,
    }, false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSelection, currentView, searchKeyword, calendarMode, calendarAnchor, timelineScale, selectedTagIds, selectedTaskId, calendarShowCompleted])

  // On activeSelection change, push a new history entry (major navigation)
  const prevActiveSelectionRef = useRef(activeSelection)
  useEffect(() => {
    if (prevActiveSelectionRef.current !== activeSelection) {
      prevActiveSelectionRef.current = activeSelection
      navigateTo(activeSelection)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSelection])

  // ---- Effects (extracted to useWorkspaceEffects) ----
  useWorkspaceEffects({
    resolvedTheme, folders, lists, tags, filters, tasks, theme,
    activeSelection, selectedTagIds, selectionTimeModes, currentView,
    calendarMode, calendarShowCompleted, timelineScale,
    firedReminderKeys, initialState, setViewportWidth, viewportWidth,
    quickCreateInputRef, searchInputRef, setCommandPaletteOpen,
    setSelectedTaskId, setCurrentView, setShortcutPanelOpen,
    setNavigationDrawerOpen, setUtilityDrawerOpen, selectedTaskId,
    createFeedback, setCreateFeedback, statusChangeFeedback, setStatusChangeFeedback,
    inlineCreate, setInlineCreate, setProjectionInsightMode, searchKeyword,
    setFiredReminderKeys, notifySurface,
  })

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
      quickTagIds={quickTagIds} setQuickTagIds={setQuickTagIds} toggleQuickTag={toggleQuickTag}
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
      setTasks={setTasks}
      selectionKind={selectionKind} selectionId={selectionId} isToolSelection={isToolSelection}
      initialState={initialState} desktopMode={desktopMode}
    />
  )
}

export default App

