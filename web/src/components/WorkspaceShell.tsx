/**
 * WorkspaceShell — the entire workspace render shell extracted from App.tsx.
 * Contains: sidebar props, projection metrics, task selection handlers,
 * layout composition, and all JSX rendering.
 * Pure refactor: no behavior changes.
 */
import type { CalendarMode, Priority, Tag, Task, TaskAttachment, TaskStatus } from '../types/domain'
import type { MobileTab } from '../stores/mobileUiStore'
import type { InlineCreateRequest, CreateTaskPayload, ProjectionSummaryMetric, ProjectionRecoveryItem } from '../utils/app-helpers'
import { PRESET_COLORS, makeId, upsertTaskInCache, resolveInlineCreateInitialPosition, viewMeta } from '../utils/app-helpers'
import { formatDateTime, getDateKey, getNowIso, addDays, shiftDateTimeByDays } from '../utils/dates'
import { formatTaskWindow } from '../utils/reminder-engine'
import { requestAuthScreen } from '../utils/auth-events'
import { getCalendarTaskAnchor, getProjectionAnchorDateKey, priorityMeta, addMonths, statusMeta } from '@taskflow/core'
import { buildTimelineDraftWindow } from '@taskflow/core'
import { parseSmartEntry } from '../utils/smart-entry'
import { useState } from 'react'
import { DndContext, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { KanbanOverlayCard, statusOptions } from './views/KanbanView'
import { AppSidebar } from './AppSidebar'
import { AppTopBar } from './AppTopBar'
import { MobileTabBar } from './MobileTabBar'
import { ReminderCenterPanel } from './ReminderCenterPanel'
import { TagPicker, TagManagementDialog } from './TagManagementDialog'
import { TaskDetailPanel } from './TaskDetailPanel'
import { InlineCreatePopover } from './InlineCreatePopover'
import { ResponsiveDrawer, TaskBottomSheet } from './TaskBottomSheet'
import { ProjectionSummary, ProjectionRecoveryPanel } from './views/StatsView'
import { WorkspaceViewContent } from './WorkspaceViewContent'
import { MobileTaskDetailContent } from '../mobile/MobileTaskDetailContent'
import { MobileQuickCreateSheet, MobileConfirmSheet, MobilePromptSheet, MobileTagManagerSheet } from '../mobile/MobileSheets'
import { PwaInstallBanner } from './PwaInstallBanner'
import { ShortcutPanel } from './ShortcutPanel'
import { ExportPanel } from './ExportPanel'
import { CommandPalette } from './CommandPalette'
import styles from './WorkspaceShell.module.css'

export interface WorkspaceShellProps {
  // All state
  user: any; signOut: () => void
  folders: any[]; lists: any[]; tags: Tag[]; filters: any[]; tasks: Task[]
  theme: any; resolvedTheme: string
  activeSelection: string; setActiveSelection: (s: string) => void
  selectedTagIds: string[]; setSelectedTagIds: (v: any) => void
  selectionTimeModes: any; updateSelectionTimeMode: any
  selectedTaskId: string | null; setSelectedTaskId: (id: string | null) => void
  selectedTask: Task | null
  currentView: string; setCurrentView: (v: any) => void
  calendarMode: CalendarMode; setCalendarMode: (m: CalendarMode) => void
  calendarShowCompleted: boolean; setCalendarShowCompleted: (v: any) => void
  calendarAnchor: string; setCalendarAnchor: (a: string) => void
  timelineScale: any; setTimelineScale: (s: any) => void
  viewportWidth: number
  isPhoneViewport: boolean; isNavigationDrawerMode: boolean; isCompactSidebar: boolean; isUtilityDrawerMode: boolean
  // Modals
  tagManagerOpen: boolean; setTagManagerOpen: (v: any) => void
  shortcutPanelOpen: boolean; setShortcutPanelOpen: (v: any) => void
  commandPaletteOpen: boolean; setCommandPaletteOpen: (v: any) => void
  exportPanelOpen: boolean; setExportPanelOpen: (v: any) => void
  navigationDrawerOpen: boolean; setNavigationDrawerOpen: (v: any) => void
  utilityDrawerOpen: boolean; setUtilityDrawerOpen: (v: any) => void
  taskSheetOpen: boolean; setTaskSheetOpen: (v: any) => void
  sidebarExpanded: boolean; setSidebarExpanded: (v: any) => void
  projectionInsightMode: any; setProjectionInsightMode: (v: any) => void
  // Quick create
  quickEntry: string; setQuickEntry: (v: string) => void
  quickListId: string; setQuickListId: (v: string) => void
  quickPriority: Priority; setQuickPriority: (v: Priority) => void
  quickTagIds: string[]; setQuickTagIds: (v: any) => void; toggleQuickTag: (id: string) => void
  quickCreateInputRef: any; searchInputRef: any
  searchInput: string; setSearchInput: (v: string) => void; searchKeyword: string
  toggleSelectedTag: (id: string) => void
  inlineCreate: any; setInlineCreate: (v: any) => void; toggleInlineCreateTag: (id: string) => void
  createFeedback: any; setCreateFeedback: (v: any) => void
  statusChangeFeedback: any
  // Mobile
  mobileTab: MobileTab; setMobileTab: (t: MobileTab) => void
  mobileTabFading: boolean
  mobileFocusScope: string; mobileFocusScopeListId: string | null
  setMobileFocusScope: (s: any) => void; setMobileFocusScopeListId: (id: string | null) => void
  mobileFocusScopeMenuOpen: boolean; setMobileFocusScopeMenuOpen: (v: boolean) => void
  mobileFocusUpcomingCollapsed: boolean; setMobileFocusUpcomingCollapsed: (v: boolean) => void
  mobileCalendarModeMenuOpen: boolean; setMobileCalendarModeMenuOpen: (v: boolean) => void
  mobileMatrixViewMode: 'matrix' | 'kanban' | 'timeline'; setMobileMatrixViewMode: (v: any) => void
  mobileMatrixModeMenuOpen: boolean; setMobileMatrixModeMenuOpen: (v: boolean) => void
  mobileFocusSortMode: 'planned' | 'deadline'; setMobileFocusSortMode: (v: any) => void
  meShowProjects: boolean; setMeShowProjects: (v: boolean) => void
  mobileProjectListId: string | null; setMobileProjectListId: (v: string | null) => void
  mobileQuickCreateOpen: boolean; setMobileQuickCreateOpen: (v: boolean) => void
  mobileCompletionToast: { taskId: string; title: string; nextDueLabel?: string } | null; setMobileCompletionToast: (v: any) => void
  completionToastTimerRef: any
  mobileConfirmDialog: any; setMobileConfirmDialog: (v: any) => void
  mobilePromptDialog: any; setMobilePromptDialog: (v: any) => void
  mobilePromptValue: string; setMobilePromptValue: (v: string) => void
  mobileConfirm: (msg: string) => Promise<boolean>; mobilePrompt: (msg: string, dflt?: string) => Promise<string | null>
  // Sync
  syncStatus: any; lastSyncedAt: any; handleManualSync: () => Promise<void>
  themeIcon: string; themeLabel: string; cycleTheme: () => void
  pushSupported: boolean; pushSubscribed: boolean; subscribePush: () => void; unsubscribePush: () => void
  // Reminder center
  notificationPermission: any; reminderFeed: any
  requestNotificationPermission: any; dismissReminderFeedItem: (id: string) => void; clearReminderFeed: () => void
  // Computed
  countsBySelection: Record<string, number>
  visibleTasks: Task[]; calendarTasks: Task[]; mobileCalendarTasks: Task[]; mobileVisibleTasks: Task[]
  mobileFocusSegments: any; mobileCompletedTodayCount: number
  selectedTagObjects: Tag[]; primaryTags: Tag[]; secondaryTags: Tag[]
  workspaceLabel: string; weekDates: any; monthDates: any; calendarNavLabel: string
  contextTasks: Task[]
  projectionUnscheduledTasks: Task[]; projectionOutsideTasksSorted: Task[]
  projectionWindowLabel: string; projectionUnscheduledCount: number; projectionOutsideCount: number
  projectionWorkspaceTotal: number; projectionScheduledCount: number; projectionVisibleCount: number
  nearestProjectionOutsideAnchor: string | null; summaryScopeChips: string[]
  shouldShowProjectionSummary: boolean; genericSummaryMetrics: ProjectionSummaryMetric[]
  workspaceSummaryEyebrow: string; workspaceSummaryTitle: string; workspaceSummaryDescription: string
  doesTaskMatchWorkspace: (task: Task, includeCompleted?: boolean) => boolean
  // Actions
  updateTask: (id: string, patch: Partial<Task>) => void
  toggleTaskComplete: (id: string) => void
  mobileToggleComplete: (id: string) => void
  applyStatusChangeFeedback: (id: string, status: any) => void
  applyKanbanDropFeedback: (id: string, status: any) => void
  updateTaskPriority: (id: string, p: Priority) => void
  moveTaskToQuadrant: (id: string, q: any) => void
  undoStatusChange: () => void
  rescheduleTask: (id: string, s: string, d: string) => void
  moveTaskToDate: (id: string, f: string, t: string) => void
  bulkMode: boolean; setBulkMode: (v: boolean) => void
  bulkSelectedIds: Set<string>; toggleBulkSelect: (id: string) => void; clearBulkSelect: () => void
  selectAllVisibleBulk: () => void
  bulkComplete: () => void; bulkDelete: () => void; bulkMoveToList: (id: string) => void; bulkAddTag: (id: string) => void
  softDeleteTask: (id: string) => void; restoreTask: (id: string) => void; duplicateTask: (id: string) => void
  addReminder: (id: string, label: string, value: string, kind: 'relative' | 'absolute') => void
  removeReminder: (id: string, reminderId: string) => void
  snoozeReminder: (feedId: string, taskId: string, min: number) => void
  addSubtask: (id: string, title: string) => void; toggleSubtask: (id: string, sid: string) => void
  addComment: (id: string, comment: any) => void
  addAttachments: (id: string, a: TaskAttachment[]) => void; removeAttachment: (id: string, aid: string) => void
  openAttachment: (a: TaskAttachment) => Promise<void>
  createTagDefinition: (name: string, color: string) => any
  updateTagDefinition: (id: string, name: string, color: string) => any
  deleteTagDefinition: (id: string) => any
  createFolder: (name: string, color?: string) => void; renameFolder: (id: string, name: string) => void
  updateFolderColor: (id: string, color: string) => void; deleteFolder: (id: string) => void
  createList: (name: string, folderId?: string | null, color?: string) => void; renameList: (id: string, name: string) => void
  updateListColor: (id: string, color: string) => void; updateListFolder: (id: string, folderId: string | null) => void
  deleteList: (id: string) => void
  setTasks: (v: any) => void
  selectionKind: string; selectionId: string; isToolSelection: boolean
  initialState: any; desktopMode: boolean
  // Desktop completion animation + toast (UX-02)
  completingTaskIds?: Set<string>
  completionFeedback?: { taskId: string; title: string; nextDueLabel?: string } | null
  hideCompletionFeedback?: () => void
}

export function WorkspaceShell(p: WorkspaceShellProps) {
  // ---- Kanban DnD (shared DndContext for all views) ----
  const [kanbanActiveTaskId, setKanbanActiveTaskId] = useState<string | null>(null)
  const kanbanActiveTask = kanbanActiveTaskId ? p.tasks.find((t) => t.id === kanbanActiveTaskId) ?? null : null
  const kanbanSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )
  const handleKanbanDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setKanbanActiveTaskId(null)
    if (!over) return
    const taskId = String(active.id)
    const targetStatus = String(over.id)
    if (!statusOptions.includes(targetStatus as any)) return
    p.applyKanbanDropFeedback(taskId, targetStatus as any)
  }

  // ---- Task creation (moved from App.tsx) ----
  const commitTask = ({ title, note = '', listId, priority, tagIds = [], isUrgent = false, isImportant = false, status = 'todo' as TaskStatus, dueAt = null, startAt = null, deadlineAt = null, activityLabel }: CreateTaskPayload) => {
    const cleanTitle = title.trim()
    if (!cleanTitle) return false
    const now = getNowIso()
    const reminderAt = startAt ?? dueAt ?? null
    const nextTask: Task = {
      id: makeId('task'), title: cleanTitle, note: note.trim(), listId,
      tagIds: Array.from(new Set(tagIds)), isUrgent, isImportant, priority, status, startAt, dueAt, deadlineAt,
      repeatRule: '\u4E0D\u91CD\u590D',
      reminders: reminderAt ? [{ id: makeId('rem'), label: '\u5F00\u59CB\u65F6\u63D0\u9192', value: reminderAt, kind: 'absolute' as const }] : [],
      subtasks: [], attachments: [], assignee: '\u6211', collaborators: [], comments: [],
      activity: [{ id: makeId('act'), content: activityLabel, createdAt: now }],
      estimatedPomodoros: 0, completedPomodoros: 0, focusMinutes: 0,
      completed: status === 'done', deleted: false, createdAt: now, updatedAt: now,
    }
    const visibleInWorkspace = p.doesTaskMatchWorkspace(nextTask, p.currentView === 'calendar' ? p.calendarShowCompleted : false)
    p.setTasks((items: Task[]) => upsertTaskInCache(items, nextTask, true))
    p.setSelectedTaskId(nextTask.id)
    p.setQuickListId(listId)
    p.setQuickPriority(priority)
    p.setCreateFeedback({ title: nextTask.title, listId, listName: p.lists.find((l: any) => l.id === listId)?.name ?? '\u672A\u77E5\u6E05\u5355', visibleInWorkspace, workspaceLabel: p.workspaceLabel })
    if (p.isPhoneViewport) setTimeout(() => p.setCreateFeedback(null), 3000)
    return true
  }

  const openInlineCreate = ({ view, anchorRect, dateKey = '', listId, priority, tagIds = [], isUrgent = false, isImportant = false, status, guidance, time = '' }: InlineCreateRequest) => {
    const fallbackListId = p.selectionKind === 'list' ? p.selectionId : p.quickListId
    p.setInlineCreate({ view, title: '', note: '', listId: listId ?? fallbackListId, priority: priority ?? p.quickPriority, tagIds, isUrgent, isImportant, status: status ?? 'todo', dateKey, time, guidance: guidance ?? '', position: resolveInlineCreateInitialPosition(anchorRect), anchorRect })
  }

  const resolveTagIdsFromNames = (tagNames: string[]): string[] => {
    if (!tagNames.length) return []
    return tagNames.map(name => p.tags.find(t => t.name === name)?.id).filter((id): id is string => Boolean(id))
  }

  const submitInlineCreate = () => {
    if (!p.inlineCreate) return
    const parsed = parseSmartEntry(p.inlineCreate.title)
    const explicitDueAt = p.inlineCreate.dateKey ? (p.inlineCreate.time ? `${p.inlineCreate.dateKey}T${p.inlineCreate.time}` : p.inlineCreate.dateKey) : null
    const resolvedDueAt = explicitDueAt ?? parsed.dueAt
    const schedule = p.inlineCreate.view === 'timeline' ? buildTimelineDraftWindow(resolvedDueAt) : { startAt: null, dueAt: resolvedDueAt }
    const resolvedTagIds = Array.from(new Set([...p.inlineCreate.tagIds, ...resolveTagIdsFromNames(parsed.tagNames)]))
    const created = commitTask({ title: parsed.title, note: p.inlineCreate.note, listId: p.inlineCreate.listId, priority: parsed.priority ?? p.inlineCreate.priority, tagIds: resolvedTagIds, isUrgent: p.inlineCreate.isUrgent ?? false, isImportant: p.inlineCreate.isImportant ?? false, status: p.inlineCreate.status, startAt: schedule.startAt, dueAt: schedule.dueAt, activityLabel: `\u901A\u8FC7${viewMeta.find((item) => item.id === p.inlineCreate.view)?.label ?? '\u5F53\u524D\u89C6\u56FE'}\u5185\u8054\u521B\u5EFA\u5F55\u5165\u4EFB\u52A1` })
    if (created) p.setInlineCreate(null)
  }

  const createTask = () => {
    const raw = p.quickEntry.trim()
    if (!raw) return
    const parsed = parseSmartEntry(raw)
    const resolvedTagIds = Array.from(new Set([...p.quickTagIds, ...resolveTagIdsFromNames(parsed.tagNames)]))
    const created = commitTask({ title: parsed.title, listId: p.selectionKind === 'list' ? p.selectionId : p.quickListId, priority: parsed.priority ?? p.quickPriority, tagIds: resolvedTagIds, dueAt: parsed.dueAt, activityLabel: '\u901A\u8FC7\u5FEB\u901F\u521B\u5EFA\u5F55\u5165\u4EFB\u52A1' })
    if (created) { p.setQuickEntry(''); p.setQuickTagIds([]) }
  }

  const sidebarProps = {
    folders: p.folders, lists: p.lists, tags: p.tags, filters: p.filters,
    countsBySelection: p.countsBySelection,
    primaryTags: p.primaryTags, secondaryTags: p.secondaryTags,
    selectedTagObjects: p.selectedTagObjects,
    activeSelection: p.activeSelection, selectedTagIds: p.selectedTagIds,
    selectionTimeModes: p.selectionTimeModes,
    themeIcon: p.themeIcon, themeLabel: p.themeLabel, onCycleTheme: p.cycleTheme,
    pushSupported: p.pushSupported, pushSubscribed: p.pushSubscribed,
    onSubscribePush: p.subscribePush, onUnsubscribePush: p.unsubscribePush,
    onSetActiveSelection: p.setActiveSelection,
    onUpdateSelectionTimeMode: p.updateSelectionTimeMode,
    onToggleSelectedTag: p.toggleSelectedTag,
    onClearSelectedTags: () => p.setSelectedTagIds([]),
    onOpenTagManager: () => p.setTagManagerOpen(true),
    onOpenExportPanel: () => p.setExportPanelOpen(true),
    onOpenShortcutPanel: () => p.setShortcutPanelOpen(true),
    onCreateFolder: p.createFolder, onCreateList: p.createList,
    onRenameFolder: p.renameFolder, onRenameList: p.renameList,
    onUpdateFolderColor: p.updateFolderColor, onUpdateListColor: p.updateListColor,
    onUpdateListFolder: p.updateListFolder,
    onDeleteFolder: p.deleteFolder, onDeleteList: p.deleteList,
    mobileConfirm: p.mobileConfirm, mobilePrompt: p.mobilePrompt,
  }
  const navigationContent = <AppSidebar {...sidebarProps} />

  const handleMobileTabChange = (tab: MobileTab) => {
    p.setMobileTab(tab)
    if (tab === 'me') p.setMeShowProjects(false)
    if (tab === 'calendar') {
      p.setCurrentView('calendar')
      if (p.activeSelection === 'tool:stats') p.setActiveSelection('system:all')
    }
  }

  const selectTask = (taskId: string) => {
    p.setSelectedTaskId(taskId)
    if (p.isPhoneViewport) p.setTaskSheetOpen(true)
    else if (p.isUtilityDrawerMode) p.setUtilityDrawerOpen(true)
  }

  const openProjectionTaskDetail = (taskId: string) => selectTask(taskId)

  const jumpToProjectionTask = (task: Task) => {
    const nextAnchor = getProjectionAnchorDateKey(task, p.currentView as any)
    if (nextAnchor) p.setCalendarAnchor(nextAnchor)
    p.setProjectionInsightMode(null)
    selectTask(task.id)
  }

  const jumpToNearestProjectionOutside = () => {
    if (!p.nearestProjectionOutsideAnchor) return
    p.setCalendarAnchor(p.nearestProjectionOutsideAnchor)
    p.setProjectionInsightMode(null)
  }

  const projectionSummaryMetrics: ProjectionSummaryMetric[] = p.shouldShowProjectionSummary
    ? [
        { label: '\u5DE5\u4F5C\u533A', value: p.projectionWorkspaceTotal, hint: p.searchKeyword.trim() || p.selectedTagObjects.length > 0 ? '\u7B5B\u9009\u540E' : '\u5168\u90E8' },
        { label: '\u5DF2\u6392\u671F', value: p.projectionScheduledCount, hint: p.currentView === 'calendar' ? '\u8FDB\u5165\u65E5\u5386' : '\u8FDB\u5165\u65F6\u95F4\u7EBF' },
        { label: '\u7A97\u53E3\u5185', value: p.projectionVisibleCount, hint: p.currentView === 'calendar' ? '\u5F53\u524D\u7A97\u53E3' : '\u5F53\u524D\u65F6\u95F4\u7A97' },
        { label: '\u672A\u6392\u671F', value: p.projectionUnscheduledCount, hint: p.projectionUnscheduledCount > 0 ? '\u70B9\u5F00\u5B89\u6392' : '\u5DF2\u6392\u6EE1', onClick: p.projectionUnscheduledCount > 0 ? () => p.setProjectionInsightMode((c: any) => (c === 'unscheduled' ? null : 'unscheduled')) : undefined, active: p.projectionInsightMode === 'unscheduled', disabled: p.projectionUnscheduledCount === 0 },
        { label: '\u7A97\u53E3\u5916', value: p.projectionOutsideCount, hint: p.projectionOutsideCount > 0 ? '\u70B9\u5F00\u8DF3\u8F6C' : '\u5F53\u524D\u53EF\u89C1', onClick: p.projectionOutsideCount > 0 ? () => p.setProjectionInsightMode((c: any) => (c === 'outside' ? null : 'outside')) : undefined, active: p.projectionInsightMode === 'outside', disabled: p.projectionOutsideCount === 0 },
      ]
    : []

  const projectionRecoveryItems: ProjectionRecoveryItem[] =
    p.projectionInsightMode === 'unscheduled'
      ? p.projectionUnscheduledTasks.slice(0, 5).map((task) => ({ id: task.id, title: task.title, subtitle: `${p.lists.find((l: any) => l.id === task.listId)?.name ?? '\u672A\u77E5\u6E05\u5355'} \u00B7 \u8FD8\u6CA1\u5B89\u6392\u5230\u65F6\u95F4\u8F74\u91CC`, actionLabel: '\u6253\u5F00\u8BE6\u60C5\u53BB\u5B89\u6392', onAction: () => openProjectionTaskDetail(task.id) }))
      : p.projectionInsightMode === 'outside'
        ? p.projectionOutsideTasksSorted.slice(0, 5).map((task) => ({ id: task.id, title: task.title, subtitle: p.currentView === 'calendar' ? `${p.lists.find((l: any) => l.id === task.listId)?.name ?? '\u672A\u77E5\u6E05\u5355'} \u00B7 ${formatDateTime(getCalendarTaskAnchor(task))}` : `${p.lists.find((l: any) => l.id === task.listId)?.name ?? '\u672A\u77E5\u6E05\u5355'} \u00B7 ${formatTaskWindow(task.startAt, task.dueAt)}`, actionLabel: '\u8DF3\u5230\u8FD9\u91CC', onAction: () => jumpToProjectionTask(task) }))
        : []

  const projectionRecoveryFooterAction = p.projectionInsightMode === 'unscheduled'
    ? { label: '\u5207\u5230\u5217\u8868\u67E5\u770B\u5168\u90E8', onClick: () => { p.setCurrentView('list'); p.setProjectionInsightMode(null) } }
    : p.nearestProjectionOutsideAnchor ? { label: '\u6700\u8FD1\u5B89\u6392', onClick: jumpToNearestProjectionOutside } : undefined

  const workspaceSummaryToolbar = !p.isToolSelection ? (
    <>
      <input type="search" className="search-input" aria-label="\u641C\u7D22\u5F53\u524D\u5DE5\u4F5C\u533A" ref={p.searchInputRef} value={p.searchInput} onChange={(e) => p.setSearchInput(e.target.value)} placeholder="\u641C\u7D22\u5F53\u524D\u7ED3\u679C\u2026" />
      {p.selectedTagObjects.length > 0 && <button className="ghost-button small" onClick={() => p.setSelectedTagIds([])}>{'\u6E05\u7A7A\u6807\u7B7E'}</button>}
    </>
  ) : null

  const utilityContent = (
    <>
      <ReminderCenterPanel permission={p.notificationPermission} reminderFeed={p.reminderFeed} selectedTask={p.selectedTask} onRequestPermission={p.requestNotificationPermission} onSnooze={p.snoozeReminder} onDismiss={p.dismissReminderFeedItem} onClear={p.clearReminderFeed} />
      <TaskDetailPanel task={p.selectedTask} lists={p.lists} tags={p.tags} members={[]} desktopMode={p.desktopMode} onUpdateTask={p.updateTask} onChangeStatus={p.applyStatusChangeFeedback} onToggleComplete={p.toggleTaskComplete} onAddReminder={p.addReminder} onRemoveReminder={p.removeReminder} onAddSubtask={p.addSubtask} onToggleSubtask={p.toggleSubtask} onAddComment={p.addComment} onAddAttachments={p.addAttachments} onRemoveAttachment={p.removeAttachment} onOpenAttachment={p.openAttachment} onManageTags={() => p.setTagManagerOpen(true)} />
    </>
  )

  return (
    <DndContext
      sensors={kanbanSensors}
      onDragStart={(event) => setKanbanActiveTaskId(String(event.active.id))}
      onDragEnd={handleKanbanDragEnd}
      onDragCancel={() => setKanbanActiveTaskId(null)}
    >
    <div className={`${styles.appShell} ${p.isNavigationDrawerMode ? 'is-navigation-drawer' : ''} ${p.isNavigationDrawerMode && p.navigationDrawerOpen ? 'is-nav-open' : ''} ${p.isUtilityDrawerMode ? 'is-utility-drawer' : ''} ${p.isPhoneViewport ? 'is-phone' : ''} ${p.isCompactSidebar ? 'is-compact-sidebar' : ''} ${p.isCompactSidebar && p.sidebarExpanded ? 'has-expanded-sidebar' : ''}`}>
      {(!p.isNavigationDrawerMode || p.navigationDrawerOpen) && !p.isPhoneViewport && (
        <aside className={`sidebar panel ${p.isCompactSidebar ? `sidebar--compact ${p.sidebarExpanded ? 'is-expanded' : ''}` : ''} ${p.isNavigationDrawerMode ? 'sidebar--push' : ''}`}>
          {p.isCompactSidebar && <button className="sidebar-collapse-toggle" onClick={() => p.setSidebarExpanded((v: any) => !v)} title={p.sidebarExpanded ? '\u6298\u53E0\u4FA7\u8FB9\u680F' : '\u5C55\u5F00\u4FA7\u8FB9\u680F'}>{p.sidebarExpanded ? '\u2190' : '\u2192'}</button>}
          {p.isNavigationDrawerMode && <button className="sidebar-push-close" onClick={() => p.setNavigationDrawerOpen(false)} title="\u6536\u8D77\u4FA7\u8FB9\u680F">{'\u2715'}</button>}
          {navigationContent}
        </aside>
      )}
      {p.isPhoneViewport && !p.isNavigationDrawerMode && <aside className="sidebar panel">{navigationContent}</aside>}

      <main className={styles.mainStage}>
        <AppTopBar
          isNavigationDrawerMode={p.isNavigationDrawerMode} isPhoneViewport={p.isPhoneViewport} isUtilityDrawerMode={p.isUtilityDrawerMode}
          workspaceLabel={p.workspaceLabel} mobileTab={p.mobileTab} calendarMode={p.calendarMode}
          mobileMatrixViewMode={p.mobileMatrixViewMode} mobileFocusScope={p.mobileFocusScope}
          mobileFocusScopeListId={p.mobileFocusScopeListId} mobileFocusScopeMenuOpen={p.mobileFocusScopeMenuOpen}
          mobileFocusSortMode={p.mobileFocusSortMode} mobileCalendarModeMenuOpen={p.mobileCalendarModeMenuOpen}
          mobileMatrixModeMenuOpen={p.mobileMatrixModeMenuOpen} lists={p.lists} syncStatus={p.syncStatus}
          lastSyncedAt={p.lastSyncedAt} user={p.user} themeIcon={p.themeIcon} themeLabel={p.themeLabel} selectedTask={p.selectedTask}
          onOpenNavDrawer={() => p.setNavigationDrawerOpen(true)} onOpenUtilityDrawer={() => p.setUtilityDrawerOpen(true)}
          onSetMobileFocusScope={p.setMobileFocusScope} onSetMobileFocusScopeListId={p.setMobileFocusScopeListId}
          onSetMobileFocusScopeMenuOpen={(v: any) => p.setMobileFocusScopeMenuOpen(typeof v === 'function' ? v(p.mobileFocusScopeMenuOpen) : v)}
          onSetMobileFocusSortMode={p.setMobileFocusSortMode} onSetCalendarMode={p.setCalendarMode}
          onSetMobileCalendarModeMenuOpen={(v: any) => p.setMobileCalendarModeMenuOpen(typeof v === 'function' ? v(p.mobileCalendarModeMenuOpen) : v)}
          onSetMobileMatrixViewMode={p.setMobileMatrixViewMode}
          onSetMobileMatrixModeMenuOpen={(v: any) => p.setMobileMatrixModeMenuOpen(typeof v === 'function' ? v(p.mobileMatrixModeMenuOpen) : v)}
          onCycleTheme={p.cycleTheme} onSignOut={() => p.signOut()} onForceSync={p.handleManualSync}
        />

        {!p.isToolSelection && (
          <ProjectionSummary eyebrow={p.workspaceSummaryEyebrow} title={p.workspaceSummaryTitle} description={p.workspaceSummaryDescription}
            scopes={p.summaryScopeChips} metrics={p.shouldShowProjectionSummary ? projectionSummaryMetrics : p.genericSummaryMetrics}
            toolbar={workspaceSummaryToolbar}
            auxiliaryAction={p.shouldShowProjectionSummary && p.projectionOutsideCount > 0 && p.nearestProjectionOutsideAnchor ? { label: '\u6700\u8FD1\u5B89\u6392', onClick: jumpToNearestProjectionOutside } : undefined}
          />
        )}

        {p.shouldShowProjectionSummary && p.projectionInsightMode && (
          <ProjectionRecoveryPanel mode={p.projectionInsightMode}
            title={p.projectionInsightMode === 'unscheduled' ? `\u8FD8\u6709 ${p.projectionUnscheduledCount} \u6761\u672A\u6392\u671F\u4EFB\u52A1` : `\u8FD8\u6709 ${p.projectionOutsideCount} \u6761\u5B89\u6392\u4E0D\u5728\u5F53\u524D\u7A97\u53E3`}
            description={p.projectionInsightMode === 'unscheduled' ? (p.currentView === 'calendar' ? '\u8FD9\u4E9B\u4EFB\u52A1\u4ECD\u5728\u5F53\u524D\u5DE5\u4F5C\u533A\u91CC\uFF0C\u53EA\u662F\u8FD8\u6CA1\u8FDB\u65E5\u5386\uFF1B\u6253\u5F00\u8BE6\u60C5\u5373\u53EF\u8865\u65F6\u95F4\u3002' : '\u8FD9\u4E9B\u4EFB\u52A1\u4ECD\u5728\u5F53\u524D\u5DE5\u4F5C\u533A\u91CC\uFF0C\u53EA\u662F\u8FD8\u6CA1\u5F62\u6210\u4EFB\u52A1\u6761\uFF1B\u6253\u5F00\u8BE6\u60C5\u5373\u53EF\u8865\u65F6\u95F4\u3002') : (p.currentView === 'calendar' ? `\u5B83\u4EEC\u4ECD\u5C5E\u4E8E\u5F53\u524D\u5DE5\u4F5C\u533A\uFF0C\u4F46\u6708 / \u5468 / \u5217\u8868\u53EA\u4F1A\u5C55\u793A ${p.projectionWindowLabel} \u5185\u7684\u65E5\u7A0B\u951A\u70B9\u3002` : `\u5B83\u4EEC\u4ECD\u5C5E\u4E8E\u5F53\u524D\u5DE5\u4F5C\u533A\uFF0C\u4F46\u65F6\u95F4\u7EBF\u5F53\u524D\u53EA\u5C55\u793A\u4E0E ${p.projectionWindowLabel} \u76F8\u4EA4\u7684\u4EFB\u52A1\u6761\u3002`)}
            items={projectionRecoveryItems} footerAction={projectionRecoveryFooterAction}
            onClose={() => p.setProjectionInsightMode(null)}
          />
        )}

        {!p.isToolSelection && p.currentView === 'list' && (
          <section className="bulk-toolbar panel" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 14px', minHeight: 40 }}>
            {!p.bulkMode ? (
              <button className="ghost-button small" style={{ opacity: 0.5 }} onClick={() => p.setBulkMode(true)}>{'\u2611 \u6279\u91CF\u64CD\u4F5C'}</button>
            ) : (
              <>
                <button className="ghost-button small" onClick={p.selectAllVisibleBulk}>{'\u5168\u9009'}</button>
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{'\u5DF2\u9009'} {p.bulkSelectedIds.size} / {p.visibleTasks.length}</span>
                {p.bulkSelectedIds.size > 0 && (
                  <>
                    <button className="ghost-button small" onClick={p.bulkComplete}>{'\u2713 \u6279\u91CF\u5B8C\u6210'}</button>
                    <select className="ghost-button small" style={{ cursor: 'pointer', padding: '3px 8px' }} defaultValue="" onChange={e => { if (e.target.value) { p.bulkMoveToList(e.target.value); e.target.value = '' } }}>
                      <option value="" disabled>{'\u79FB\u52A8\u5230\u6E05\u5355\u2026'}</option>
                      {p.lists.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                    <select className="ghost-button small" style={{ cursor: 'pointer', padding: '3px 8px' }} defaultValue="" onChange={e => { if (e.target.value) { p.bulkAddTag(e.target.value); e.target.value = '' } }}>
                      <option value="" disabled>{'\u6253\u6807\u7B7E\u2026'}</option>
                      {p.tags.map(t => <option key={t.id} value={t.id}>#{t.name}</option>)}
                    </select>
                    <button className="ghost-button small danger" onClick={p.bulkDelete}>{'\uD83D\uDDD1 \u6279\u91CF\u5220\u9664'}</button>
                  </>
                )}
                <button className="ghost-button small" style={{ marginLeft: 'auto' }} onClick={p.clearBulkSelect}>{'\u9000\u51FA'}</button>
              </>
            )}
          </section>
        )}

        <section className={`${styles.composerBar} panel`} data-onboarding-anchor="quick-add">
          <div className={styles.composerBarMain}>
            <input ref={p.quickCreateInputRef} value={p.quickEntry} onChange={(e) => p.setQuickEntry(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') createTask() }} placeholder="\u4F8B\u5982\uFF1A\u660E\u5929\u4E0B\u5348 3 \u70B9\u4EA7\u54C1\u8BC4\u5BA1" />
            <select value={p.quickListId} onChange={(e) => p.setQuickListId(e.target.value)}>{p.lists.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
            <select value={p.quickPriority} onChange={(e) => p.setQuickPriority(e.target.value as Priority)}>{Object.entries(priorityMeta).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}</select>
            <button className="primary-button" onClick={createTask}>{'\u7ACB\u5373\u521B\u5EFA'}</button>
          </div>
          <TagPicker title="\u6807\u7B7E" tags={p.tags} selectedTagIds={p.quickTagIds} onToggleTag={p.toggleQuickTag} onManageTags={() => p.setTagManagerOpen(true)} manageLabel="\u7BA1\u7406\u6807\u7B7E" />
        </section>

        {p.createFeedback && (
          <section className={`${styles.quickFeedback} panel ${p.createFeedback.visibleInWorkspace ? styles.isPositive : styles.isWarning}`}>
            <div>
              <p className="eyebrow">{p.createFeedback.visibleInWorkspace ? 'created in current context' : 'created outside current context'}</p>
              <h3>{'\u5DF2\u521B\u5EFA\u201C'}{p.createFeedback.title}{'\u201D'}</h3>
              <p>{p.createFeedback.visibleInWorkspace ? `\u4ECD\u505C\u7559\u5728\u201C${p.createFeedback.workspaceLabel}\u201D\uFF0C\u5E76\u5DF2\u628A\u65B0\u4EFB\u52A1\u653E\u8FDB\u5F53\u524D\u5DE5\u4F5C\u6D41\u3002` : `\u4EFB\u52A1\u5DF2\u8FDB\u5165\u201C${p.createFeedback.listName}\u201D\uFF0C\u4F60\u4ECD\u505C\u7559\u5728\u201C${p.createFeedback.workspaceLabel}\u201D\u3002\u8FD9\u6761\u4EFB\u52A1\u6682\u65F6\u4E0D\u5728\u5F53\u524D\u7ED3\u679C\u91CC\u3002`}</p>
            </div>
            <div className="action-row">
              {!p.createFeedback.visibleInWorkspace && <button className="ghost-button small" onClick={() => { p.setActiveSelection(`list:${p.createFeedback.listId}`); p.setCurrentView('list'); p.setCreateFeedback(null) }}>{'\u67E5\u770B\u4EFB\u52A1'}</button>}
              <button className="ghost-button small" onClick={() => p.setCreateFeedback(null)}>{'\u77E5\u9053\u4E86'}</button>
            </div>
          </section>
        )}

        {!p.isToolSelection && (
          <section className={`${styles.viewSwitcher} panel`}>
            <div className={styles.segmentedControl}>
              {viewMeta.map((v) => <button key={v.id} className={p.currentView === v.id ? 'is-active' : ''} onClick={() => p.setCurrentView(v.id)}>{v.label}</button>)}
            </div>
            {p.currentView === 'calendar' && (
              <div className={styles.calendarNav}>
                <div className={styles.calendarModes}>
                  {(['month', 'week', 'agenda'] as CalendarMode[]).map((mode) => <button key={mode} className={p.calendarMode === mode ? 'is-active' : ''} onClick={() => p.setCalendarMode(mode)}>{mode === 'month' ? '\u6708' : mode === 'week' ? '\u5468' : '\u5217\u8868'}</button>)}
                </div>
                <div className={styles.calendarControls}>
                  <div className={styles.calendarWindowLabel}><strong>{p.calendarNavLabel}</strong><span>{p.calendarMode === 'month' ? '\u6309\u6708\u6D4F\u89C8' : '\u6309\u5468\u6D4F\u89C8'}</span></div>
                  <button className={`${styles.calendarVisibilityToggle} ${p.calendarShowCompleted ? 'is-active' : ''}`} onClick={() => p.setCalendarShowCompleted((v: any) => !v)}>{p.calendarShowCompleted ? '\u9690\u85CF\u5DF2\u5B8C\u6210' : '\u663E\u793A\u5DF2\u5B8C\u6210'}</button>
                  <button className="ghost-button small" onClick={() => p.setCalendarAnchor(p.calendarMode === 'month' ? addMonths(p.calendarAnchor, -1) : addDays(p.calendarAnchor, -7))}>{'\u2039'}</button>
                  <button className="ghost-button small" onClick={() => p.setCalendarAnchor(getDateKey())}>{'\u4ECA\u5929'}</button>
                  <button className="ghost-button small" onClick={() => p.setCalendarAnchor(p.calendarMode === 'month' ? addMonths(p.calendarAnchor, 1) : addDays(p.calendarAnchor, 7))}>{'\u203A'}</button>
                  <input type="date" className={styles.datePickerInput} value={p.calendarAnchor} onChange={(e) => e.target.value && p.setCalendarAnchor(e.target.value)} />
                </div>
              </div>
            )}
          </section>
        )}

        {p.statusChangeFeedback && !p.isPhoneViewport && (
          <section className={`${styles.actionToast} panel`} aria-live="polite">
            <div><p className="eyebrow">status updated</p><strong>{'\u5DF2\u79FB\u5230\u201C'}{statusMeta[p.statusChangeFeedback.toStatus as keyof typeof statusMeta]}{'\u201D'}</strong><p>{p.statusChangeFeedback.title}</p></div>
            <button className="ghost-button small" onClick={p.undoStatusChange}>{'\u64A4\u9500'}</button>
          </section>
        )}

        {p.completionFeedback && !p.isPhoneViewport && (
          <section className={`${styles.actionToast} panel`} aria-live="polite">
            <div>
              <p className="eyebrow">task completed</p>
              <strong>{'\u5DF2\u5B8C\u6210\u300C'}{p.completionFeedback.title}{'\u300D'}</strong>
              {p.completionFeedback.nextDueLabel && <p>{'\u4E0B\u6B21\uFF1A'}{p.completionFeedback.nextDueLabel}</p>}
            </div>
            <button className="ghost-button small" onClick={() => { p.toggleTaskComplete(p.completionFeedback!.taskId); p.hideCompletionFeedback?.() }}>{'\u64A4\u9500'}</button>
          </section>
        )}

        {p.inlineCreate && <InlineCreatePopover draft={p.inlineCreate} lists={p.lists} tags={p.tags} onClose={() => p.setInlineCreate(null)} onSubmit={submitInlineCreate} onChange={(patch: any) => p.setInlineCreate((c: any) => (c ? { ...c, ...patch } : c))} onToggleTag={p.toggleInlineCreateTag} onManageTags={() => p.setTagManagerOpen(true)} />}

        {p.tagManagerOpen && (p.isPhoneViewport ? <MobileTagManagerSheet tags={p.tags} onClose={() => p.setTagManagerOpen(false)} onCreateTag={p.createTagDefinition} onUpdateTag={p.updateTagDefinition} onDeleteTag={p.deleteTagDefinition} /> : <TagManagementDialog tags={p.tags} onClose={() => p.setTagManagerOpen(false)} onCreateTag={p.createTagDefinition} onUpdateTag={p.updateTagDefinition} onDeleteTag={p.deleteTagDefinition} />)}
        {p.shortcutPanelOpen && <ShortcutPanel onClose={() => p.setShortcutPanelOpen(false)} />}
        {p.exportPanelOpen && <ExportPanel state={{ folders: p.folders, lists: p.lists, tags: p.tags, filters: p.filters, tasks: p.tasks, theme: p.theme, activeSelection: p.activeSelection, selectedTagIds: p.selectedTagIds, selectionTimeModes: p.selectionTimeModes ?? {}, currentView: p.currentView as any, calendarMode: p.calendarMode, calendarShowCompleted: p.calendarShowCompleted, timelineScale: p.timelineScale, firedReminderKeys: p.initialState.firedReminderKeys, onboarding: p.initialState.onboarding }} onClose={() => p.setExportPanelOpen(false)} />}

        <section className={`workspace panel ${styles.workspacePanel} ${p.isPhoneViewport ? 'is-phone' : ''} ${p.mobileTabFading ? 'is-fading' : ''}`}>
          <WorkspaceViewContent isPhoneViewport={p.isPhoneViewport} isToolSelection={p.isToolSelection} currentView={p.currentView} mobileTab={p.mobileTab} mobileMatrixViewMode={p.mobileMatrixViewMode} meShowProjects={p.meShowProjects}
            tasks={p.tasks} visibleTasks={p.visibleTasks} calendarTasks={p.calendarTasks} mobileCalendarTasks={p.mobileCalendarTasks} mobileVisibleTasks={p.mobileVisibleTasks} contextTasks={p.contextTasks}
            mobileFocusSegments={p.mobileFocusSegments} mobileFocusSortMode={p.mobileFocusSortMode} mobileFocusUpcomingCollapsed={p.mobileFocusUpcomingCollapsed} mobileCompletedTodayCount={p.mobileCompletedTodayCount}
            mobileFocusScope={p.mobileFocusScope} mobileFocusScopeListId={p.mobileFocusScopeListId}
            lists={p.lists} tags={p.tags} folders={p.folders} countsBySelection={p.countsBySelection} selectedTaskId={p.selectedTaskId}
            calendarMode={p.calendarMode} calendarAnchor={p.calendarAnchor} monthDates={p.monthDates} weekDates={p.weekDates}
            calendarShowCompleted={p.calendarShowCompleted} timelineScale={p.timelineScale}
            onSelectTask={selectTask} onUpdateTask={p.updateTask} onToggleComplete={p.toggleTaskComplete} onMobileToggleComplete={p.mobileToggleComplete}
            onChangeStatus={p.applyStatusChangeFeedback} onChangePriority={p.updateTaskPriority} onMoveToQuadrant={p.moveTaskToQuadrant}
            onDropStatusChange={p.applyKanbanDropFeedback} onOpenInlineCreate={openInlineCreate} onMoveTaskToDate={p.moveTaskToDate}
            onRescheduleTask={p.rescheduleTask} onDelete={p.softDeleteTask} onRestore={p.restoreTask} onDuplicate={p.duplicateTask}
            onSetCalendarMode={p.setCalendarMode} onSetCalendarAnchor={p.setCalendarAnchor} onSetTimelineScale={p.setTimelineScale}
            onToggleSortMode={() => p.setMobileFocusSortMode((m: any) => m === 'planned' ? 'deadline' : 'planned')}
            onToggleUpcoming={() => p.setMobileFocusUpcomingCollapsed(!p.mobileFocusUpcomingCollapsed)}
            bulkMode={p.bulkMode} bulkSelectedIds={p.bulkSelectedIds} onToggleBulkSelect={p.toggleBulkSelect}
            user={p.user} syncStatus={p.syncStatus} lastSyncedAt={p.lastSyncedAt} theme={p.theme} themeLabel={p.themeLabel} themeIcon={p.themeIcon}
            onCycleTheme={p.cycleTheme} onSignOut={p.signOut} onRequestAuth={requestAuthScreen} onManualSync={p.handleManualSync}
            onOpenTagManager={() => p.setTagManagerOpen(true)}
            onGoToCompleted={() => { p.setActiveSelection('system:completed'); p.setMobileTab('focus') }}
            onGoToTrash={() => { p.setActiveSelection('system:trash'); p.setMobileTab('focus') }}
            onGoToProjects={() => p.setMeShowProjects(true)}
            onSelectList={(listId: string) => { p.setActiveSelection(`list:${listId}`); p.setMobileFocusScope('list'); p.setMobileFocusScopeListId(listId); p.setMeShowProjects(false); p.setMobileTab('focus') }}
            onRenameList={async (listId: string) => { const l = p.lists.find((x: any) => x.id === listId); if (!l) return; const n = await p.mobilePrompt('\u91CD\u547D\u540D\u6E05\u5355', l.name); if (n) p.renameList(listId, n) }}
            onDeleteList={async (listId: string) => { const l = p.lists.find((x: any) => x.id === listId); if (!l) return; if (await p.mobileConfirm(`\u5220\u9664\u6E05\u5355\u300C${l.name}\u300D\uFF1F\u5176\u4E2D\u7684\u4EFB\u52A1\u4F1A\u79FB\u5230\u6536\u4EF6\u7BB1\u3002`)) p.deleteList(listId) }}
            onChangeListColor={(listId: string, color: string) => p.updateListColor(listId, color)}
            onCreateList={async (folderId: string | null) => { const n = await p.mobilePrompt('\u6E05\u5355\u540D\u79F0'); if (n) p.createList(n, folderId) }}
            onCreateFolder={async () => { const n = await p.mobilePrompt('\u6587\u4EF6\u5939\u540D\u79F0'); if (n) p.createFolder(n) }}
            onMoveListToFolder={(listId: string, folderId: string | null) => p.updateListFolder(listId, folderId)}
            presetColors={PRESET_COLORS}
            completingTaskIds={p.completingTaskIds}
          />
        </section>

        {p.isPhoneViewport && p.mobileTab === 'me' && p.meShowProjects && p.mobileProjectListId && (
          <div className={styles.mobileProjectNav}><button className="ghost-button small" onClick={() => { p.setMobileProjectListId(null); p.setActiveSelection('system:all') }}>{'\u2190 \u8FD4\u56DE\u6E05\u5355'}</button><span className={styles.mobileProjectNavTitle}>{p.lists.find((l: any) => l.id === p.mobileProjectListId)?.name ?? '\u6E05\u5355'}</span></div>
        )}
        {p.isPhoneViewport && p.mobileTab === 'me' && p.meShowProjects && !p.mobileProjectListId && (
          <div className={styles.mobileProjectNav}><button className="ghost-button small" onClick={() => p.setMeShowProjects(false)}>{'\u2190 \u8FD4\u56DE'}</button></div>
        )}
      </main>

      {!p.isUtilityDrawerMode && <aside className={styles.rightRail}>{utilityContent}</aside>}

      {p.isPhoneViewport && <MobileTabBar mobileTab={p.mobileTab} onChangeTab={handleMobileTabChange} onOpenQuickCreate={() => p.setMobileQuickCreateOpen(true)} />}

      {p.isPhoneViewport && p.navigationDrawerOpen && <ResponsiveDrawer title="\u5DE5\u4F5C\u533A\u5BFC\u822A" side="left" onClose={() => p.setNavigationDrawerOpen(false)}><div className="sidebar panel sidebar--drawer">{navigationContent}</div></ResponsiveDrawer>}

      {p.isUtilityDrawerMode && !p.isPhoneViewport && p.utilityDrawerOpen && <ResponsiveDrawer title="\u63D0\u9192\u4E0E\u8BE6\u60C5" side="right" width={400} onClose={() => p.setUtilityDrawerOpen(false)}><div className={styles.drawerRail}>{utilityContent}</div></ResponsiveDrawer>}

      {p.isPhoneViewport && p.taskSheetOpen && p.selectedTask && <TaskBottomSheet key={p.selectedTask.id} onClose={() => p.setTaskSheetOpen(false)}><MobileTaskDetailContent task={p.selectedTask} lists={p.lists} tags={p.tags} onUpdateTask={p.updateTask} onToggleComplete={p.mobileToggleComplete} onClose={() => p.setTaskSheetOpen(false)} /></TaskBottomSheet>}

      {p.isPhoneViewport && p.mobileQuickCreateOpen && <MobileQuickCreateSheet onClose={() => p.setMobileQuickCreateOpen(false)} onSubmit={(title: string, listId: string, startAt: any, dueAt: any, deadlineAt: any, priority: Priority, tagIds: string[]) => { if (!title.trim()) return; const parsed = parseSmartEntry(title); commitTask({ title: parsed.title, listId, priority: parsed.priority ?? priority, tagIds, startAt, dueAt, deadlineAt, activityLabel: '\u901A\u8FC7\u79FB\u52A8\u7AEF\u5FEB\u901F\u521B\u5EFA\u5F55\u5165' }); p.setMobileQuickCreateOpen(false) }} contextLabel={p.mobileTab === 'focus' ? '\u7126\u70B9 \u2192 \u4ECA\u5929' : p.mobileTab === 'calendar' ? `\u65E5\u5386 \u2192 ${p.calendarAnchor}` : p.mobileTab === 'matrix' ? '\u56DB\u8C61\u9650' : '\u6536\u4EF6\u7BB1'} lists={p.lists} tags={p.tags} defaultListId={p.mobileFocusScopeListId ?? 'inbox'} defaultDueAt={p.mobileTab === 'focus' ? getDateKey() : p.mobileTab === 'calendar' ? p.calendarAnchor : null} />}

      {p.isPhoneViewport && p.mobileConfirmDialog && <MobileConfirmSheet message={p.mobileConfirmDialog.message} onConfirm={() => { p.mobileConfirmDialog.onConfirm(); p.setMobileConfirmDialog(null) }} onCancel={() => { p.mobileConfirmDialog.onCancel(); p.setMobileConfirmDialog(null) }} />}

      {p.isPhoneViewport && p.mobilePromptDialog && <MobilePromptSheet message={p.mobilePromptDialog.message} value={p.mobilePromptValue} onChange={p.setMobilePromptValue} onSubmit={() => { p.mobilePromptDialog.onSubmit(p.mobilePromptValue); p.setMobilePromptDialog(null); p.setMobilePromptValue('') }} onCancel={() => { p.mobilePromptDialog.onSubmit(null); p.setMobilePromptDialog(null); p.setMobilePromptValue('') }} />}

      {p.isPhoneViewport && p.mobileCompletionToast && (
        <div className={styles.mobileCompletionToast} role="status" aria-live="polite" aria-label="\u4EFB\u52A1\u5DF2\u5B8C\u6210">
          <span className={styles.mobileCompletionToastLabel}>{'\u5DF2\u5B8C\u6210\u300C'}{p.mobileCompletionToast.title}{'\u300D'}{p.mobileCompletionToast.nextDueLabel ? ` \u00B7 \u4E0B\u6B21\uFF1A${p.mobileCompletionToast.nextDueLabel}` : ''}</span>
          <div className={styles.mobileCompletionToastActions}>
            <button className={styles.mobileCompletionToastSnooze} onClick={() => { const task = p.tasks.find(t => t.id === p.mobileCompletionToast!.taskId); if (task) { const newDueAt = task.dueAt ? shiftDateTimeByDays(task.dueAt, 1) : `${addDays(getDateKey(), 1)}T09:00:00`; if (task.completed) p.toggleTaskComplete(p.mobileCompletionToast!.taskId); p.updateTask(p.mobileCompletionToast!.taskId, { dueAt: newDueAt }) }; p.setMobileCompletionToast(null); if (p.completionToastTimerRef.current) window.clearTimeout(p.completionToastTimerRef.current) }}>{'\u660E\u5929\u518D\u505A'}</button>
            <button className={styles.mobileCompletionToastUndo} onClick={() => { p.toggleTaskComplete(p.mobileCompletionToast!.taskId); p.setMobileCompletionToast(null); if (p.completionToastTimerRef.current) window.clearTimeout(p.completionToastTimerRef.current) }}>{'\u64A4\u9500'}</button>
          </div>
        </div>
      )}

      {p.isPhoneViewport && <PwaInstallBanner />}

      <CommandPalette open={p.commandPaletteOpen} onClose={() => p.setCommandPaletteOpen(false)} tasks={p.tasks} lists={p.lists} tags={p.tags} onSelectTask={(id: string) => selectTask(id)} onSelectList={(id: string) => p.setActiveSelection(`list:${id}`)} />
    </div>
    <DragOverlay dropAnimation={null}>
      {kanbanActiveTask ? <KanbanOverlayCard task={kanbanActiveTask} /> : null}
    </DragOverlay>
    </DndContext>
  )
}
