---
phase: 10
plan: 05
status: done
---

# Summary — DATE-05: InlineCreatePopover dual-date fields

## Changes

### `web/src/types/workspace.ts`
- Added `deadlineDateKey: string` and `deadlineTime: string` to `InlineCreateDraft`

### `web/src/components/WorkspaceShell.tsx`
- `openInlineCreate`: initializes `deadlineDateKey: ''` and `deadlineTime: ''`
- `submitInlineCreate`: maps `deadlineDateKey + deadlineTime → explicitDeadlineAt`, passes to `commitTask`

### `web/src/components/InlineCreatePopover.tsx`
- Renamed "日期" field label to "计划完成"
- Added `deadlineExpanded` local state
- Collapsed: shows "+ 添加截止日期" dashed button
- Expanded: shows deadline section with date + time inputs and ✕ dismiss button

### `web/src/components/InlineCreatePopover.module.css`
- Added `.addDeadlineBtn`: dashed border button, turns red on hover
- Added `.deadlineSection`: red-tinted panel
- Added `.deadlineSectionHeader`: flex row with label and remove button
- Added `.removeDeadlineBtn`: small muted ✕
- Added `.deadlineFields`: 2-column grid for date + time
