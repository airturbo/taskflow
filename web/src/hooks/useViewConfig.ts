import { useState } from 'react'
import type {
  CalendarMode,
  PersistedState,
  ThemeMode,
  TimeFieldMode,
  TimeSelectionKey,
  TimelineScale,
  WorkspaceView,
} from '../types/domain'
import { getDateKey } from '../utils/dates'
import { parseQueryParams } from './useRouterSync'

const DEFAULT_SELECTION_TIME_MODES: Record<TimeSelectionKey, TimeFieldMode> = {
  today: 'planned',
  upcoming: 'planned',
}

/** Read URL hash query params once at startup for initial state hydration */
function getUrlQueryParams() {
  const hash = window.location.hash
  const queryStr = hash.includes('?') ? hash.slice(hash.indexOf('?')) : ''
  return parseQueryParams(queryStr)
}

export function useViewConfig(initialState: PersistedState) {
  const urlParams = getUrlQueryParams()

  const [currentView, setCurrentView] = useState<WorkspaceView>(
    urlParams.view ?? initialState.currentView,
  )
  const [calendarMode, setCalendarMode] = useState<CalendarMode>(
    urlParams.calendarMode ?? initialState.calendarMode,
  )
  const [calendarShowCompleted, setCalendarShowCompleted] = useState(
    urlParams.calendarShowCompleted ?? initialState.calendarShowCompleted,
  )
  const [timelineScale, setTimelineScale] = useState<TimelineScale>(
    urlParams.timelineScale ?? initialState.timelineScale,
  )
  const [calendarAnchor, setCalendarAnchor] = useState(
    urlParams.calendarAnchor ?? getDateKey(),
  )
  const [theme, setTheme] = useState<ThemeMode>(initialState.theme)
  const [selectionTimeModes, setSelectionTimeModes] = useState<PersistedState['selectionTimeModes']>({
    ...DEFAULT_SELECTION_TIME_MODES,
    ...(initialState.selectionTimeModes ?? {}),
  })

  const updateSelectionTimeMode = (key: TimeSelectionKey, mode: TimeFieldMode) => {
    setSelectionTimeModes((current) => ({
      ...DEFAULT_SELECTION_TIME_MODES,
      ...(current ?? {}),
      [key]: mode,
    }))
  }

  return {
    currentView, setCurrentView,
    calendarMode, setCalendarMode,
    calendarShowCompleted, setCalendarShowCompleted,
    timelineScale, setTimelineScale,
    calendarAnchor, setCalendarAnchor,
    theme, setTheme,
    selectionTimeModes, setSelectionTimeModes,
    updateSelectionTimeMode,
  }
}
