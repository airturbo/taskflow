---
task: "15-06"
title: "SYNC-03: fieldVersions JSONB column"
status: "completed"
---

## What was done

Added `fieldVersions?: Record<string, string>` to the `Task` interface in `packages/taskflow-core/src/domain.ts`.

Created `web/supabase/migrations/002_field_versions.sql` — documentation-only migration explaining:
- `fieldVersions` is stored inside `workspace_states.state_json` (no DDL needed for current architecture)
- Semantics: maps `fieldName → ISO 8601 timestamp` of last write
- Future-ready: includes commented-out `ALTER TABLE tasks ADD COLUMN field_versions JSONB` for when a dedicated tasks table is created

## Files changed

- `packages/taskflow-core/src/domain.ts` (fieldVersions field)
- `web/supabase/migrations/002_field_versions.sql` (new, documentation)

## Result

fieldVersions is fully typed, optional (backward-compatible), and stored automatically in the existing JSON blob with zero schema migration required.
