/**
 * WorkspaceViewContent — renders the correct view based on device and current tab/view.
 * Extracted from App.tsx to reduce its line count. Pure refactor, no behavior changes.
 *
 * PERF-02: All view components are lazy-loaded via React.lazy for code splitting.
 */
import { lazy, Suspense } from 'react'
import type { CalendarMode, Priority, Tag, Task, TaskStatus } from '../types/domain'
import type { InlineCreateRequest } from '../utils/app-helpers'
import type { MatrixQuadrantKey } from '@taskflow/core'
import { ViewErrorBoundary } from './ViewErrorBoundary'
import type { MobileTab } from '../stores/mobileUiStore'

// ---- Lazy view imports (desktop) ----
const ListView = lazy(() => import('./views/ListView').then((m) => ({ default: m.ListView })))
const CalendarView = lazy(() => import('./views/CalendarView').then((m) => ({ default: m.CalendarView })))
const KanbanView = lazy(() => import('./views/KanbanView').then((m) => ({ default: m.KanbanView })))
const TimelineView = lazy(() => import('./views/TimelineView').then((m) => ({ default: m.TimelineView })))
const MatrixView = lazy(() => import('./views/MatrixView').then((m) => ({ default: m.MatrixView })))
const StatsView = lazy(() => import('./views/StatsView').then((m) => ({ default: m.StatsView })))

// ---- Lazy view imports (mobile) ----
const MobileFocusView = lazy(() => import('../mobile/MobileFocusView').then((m) => ({ default: m.MobileFocusView })))
const MobileCalendarView = lazy(() => import('../mobile/MobileCalendarView').then((m) => ({ default: m.MobileCalendarView })))
const MobileMatrixView = lazy(() => import('../mobile/MobileMatrixView').then((m) => ({ default: m.MobileMatrixView })))
const MobileProjectsView = lazy(() => import('../mobile/MobileProjectsView').then((m) => ({ default: m.MobileProjectsView })))
const MobileMeView = lazy(() => import('../mobile/MobileMeView').then((m) => ({ default: m.MobileMeView })))

/** Minimal fallback shown while a lazy view chunk loads. */
function ViewLoadingFallback() {
  return <div className="view-loading-fallback" aria-label="加载中..." />
}

export interface WorkspaceViewContentProps {
  isPhoneViewport: boolean
  isToolSelection: boolean
  currentView: string
  mobileTab: MobileTab
  mobileMatrixViewMode: 'matrix' | 'kanban' | 'timeline'
  meShowProjects: boolean

  // Task data
  tasks: Task[]
  visibleTasks: Task[]
  calendarTasks: Task[]
  mobileCalendarTasks: Task[]
  mobileVisibleTasks: Task[]
  contextTasks: Task[]
  mobileFocusSegments: any
  mobileFocusSortMode: 'planned' | 'deadline'
  mobileFocusUpcomingCollapsed: boolean
  mobileCompletedTodayCount: number
  mobileFocusScope: string
  mobileFocusScopeListId: string | null

  // Metadata
  lists: any[]
  tags: Tag[]
  folders: any[]
  countsBySelection: Record<string, number>
  selectedTaskId: string | null
  calendarMode: CalendarMode
  calendarAnchor: string
  monthDates: any
  weekDates: any
  calendarShowCompleted: boolean
  timelineScale: any

  // Callbacks
  onSelectTask: (id: string) => void
  onUpdateTask: (id: string, patch: Partial<Task>) => void
  onToggleComplete: (id: string) => void
  onMobileToggleComplete: (id: string) => void
  onChangeStatus: (id: string, status: TaskStatus) => void
  onChangePriority: (id: string, priority: Priority) => void
  onMoveToQuadrant: (id: string, quadrant: MatrixQuadrantKey) => void
  onDropStatusChange: (id: string, status: TaskStatus) => void
  onOpenInlineCreate: (req: InlineCreateRequest) => void
  onMoveTaskToDate: (id: string, from: string, to: string) => void
  onRescheduleTask: (id: string, start: string, due: string) => void
  onDelete: (id: string) => void
  onRestore: (id: string) => void
  onDuplicate: (id: string) => void
  onSetCalendarMode: (mode: CalendarMode) => void
  onSetCalendarAnchor: (anchor: string) => void
  onSetTimelineScale: (scale: any) => void
  onToggleSortMode: () => void
  onToggleUpcoming: () => void
  onStatsNavigate?: (view: string, preset?: { selection?: string; due?: string }) => void
  bulkMode: boolean
  bulkSelectedIds: Set<string>
  onToggleBulkSelect: (id: string) => void
  onBulkRangeSelect?: (ids: string[]) => void

  // Mobile "me" tab callbacks
  user: any
  syncStatus: string
  lastSyncedAt: any
  theme: any
  themeLabel: string
  themeIcon: string
  onCycleTheme: () => void
  onSignOut: () => void
  onRequestAuth: () => void
  onManualSync: () => Promise<void>
  onOpenTagManager: () => void
  onGoToCompleted: () => void
  onGoToTrash: () => void
  onGoToProjects: () => void
  // Projects callbacks
  onSelectList: (id: string) => void
  onRenameList: (id: string) => Promise<void>
  onDeleteList: (id: string) => Promise<void>
  onChangeListColor: (id: string, color: string) => void
  onCreateList: (folderId: string | null) => Promise<void>
  onCreateFolder: () => Promise<void>
  onMoveListToFolder: (listId: string, folderId: string | null) => void
  presetColors: string[]
  completingTaskIds?: Set<string>
}

export function WorkspaceViewContent(props: WorkspaceViewContentProps) {
  if (props.isPhoneViewport) {
    return <MobileViewSwitch {...props} />
  }
  return <DesktopViewSwitch {...props} />
}

function MobileViewSwitch(props: WorkspaceViewContentProps) {
  const { mobileTab } = props

  if (mobileTab === 'focus') {
    return (
      <ViewErrorBoundary viewName="MobileFocusView">
        <Suspense fallback={<ViewLoadingFallback />}>
          <MobileFocusView
            segments={props.mobileFocusSegments}
            sortMode={props.mobileFocusSortMode}
            onToggleSortMode={props.onToggleSortMode}
            upcomingCollapsed={props.mobileFocusUpcomingCollapsed}
            onToggleUpcoming={props.onToggleUpcoming}
            lists={props.lists}
            tags={props.tags}
            onSelectTask={props.onSelectTask}
            onUpdateTask={props.onUpdateTask}
            onToggleComplete={props.onMobileToggleComplete}
            focusScope={props.mobileFocusScope as any}
            focusScopeListId={props.mobileFocusScopeListId}
            completedTodayCount={props.mobileCompletedTodayCount}
          />
        </Suspense>
      </ViewErrorBoundary>
    )
  }

  if (mobileTab === 'calendar') {
    return (
      <ViewErrorBoundary viewName="MobileCalendarView">
        <Suspense fallback={<ViewLoadingFallback />}>
          <MobileCalendarView
            tasks={props.mobileCalendarTasks}
            lists={props.lists}
            tags={props.tags}
            calendarMode={props.calendarMode}
            calendarAnchor={props.calendarAnchor}
            monthDates={props.monthDates}
            weekDates={props.weekDates}
            showCompletedTasks={props.calendarShowCompleted}
            selectedTaskId={props.selectedTaskId}
            onSelectTask={props.onSelectTask}
            onOpenInlineCreate={props.onOpenInlineCreate}
            onMoveTaskToDate={props.onMoveTaskToDate}
            onChangeMode={props.onSetCalendarMode}
            onToggleComplete={props.onMobileToggleComplete}
            onChangeAnchor={props.onSetCalendarAnchor}
          />
        </Suspense>
      </ViewErrorBoundary>
    )
  }

  if (mobileTab === 'matrix') {
    if (props.mobileMatrixViewMode === 'matrix') {
      return (
        <ViewErrorBoundary viewName="MobileMatrixView">
          <Suspense fallback={<ViewLoadingFallback />}>
            <MobileMatrixView
              tasks={props.mobileVisibleTasks}
              lists={props.lists}
              tags={props.tags}
              selectedTaskId={props.selectedTaskId}
              onSelectTask={props.onSelectTask}
              onChangeStatus={props.onChangeStatus}
              onChangePriority={props.onChangePriority}
              onMoveToQuadrant={props.onMoveToQuadrant}
              onOpenInlineCreate={props.onOpenInlineCreate}
            />
          </Suspense>
        </ViewErrorBoundary>
      )
    }
    if (props.mobileMatrixViewMode === 'kanban') {
      return (
        <Suspense fallback={<ViewLoadingFallback />}>
          <KanbanView
            tasks={props.mobileVisibleTasks}
            lists={props.lists}
            tags={props.tags}
            selectedTaskId={props.selectedTaskId}
            onSelectTask={props.onSelectTask}
            onChangeStatus={props.onChangeStatus}
            onChangePriority={props.onChangePriority}
            onDropStatusChange={props.onDropStatusChange}
            onOpenInlineCreate={props.onOpenInlineCreate}
          />
        </Suspense>
      )
    }
    return (
      <Suspense fallback={<ViewLoadingFallback />}>
        <TimelineView
          tasks={props.mobileVisibleTasks}
          selectedTaskId={props.selectedTaskId}
          calendarAnchor={props.calendarAnchor}
          timelineScale={props.timelineScale}
          onSelectTask={props.onSelectTask}
          onUpdateSchedule={props.onRescheduleTask}
          onOpenInlineCreate={props.onOpenInlineCreate}
          onChangeAnchor={props.onSetCalendarAnchor}
          onChangeScale={props.onSetTimelineScale}
        />
      </Suspense>
    )
  }

  // me tab
  if (props.meShowProjects) {
    return (
      <ViewErrorBoundary viewName="MobileProjectsView">
        <Suspense fallback={<ViewLoadingFallback />}>
          <MobileProjectsView
            folders={props.folders}
            lists={props.lists}
            tasks={props.tasks}
            countsBySelection={props.countsBySelection}
            onSelectList={props.onSelectList}
            onRenameList={props.onRenameList}
            onDeleteList={props.onDeleteList}
            onChangeListColor={props.onChangeListColor}
            onCreateList={props.onCreateList}
            onCreateFolder={props.onCreateFolder}
            onMoveListToFolder={props.onMoveListToFolder}
            presetColors={props.presetColors}
          />
        </Suspense>
      </ViewErrorBoundary>
    )
  }

  return (
    <ViewErrorBoundary viewName="MobileMeView">
      <Suspense fallback={<ViewLoadingFallback />}>
        <MobileMeView
          tasks={props.tasks}
          user={props.user}
          syncStatus={props.syncStatus}
          lastSyncedAt={props.lastSyncedAt}
          theme={props.theme}
          themeLabel={props.themeLabel}
          themeIcon={props.themeIcon}
          onCycleTheme={props.onCycleTheme}
          onSignOut={props.onSignOut}
          onRequestAuth={props.onRequestAuth}
          onManualSync={props.onManualSync}
          onOpenTagManager={props.onOpenTagManager}
          onGoToCompleted={props.onGoToCompleted}
          onGoToTrash={props.onGoToTrash}
          onGoToProjects={props.onGoToProjects}
        />
      </Suspense>
    </ViewErrorBoundary>
  )
}

function DesktopViewSwitch(props: WorkspaceViewContentProps) {
  if (props.isToolSelection) {
    return (
      <ViewErrorBoundary viewName="StatsView">
        <Suspense fallback={<ViewLoadingFallback />}>
          <StatsView tasks={props.contextTasks} tags={props.tags} stats={null} priorityDistribution={null} tagDistribution={null} onNavigate={props.onStatsNavigate} />
        </Suspense>
      </ViewErrorBoundary>
    )
  }

  if (props.currentView === 'list') {
    return (
      <ViewErrorBoundary viewName="ListView">
        <Suspense fallback={<ViewLoadingFallback />}>
          <ListView
            tasks={props.visibleTasks}
            lists={props.lists}
            tags={props.tags}
            selectedTaskId={props.selectedTaskId}
            onSelectTask={props.onSelectTask}
            onToggleTaskComplete={props.onToggleComplete}
            onDelete={props.onDelete}
            onRestore={props.onRestore}
            onDuplicate={props.onDuplicate}
            bulkMode={props.bulkMode}
            bulkSelectedIds={props.bulkSelectedIds}
            onToggleBulkSelect={props.onToggleBulkSelect}
            onBulkRangeSelect={props.onBulkRangeSelect}
            completingTaskIds={props.completingTaskIds}
          />
        </Suspense>
      </ViewErrorBoundary>
    )
  }

  if (props.currentView === 'calendar') {
    return (
      <ViewErrorBoundary viewName="CalendarView">
        <Suspense fallback={<ViewLoadingFallback />}>
          <CalendarView
            tasks={props.calendarTasks}
            lists={props.lists}
            tags={props.tags}
            calendarMode={props.calendarMode}
            calendarAnchor={props.calendarAnchor}
            monthDates={props.monthDates}
            weekDates={props.weekDates}
            showCompletedTasks={props.calendarShowCompleted}
            selectedTaskId={props.selectedTaskId}
            onSelectTask={props.onSelectTask}
            onOpenInlineCreate={props.onOpenInlineCreate}
            onMoveTaskToDate={props.onMoveTaskToDate}
          />
        </Suspense>
      </ViewErrorBoundary>
    )
  }

  if (props.currentView === 'kanban') {
    return (
      <ViewErrorBoundary viewName="KanbanView">
        <Suspense fallback={<ViewLoadingFallback />}>
          <KanbanView
            tasks={props.visibleTasks}
            lists={props.lists}
            tags={props.tags}
            selectedTaskId={props.selectedTaskId}
            onSelectTask={props.onSelectTask}
            onChangeStatus={props.onChangeStatus}
            onChangePriority={props.onChangePriority}
            onDropStatusChange={props.onDropStatusChange}
            onOpenInlineCreate={props.onOpenInlineCreate}
          />
        </Suspense>
      </ViewErrorBoundary>
    )
  }

  if (props.currentView === 'timeline') {
    return (
      <ViewErrorBoundary viewName="TimelineView">
        <Suspense fallback={<ViewLoadingFallback />}>
          <TimelineView
            tasks={props.visibleTasks}
            selectedTaskId={props.selectedTaskId}
            calendarAnchor={props.calendarAnchor}
            timelineScale={props.timelineScale}
            onSelectTask={props.onSelectTask}
            onUpdateSchedule={props.onRescheduleTask}
            onOpenInlineCreate={props.onOpenInlineCreate}
            onChangeAnchor={props.onSetCalendarAnchor}
            onChangeScale={props.onSetTimelineScale}
          />
        </Suspense>
      </ViewErrorBoundary>
    )
  }

  return (
    <ViewErrorBoundary viewName="MatrixView">
      <Suspense fallback={<ViewLoadingFallback />}>
        <MatrixView
          tasks={props.visibleTasks}
          lists={props.lists}
          tags={props.tags}
          selectedTaskId={props.selectedTaskId}
          onSelectTask={props.onSelectTask}
          onChangeStatus={props.onChangeStatus}
          onChangePriority={props.onChangePriority}
          onMoveToQuadrant={props.onMoveToQuadrant}
          onOpenInlineCreate={props.onOpenInlineCreate}
        />
      </Suspense>
    </ViewErrorBoundary>
  )
}
