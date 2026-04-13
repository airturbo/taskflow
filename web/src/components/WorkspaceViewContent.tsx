/**
 * WorkspaceViewContent — renders the correct view based on device and current tab/view.
 * Extracted from App.tsx to reduce its line count. Pure refactor, no behavior changes.
 */
import type { CalendarMode, Priority, Tag, Task, TaskStatus } from '../types/domain'
import type { InlineCreateRequest } from '../utils/app-helpers'
import type { MatrixQuadrantKey } from '@taskflow/core'
import { ViewErrorBoundary } from './ViewErrorBoundary'
import { ListView } from './views/ListView'
import { CalendarView } from './views/CalendarView'
import { KanbanView } from './views/KanbanView'
import { TimelineView } from './views/TimelineView'
import { MatrixView } from './views/MatrixView'
import { StatsView } from './views/StatsView'
import { MobileFocusView } from '../mobile/MobileFocusView'
import { MobileCalendarView } from '../mobile/MobileCalendarView'
import { MobileMatrixView } from '../mobile/MobileMatrixView'
import { MobileProjectsView } from '../mobile/MobileProjectsView'
import { MobileMeView } from '../mobile/MobileMeView'
import type { MobileTab } from '../stores/mobileUiStore'

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
  bulkMode: boolean
  bulkSelectedIds: Set<string>
  onToggleBulkSelect: (id: string) => void

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
      </ViewErrorBoundary>
    )
  }

  if (mobileTab === 'calendar') {
    return (
      <ViewErrorBoundary viewName="MobileCalendarView">
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
      </ViewErrorBoundary>
    )
  }

  if (mobileTab === 'matrix') {
    if (props.mobileMatrixViewMode === 'matrix') {
      return (
        <ViewErrorBoundary viewName="MobileMatrixView">
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
        </ViewErrorBoundary>
      )
    }
    if (props.mobileMatrixViewMode === 'kanban') {
      return (
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
      )
    }
    return (
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
    )
  }

  // me tab
  if (props.meShowProjects) {
    return (
      <ViewErrorBoundary viewName="MobileProjectsView">
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
      </ViewErrorBoundary>
    )
  }

  return (
    <ViewErrorBoundary viewName="MobileMeView">
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
    </ViewErrorBoundary>
  )
}

function DesktopViewSwitch(props: WorkspaceViewContentProps) {
  if (props.isToolSelection) {
    return (
      <ViewErrorBoundary viewName="StatsView">
        <StatsView tasks={props.contextTasks} tags={props.tags} stats={null} priorityDistribution={null} tagDistribution={null} />
      </ViewErrorBoundary>
    )
  }

  if (props.currentView === 'list') {
    return (
      <ViewErrorBoundary viewName="ListView">
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
        />
      </ViewErrorBoundary>
    )
  }

  if (props.currentView === 'calendar') {
    return (
      <ViewErrorBoundary viewName="CalendarView">
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
      </ViewErrorBoundary>
    )
  }

  if (props.currentView === 'kanban') {
    return (
      <ViewErrorBoundary viewName="KanbanView">
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
      </ViewErrorBoundary>
    )
  }

  if (props.currentView === 'timeline') {
    return (
      <ViewErrorBoundary viewName="TimelineView">
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
      </ViewErrorBoundary>
    )
  }

  return (
    <ViewErrorBoundary viewName="MatrixView">
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
    </ViewErrorBoundary>
  )
}
