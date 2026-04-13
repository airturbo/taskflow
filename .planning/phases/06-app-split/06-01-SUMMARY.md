---
phase: 06-app-split
plan: 01
subsystem: ui
tags: [react, hooks, state-management, refactor]

requires:
  - phase: 05-safety-net
    provides: stable App.tsx with error boundaries and offline queue
provides:
  - 5 domain-specific UI state hooks extracted from App.tsx
  - useModalState — 9 panel/dialog boolean states
  - useTaskSelection — task selection + bulk selection state
  - useFilterState — search debounce + tag filtering
  - useViewConfig — view/calendar/timeline/theme configuration
  - useNavigationState — activeSelection + legacy migration + derived parsing
affects: [06-app-split]

tech-stack:
  added: []
  patterns:
    - "Domain state hooks: group related useState into custom hooks returning state + setters"
    - "Legacy migration in hooks: useNavigationState handles old activeSelection formats"

key-files:
  created:
    - web/src/hooks/useModalState.ts
    - web/src/hooks/useTaskSelection.ts
    - web/src/hooks/useFilterState.ts
    - web/src/hooks/useViewConfig.ts
    - web/src/hooks/useNavigationState.ts
  modified:
    - web/src/App.tsx

key-decisions:
  - "Bulk operations (bulkComplete, bulkDelete, bulkMoveToList, bulkAddTag) stay in App.tsx because they need setTasks — cross-domain"
  - "selectAllBulk takes taskIds param in hook; App.tsx wraps as selectAllVisibleBulk with visibleTasks"
  - "ProjectionInsightMode type exported from useModalState and imported in App.tsx"

patterns-established:
  - "Hook extraction pattern: create hook first, then swap useState blocks for hook calls in App.tsx"
  - "Domain boundary: hooks own state + simple helpers; cross-domain ops stay in parent"

requirements-completed: [ARCH-01]

duration: 8min
completed: 2026-04-13
---

# Phase 06 Plan 01: Extract 5 UI State Hooks Summary

**Extracted ~30 useState declarations + helpers from App.tsx into 5 domain hooks (useModalState, useTaskSelection, useFilterState, useViewConfig, useNavigationState) — pure refactor, behavior identical**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-13T00:59:50Z
- **Completed:** 2026-04-13T01:08:14Z
- **Tasks:** 6 (5 hook files + 1 wiring task)
- **Files modified:** 6

## Accomplishments
- Created 5 focused state hooks, each owning a single domain of UI state
- Removed legacy migration code, search debounce effect, selection parsing, and tag toggle from App.tsx inline code
- Eliminated `DEFAULT_SELECTION_TIME_MODES`, `SEARCH_QUERY_DEBOUNCE_MS`, and `ProjectionInsightMode` type from App.tsx (moved to hooks)
- App.tsx now calls hooks and destructures — same props flow to children

## Task Commits

Each task was committed atomically (all 6 tasks in a single commit since they form one logical refactor):

1. **Tasks 1-6: Extract 5 hooks + wire into App.tsx** - `1c6de1d` (refactor)

## Files Created/Modified
- `web/src/hooks/useModalState.ts` - 9 panel/dialog boolean states + ProjectionInsightMode type
- `web/src/hooks/useTaskSelection.ts` - selectedTaskId + bulk selection state + toggle/selectAll/clear helpers
- `web/src/hooks/useFilterState.ts` - search debounce + tag filter state + toggleSelectedTag
- `web/src/hooks/useViewConfig.ts` - view/calendar/timeline/theme/selectionTimeModes + updateSelectionTimeMode
- `web/src/hooks/useNavigationState.ts` - activeSelection with legacy migration + derived selectionKind/Id/isToolSelection
- `web/src/App.tsx` - Replaced ~60 lines of useState + helpers with 5 hook calls + destructuring

## Decisions Made
- Bulk operations (bulkComplete, bulkDelete, bulkMoveToList, bulkAddTag) stay in App.tsx because they mutate `tasks` state — cross-domain
- selectAllBulk in hook takes explicit taskIds param; App.tsx wraps it as `selectAllVisibleBulk` to pass `visibleTasks`
- ProjectionInsightMode type exported from useModalState (where the state lives)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Hook extraction complete, ready for 06-02 (further App.tsx splitting into layout components)
- App.tsx still has ~3350 lines but state management is now modular

---
*Phase: 06-app-split*
*Completed: 2026-04-13*
