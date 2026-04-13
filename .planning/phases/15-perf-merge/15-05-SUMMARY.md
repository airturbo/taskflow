---
task: "15-05"
title: "SYNC-02: Conflict resolution UI"
status: "completed"
---

## What was done

Created `web/src/components/ConflictResolutionDialog.tsx` + `ConflictResolutionDialog.module.css`:

- Modal dialog, z-index 9000, backdrop overlay
- Groups conflicts by task (shows task title as section header)
- Each conflict shows field name (localised), local value + timestamp, remote value + timestamp
- Toggle buttons to choose 'local' or 'remote' per field (default: local)
- "忽略（保留本地）" = dismiss, keep all local; "确认应用" = apply chosen resolutions
- Calls `applyConflictResolutions` from field-merge engine on confirm

Wired into `App.tsx`:
- `pendingConflicts: FieldConflict[]` state
- `pendingRemoteTasksRef` to hold remote tasks for resolution
- `handleConflictResolve` / `handleConflictDismiss` callbacks
- Dialog rendered conditionally after `WorkspaceShell` inside a Fragment

## Files changed

- `web/src/components/ConflictResolutionDialog.tsx` (new)
- `web/src/components/ConflictResolutionDialog.module.css` (new)
- `web/src/App.tsx` (state + render wiring)

## Result

Users see a clear per-field conflict resolution UI when concurrent edits are detected. No data is silently discarded.
