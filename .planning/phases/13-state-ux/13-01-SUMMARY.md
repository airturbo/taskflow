# Phase 13 Plan 01 — UX-02: Desktop Completion Animation Ceremony

## Status: DONE

## What was built
- CSS keyframes `check-bounce` (0.5s) and `task-slide-out` (0.85s delay, 0.4s)
- `.check-button.is-completing` triggers bounce animation
- `.task-card.is-completing .task-headline h3` gets strikethrough + tertiary color
- `.task-card.is-completing` triggers slide-out after bounce completes
- `desktopUiStore`: `completingTaskIds: Set<string>` with `addCompletingTask` (auto-clears after 1500ms via `window.setTimeout`)
- `desktopUiStore`: `completionFeedback` + `showCompletionFeedback` / `hideCompletionFeedback`
- `useTaskActions`: `onTaskCompleting` optional callback fires on desktop only
- `App.tsx`: wires callback → `addCompletingTask` + `showCompletionFeedback`, auto-hides toast after 4s
- `WorkspaceShell`: renders desktop Undo Toast with title + next-due label
- `WorkspaceViewContent` + `ListView`: `completingTaskIds` prop flows through and applies `.is-completing` class

## Files changed
- `web/src/styles/shared-components.css`
- `web/src/stores/desktopUiStore.ts` (NEW)
- `web/src/hooks/useTaskActions.ts`
- `web/src/App.tsx`
- `web/src/components/WorkspaceShell.tsx`
- `web/src/components/WorkspaceViewContent.tsx`
- `web/src/components/views/ListView.tsx`
