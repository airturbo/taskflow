# Phase 8 — Research Findings

## Current Navigation Mechanism

### State Ownership
- `useNavigationState(initialState)` — owns `activeSelection` (string like `system:today`, `list:abc`, `filter:xyz`)
- `useFilterState(initialSelectedTagIds)` — owns `selectedTagIds`, `searchInput`, `searchKeyword`
- `useViewConfig(initialState)` — owns `currentView`, `calendarMode`, `calendarAnchor`, `timelineScale`, `calendarShowCompleted`

### activeSelection Format
```
system:today      → Focus/Today view
system:all        → All Tasks
system:upcoming   → Upcoming
system:inbox      → Inbox
system:logbook    → Logbook
system:trash      → Trash
list:<listId>     → Specific list
filter:<filterId> → Saved filter
```

### Tag Filtering
`selectedTagIds: string[]` — separate from activeSelection, can overlay any view with tag filters.

### View Types
`WorkspaceView = 'list' | 'calendar' | 'kanban' | 'timeline' | 'matrix'`

### State Persistence
`useWorkspaceEffects` → `saveState()` → localStorage.
On load: `loadState()` → `initialState` → passed to hooks.

## Vite Config Analysis
- `base: './'` — relative base path (Tauri compatibility)
- App runs in both **Tauri desktop** (file:// protocol) and **web browser**
- **BrowserRouter requires server-side URL rewriting** — incompatible with Tauri
- **HashRouter works universally** — `#/route` suffix, no server config needed
- Decision: **Use HashRouter**

## Router Library Decision: React Router v7 (react-router-dom)
Rationale:
- Industry standard, battle-tested
- No extra dependencies needed beyond react-router-dom
- v7 has clean hooks: `useNavigate`, `useParams`, `useSearchParams`, `useLocation`
- TanStack Router would require full type-route definition — too invasive for this codebase

## URL Structure (HashRouter)
```
/#/                        → redirect → /#/focus
/#/focus                   → system:today
/#/all                     → system:all
/#/upcoming                → system:upcoming
/#/inbox                   → system:inbox
/#/logbook                 → system:logbook
/#/trash                   → system:trash
/#/list/:listId             → list:<listId>
/#/filter/:filterId         → filter:<filterId>
```

### Query Parameters
```
?view=list|calendar|kanban|timeline|matrix   (currentView)
?q=keyword                                    (searchKeyword)
?cal=month|week|agenda                        (calendarMode)
?anchor=YYYY-MM-DD                            (calendarAnchor)
?scale=day|week                               (timelineScale)
?tags=id1,id2                                 (selectedTagIds overlay)
?task=taskId                                  (selectedTaskId)
?cal_done=1                                   (calendarShowCompleted)
```

## Integration Strategy

### useRouterSync hook (new)
- Reads URL on mount → sets state
- Watches state changes → updates URL (replaceState for minor changes, pushState for major nav)
- "Major nav" = activeSelection change → pushState (creates history entry)
- "Minor change" = view/search/filter change → replaceState (no history entry)

### Back/Forward (ROUTE-04)
- React Router's HashRouter handles popstate automatically
- On location change → parse URL → update state via setters passed from App

### App.tsx changes
- Wrap with `<HashRouter>` in main.tsx
- WorkspaceApp gets `useRouterSync` to bridge URL ↔ state

## Key Files to Modify
1. `web/src/main.tsx` — add HashRouter wrapper
2. `web/src/App.tsx` — route-aware WorkspaceApp, add useRouterSync
3. `web/src/hooks/useNavigationState.ts` — optionally accepts initial URL-parsed state
4. `web/src/hooks/useRouterSync.ts` — NEW: URL ↔ state bridge
5. `web/src/hooks/useViewConfig.ts` — optionally accepts initial URL-parsed state
6. `web/src/hooks/useFilterState.ts` — optionally accepts initial URL-parsed state

## Implementation Approach
Rather than rebuilding navigation around router, use a **thin bridge layer**:
1. `useRouterSync` hook: subscribes to React Router location, parses URL → calls setters
2. State changes → useEffect in useRouterSync → update URL

This minimizes changes to existing hooks and WorkspaceShell.

## Risks
- `base: './'` + HashRouter: compatible ✅
- Tauri file:// protocol + HashRouter: compatible ✅
- Supabase auth redirects use `window.location.origin` → still works ✅
- PWA `start_url: '/'` → need to set to `/#/focus` or handle redirect

## package.json — react-router-dom version
Will install `react-router-dom@^7.0.0`
