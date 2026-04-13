# Phase 15 — Research

## PERF-01: React.memo Analysis

### KanbanDraggableCard
- Location: `KanbanView.tsx` lines 132–220
- Props: task, lists, tags, selectedTaskId, onSelectTask, onChangeStatus, onChangePriority
- Re-render triggers: any parent re-render (no memo)
- Custom comparator needed: compare task.id + task.updatedAt + selectedTaskId (not lists/tags array identity)

### KanbanDroppableColumn  
- Location: `KanbanView.tsx` lines 17–130
- Props: status, children, onOpenInlineCreate, isEmpty, count, wipLimit, onChangeWipLimit
- Custom comparator: compare all primitive props + children reference (default memo is fine)

### Approach
- Wrap `KanbanDraggableCard` with `React.memo` + custom comparator that checks `task.id`, `task.updatedAt`, `task.completed`, `task.status`, `task.priority`, `task.title`, `selectedTaskId`
- Wrap `KanbanDroppableColumn` with `React.memo` (default shallow)
- Keep `lists` and `tags` out of deep comparison (pass through stable `useCallback` handlers)

## PERF-02: React.lazy Code Splitting

### Current imports in WorkspaceViewContent.tsx
All 11 components are eagerly imported:
- Desktop views: ListView, CalendarView, KanbanView, TimelineView, MatrixView, StatsView
- Mobile views: MobileFocusView, MobileCalendarView, MobileMatrixView, MobileProjectsView, MobileMeView

### Approach
- Convert all imports to `React.lazy(() => import(...))`
- Each must be wrapped in `Suspense` with a simple loading fallback
- Named exports need wrapping: `lazy(() => import('./views/ListView').then(m => ({ default: m.ListView })))`
- ViewErrorBoundary already wraps each view — add Suspense inside ErrorBoundary

### TypeScript note
- `React.lazy` requires default export — use `.then(m => ({ default: m.X }))` pattern

## PERF-03: IndexedDB Offline Queue

### Current storage: localStorage
- `QUEUE_KEY = 'taskflow-offline-queue'`  
- Single entry; no retry count; no exponential backoff

### Target: IndexedDB via native API
- DB name: `taskflow-offline-db`
- Object store: `queue`
- Key: userId
- Value: `QueueEntry` with added `retryCount`, `nextRetryAt`

### Exponential backoff
- Base: 2s, multiplier: 2, max: 5 min
- On flush fail: increment retryCount, compute nextRetryAt
- On flush success: delete entry

### idb library decision
- No `idb` in package.json; would need `npm install idb`
- Alternative: Use native IndexedDB API (verbose but no dependency)
- Decision: **Install idb** (small, well-maintained, TypeScript-native)

## SYNC-01: Field-level Merge Engine

### Current behavior
- `onRemoteUpdate` in App.tsx: whole-task replacement based on `updatedAt`
- No per-field tracking

### Field-level merge algorithm
```
For each task in remote:
  Find corresponding local task by id
  If no local: add remote (new task)
  If no remote: keep local (deleted remotely = not our concern here)
  If both exist:
    For each mutable field (title, note, status, priority, dueAt, startAt, deadlineAt, tagIds, ...):
      Compare field_versions[field] timestamps
      If only one side changed: take that side's value
      If both changed (timestamps differ): CONFLICT → collect for UI
      If neither changed: keep current
    Merge non-conflicting fields
    If conflicts: emit conflict event for UI
```

### field_versions structure
```typescript
fieldVersions?: Record<string, string> // field name → ISO timestamp of last change
```

### New file: `web/src/utils/field-merge.ts`

## SYNC-02: Conflict Resolution UI

### Component: `ConflictResolutionDialog`
- Shows when merge produces conflicts
- Side-by-side: local value vs remote value per field
- User clicks to choose each field's winner
- On confirm: apply choices + update fieldVersions
- Modal dialog using existing CSS patterns

## SYNC-03: Supabase Schema — field_versions

### What needs to change
1. `packages/taskflow-core/src/domain.ts`: Add `fieldVersions?: Record<string, string>` to Task
2. Migration SQL: Add note — the current architecture stores tasks inside `workspace_states.state_json` (JSONB), so no DDL change needed for field_versions (it's embedded in the JSON)
3. Document: If/when a dedicated `tasks` table is created, it should include a `field_versions JSONB` column

### Migration file
- Create `web/supabase/migrations/002_field_versions.sql`
- Contents: Documentation + optional helper for when tasks table exists

## Build Verification Plan
1. `cd web && npm install` (for idb)
2. `npx vite build` — must pass with no TypeScript errors
3. Check bundle chunks to confirm code splitting
