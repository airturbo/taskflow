/**
 * useRouterSync — bridges React Router URL ↔ workspace state.
 *
 * URL Structure (HashRouter):
 *   Path: /, /focus, /all, /upcoming, /inbox, /logbook, /trash,
 *         /list/:listId, /filter/:filterId
 *
 *   Query params:
 *     view=list|calendar|kanban|timeline|matrix
 *     q=searchKeyword
 *     cal=month|week|agenda
 *     anchor=YYYY-MM-DD
 *     scale=day|week
 *     tags=id1,id2
 *     task=taskId
 *     cal_done=1
 *
 * Strategy:
 * - Major navigation (activeSelection change) → pushState (creates history entry)
 * - Minor state changes (view/search/filter) → replaceState (no history entry)
 * - URL → state on location change (back/forward + direct navigation)
 * - State → URL on state change (keeps URL in sync)
 */
import { useCallback, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { CalendarMode, TimelineScale, WorkspaceView } from '../types/domain'

// ─── URL ↔ activeSelection mapping ────────────────────────────────────────────

const PATH_TO_SELECTION: Record<string, string> = {
  '/': 'system:today',
  '/focus': 'system:today',
  '/all': 'system:all',
  '/upcoming': 'system:upcoming',
  '/inbox': 'system:inbox',
  '/logbook': 'system:logbook',
  '/trash': 'system:trash',
}

const SELECTION_TO_PATH: Record<string, string> = {
  'system:today': '/focus',
  'system:all': '/all',
  'system:upcoming': '/upcoming',
  'system:inbox': '/inbox',
  'system:logbook': '/logbook',
  'system:trash': '/trash',
}

/** Parse URL pathname → activeSelection string */
export function pathToSelection(pathname: string): string | null {
  if (PATH_TO_SELECTION[pathname]) return PATH_TO_SELECTION[pathname]

  // /list/:listId
  const listMatch = pathname.match(/^\/list\/(.+)$/)
  if (listMatch) return `list:${listMatch[1]}`

  // /filter/:filterId
  const filterMatch = pathname.match(/^\/filter\/(.+)$/)
  if (filterMatch) return `filter:${filterMatch[1]}`

  return null
}

/** Parse activeSelection → URL pathname */
export function selectionToPath(activeSelection: string): string {
  if (SELECTION_TO_PATH[activeSelection]) return SELECTION_TO_PATH[activeSelection]

  const [kind, id] = activeSelection.split(':')
  if (kind === 'list' && id) return `/list/${id}`
  if (kind === 'filter' && id) return `/filter/${id}`

  // Fallback
  return '/focus'
}

// ─── Query param types ─────────────────────────────────────────────────────────

export interface ParsedQueryState {
  view?: WorkspaceView
  searchKeyword?: string
  calendarMode?: CalendarMode
  calendarAnchor?: string
  timelineScale?: TimelineScale
  selectedTagIds?: string[]
  selectedTaskId?: string | null
  calendarShowCompleted?: boolean
}

const VALID_VIEWS: WorkspaceView[] = ['list', 'calendar', 'kanban', 'timeline', 'matrix']
const VALID_CAL_MODES: CalendarMode[] = ['month', 'week', 'agenda']
const VALID_SCALES: TimelineScale[] = ['day', 'week']

/** Parse URLSearchParams → ParsedQueryState */
export function parseQueryParams(search: string): ParsedQueryState {
  const params = new URLSearchParams(search)
  const result: ParsedQueryState = {}

  const view = params.get('view') as WorkspaceView | null
  if (view && VALID_VIEWS.includes(view)) result.view = view

  const q = params.get('q')
  if (q) result.searchKeyword = q

  const cal = params.get('cal') as CalendarMode | null
  if (cal && VALID_CAL_MODES.includes(cal)) result.calendarMode = cal

  const anchor = params.get('anchor')
  if (anchor && /^\d{4}-\d{2}-\d{2}$/.test(anchor)) result.calendarAnchor = anchor

  const scale = params.get('scale') as TimelineScale | null
  if (scale && VALID_SCALES.includes(scale)) result.timelineScale = scale

  const tags = params.get('tags')
  if (tags) result.selectedTagIds = tags.split(',').filter(Boolean)

  const task = params.get('task')
  if (task) result.selectedTaskId = task
  else if (params.has('task')) result.selectedTaskId = null

  if (params.get('cal_done') === '1') result.calendarShowCompleted = true

  return result
}

/** Build query string from state values (only includes non-default values) */
export function buildQueryString(params: {
  view?: WorkspaceView
  searchKeyword?: string
  calendarMode?: CalendarMode
  calendarAnchor?: string
  timelineScale?: TimelineScale
  selectedTagIds?: string[]
  selectedTaskId?: string | null
  calendarShowCompleted?: boolean
}): string {
  const p = new URLSearchParams()

  if (params.view && params.view !== 'list') p.set('view', params.view)
  if (params.searchKeyword) p.set('q', params.searchKeyword)
  if (params.calendarMode && params.calendarMode !== 'month') p.set('cal', params.calendarMode)
  if (params.calendarAnchor) p.set('anchor', params.calendarAnchor)
  if (params.timelineScale && params.timelineScale !== 'week') p.set('scale', params.timelineScale)
  if (params.selectedTagIds && params.selectedTagIds.length > 0) p.set('tags', params.selectedTagIds.join(','))
  if (params.selectedTaskId) p.set('task', params.selectedTaskId)
  if (params.calendarShowCompleted) p.set('cal_done', '1')

  const str = p.toString()
  return str ? `?${str}` : ''
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export interface RouterSyncSetters {
  setActiveSelection: (s: string) => void
  setCurrentView: (v: WorkspaceView) => void
  setSearchInput: (s: string) => void
  setCalendarMode: (m: CalendarMode) => void
  setCalendarAnchor: (a: string) => void
  setTimelineScale: (s: TimelineScale) => void
  setSelectedTagIds: (ids: string[]) => void
  setSelectedTaskId: (id: string | null) => void
  setCalendarShowCompleted: (v: boolean) => void
}

export interface RouterSyncState {
  activeSelection: string
  currentView: WorkspaceView
  searchKeyword: string
  calendarMode: CalendarMode
  calendarAnchor: string
  timelineScale: TimelineScale
  selectedTagIds: string[]
  selectedTaskId: string | null
  calendarShowCompleted: boolean
}

/**
 * useRouterSync — call once in WorkspaceApp.
 *
 * Provides:
 * - `navigateTo(selection)`: major navigation → pushState
 * - `syncToUrl(state)`: minor state update → replaceState
 *
 * On location change (back/forward/direct): calls setters to restore state.
 */
export function useRouterSync(
  setters: RouterSyncSetters,
  currentState: RouterSyncState,
) {
  const location = useLocation()
  const navigate = useNavigate()

  // Guard against circular update: URL→state→URL
  const syncingFromUrl = useRef(false)
  // Track last pushed path to avoid duplicate pushes
  const lastPushedPath = useRef<string>('')

  // ── URL → state (on location change) ────────────────────────────────────────
  useEffect(() => {
    syncingFromUrl.current = true

    const selection = pathToSelection(location.pathname)
    if (selection) {
      setters.setActiveSelection(selection)
    }

    const parsed = parseQueryParams(location.search)

    // Always apply parsed values; fall back to defaults when param is absent
    setters.setCurrentView(parsed.view ?? 'list')
    setters.setSearchInput(parsed.searchKeyword ?? '')
    setters.setCalendarMode(parsed.calendarMode ?? 'month')
    if (parsed.calendarAnchor !== undefined) setters.setCalendarAnchor(parsed.calendarAnchor)
    setters.setTimelineScale(parsed.timelineScale ?? 'week')
    setters.setSelectedTagIds(parsed.selectedTagIds ?? [])
    setters.setSelectedTaskId(parsed.selectedTaskId ?? null)
    setters.setCalendarShowCompleted(parsed.calendarShowCompleted ?? false)

    // Reset guard after React processes the state updates
    const timer = setTimeout(() => { syncingFromUrl.current = false }, 50)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search])

  // ── state → URL (on state change) ───────────────────────────────────────────
  const syncToUrl = useCallback((state: RouterSyncState, push = false) => {
    if (syncingFromUrl.current) return

    const path = selectionToPath(state.activeSelection)
    const qs = buildQueryString({
      view: state.currentView,
      searchKeyword: state.searchKeyword,
      calendarMode: state.calendarMode,
      calendarAnchor: state.calendarAnchor,
      timelineScale: state.timelineScale,
      selectedTagIds: state.selectedTagIds,
      selectedTaskId: state.selectedTaskId,
      calendarShowCompleted: state.calendarShowCompleted,
    })

    const fullPath = `${path}${qs}`

    if (push) {
      if (lastPushedPath.current !== path) {
        lastPushedPath.current = path
        navigate(fullPath)
      } else {
        navigate(fullPath, { replace: true })
      }
    } else {
      navigate(fullPath, { replace: true })
    }
  }, [navigate])

  /** Navigate to a new selection (major nav → pushState) */
  const navigateTo = useCallback((selection: string) => {
    if (syncingFromUrl.current) return
    const path = selectionToPath(selection)
    const qs = buildQueryString({
      view: currentState.currentView,
      searchKeyword: currentState.searchKeyword,
      calendarMode: currentState.calendarMode,
      calendarAnchor: currentState.calendarAnchor,
      timelineScale: currentState.timelineScale,
      selectedTagIds: currentState.selectedTagIds,
      selectedTaskId: currentState.selectedTaskId,
      calendarShowCompleted: currentState.calendarShowCompleted,
    })
    lastPushedPath.current = path
    navigate(`${path}${qs}`)
  }, [navigate, currentState])

  return { navigateTo, syncToUrl }
}
