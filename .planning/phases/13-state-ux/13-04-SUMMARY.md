# Phase 13 Plan 04 — UX-05: InlineCreatePopover Use @floating-ui/dom

## Status: DONE

## What was built
- Installed `@floating-ui/dom` (3 packages, ~860ms)
- `types/workspace.ts`: added `anchorRect?: DOMRect | null` to `InlineCreateDraft`
- `WorkspaceShell.tsx`: passes `anchorRect` into draft alongside `resolveInlineCreateInitialPosition` result
- `InlineCreatePopover.tsx`:
  - Added `useLayoutEffect` on mount that calls `computePosition` with `flip` + `shift` + `offset(8)` middleware
  - Only fires when `draft.anchorRect` is present AND no remembered position exists (respects user preference)
  - Result is clamped with existing `clampInlineCreatePosition` then applied via `updatePositionState`
  - Manual drag/top-dock/resize system fully preserved

## Design decision
Used `@floating-ui/dom` (not `@floating-ui/react`) to avoid coupling to React's render cycle — `computePosition` is called imperatively in `useLayoutEffect`. The virtual element pattern (`getBoundingClientRect: () => anchorRect`) lets us pass the stored DOMRect without needing a live DOM reference for the anchor.

## Files changed
- `web/package.json` + `web/package-lock.json`
- `web/src/types/workspace.ts`
- `web/src/components/WorkspaceShell.tsx`
- `web/src/components/InlineCreatePopover.tsx`
