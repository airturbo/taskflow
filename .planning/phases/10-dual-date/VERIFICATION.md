---
phase: 10
status: verified
date: 2026-04-13
---

# Phase 10 Verification — 双日期体验强化

## Build
`cd web && npx vite build` — ✅ 0 errors, 0 TS errors, 251 modules transformed

## DATE-01 ✅
- `formatDueAtBadge` added to selectors
- `formatTaskDeadlineBadge` no longer prefixes "DDL "
- `TaskTimeSummary` renders blue `time-badge--due` (📅) + red `time-badge--deadline` (⚡) side by side
- CSS classes `.time-badge--due` and `.time-badge--deadline` added to shared-components.css
- Downstream: `TaskDeadlineIndicators` compact still shows 'DDL'; non-compact now shows `⚡ {badge}`

## DATE-02 ✅
- All 5 VirtualFocusList section headers now carry a `subtitle` field
- Subtitles rendered in a stacked title group below section title
- Section "今天到期" renamed to "今天截止" (aligns with deadlineAt semantics)
- CSS module updated with title/subtitle layout classes

## DATE-03 ✅
- `TaskDetailPanel` shows red banner when `isTaskPlannedAfterDeadline(task)`
- "一键修正" button calls `onUpdateTask(task.id, { dueAt: task.deadlineAt })`
- Banner uses red-tinted background with border

## DATE-04 ✅
- Calendar month cells compute `dueCount` (blue) and `deadlineCount` (red) per day
- Dual-dot indicators appear in cell header alongside day number and lunar date
- Only shown for active (not deleted, not completed) tasks

## DATE-05 ✅
- `InlineCreateDraft` type extended with `deadlineDateKey` + `deadlineTime`
- "日期" renamed to "计划完成" in popover
- Expandable deadline section: collapsed = dashed "+ 添加截止日期"; expanded = date+time inputs with dismiss
- Submit logic maps deadline fields to `deadlineAt` on task creation
