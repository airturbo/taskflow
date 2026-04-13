# Phase 13 Research

## UX-02: Desktop Completion Animation

### Current state
- Desktop: `toggleTaskComplete` called directly, task disappears on re-render (no animation)
- Mobile: has `mobileCompletionToast` (slide-up toast with Undo + Snooze)
- `.task-card` has `transition: background, box-shadow, transform`
- `.check-button` → `.check-button.is-checked` has color transition
- `.actionToast` CSS already exists in WorkspaceShell.module.css for kanban status changes

### Plan
Add three CSS classes to shared-components.css:
1. `.check-button.is-completing` — bounce animation on the check circle
2. `.task-card.is-completing h3` — strikethrough text-decoration transition
3. `.task-card.is-completing` — opacity + translateX slide-out (delayed ~800ms)

Trigger:
- New `completingTaskIds: Set<string>` state in a new `desktopUiStore`
- In `toggleTaskComplete`, when completing (not uncompleting), add taskId to set
- After 1s delay, remove from set (task will be filtered out by workspace selector anyway)
- Show desktop Undo Toast (extend existing `statusChangeFeedback` pattern)

Desktop Undo Toast approach:
- `toggleTaskComplete` on desktop calls `applyStatusChangeFeedback`-style: show actionToast
- Add `completionFeedback` to desktopUiStore (separate from statusChangeFeedback)
- Timer auto-clears after 4s

### Animation keyframes needed
```css
@keyframes check-bounce {
  0% { transform: scale(1); }
  40% { transform: scale(1.35); }
  70% { transform: scale(0.88); }
  100% { transform: scale(1); }
}
@keyframes task-slide-out {
  0% { opacity: 1; transform: translateX(0) scaleY(1); max-height: 60px; }
  100% { opacity: 0; transform: translateX(-24px) scaleY(0); max-height: 0; overflow: hidden; }
}
```

## UX-03: Recurring Task 🔄 Icon + Toast

### Current state  
- Task has `repeatRule` field (string)
- `describeRepeatRule(rule)` → human-readable
- `nextDueDate(rule, fromDate)` → next ISO date
- ListView shows no 🔄 icon
- Mobile completion toast shows "已完成《title》" only
- Desktop statusChangeFeedback toast shows nothing repeat-specific

### Plan
1. ListView.tsx: add `{task.repeatRule && <span title={describeRepeatRule(task.repeatRule)}>🔄</span>}` in `.task-meta`
2. KanbanView/MatrixView/TimelineView: same pattern in task cards
3. Completion Toast enhancement:
   - `toggleTaskComplete` in useTaskActions: when completing a recurring task, compute `nextDueDateStr`
   - Pass this info to the feedback/toast: "已完成《title》，下次：MM-DD"
   - `MobileCompletionToast` type: add `nextDueLabel?: string`
   - Desktop completion toast: show nextDueLabel in actionToast

### Next-due calculation
```ts
const nextDueDateStr = nextDueDate(currentTask.repeatRule, currentTask.dueAt ?? getNowIso())
```
Format as 中文 short date: `formatDate(nextDueDateStr, 'MM-DD')`

## UX-04: Zustand desktopUiStore

### Current useState-based hooks to migrate
**useModalState** (9 states):
- `tagManagerOpen`, `shortcutPanelOpen`, `commandPaletteOpen`, `exportPanelOpen`
- `navigationDrawerOpen`, `utilityDrawerOpen`, `taskSheetOpen`
- `sidebarExpanded`, `projectionInsightMode`

**Partial useQuickCreate** (feedback state only):
- `createFeedback`, `statusChangeFeedback` → move to desktopUiStore

**App.tsx direct useState**:
- `mobileProjectListId`, `mobileMatrixViewMode`, `mobileFocusSortMode`
- `mobileMatrixModeMenuOpen`, `meShowProjects`

### Strategy
- Create `desktopUiStore.ts` for desktop modals
- Create `mobileExtraStore.ts` for the 5 mobile extra states not yet in mobileUiStore
- Keep `useModalState` as a thin wrapper that delegates to desktopUiStore (backward compat)
- Remove useState from App.tsx by calling stores directly

### Trade-off
Full removal of all useState would require updating WorkspaceShell props (massive change).
Better approach: Create store + keep backward compat adapter hooks. App.tsx uses stores directly,
hooks are deprecated but still used by WorkspaceShell unchanged.

Actually simpler: Since WorkspaceShell accepts all these as props, we just need to source them
from stores instead of useState in App.tsx/WorkspaceApp. WorkspaceShell props stay the same.

## UX-05: @floating-ui/react InlineCreatePopover

### Current state
- 274-line component with manual drag/positioning
- `clampInlineCreatePosition`, `getTopDockedInlineCreatePosition` from workspace-helpers
- Manual pointer event tracking with refs
- Two modes: 'floating' (x/y absolute) and 'top-docked'

### @floating-ui/react approach
- `useFloating` hook: manages position (reference element + floating element)
- `autoUpdate`: recomputes on scroll/resize
- `offset`, `shift`, `flip` middleware for boundary clamping

### Decision
InlineCreatePopover is a **free-floating draggable popover**, NOT anchored to a reference element.
@floating-ui/react is primarily for anchored tooltips/popovers (reference → floating).

For this case, the existing manual positioning already works and handles:
1. Free dragging with pointer events
2. Top-dock snap behavior
3. Viewport edge clamping

The best use of @floating-ui/react here would be to use `useFloating` with a virtual reference
element at the current x/y position, and use `shift()` middleware for boundary clamping.

**Revised plan**: Use `@floating-ui/react` for the boundary clamping/overflow detection:
- `computePosition` from `@floating-ui/dom` (lighter, no React adapter needed for this)
- Actually: use `@floating-ui/react` `useFloating` with `virtualReference` + `shift()` + `flip()`
- Remove `clampInlineCreatePosition` manual math
- Still keep drag handling (pointer events) since floating-ui doesn't handle drag

Install: `npm install @floating-ui/react` in web/

## Build Impact
- All changes are additive CSS + store files
- No breaking changes to existing types
- Vite build should pass cleanly
