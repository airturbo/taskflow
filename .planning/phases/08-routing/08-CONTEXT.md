---
phase: 8
name: 路由系统
status: in-progress
started: "2026-04-13"
---

# Phase 8 — 路由系统 CONTEXT

## Goals
- ROUTE-01: 每个视图独立 URL (客户端路由)
- ROUTE-02: 搜索词/过滤器/选中任务序列化到 URL params
- ROUTE-03: 浏览器刷新后恢复完全相同视图状态
- ROUTE-04: 浏览器 back/forward 正确导航

## Infrastructure Decisions

### Router Library
**Selected: React Router v7 (Data Mode / declarative)**
- 已是 React 生态标准，稳定
- v7 提供良好的 TypeScript 支持
- TanStack Router 虽然类型安全更强，但对现有代码侵入更大
- 项目已有 React 19，React Router v7 完全兼容

### URL Structure
```
/                     → redirect to /focus
/focus                → system:today
/all                  → system:all
/upcoming             → system:upcoming
/list/:listId         → list selection
/tag/:tagId           → tag selection (multiple tags: /tag/id1,id2)
/filter/:filterId     → saved filter
/inbox                → system:inbox
/logbook              → system:logbook
/trash                → system:trash
```

Query params (appended to any route):
```
?view=list|calendar|kanban|timeline|matrix
?search=keyword
?cal=month|week|agenda
?cal_anchor=YYYY-MM-DD
?tl_scale=day|week
?tags=id1,id2          (additional tag filter overlay)
?task=taskId           (selected task)
```

### State Sync Strategy
- URL is source of truth for navigation/view state
- useNavigationState + useViewConfig read from URL params
- State changes update URL via navigate() (replace for minor changes, push for major nav)
- `useRouterSync` hook bridges URL ↔ React state

### Persistence
- Existing `saveState` localStorage remains for task data
- Navigation state (activeSelection, currentView, etc.) NOW comes from URL first, localStorage as fallback
- On refresh: URL params → state reconstruction → identical view

## Files Created/Modified
- `web/src/hooks/useRouterSync.ts` — URL ↔ state bridge
- `web/src/App.tsx` — add BrowserRouter wrapper  
- `web/src/hooks/useNavigationState.ts` — read URL params
- `web/src/hooks/useViewConfig.ts` — read URL params
- `web/src/hooks/useFilterState.ts` — read URL params
- `web/src/hooks/useWorkspaceEffects.ts` — sync state→URL

## Constraints
- Must not break existing task data flow
- Build must pass (vite build) after each commit
- No breaking changes to WorkspaceShell props signature
- Mobile view state (mobileTab) stays in Zustand (mobile-only)
