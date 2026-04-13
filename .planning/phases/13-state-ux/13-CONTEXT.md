# Phase 13 Context

## Objective
State management consolidation + UX polish:
- UX-02: Desktop completion animation ceremony (✓ bounce + strikethrough + slide-out + Undo Toast)
- UX-03: Recurring task card 🔄 icon + completion Toast with next-due date
- UX-04: Zustand consolidate all UI state (replace useState dual-rail)
- UX-05: InlineCreatePopover use @floating-ui/react instead of manual positioning

## Current State

### Zustand (mobileUiStore.ts)
- Already manages: mobileTab, mobileFocusScope, mobileCalendarMode, taskSheet, quickCreate, completionToast
- Desktop modal state still lives in `useModalState` hook (useState-based, scoped to WorkspaceApp)
- `useQuickCreate` hook: inline create draft + feedback state (useState)
- `useFilterState` hook: search + tag filter state (useState, has URL sync logic)
- `useTaskSelection` hook: selectedTaskId, bulk mode (useState)

### Completion Flow
- Mobile: `mobileToggleComplete` → shows `mobileCompletionToast` (3s) with Undo + Snooze
- Desktop: `toggleTaskComplete` directly → NO animation ceremony
- `statusChangeFeedback` exists for kanban status changes (shown as toast on desktop with Undo)
- No desktop completion animation exists yet

### Recurring Tasks
- `repeatRule` field on Task (daily/weekly/monthly/etc.)
- On completion: `createNextRepeatTask` called, spawns a new task
- `describeRepeatRule` → human-readable label
- `nextDueDate` utility: calculates next occurrence from current due date
- ListView/MatrixView/etc: NO 🔄 icon shown currently

### InlineCreatePopover
- 274 lines, manual drag/position logic with clamping
- `clampInlineCreatePosition`, `getTopDockedInlineCreatePosition` from workspace-helpers
- Uses `positionRef` + `setPosition` pattern
- @floating-ui/react NOT installed

### Animation Patterns (existing)
- mobile-layout.css: drawer slide-in, sheet slide-up, toast slide-up/fade-out
- No CSS for desktop task completion animations (bounce, strikethrough, slide-out)

### Key Components
- WorkspaceShell.tsx: renders statusChangeFeedback toast (desktop), mobileCompletionToast (mobile)
- ListView.tsx: check-button with is-checked class
- shared-components.css: .check-button, .task-card styles

## Dependencies
- Phase 6: App.tsx split into hooks ✓
- Phase 7: CSS Modules ✓
- Phase 12: Unified DnD ✓

## Plan Summary (4 tasks)
1. UX-02: Desktop completion animation + Undo Toast
2. UX-03: Recurring task 🔄 icon + next-due info in Toast
3. UX-04: Zustand desktopUiStore (replace useModalState + partial useQuickCreate)
4. UX-05: @floating-ui/react InlineCreatePopover positioning
