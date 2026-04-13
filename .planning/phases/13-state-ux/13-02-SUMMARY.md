# Phase 13 Plan 02 — UX-03: Recurring Task 🔄 Icon + Completion Toast Next-Due

## Status: DONE

## What was built
- `mobileUiStore.ts`: added `nextDueLabel?: string` to `MobileCompletionToast`
- `useTaskActions.ts`: computes `nextDueLabel` from `nextDueDate(repeatRule, dueAt)` and passes to `onTaskCompleting` callback
- `App.tsx`: `mobileToggleComplete` computes `nextDueLabel` for recurring tasks and passes to `showCompletionToast`
- `WorkspaceShell.tsx`: mobile toast label now includes ` · 下次：{nextDueLabel}` when available
- `ListView.tsx`: `🔄` icon in `.task-meta` for tasks where `repeatRule !== '不重复'`
- `KanbanView.tsx`: `🔄` icon in kanban title row
- `MatrixView.tsx`: `🔄` prefix in matrix card title

## Files changed
- `web/src/stores/mobileUiStore.ts`
- `web/src/hooks/useTaskActions.ts`
- `web/src/App.tsx`
- `web/src/components/WorkspaceShell.tsx`
- `web/src/components/views/ListView.tsx`
- `web/src/components/views/KanbanView.tsx`
- `web/src/components/views/MatrixView.tsx`
