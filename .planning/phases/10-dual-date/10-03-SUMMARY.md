---
phase: 10
plan: 03
status: done
---

# Summary — DATE-03: Warning banner + one-click fix in TaskDetailPanel

## Changes

### `web/src/components/TaskDetailPanel.tsx`
- Replaced bare `<p>` warning with `<div className={styles.detailScheduleWarningBanner}>` containing:
  - Warning text (flex: 1)
  - "一键修正" button: calls `onUpdateTask(task.id, { dueAt: task.deadlineAt })`

### `web/src/components/TaskDetailPanel.module.css`
- Added `.detailScheduleWarningBanner`: flex row with red tinted background and border
- Updated `.detailScheduleWarning`: flex: 1
- Added `.detailScheduleFixBtn`: red solid button with hover opacity
