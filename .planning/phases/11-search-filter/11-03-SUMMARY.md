---
phase: 11
plan: 03
title: "FILTER-03: CommandPalette NLP 解析预览 chip"
status: completed
---

# Summary

## What was implemented

Added real-time NLP parsing and filter chip preview to CommandPalette.

### `parseCommandQuery(input, allTags)` pure function
Parses CommandPalette search string into structured output:
- `#tagname` → matches tag by name → `tags: string[]` (tag ids)
- `!urgent/!high/!p1` etc. → `priority: Priority | null`
- `status:todo/doing/done` → `status: TaskStatus | null`
- `due:today/week/overdue` → `due: FilterDue`
- `@listname` → `listName: string | null` (display only)
- remaining text → `keyword: string`

### Chip preview row
Rendered below the input when any parsed token is present:
- **tag chip**: colored dot + tag name (color-mix tint from tag.color)
- **priority chip**: priority color background tint
- **status chip**: neutral
- **due chip**: yellow warning / red for overdue
- **list chip**: neutral (display only)
- **keyword chip**: neutral with search icon

### Apply mechanism
- "应用筛选" button appears when chips are present
- `Cmd+Enter` / `Ctrl+Enter` keyboard shortcut
- `onApplyFilter` prop called with `{ tagIds, priority, status, due, keyword }`
- Palette closes after apply

## Files changed

- `web/src/components/CommandPalette.tsx` — rewrite
  - Added `parseCommandQuery()` export
  - Added `ApplyFilterPayload` interface
  - Added `onApplyFilter?: (payload) => void` prop
  - Added NLP chip row JSX
  - Added `handleApply` + `Cmd+Enter` handler

- `web/src/components/CommandPalette.module.css`
  - Added NLP chip row styles (`.nlpChipRow`, `.nlpChip*`, `.nlpApplyBtn`)

- `web/src/components/WorkspaceShell.tsx`
  - Added `onApplyCommandFilter?` prop to `WorkspaceShellProps`
  - Wired `onApplyFilter` on CommandPalette

- `web/src/App.tsx`
  - Passed `onApplyCommandFilter` handler: sets `selectedTagIds`, `filterPriority`, `filterStatus`, `filterDue`, `searchInput`
