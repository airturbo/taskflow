---
phase: 11
plan: 02
title: "FILTER-02: URL 序列化集成"
status: completed
---

# Summary

## What was implemented

Extended `useRouterSync` (Phase 8) to bidirectionally sync the three new filter fields:

- `priority=urgent,high` (comma-separated, omitted when empty)
- `status=todo,doing` (comma-separated, omitted when empty)
- `due=today` (single value overdue|today|week, omitted when null)

## Files changed

- `web/src/hooks/useRouterSync.ts`
  - Extended `ParsedQueryState` with `filterPriority`, `filterStatus`, `filterDue`
  - Added `VALID_PRIORITIES`, `VALID_STATUSES`, `VALID_DUES` constants
  - Updated `parseQueryParams` to parse new params with validation
  - Updated `buildQueryString` to serialize new params (omit when empty/null)
  - Extended `RouterSyncSetters` with `setFilterPriority`, `setFilterStatus`, `setFilterDue`
  - Extended `RouterSyncState` with `filterPriority`, `filterStatus`, `filterDue`
  - URL→state effect calls new setters
  - `syncToUrl` and `navigateTo` pass new fields to `buildQueryString`

- `web/src/App.tsx`
  - Destructures new fields from `filterState`
  - Passes `setFilterPriority/Status/Due` into `useRouterSync` setters
  - Passes `filterPriority/Status/Due` into `useRouterSync` currentState
  - `syncToUrl` effect includes new fields in call + deps array
  - `useWorkspaceComputed` receives new fields
