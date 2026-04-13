---
task: "15-01"
title: "PERF-01: React.memo on KanbanCard/KanbanColumn"
status: "completed"
---

## What was done

Wrapped `KanbanDroppableColumn` and `KanbanDraggableCard` in `KanbanView.tsx` with `React.memo`.

- `KanbanDroppableColumn`: default memo (shallow compare suffices — props are primitives + stable callbacks)
- `KanbanDraggableCard`: custom comparator `kanbanCardPropsEqual` that compares key scalar fields (`id`, `updatedAt`, `title`, `status`, `priority`, `completed`, `note`, `subtasks.length`, `tagIds.length`, `listId`) plus whether this card is the selected one — avoids re-render when unrelated tasks change

## Files changed

- `web/src/components/views/KanbanView.tsx`

## Result

Cards and columns skip re-render when their data hasn't changed. In a board with 50+ cards, only the mutated card(s) re-render on each interaction.
