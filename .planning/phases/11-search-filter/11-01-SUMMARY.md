---
phase: 11
plan: 01
title: "FILTER-01: 统一 FilterState 模型"
status: completed
---

# Summary

## What was implemented

Extended `useFilterState` to become `FilterStateExtended`, adding three new filter dimensions:

- `filterPriority: Priority[]` — filter tasks by one or more priority values
- `filterStatus: TaskStatus[]` — filter tasks by status (todo/doing/done)
- `filterDue: FilterDue` — filter tasks by due date bucket (overdue/today/week/null)

Each dimension has a setter, a clear helper, and is included in `clearAllFilters()`.

Initial state hydrates from URL query params via `parseQueryParams` (implemented in FILTER-02).

## Files changed

- `web/src/hooks/useFilterState.ts` — complete rewrite
  - Added `FilterDue` type export
  - Added `FilterStateExtended` interface
  - Added state, setters, clear helpers for priority/status/due
  - URL hydration via `getUrlQueryParams()` on init

- `web/src/hooks/useWorkspaceComputed.ts`
  - Extended `WorkspaceComputedParams` with optional `filterPriority`, `filterStatus`, `filterDue`
  - Added `applyExtraFilters()` helper (chains priority → status → due date filtering)
  - Applied in `visibleTasks`, `calendarTasks`, `countsBySelection`, `doesTaskMatchWorkspace`
