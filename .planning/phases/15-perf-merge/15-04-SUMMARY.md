---
task: "15-04"
title: "SYNC-01: Field-level merge engine"
status: "completed"
---

## What was done

Created `web/src/utils/field-merge.ts` — the field-level merge engine:

- `MERGEABLE_FIELDS`: 16 scalar Task fields (excludes array/object fields which fall back to whole-task updatedAt)
- `stampFieldVersions(task, patch)`: stamps `fieldVersions[field] = now` for each mutated field
- `mergeTask(local, remote)`: per-field comparison using `fieldVersions` timestamps; single-writer auto-resolves, both-writers produces `FieldConflict`
- `mergeTaskList(localTasks, remoteTasks)`: merges arrays; remote-only = added, local-only = kept, common = field-level merge
- `applyConflictResolutions(tasks, conflicts, resolutions, remoteTasks)`: applies user choices after UI interaction

Integrated into `normalizeTaskPatch` in `packages/taskflow-core/src/selectors.ts` — every task mutation automatically stamps `fieldVersions` without any call-site changes needed.

Replaced `handleRemoteUpdate` in `App.tsx` with `mergeTaskList` call; conflicts collected into `pendingConflicts` state.

## Files changed

- `web/src/utils/field-merge.ts` (new)
- `packages/taskflow-core/src/selectors.ts` (stampFieldVersions in normalizeTaskPatch)
- `web/src/App.tsx` (handleRemoteUpdate integration)

## Result

Local task mutations automatically stamp per-field timestamps. Remote merges auto-resolve single-writer changes and surface only genuine concurrent-edit conflicts to the UI.
