---
phase: 8
plan: 1
status: complete
committed: "7b01fdd"
---

# 08-01 Summary

## What was done
1. Installed `react-router-dom@^7.14.0` (with --legacy-peer-deps for vite-plugin-pwa peer conflict)
2. Wrapped app tree in `<HashRouter>` in main.tsx
3. Created `web/src/hooks/useRouterSync.ts` with:
   - `pathToSelection(pathname)` — URL path → activeSelection string
   - `selectionToPath(activeSelection)` — activeSelection → URL path
   - `parseQueryParams(search)` — URLSearchParams → ParsedQueryState
   - `buildQueryString(params)` — state → query string
   - `useRouterSync(setters, currentState)` — main hook: URL→state + state→URL

## Design decisions
- HashRouter chosen over BrowserRouter for Tauri (file://) + web compatibility
- /focus, /all, /upcoming, /inbox, /logbook, /trash as top-level paths
- /list/:listId, /filter/:filterId for dynamic selections
- Query params: view, q, cal, anchor, scale, tags, task, cal_done
- replaceState for minor changes, pushState for major navigation

## Build
- `vite build` passes ✅
- TypeScript `tsc --noEmit` passes ✅
