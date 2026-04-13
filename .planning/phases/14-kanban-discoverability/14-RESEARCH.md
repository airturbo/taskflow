# Phase 14 Research

## KANBAN-01: WIP Limit
- `KanbanView.tsx` splits tasks by status in component: `columns[task.status].push(task)`
- Column header renders `statusMeta[status]` (the string label) — currently no count badge
- `KanbanDroppableColumn` receives `isEmpty` prop; needs `wipLimit` + `count` for warning
- WIP limit stored in component local state (no server persistence needed for MVP)
- Visual warning: column header red badge when count > wipLimit
- Default WIP limits: todo=∞, doing=5, done=∞ (only "doing" makes sense to limit)
- Will add a small WIP limit edit button in column header (click to set)

## STATS-01: Stats Action Buttons
- `StatsView` is rendered in `WorkspaceViewContent.tsx` (DesktopViewSwitch)
- Currently no navigation callback passed to StatsView
- Need to add `onNavigate?: (view: string, filter?: { status?: TaskStatus, due?: FilterDue }) => void` prop
- Stats cards that need actions:
  - "已逾期" N → click → switch to list view, filter status=overdue
  - "活跃任务" N → click → switch to list view, show active tasks
  - "已完成任务" N → click → switch to list, filter completed
  - "已排期" N → click → switch to timeline view
- The `WorkspaceViewContent.tsx` has no navigation callback; need to thread it from `WorkspaceShell.tsx`
- WorkspaceShell has `p.setCurrentView`, `p.setFilterStatus`, `p.setFilterDue` — pass as combined callback

## DISC-01: Shortcut Tooltips
- `formatShortcut()` already exists in `useGlobalShortcuts.ts`
- Simple approach: add `data-shortcut` attribute + CSS `:after` pseudo-element for tooltip
- Or: enhance `title` attribute with shortcut hint (simpler, works natively)
- Best: custom `<ShortcutTooltip>` wrapper component using `title` attribute enhancement
- Target buttons: view switcher (1-5), Cmd+N, Cmd+K, ? panel
- Implementation: enhance WorkspaceShell view buttons + toolbar buttons with shortcut text in title

## DISC-02: First-Use Shortcut Guide Overlay
- ShortcutPanel already exists (comprehensive, ? key opens it)
- New: lightweight "first run" overlay showing Top-5 shortcuts
- Storage: `localStorage.getItem('taskflow:shortcut-guide-seen')` — no domain model change
- Trigger: auto-show after 2s on first load (when key not set in localStorage)
- Top 5: ⌘N (new task), ⌘K (search), 1-5 (views), ? (shortcuts panel), Esc (close)
- Component: `ShortcutGuideOverlay` — minimal card in corner, not full-screen modal
- Add to `desktopUiStore`: `shortcutGuideOpen: boolean`

## DISC-03: Bulk Operations Enhancement
- Already exists: `bulkMode` in WorkspaceShell, bulk toolbar above composer bar
- Currently: only shown when `currentView === 'list'` 
- Enhancement needed:
  1. Shift+Click selection in ListView (already has `onToggleBulkSelect`)
  2. Floating bottom bar when items are selected (instead of/alongside top toolbar)
  3. Show bulk entry in more views (kanban?)
- ListView already supports `bulkMode` + `onToggleBulkSelect` + `bulkSelectedIds`
- Need to check if Shift+Click is wired in ListView

## MINOR-01: Attachment Upload 10MB
- `MAX_EMBEDDED_ATTACHMENT_BYTES = 1.5 * 1024 * 1024` in:
  - `web/src/utils/workspace-helpers.ts:28`
  - `web/src/utils/app-helpers.ts:45`
- Change both to `10 * 1024 * 1024`
- Progress bar: `TaskDetailPanel.tsx` has `attachmentError` state; add upload progress state
- Use `FileReader` with `onprogress` event for progress tracking
- Add `attachmentProgress` state (0-100 | null) in TaskDetailPanel

## MINOR-02: Tag Color Hover Preview
- `TagManagementDialog.tsx`: color swatches use `onClick` to set color
- Need `onMouseEnter` to temporarily preview color, `onMouseLeave` to reset
- Add `hoverColor: string | null` state in TagManagementDialog
- Display: show `hoverColor ?? newTagColor` in the tag preview chip

## MINOR-03: Timeline "Today" Line
- Day scale: `nowInWindow` check already exists, renders `.timelineDayNow` line ✅
- Week scale: `scaleMarks` has `isToday` flag → `is-today` class on column headers
  - But no vertical line in the timeline lanes for "today" column
  - Need to add a vertical highlight/line in the week-scale grid for today's column
- Auto-center on today: week scale shows the current week by default via `calendarAnchor`
  - Day scale: add `useEffect` to scroll `.timelineDayScroll` so "now" line is visible
  - Currently no auto-scroll on mount

## Implementation Waves

### Wave 1 (Plan 01): Kanban WIP + Stats Actions
- KANBAN-01: WIP limit per column with visual warning
- STATS-01: Stats card action buttons → navigate to filtered list/timeline

### Wave 2 (Plan 02): Discoverability
- DISC-01: Shortcut tooltips on key buttons  
- DISC-02: First-use shortcut guide overlay
- DISC-03: Bulk ops — Shift+Click in ListView + floating action bar

### Wave 3 (Plan 03): Minor UX
- MINOR-01: Attachment limit 10MB + progress bar
- MINOR-02: Tag color hover preview
- MINOR-03: Timeline today line (week scale) + day-scale auto-scroll
