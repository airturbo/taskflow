---
phase: 07
plan: 04
title: "Mobile CSS Modules extraction + index.css cleanup"
status: completed
completed: 2026-04-13
commits:
  - D1: "feat(07-04/D1): extract MobileFocusView CSS Module"
  - D2: "feat(07-04/D2): extract MobileProjectsView + MobileMeView CSS Modules"
  - D3: "feat(07-04/D3): extract MobileSheets + MobileCalendarView + MobileMatrixView CSS Modules"
  - D4: "feat(07-04/D4): extract MobileTaskDetailContent + create styles/mobile-layout.css"
  - D5: "feat(07-04/D5): rename index.css → styles/shared-components.css"
---

# 07-04 SUMMARY — Mobile CSS Modules + Final Cleanup

## What Was Done

### D1 — MobileFocusView CSS Module
- Created `web/src/mobile/MobileFocusView.module.css` (~200 lines)
- Extracted focus page, focus scope switching, focus stats sections from index.css
- Converted all class names to camelCase; `.is-phone` parent rules use `:global(.is-phone)` prefix
- Updated `MobileFocusView.tsx` with module import

### D2 — MobileProjectsView + MobileMeView CSS Modules
- Created `web/src/mobile/MobileProjectsView.module.css`
- Created `web/src/mobile/MobileMeView.module.css`
- Both TSX files updated with module imports
- Removed corresponding blocks from index.css

### D3 — MobileSheets + MobileCalendarView + MobileMatrixView CSS Modules
- Created `web/src/mobile/MobileSheets.module.css` (quick-create sheet, confirm sheet, prompt sheet)
- Created `web/src/mobile/MobileCalendarView.module.css` (mobile calendar overrides)
- Created `web/src/mobile/MobileMatrixView.module.css` (mobile matrix tab overrides)
- All TSX files updated; blocks removed from index.css
- Dead CSS (`.calendar-dot-indicator`) tombstoned — no TSX references found

### D4 — MobileTaskDetailContent + mobile-layout.css
- Created `web/src/mobile/MobileTaskDetailContent.module.css` (full detail sheet styles)
- Created `web/src/styles/mobile-layout.css` — new global file for cross-cutting mobile primitives:
  - Drawer layer/panel/animations
  - Mobile topbar
  - Task bottom sheet
  - `.is-phone` scoped overrides
  - PWA / safe-area adaptation
  - Toast / sheet animations
- Added `import './styles/mobile-layout.css'` to `main.tsx`
- `is-phone .quick-feedback` and `is-phone .action-toast` toast rules moved from index.css to mobile-layout.css

### D5 — Rename index.css → styles/shared-components.css
- Remaining ~1519 lines in index.css are all legitimate cross-cutting styles (task-card, priority-pill, sidebar, nav-button, inline-create, reminder-composer, etc.) — cannot be deleted
- Decision: rename to `styles/shared-components.css` (same styles/ directory as globals.css, sidebar-shared.css, mobile-layout.css)
- Updated `main.tsx`: `import './index.css'` → `import './styles/shared-components.css'`
- Updated file header comment
- Deleted `web/src/index.css`
- `vite build` passes ✓

## Outcome

| Metric | Before Plan D | After Plan D |
|--------|---------------|--------------|
| `*.module.css` count | 15 | **22** |
| `index.css` | ~1708 lines | **deleted** |
| Cross-cutting CSS file | `src/index.css` (root) | `src/styles/shared-components.css` |
| Mobile layout CSS | scattered in index.css | `src/styles/mobile-layout.css` |

## Decisions

- `mobile-layout.css` as plain CSS (not module): drawer, topbar, task-sheet, `.is-phone` overrides are applied via body-level class names at runtime — not scoped to a single component, so CSS Modules are inappropriate
- `shared-components.css` name chosen over keeping it as a near-empty index.css stub: the ~1519 remaining lines are real, used styles. Renaming is honest about the file's purpose
- Dead CSS (`.calendar-dot-indicator`) tombstoned with comment rather than silently deleted

## ARCH-02 Status

**COMPLETE** — Monolithic 6908-line index.css fully decomposed:
- 22 CSS Modules for component/view-specific styles
- `styles/globals.css` — design tokens, resets, shared utilities
- `styles/sidebar-shared.css` — sidebar cross-component shared primitives
- `styles/mobile-layout.css` — cross-cutting mobile layout primitives
- `styles/shared-components.css` — remaining cross-cutting component styles (task-card, priority-pill, etc.)
