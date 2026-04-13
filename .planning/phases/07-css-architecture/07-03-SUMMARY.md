---
phase: 07
plan: 03
title: "View CSS Modules extraction"
status: completed
completed: "2026-04-13"
commits:
  - C1: feat(07-03/C1): extract CalendarView + Agenda CSS into CalendarView.module.css
  - C2: feat(07-03/C2): extract KanbanView CSS into KanbanView.module.css
  - C3: feat(07-03/C3): extract TimelineView CSS into TimelineView.module.css
  - C4: feat(07-03/C4): extract MatrixView CSS into MatrixView.module.css
  - C5: feat(07-03/C5): extract StatsView CSS into StatsView.module.css
  - C6: no-op (ListView has only shared global classes)
---

# Plan 03 Summary — View CSS Modules Extraction

## What Was Done

Extracted view-specific CSS from `index.css` into 5 individual `.module.css` files under `src/components/views/`. Each module is co-located with its TSX component and covers all breakpoint rules and `.is-phone` overrides.

## Commits

### C1 — CalendarView.module.css
- Extracted calendar grid, column, day, event, agenda, resize handle CSS (~414 lines)
- Moved all `@media` and `.is-phone` calendar/agenda rules
- Dynamic class `calendar-event--priority-${p}` kept as plain string; `:global()` wrappers for state classes (`.is-today`, `.is-drag-over`, `.is-resizing`, etc.)
- `CalendarView.tsx` updated with `import styles from './CalendarView.module.css'`

### C2 — KanbanView.module.css
- Extracted kanban grid, column, card, header, footer, drag-over CSS
- Dynamic `kanban-card--priority-${p}` variant retained as plain string; `:global()` for `.is-dragging`, `.is-drag-over`, `.is-selected`, `.status-done`
- Responsive @680px mobile single-column layout + `.is-phone` overrides
- `KanbanView.tsx` updated

### C3 — TimelineView.module.css
- Extracted timeline header, track, event bar, drag ghost, resize handle CSS
- `:global()` for `.is-resizing`, `.is-drag-over`, `.is-dragging`
- `.is-phone` mobile layout moved to `:global(.is-phone)` wrapper
- `TimelineView.tsx` updated

### C4 — MatrixView.module.css
- Extracted matrix grid, quadrant, stack, card, placeholder, create card CSS
- `:global()` for `.is-selected`, `.is-dragging`, `.is-drag-over`, `.status-done`
- @1280px and @680px responsive rules co-located
- `MatrixView.tsx` updated

### C5 — StatsView.module.css
- Extracted projection-summary, projection-recovery, stats-grid, stats-card, chart-card, trend bars, progress-bar, 30-day trend chart, heatmap CSS
- Dynamic `projection-recovery--${mode}` retained as plain string; `:global(.projection-recovery--unscheduled/outside)` in module CSS
- `is-active` on `projectionMetric` buttons kept as plain string with `:global(.is-active)` in module
- `panel-header` kept global (used in 5+ non-StatsView components)
- Heatmap legend block added (was missing in index.css draft)
- `StatsView.tsx` updated

### C6 — ListView (no-op)
- ListView uses only shared global classes: `task-list`, `task-card`, `check-button`, `task-main`, `task-headline`, `task-meta`, `priority-pill`, `task-actions`, `chip-wrap dense`, `mini-tag`, `task-tags-more`
- All shared across 8+ components — cannot scope to ListView module
- No view-specific CSS to extract; no file created

## index.css Changes

Tombstone comments left at each removed block:
- `/* ---- projection-summary, projection-recovery → StatsView.module.css ---- */`
- `/* .tool-layout → StatsView.module.css */`
- `/* .progress-bar → StatsView.module.css */`
- `/* ---- Stats → StatsView.module.css ---- */`
- `/* ---- StatsView Heatmap → StatsView.module.css ---- */`
- Similar tombstones for calendar, agenda, kanban, timeline, matrix sections
- Multi-selector rules split where one selector was extracted (e.g. `@680px stats-grid` removed from combined rule)

## Key Decisions

- **Shared globals stay global**: `panel-header`, `task-card`, `task-main` etc. remain in `index.css` / `globals.css`
- **Dynamic class strings**: priority/status variants that are string-interpolated in JSX cannot be CSS Module keys — kept as plain strings, targeted via `:global()` in module CSS
- **No ListView module**: ListView is a pure consumer of shared task-card styles; creating an empty module would add noise

## Result

| File | Status |
|------|--------|
| CalendarView.module.css | Created (288 lines) |
| KanbanView.module.css | Created (~150 lines) |
| TimelineView.module.css | Created (~180 lines) |
| MatrixView.module.css | Created (199 lines) |
| StatsView.module.css | Created (268 lines) |
| ListView.module.css | Not created (no-op) |

Build verified passing (`npx vite build`) after each commit.
