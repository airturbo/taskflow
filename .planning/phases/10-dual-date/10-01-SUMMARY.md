---
phase: 10
plan: 01
status: done
---

# Summary — DATE-01: Dual-date display in all views

## Changes

### `packages/taskflow-core/src/selectors.ts`
- Added `formatDueAtBadge(task)` — returns formatted `dueAt` string or null
- Changed `formatTaskDeadlineBadge` to remove "DDL " prefix (raw date only)

### `web/src/components/shared.tsx`
- Updated import to include `formatDueAtBadge`
- Rewrote `TaskTimeSummary` with two distinct badges:
  - `time-badge--due` (blue 📅) for `dueAt`
  - `time-badge--deadline` (red ⚡) for `deadlineAt`
  - Shows "计划晚于截止" warning when `isTaskPlannedAfterDeadline`
  - Falls back to `formatTaskDualTimeSummary` when neither date present
- Fixed `TaskDeadlineIndicators` non-compact mode to show `⚡ {badge}` instead of bare string

### `web/src/styles/shared-components.css`
- Added `.time-badge--due`: blue accent styling (`var(--accent)`)
- Added `.time-badge--deadline`: red styling (`var(--red)`)

## Coverage
`TaskTimeSummary` is used in ListView, KanbanView, MatrixView cards — all three views now show dual badges.
