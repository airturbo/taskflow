---
phase: 10
plan: 04
status: done
---

# Summary — DATE-04: Calendar month dual-day dot indicators

## Changes

### `web/src/components/views/CalendarView.tsx`
- In month mode, compute per-day `dueCount` and `deadlineCount` (active, non-deleted tasks)
- Added `<span className={styles.calDualDots}>` in cell header when either count > 0:
  - Blue dot (`calDueDot`) with `var(--accent)` when dueCount > 0
  - Red dot (`calDeadlineDot`) with `var(--red)` when deadlineCount > 0

### `web/src/components/views/CalendarView.module.css`
- Added `.calDualDots`: inline-flex row with gap, margin-left: auto
- Added `.calDueDot`: 5px blue circle
- Added `.calDeadlineDot`: 5px red circle
