# Phase 14 Verification

Build: ✓ `npx vite build` — 361ms, no TypeScript errors  
Date: 2026-04-13

---

## Plan 01

### KANBAN-01 — WIP limits on Kanban columns
- Each column header shows "WIP 限制" input (1–20)
- When task count reaches the limit, column header turns amber + warning badge appears
- Limit persists in component-local state per session
- Files: `KanbanView.tsx`, `KanbanView.module.css`

### STATS-01 — Stats cards as navigation buttons
- "当前选中" / "逾期" / "今日到期" / "本周到期" / "已完成" / "专注" stats cards are now clickable
- Clicking navigates to List view with the appropriate filter preset applied
- `onNavigate` callback threaded through `WorkspaceViewContent` → `WorkspaceShell`
- Files: `StatsView.tsx`, `StatsView.module.css`

---

## Plan 02

### DISC-01 — Shortcut key tooltips on view switcher
- Each view button in the segmented control shows `title="日历（快捷键 1）"` etc.
- `shortcutKey` field added to `viewMeta` array in `app-helpers.ts`
- Files: `app-helpers.ts`, `WorkspaceShell.tsx`

### DISC-02 — First-use shortcut overlay
- On first load, a toast overlay appears bottom-center with 4 shortcut hints: ⌘+N, ⌘+K, 1–5, ?
- Auto-dismisses after 12 seconds; has × and "知道了" buttons
- Guard: `localStorage.getItem('taskflow:shortcut-guide-seen')` — shown once only
- Hidden on phone viewports (`.is-phone` CSS class)
- Files: `ShortcutGuideOverlay.tsx`, `ShortcutGuideOverlay.module.css`, `WorkspaceShell.tsx`

### DISC-03 — Bulk ops floating bar + shift+click range select
- In List view, enabling bulk mode shows a fixed floating action bar (bottom-center)
- Bar shows: selected count, ✓ Complete, Move to list, Add tag, 🗑 Delete, Exit
- Shift+click selects a contiguous range of tasks (additive)
- Range select uses `useRef` to track last clicked index without re-renders
- Files: `ListView.tsx`, `WorkspaceViewContent.tsx`, `WorkspaceShell.tsx`, `WorkspaceShell.module.css`, `App.tsx`

---

## Plan 03

### MINOR-01 — Attachment 10 MB limit + upload progress
- `MAX_EMBEDDED_ATTACHMENT_BYTES` raised from 1.5 MB to 10 MB in both `workspace-helpers.ts` and `app-helpers.ts`
- `handleBrowserFileSelection` now processes files sequentially with `uploadProgress` state
- Progress bar appears during upload showing "上传中 N/M…"
- Files: `workspace-helpers.ts`, `app-helpers.ts`, `TaskDetailPanel.tsx`, `TaskDetailPanel.module.css`

### MINOR-02 — Tag color hover preview
- Color swatches in TagManagementDialog scale up on hover (`transform: scale(1.25)`)
- Hovering a preset swatch shows a live chip preview that reflects the hovered color
- Preview chip also shows the current tag name draft (falls back to "预览")
- Files: `TagManagementDialog.tsx`, `TagManagementDialog.module.css`

### MINOR-03 — Timeline today line + auto-scroll
- **Day view**: auto-scrolls to current time on mount and when anchor changes
- **Week view**: red vertical "now" line appears in every lane when today is in the window
- Dot indicator at the top of the now line (matches day-view style)
- Files: `TimelineView.tsx`, `TimelineView.module.css`
