---
phase: 06-app-split
plan: "03"
subsystem: ui
tags: [react, refactor, layout-components]

requires:
  - phase: 06-app-split
    provides: useModalState, useTaskSelection, useFilterState, useViewConfig, useNavigationState, useQuickCreate, useMobileDialogs hooks
provides:
  - AppSidebar layout component with sidebar-local editing state
  - AppTopBar layout component for mobile/tablet topbar
  - MobileTabBar layout component for bottom tab navigation
affects: [06-app-split]

tech-stack:
  added: []
  patterns: [layout-component-extraction, props-passthrough-pattern]

key-files:
  created:
    - web/src/components/AppSidebar.tsx
    - web/src/components/AppTopBar.tsx
    - web/src/components/MobileTabBar.tsx
  modified:
    - web/src/App.tsx

key-decisions:
  - "Moved editingTarget/ctxMenu sidebar-local state into AppSidebar (not passed as props)"
  - "MobileTabBar reads setMobileTabFading from Zustand store directly; tab-change side effects kept in App.tsx via handleMobileTabChange"
  - "AppTopBar receives all scope/menu state as props rather than reading from stores directly, keeping it pure-presentational"

patterns-established:
  - "Layout components receive state via props, keeping App.tsx as the single orchestrator"

requirements-completed: [ARCH-01]

duration: 11min
completed: 2026-04-13
---

# Phase 06 Plan 03: Extract Layout Components Summary

**Extracted AppSidebar (~447 lines), AppTopBar (~246 lines), and MobileTabBar (~53 lines) from App.tsx, reducing it from 3375 to 2867 lines (-508 lines)**

## Performance

- **Duration:** 11 min
- **Started:** 2026-04-13T01:18:59Z
- **Completed:** 2026-04-13T01:30:58Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Extracted ~340 lines of sidebar navigation JSX + editing state into AppSidebar component
- Extracted ~170 lines of mobile/tablet topbar JSX into AppTopBar component
- Extracted ~45 lines of mobile tab bar + FAB into MobileTabBar component
- Moved sidebar-local state (editingTarget, ctxMenu, startEdit, commitEdit, openCtxMenu) out of App.tsx entirely

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract AppSidebar** - `7a2ae1f` (refactor)
2. **Task 2: Extract AppTopBar** - `e295e25` (refactor)
3. **Task 3: Extract MobileTabBar** - `314eb3b` (refactor)

## Files Created/Modified
- `web/src/components/AppSidebar.tsx` - Sidebar navigation with folder/list CRUD, tag filtering, system views
- `web/src/components/AppTopBar.tsx` - Mobile topbar with scope menus, calendar/matrix mode switching, sync/auth
- `web/src/components/MobileTabBar.tsx` - Bottom tab bar (focus/calendar/matrix/me) + FAB quick create button
- `web/src/App.tsx` - Replaced inline JSX with component usage, added handleMobileTabChange handler

## Decisions Made
- Sidebar editing state (editingTarget, ctxMenu) moved entirely into AppSidebar as local state since it's only used within the sidebar
- MobileTabBar uses Zustand store for fading animation but delegates tab-change side effects to App.tsx via callback
- Imported MobileTab type from store instead of local redeclaration in App.tsx

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- App.tsx reduced to 2867 lines (from original 3441, cumulative -574 lines across 06-01 to 06-03)
- Phase 06 plans complete; further extraction possible to reach <400 line target
- All layout components are pure-presentational wrappers receiving state as props

---
*Phase: 06-app-split*
*Completed: 2026-04-13*
