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

const DEFAULT_SELECTION_TIME_MODES: Record<TimeSelectionKey, TimeFieldMode> = {
  today: 'planned',
  upcoming: 'planned',
}

export function useViewConfig(initialState: PersistedState) {
  const [currentView, setCurrentView] = useState<WorkspaceView>(initialState.currentView)
  const [calendarMode, setCalendarMode] = useState<CalendarMode>(initialState.calendarMode)
  const [calendarShowCompleted, setCalendarShowCompleted] = useState(initialState.calendarShowCompleted)
  const [timelineScale, setTimelineScale] = useState<TimelineScale>(initialState.timelineScale)
  const [calendarAnchor, setCalendarAnchor] = useState(getDateKey())
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
