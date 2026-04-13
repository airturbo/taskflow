---
phase: 8
status: complete
verified: "2026-04-13"
build: passing
---

# Phase 8 — VERIFICATION

## Build Status
`cd web && npx vite build` ✅ passes (394ms)  
`npx tsc --noEmit` ✅ passes (no errors)

## Requirements Check

### ROUTE-01 — 引入客户端路由，每个视图独立 URL ✅

**Implementation:**
- `react-router-dom@^7.14.0` installed
- `HashRouter` wraps full app in `main.tsx` (compatible with Tauri + web)
- URL paths defined:
  - `/#/focus` → system:today
  - `/#/all` → system:all
  - `/#/upcoming` → system:upcoming
  - `/#/inbox` → system:inbox
  - `/#/logbook` → system:logbook
  - `/#/trash` → system:trash
  - `/#/list/:listId` → list selection
  - `/#/filter/:filterId` → saved filter
- `/` → redirects to `/focus` via `<Navigate replace />`

**Files:** `web/src/main.tsx`, `web/src/App.tsx`, `web/src/hooks/useRouterSync.ts`

---

### ROUTE-02 — 搜索词/过滤器/选中任务序列化到 URL params ✅

**Implementation:**
All relevant state serialized to URL query params:

| State | URL param | Default (omitted) |
|-------|-----------|-------------------|
| currentView | `?view=` | `list` (omitted) |
| searchKeyword | `?q=` | empty (omitted) |
| calendarMode | `?cal=` | `month` (omitted) |
| calendarAnchor | `?anchor=` | today (omitted) |
| timelineScale | `?scale=` | `week` (omitted) |
| selectedTagIds | `?tags=id1,id2` | empty (omitted) |
| selectedTaskId | `?task=` | null (omitted) |
| calendarShowCompleted | `?cal_done=1` | false (omitted) |

Example URL: `/#/list/abc-123?view=calendar&cal=week&anchor=2026-04-14&tags=tag1,tag2`

`syncToUrl()` called via `useEffect` on every state change → replaceState, no extra history entry.

**Files:** `web/src/hooks/useRouterSync.ts`, `web/src/App.tsx`

---

### ROUTE-03 — 浏览器刷新后恢复完全相同视图状态 ✅

**Implementation:**
Three-layer URL hydration on mount, before first render:

1. **`useNavigationState`** — calls `pathToSelection(window.location.hash path)` → initial `activeSelection`
2. **`useViewConfig`** — calls `parseQueryParams(hash query string)` → initial `currentView`, `calendarMode`, `calendarAnchor`, `timelineScale`, `calendarShowCompleted`
3. **`useFilterState`** — calls `parseQueryParams(hash query string)` → initial `selectedTagIds`, `searchInput`, `searchKeyword`
4. **`App.tsx`** — reads `?task=` → initial `selectedTaskId`

Priority: URL > localStorage → guarantees refresh restores identical state.

---

### ROUTE-04 — 浏览器 back/forward 正确导航 ✅

**Implementation:**
- `HashRouter` handles `popstate` events natively
- `useLocation()` in `useRouterSync` fires on every history change
- `useEffect([location.pathname, location.search])` → parses URL → calls all setters with correct values or defaults
- `syncingFromUrl` ref (50ms guard) prevents circular URL→state→URL loops
- Major navigation (sidebar selection change) → `navigate(path)` = pushState → creates history entry
- Minor state changes (view, search, filter) → `navigate(path, { replace: true })` → no extra history entry

Back/forward flow:
```
navigate to /all?view=kanban  [push]
navigate to /list/abc         [push]
← back button                 [popstate]
  → location = /all?view=kanban
  → setActiveSelection("system:all")
  → setCurrentView("kanban")
  → UI restores ✅
← back button                 [popstate]
  → location = /focus
  → setActiveSelection("system:today")
  → setCurrentView("list")
  → UI restores ✅
```

---

## Files Modified
| File | Change |
|------|--------|
| `web/package.json` | Added `react-router-dom@^7.14.0` |
| `web/src/main.tsx` | Added `<HashRouter>` wrapper |
| `web/src/App.tsx` | Routes, useRouterSync integration, URL task hydration |
| `web/src/hooks/useRouterSync.ts` | NEW — URL↔state bridge (250 lines) |
| `web/src/hooks/useNavigationState.ts` | URL-priority initial selection |
| `web/src/hooks/useViewConfig.ts` | URL-priority initial view config |
| `web/src/hooks/useFilterState.ts` | URL-priority initial filter state |

## Commits
- `7b01fdd` — install router, HashRouter, useRouterSync
- `be21b1b` — App integration, useNavigationState URL priority, Routes
- `c54987a` — useViewConfig + useFilterState URL hydration, task URL hydration
- `e6f6885` — fix URL→state defaults for back/forward
