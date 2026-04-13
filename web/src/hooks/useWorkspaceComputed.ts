/**
 * useWorkspaceComputed — all computed/derived state extracted from App.tsx.
 * Pure refactor: no behavior changes.
 */
import { useMemo } from 'react'
import type { Tag, Task, TimeFieldMode } from '../types/domain'
import {
  getTasksForSelection, matchesSearch, matchesSelectedTags,
  buildTaskStats, hasTaskSchedule, isTaskVisibleInCalendarWindow,
  compareTasksByProjectionDistance,
  getProjectionAnchorDateKey, getTaskPrimaryScheduleAt,
  SPECIAL_TAG_IDS,
} from '@taskflow/core'
import { getTimelineWindowLabel, isTaskVisibleInTimelineWindow } from '@taskflow/core'
import {
  addDays, buildMonthMatrix, buildWeek,
  formatMonthLabel, formatWeekRange, getDateKey,
} from '../utils/dates'
import { viewMeta, timeFieldModeLabel, getDateTimeMs, getTaskDeadlineAt } from '../utils/app-helpers'
import type { ProjectionSummaryMetric } from '../utils/app-helpers'

export interface WorkspaceComputedParams {
  tasks: Task[]
  tags: Tag[]
  lists: any[]
  filters: any[]
  selectionKind: string
  selectionId: string
  isToolSelection: boolean
  selectedTagIds: string[]
  searchKeyword: string
  selectionTimeModes: any
  calendarShowCompleted: boolean
  calendarMode: string
  calendarAnchor: string
  timelineScale: any
  currentView: string
  mobileFocusScope: string
  mobileFocusScopeListId: string | null
}

export function useWorkspaceComputed(params: WorkspaceComputedParams) {
  const {
    tasks, tags, lists, filters,
    selectionKind, selectionId, isToolSelection,
    selectedTagIds, searchKeyword, selectionTimeModes,
    calendarShowCompleted, calendarMode, calendarAnchor,
    timelineScale, currentView,
    mobileFocusScope, mobileFocusScopeListId,
  } = params

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
    const priorityRank = { urgent: 0, high: 1, normal: 2, low: 3 } as Record<string, number>
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

  const countsBySelection = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase()
    const getScopedSelectionCount = (sk: string, si: string) => {
      let scopedTasks = getTasksForSelection({ tasks, selectionKind: sk, selectionId: si, filters, selectionTimeModes })
      if (selectedTagIds.length > 0) scopedTasks = scopedTasks.filter((t) => matchesSelectedTags(t, selectedTagIds))
      if (keyword) scopedTasks = scopedTasks.filter((t) => matchesSearch(t, keyword, tags))
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
    lists.forEach((list: any) => { map[`list:${list.id}`] = getScopedSelectionCount('list', list.id) })
    tags.forEach((tag) => { map[`tag:${tag.id}`] = getScopedSelectionCount('tag', tag.id) })
    filters.forEach((filter: any) => { map[`filter:${filter.id}`] = getScopedSelectionCount('filter', filter.id) })
    return map
  }, [filters, lists, searchKeyword, selectedTagIds, selectionTimeModes, tags, tasks])

  const visibleTasks = useMemo(() => {
    let base = getTasksForSelection({ tasks, selectionKind, selectionId, filters, selectionTimeModes })
    if (selectedTagIds.length > 0) base = base.filter((t) => matchesSelectedTags(t, selectedTagIds))
    const keyword = searchKeyword.trim().toLowerCase()
    if (keyword) base = base.filter((t) => matchesSearch(t, keyword, tags))
    return sortVisibleTasks(base)
  }, [filters, searchKeyword, selectedTagIds, selectionId, selectionKind, selectionTimeModes, tags, tasks])

  const calendarTasks = useMemo(() => {
    let base = getTasksForSelection({ tasks, selectionKind, selectionId, filters, selectionTimeModes, includeCompleted: calendarShowCompleted })
    if (selectedTagIds.length > 0) base = base.filter((t) => matchesSelectedTags(t, selectedTagIds))
    const keyword = searchKeyword.trim().toLowerCase()
    if (keyword) base = base.filter((t) => matchesSearch(t, keyword, tags))
    return sortVisibleTasks(base)
  }, [calendarShowCompleted, filters, searchKeyword, selectedTagIds, selectionId, selectionKind, selectionTimeModes, tags, tasks])

  const mobileCalendarTasks = useMemo(() => {
    let base = tasks.filter(t => !t.deleted && (calendarShowCompleted || !t.completed) && (t.dueAt || t.startAt))
    if (mobileFocusScope === 'list' && mobileFocusScopeListId) base = base.filter(t => t.listId === mobileFocusScopeListId)
    return sortVisibleTasks(base)
  }, [tasks, calendarShowCompleted, mobileFocusScope, mobileFocusScopeListId])

  const mobileVisibleTasks = useMemo(() => {
    let base: Task[]
    if (mobileFocusScope === 'list' && mobileFocusScopeListId) {
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
      return visibleTasks
    }
    const keyword = searchKeyword.trim().toLowerCase()
    if (keyword) base = base.filter(t => matchesSearch(t, keyword, tags))
    return sortVisibleTasks(base)
  }, [mobileFocusScope, mobileFocusScopeListId, tasks, visibleTasks, searchKeyword, tags])

  const timelineTasks = visibleTasks

  const mobileFocusSegments = useMemo(() => {
    const todayKey = getDateKey()
    const tomorrowKey = addDays(todayKey, 1)
    const threeDaysKey = addDays(todayKey, 3)
    const weekEndKey = addDays(todayKey, 7)
    let activeTasks = tasks.filter(t => !t.deleted && !t.completed)
    const keyword = searchKeyword.trim().toLowerCase()
    if (keyword) activeTasks = activeTasks.filter(t => matchesSearch(t, keyword, tags))
    if (mobileFocusScope === 'list' && mobileFocusScopeListId) {
      activeTasks = activeTasks.filter(t => t.listId === mobileFocusScopeListId)
    } else if (mobileFocusScope === 'today') {
      activeTasks = activeTasks.filter(t => {
        const dueDate = t.dueAt?.slice(0, 10)
        const dlDate = t.deadlineAt?.slice(0, 10)
        return (dueDate && dueDate <= todayKey) || (dlDate && dlDate <= todayKey)
      })
    } else if (mobileFocusScope === 'week') {
      activeTasks = activeTasks.filter(t => {
        const dueDate = t.dueAt?.slice(0, 10)
        const dlDate = t.deadlineAt?.slice(0, 10)
        return (dueDate && dueDate <= weekEndKey) || (dlDate && dlDate <= weekEndKey)
      })
    }
    const overdue: Task[] = [], todayPlanned: Task[] = [], todayDeadline: Task[] = [], inbox: Task[] = [], upcoming: Task[] = []
    for (const task of activeTasks) {
      const dueDate = task.dueAt?.slice(0, 10) ?? null
      const dlDate = (task.deadlineAt ?? null)?.slice(0, 10) ?? null
      if ((dlDate && dlDate < todayKey) || (dueDate && dueDate < todayKey)) { overdue.push(task); continue }
      if (dueDate === todayKey) { todayPlanned.push(task); continue }
      if (dlDate === todayKey && dueDate !== todayKey) { todayDeadline.push(task); continue }
      const upcomingEnd = mobileFocusScope === 'week' ? weekEndKey : threeDaysKey
      if (dueDate && dueDate >= tomorrowKey && dueDate <= upcomingEnd) { upcoming.push(task); continue }
      if (task.listId === 'inbox' && !dueDate && !dlDate) { inbox.push(task); continue }
    }
    return { overdue, todayPlanned, todayDeadline, inbox, upcoming }
  }, [tasks, searchKeyword, tags, mobileFocusScope, mobileFocusScopeListId])

  const mobileCompletedTodayCount = useMemo(() => {
    const todayKey = getDateKey()
    return tasks.filter(t => !t.deleted && t.completed && (t.dueAt?.slice(0, 10) === todayKey || t.deadlineAt?.slice(0, 10) === todayKey)).length
  }, [tasks])

  const renderedWorkspaceTasks = isToolSelection
    ? tasks.filter((t) => !t.deleted)
    : currentView === 'calendar' ? calendarTasks
    : currentView === 'timeline' ? timelineTasks
    : visibleTasks

  const selectedTagObjects = useMemo(
    () => selectedTagIds.map((tagId) => tags.find((t) => t.id === tagId)).filter(Boolean) as Tag[],
    [selectedTagIds, tags],
  )

  const specialTagIds = [SPECIAL_TAG_IDS.urgent, SPECIAL_TAG_IDS.important] as string[]
  const primaryTags = useMemo(() => tags.filter((t) => specialTagIds.includes(t.id)), [specialTagIds, tags])
  const secondaryTags = useMemo(() => tags.filter((t) => !specialTagIds.includes(t.id)), [specialTagIds, tags])

  const workspaceLabel = useMemo(() => {
    if (selectionKind === 'system') {
      const labelMap: Record<string, string> = { all: '\u5168\u90E8', today: '\u4ECA\u65E5', upcoming: '\u672A\u6765 7 \u5929', inbox: '\u6536\u4EF6\u7BB1', completed: '\u5DF2\u5B8C\u6210', trash: '\u56DE\u6536\u7AD9' }
      const baseLabel = labelMap[selectionId] ?? 'TaskFlow'
      if (selectionId === 'today' || selectionId === 'upcoming') return `${baseLabel} \u00B7 ${timeFieldModeLabel[currentSelectionTimeMode]}`
      return baseLabel
    }
    if (selectionKind === 'list') return lists.find((l: any) => l.id === selectionId)?.name ?? '\u6E05\u5355'
    if (selectionKind === 'tag') return `#${tags.find((t) => t.id === selectionId)?.name ?? '\u6807\u7B7E'}`
    if (selectionKind === 'filter') return filters.find((f: any) => f.id === selectionId)?.name ?? '\u667A\u80FD\u6E05\u5355'
    if (selectionKind === 'tool') return selectionId === 'stats' ? '\u7EDF\u8BA1' : 'TaskFlow'
    return 'TaskFlow'
  }, [currentSelectionTimeMode, filters, lists, selectionId, selectionKind, tags])

  const currentViewLabel = viewMeta.find((v) => v.id === currentView)?.label ?? '\u5217\u8868'

  // Calendar/timeline computed
  const weekDates = useMemo(() => buildWeek(calendarAnchor), [calendarAnchor])
  const monthDates = useMemo(() => buildMonthMatrix(calendarAnchor), [calendarAnchor])
  const calendarNavLabel = useMemo(
    () => (calendarMode === 'month' ? formatMonthLabel(calendarAnchor) : formatWeekRange(calendarAnchor)),
    [calendarAnchor, calendarMode],
  )
  const stats = useMemo(() => buildTaskStats(renderedWorkspaceTasks), [renderedWorkspaceTasks])
  const contextTasks = useMemo(() => tasks.filter((t) => !t.deleted), [tasks])

  // Projection computed
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
    () => calendarTasks.filter((t) => isTaskVisibleInCalendarWindow(t, calendarProjectionDates)),
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
    () => timelineTasks.filter((t) => isTaskVisibleInTimelineWindow(t, timelineWindowBounds.start, timelineWindowBounds.end)),
    [timelineTasks, timelineWindowBounds.end, timelineWindowBounds.start],
  )
  const projectionScheduledTasks = useMemo(() => projectionContextTasks.filter((t) => hasTaskSchedule(t)), [projectionContextTasks])
  const projectionUnscheduledTasks = useMemo(() => projectionContextTasks.filter((t) => !hasTaskSchedule(t)), [projectionContextTasks])
  const projectionOutsideTasks = useMemo(() => {
    if (currentView === 'calendar') return projectionScheduledTasks.filter((t) => !isTaskVisibleInCalendarWindow(t, calendarProjectionDates))
    if (currentView === 'timeline') return projectionScheduledTasks.filter((t) => !isTaskVisibleInTimelineWindow(t, timelineWindowBounds.start, timelineWindowBounds.end))
    return []
  }, [calendarProjectionDates, currentView, projectionScheduledTasks, timelineWindowBounds.end, timelineWindowBounds.start])
  const projectionOutsideTasksSorted = useMemo(
    () => [...projectionOutsideTasks].sort((l, r) => compareTasksByProjectionDistance(l, r, calendarAnchor, currentView as any)),
    [calendarAnchor, currentView, projectionOutsideTasks],
  )
  const projectionWindowLabel = currentView === 'calendar' ? calendarNavLabel : getTimelineWindowLabel(calendarAnchor, timelineScale)
  const projectionVisibleCount = currentView === 'calendar' ? calendarVisibleTasks.length : currentView === 'timeline' ? timelineVisibleTasks.length : 0
  const projectionWorkspaceTotal = projectionWorkspaceStats ? projectionWorkspaceStats.active + projectionWorkspaceStats.completed : projectionContextTasks.length
  const projectionScheduledCount = projectionWorkspaceStats?.scheduled ?? projectionScheduledTasks.length
  const projectionUnscheduledCount = Math.max(projectionWorkspaceTotal - projectionScheduledCount, 0)
  const projectionOutsideCount = Math.max(projectionScheduledCount - projectionVisibleCount, 0)
  const nearestProjectionOutsideAnchor = projectionOutsideTasksSorted[0] ? getProjectionAnchorDateKey(projectionOutsideTasksSorted[0], currentView as any) : null
  const summaryScopeChips = useMemo(() => {
    if (isToolSelection) return []
    const chips: string[] = []
    if (currentView === 'calendar' || currentView === 'timeline') chips.push(`${currentView === 'calendar' ? '\u7A97\u53E3' : '\u65F6\u95F4\u7A97'} \u00B7 ${projectionWindowLabel}`)
    if (selectedTagObjects.length === 1) chips.push(`#${selectedTagObjects[0].name}`)
    else if (selectedTagObjects.length > 1) chips.push(`\u4EA4\u96C6 \u00B7 ${selectedTagObjects.map((t) => `#${t.name}`).join(' \u00B7 ')}`)
    if (searchKeyword.trim()) chips.push(`\u641C\u7D22 \u00B7 ${searchKeyword.trim()}`)
    return chips
  }, [currentView, isToolSelection, projectionWindowLabel, searchKeyword, selectedTagObjects])

  const shouldShowProjectionSummary = !isToolSelection && (currentView === 'calendar' || currentView === 'timeline')
  const projectionSummaryTitle = currentView === 'calendar'
    ? `${workspaceLabel} \u00B7 ${calendarMode === 'month' ? '\u6708\u89C6\u56FE' : calendarMode === 'week' ? '\u5468\u89C6\u56FE' : '\u65E5\u7A0B\u5217\u8868'}`
    : `${workspaceLabel} \u00B7 \u65F6\u95F4\u7EBF`
  const projectionSummaryDescription = ''
  const genericSummaryMetrics = useMemo<ProjectionSummaryMetric[]>(
    () => [
      { label: '\u603B\u6570', value: renderedWorkspaceTasks.length, hint: '\u5F53\u524D\u7ED3\u679C' },
      { label: '\u6D3B\u8DC3', value: stats.active },
      { label: '\u5DF2\u5B8C\u6210', value: stats.completed },
      { label: '\u5DF2\u903E\u671F', value: stats.overdue, hint: stats.overdue > 0 ? '\u4F18\u5148\u5904\u7406' : '\u6682\u65E0' },
    ],
    [renderedWorkspaceTasks.length, stats.active, stats.completed, stats.overdue],
  )
  const workspaceSummaryEyebrow = ''
  const workspaceSummaryTitle = currentView === 'calendar' || currentView === 'timeline' ? projectionSummaryTitle : `${workspaceLabel} \u00B7 ${currentViewLabel}`
  const workspaceSummaryDescription = currentView === 'calendar' || currentView === 'timeline' ? projectionSummaryDescription : ''

  return {
    currentSelectionTimeMode,
    doesTaskMatchWorkspace,
    countsBySelection,
    visibleTasks,
    calendarTasks,
    mobileCalendarTasks,
    mobileVisibleTasks,
    timelineTasks,
    mobileFocusSegments,
    mobileCompletedTodayCount,
    renderedWorkspaceTasks,
    selectedTagObjects,
    primaryTags,
    secondaryTags,
    workspaceLabel,
    currentViewLabel,
    weekDates,
    monthDates,
    calendarNavLabel,
    stats,
    contextTasks,
    projectionContextTasks,
    projectionUnscheduledTasks,
    projectionOutsideTasksSorted,
    projectionWindowLabel,
    projectionVisibleCount,
    projectionWorkspaceTotal,
    projectionScheduledCount,
    projectionUnscheduledCount,
    projectionOutsideCount,
    nearestProjectionOutsideAnchor,
    summaryScopeChips,
    shouldShowProjectionSummary,
    genericSummaryMetrics,
    workspaceSummaryEyebrow,
    workspaceSummaryTitle,
    workspaceSummaryDescription,
  }
}
