---
phase: 07
plan: 02
title: "Desktop Component CSS Modules Extraction"
status: COMPLETED
completed: "2026-04-13"
commits:
  - B1: WorkspaceShell layout + Composer + View Switcher + Calendar Nav
  - B2: AppSidebar + sidebar-shared.css (shared utilities)
  - B2b: AppTopBar
  - B3: ShortcutPanel + ExportPanel
  - B4: CommandPalette.css → .module.css (rename + camelCase)
  - B5: TaskDetailPanel + RightRail
  - B6: InlineCreatePopover + TagManagementDialog + ReminderCenterPanel
  - B7: WorkspaceShell workspacePanel transition (tab fade)
  - B8: MobileTabBar + FAB
---

# 07-02 SUMMARY — Desktop Component CSS Modules Extraction

## What Was Done

Extracted desktop component CSS from `index.css` into 10 individual `.module.css` files.

### Files Created

| Module | Source lines in index.css |
|--------|--------------------------|
| `AppSidebar.module.css` | L173–L578 (sidebar, nav-button, brand-block, folder-title) |
| `AppTopBar.module.css` | L579–L605 (topbar, filter-strip, search-input) |
| `CommandPalette.module.css` | Renamed from `CommandPalette.css` + camelCase conversion |
| `ExportPanel.module.css` | L984–L1079 (export-* classes) |
| `InlineCreatePopover.module.css` | L1085–L1160 + mobile variants |
| `MobileTabBar.module.css` | mobile-tab-bar, mobile-tab-item*, mobile-fab |
| `ReminderCenterPanel.module.css` | reminder-center*, reminder-group* |
| `ShortcutPanel.module.css` | L815–L983 (shortcut-overlay, shortcut-panel, shortcut-list) |
| `TagManagementDialog.module.css` | tag-manager*, tag-picker*, color-swatch |
| `TaskDetailPanel.module.css` | L2363–L2736 (right-rail, detail-card-*) |
| `WorkspaceShell.module.css` | L126–L172 layout, L606–L670 composer/view-switcher + workspacePanel transition |

### Supporting Files

- `web/src/styles/sidebar-shared.css` — global shared sidebar utilities (`.sidebar-section`, `.sidebar-inline-input`, `.sidebar-action-btn`) used by both `AppSidebar.tsx` and `WorkspaceSidebar.tsx`

### Files Deleted

- `web/src/components/CommandPalette.css` (replaced by `.module.css`)

## Key Decisions

- **`.panel` stays global**: Used by 9+ components cross-component; lives in `globals.css` (Plan A). Never moved to any module.
- **`.workspace` partial extraction**: `.workspace` global class kept for `App.tsx` loading skeleton. Only the tab-fade transition (`.workspace.panel`) was extracted as `workspacePanel` in WorkspaceShell.module.css.
- **`task-card*` stays global**: Spans 9 TSX files (ListView, CalendarView, MatrixView, TimelineView, MobileCalendarView, MobileFocusView, MobileMatrixView, MobileTaskDetailContent, shared). Cannot be module-scoped.
- **`task-sheet*` stays global**: Used by both `TaskBottomSheet.tsx` and `MobileSheets.tsx`.
- **WorkspaceSidebar no module created**: All its classes (`folder-list-item`, `nav-button`, `sidebar-section`, etc.) are shared with `AppSidebar.tsx`. Accessing shared utilities via `sidebar-shared.css`.
- **`:global()` pattern**: State classes (`.is-active`, `.is-fading`, `.tone-*`, etc.) applied as plain strings in JSX, paired with `:global(.is-active)` in the module CSS.

## Verification Results

```
Module files: 10 ✅ (expected ≥ 9)
sidebar-shared.css: PASS ✅
CommandPalette.css deleted: PASS ✅
.panel not in any module: PASS ✅
vite build: ✓ built in 348ms ✅
```

## index.css Reduction

Tombstone comments left at each removal site. Sections removed:
- Layout (`.app-shell`, `.main-stage`, `.right-rail`)
- Sidebar (~400 lines — brand-block, nav-button-grid, folder-title-*, sidebar-collapse-*)
- Topbar + filter-strip
- Shortcut overlay + panel
- Export panel
- Inline create popover + note editor
- Tag manager + tag picker + color-swatch
- Reminder center + groups
- Right rail + detail card (~370 lines)
- Mobile tab bar + FAB
- WorkspaceShell transition (tab fade)
