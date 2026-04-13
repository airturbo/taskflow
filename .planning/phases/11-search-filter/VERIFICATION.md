---
phase: 11
title: "Phase 11 — 搜索过滤统一 + NLP"
verified: true
build: passing
---

# Verification

## Build
```
✓ built in 445ms
251 modules transformed
dist/assets/index-*.js  ~924 kB (gzip ~276 kB)
```
No TypeScript errors. Two warnings (vite-plugin-pwa bundle assignment — pre-existing, unrelated to Phase 11).

## FILTER-01: Unified FilterState

- `useFilterState` returns `FilterStateExtended` with `filterPriority`, `filterStatus`, `filterDue`
- `useWorkspaceComputed` applies `applyExtraFilters()` in `visibleTasks`, `calendarTasks`, `countsBySelection`, `doesTaskMatchWorkspace`
- Filters chain correctly: priority → status → due date bucket

## FILTER-02: URL Serialization

- `parseQueryParams` parses `priority=`, `status=`, `due=` params with validation against known values
- `buildQueryString` serializes non-empty values only (omitted when no filter active)
- `RouterSyncState` and `RouterSyncSetters` interfaces extended
- App.tsx wires all three fields through `useRouterSync` setters + currentState + `syncToUrl` effect

## FILTER-03: NLP Command Palette

- `parseCommandQuery()` handles `#tag`, `!priority`, `status:`, `due:`, `@list`, keyword tokens
- Chip row renders below input with color-coded chips per token type
- "应用筛选" button + `Cmd+Enter` shortcut apply parsed filters to workspace FilterState
- `onApplyFilter` prop sets `selectedTagIds`, `filterPriority`, `filterStatus`, `filterDue`, `searchInput` in App.tsx
