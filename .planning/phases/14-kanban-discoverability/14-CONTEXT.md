# Phase 14 Context — Kanban Enhancement + Discoverability + Minor UX

## Phase Goal
Enhance the kanban board with WIP limits, add action buttons to Stats insight cards,
add shortcut tooltips + first-use onboarding overlay, improve bulk operations discoverability,
and fix several minor UX issues (attachments, tag colors, timeline today line).

## Requirements Summary
| REQ | Description | Est |
|-----|-------------|-----|
| KANBAN-01 | Per-column WIP limit; visual warning when exceeded | 1d |
| STATS-01 | Stats insight card action buttons → jump to preset filter | 0.5d |
| DISC-01 | Buttons with shortcuts show tooltip hints | 0.5d |
| DISC-02 | First-use Top-5 shortcut guide overlay | 1d |
| DISC-03 | Bulk ops entry (Shift+Click / toolbar) + floating action bar | 1d |
| MINOR-01 | Attachment upload limit 1.5MB → 10MB + progress bar | 0.5d |
| MINOR-02 | Tag color picker hover live preview | 0.25d |
| MINOR-03 | Timeline "today" red vertical line + auto-scroll-to-center | 0.25d |

## Depends On
- Phase 8: Routing (HashRouter, useRouterSync) ✅
- Phase 12: Unified @dnd-kit drag (DndContext in WorkspaceShell) ✅
- Phase 13: Zustand UI store, completion animations, @floating-ui ✅

## Key Files
- `web/src/components/views/KanbanView.tsx` + `.module.css`
- `web/src/components/views/StatsView.tsx` + `.module.css`
- `web/src/components/views/TimelineView.tsx` + `.module.css`
- `web/src/components/WorkspaceShell.tsx` — bulk toolbar, shortcut tooltips
- `web/src/components/WorkspaceViewContent.tsx` — StatsView props wiring
- `web/src/hooks/useGlobalShortcuts.ts` — formatShortcut already exists
- `web/src/utils/workspace-helpers.ts` — MAX_EMBEDDED_ATTACHMENT_BYTES = 1.5MB
- `web/src/utils/app-helpers.ts` — duplicate MAX_EMBEDDED_ATTACHMENT_BYTES
- `web/src/components/TaskDetailPanel.tsx` — attachment upload logic
- `web/src/components/TagManagementDialog.tsx` + `.module.css` — color swatches

## Architecture Notes
- KanbanView receives tasks[] already filtered; columns split by status in component
- WIP limit: stored in uiStore or local component state (no persistence needed for MVP)
- StatsView stats cards: need `onNavigate` callback to switch view + apply filter
- WorkspaceShell already has setCurrentView, setFilterStatus, setFilterDue
- Bulk mode: already exists in WorkspaceShell, but only shown in ListView
  - DISC-03 wants Shift+Click support in ListView + floating bar enhancement
- Timeline: day-scale already has "now" line (nowInWindow); week-scale needs "today" column line
- formatShortcut() already in useGlobalShortcuts.ts
- @floating-ui already installed (used in Phase 13)
