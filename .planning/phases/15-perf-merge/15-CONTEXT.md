# Phase 15 — Context

## Phase Info
- **Name**: 性能 + Field-level Merge
- **Goal**: 渲染性能优化 + 代码拆分 + 离线队列 IndexedDB + 冲突解决 UI
- **Depends on**: Phase 13 (complete)

## Current Architecture Understanding

### Rendering
- `KanbanView.tsx` — 298 lines, has `KanbanDraggableCard` component (no memo)
- `KanbanDroppableColumn` — also no memo
- `ListView.tsx` — 146 lines, small
- All views imported eagerly in `WorkspaceViewContent.tsx`
- No `React.memo` or `React.lazy` anywhere found

### Offline Queue (current — `offline-queue.ts`)
- Uses `localStorage` as backing store
- Single entry per user (merges by taskId/updatedAt)
- MAX_QUEUE_SIZE=500, MAX_AGE_MS=7 days
- No retry logic in flush (just returns false on failure)
- No exponential backoff on retry

### Sync Architecture
- `useRealtimeSync.ts` — Supabase Realtime subscription + 90s polling
- Conflict resolution: last-write-wins by `updatedAt` timestamp
- No field-level merge; whole-task replacement
- No `field_versions` JSONB column in schema

### Supabase Schema
- `workspace_states` table: stores whole-state JSON
- Migration file: `web/supabase/migrations/001_init.sql`
- No `tasks` table (uses embedded JSON in workspace_states)
  → SYNC-03 will add `field_versions` to the domain Task type + migration notes

### Libraries Available
- No `idb` or `idb-keyval` in package.json
- Will need to use native `indexedDB` API or install `idb`

## Requirements Mapping

| REQ | Scope | Files Touched |
|-----|-------|--------------|
| PERF-01 | React.memo + comparator on KanbanDraggableCard, KanbanDroppableColumn | KanbanView.tsx |
| PERF-02 | React.lazy for all view components in WorkspaceViewContent.tsx | WorkspaceViewContent.tsx |
| PERF-03 | Replace localStorage queue with IndexedDB + exponential backoff retry | offline-queue.ts, App.tsx |
| SYNC-01 | Field-level merge engine | new file: utils/field-merge.ts, storage.ts or App.tsx |
| SYNC-02 | Conflict resolution UI | new file: components/ConflictResolutionDialog.tsx |
| SYNC-03 | field_versions JSONB column + migration SQL | supabase/migrations/002_field_versions.sql, types/domain.ts |

## Key Decisions
1. **idb library**: Install `idb` (clean wrapper around IndexedDB, 1.3KB gzipped)
2. **Field-level merge**: Compare fields individually; single-side mutations auto-merge; both-sides conflicts → UI
3. **field_versions**: Add to domain.ts Task type as optional `fieldVersions?: Record<string, string>` (timestamps per field)
4. **Supabase tasks table**: Since architecture uses `workspace_states` JSON blob, SYNC-03 adds `field_versions` to the Task type and documents migration for any future structured tasks table
5. **Lazy loading**: Use `React.lazy` + `Suspense` fallback in WorkspaceViewContent
