---
phase: 8
plan: 4
status: complete
committed: "e6f6885"
---

# 08-04 Summary

## What was done

1. **useRouterSync URL→state effect improved**:
   - All state now gets explicit defaults when URL param is absent
   - This ensures back/forward correctly resets state (e.g., going back to a URL without `?view=` resets view to `list`)
   - `calendarAnchor` still only updated when explicitly in URL (date anchor is contextual)

2. **Back/forward mechanism (ROUTE-04)**:
   - React Router `HashRouter` handles `popstate` automatically
   - `useLocation` hook fires on every history navigation
   - `useEffect([location.pathname, location.search])` triggers full state restore
   - `syncingFromUrl` ref guard (50ms window) prevents circular URL→state→URL loops

3. **/ redirect** (already in 08-02):
   - `<Route path="/" element={<Navigate to="/focus" replace />} />` handles empty hash

## Back/forward flow
```
User clicks sidebar item
  → setActiveSelection("list:abc")
  → prevActiveSelectionRef detects change
  → navigateTo("list:abc")
  → navigate("/list/abc?view=...") [pushState]
  → new history entry created

User clicks browser back
  → popstate fires
  → useLocation updates: pathname="/focus", search="?view=list"
  → useEffect fires: setActiveSelection("system:today"), setCurrentView("list"), ...
  → UI restores to previous view ✅
```

## Build
- TypeScript passes ✅
- vite build passes ✅
