# Phase 12 Verification — 统一拖拽 (@dnd-kit)

## Build Status

```
npx vite build → ✅ 247 modules, 383ms
```

## Requirements Checklist

| REQ | Description | Status |
|-----|-------------|--------|
| DND-01 | KanbanView 迁移到 @dnd-kit | ✅ Done |
| DND-02 | AppShell 共享 DndProvider | ✅ Done |
| DND-03 | 桌面鼠标 + 移动触摸拖拽验证 | ✅ Done |

## Architecture After Phase 12

```
WorkspaceShell
├── DndContext (shared, kanbanSensors)
│     MouseSensor { distance: 6 }
│     TouchSensor { delay: 200, tolerance: 5 }
│     onDragEnd → applyKanbanDropFeedback
├── div.appShell
│     └── WorkspaceViewContent
│           └── KanbanView
│                 ├── KanbanDroppableColumn × 3 (useDroppable)
│                 └── KanbanDraggableCard × N (useDraggable)
└── DragOverlay → KanbanOverlayCard
```

## What Changed

### KanbanView.tsx
- **Removed**: ~80 lines of pointer events code (pointerdown/pointermove/pointerup handlers, refs, state)
- **Removed**: `DragPreviewLayer` usage
- **Removed**: workspace-helpers pointer drag utilities (POINTER_DRAG_THRESHOLD, buildPointerDragPreviewState, buildTaskDragPreview, getPointerDragStyle, markClickSuppressed, resolveDropZoneValueFromPoint, shouldIgnorePointerDragStart, handleCardKeyboardActivation)
- **Added**: `KanbanDroppableColumn` with `useDroppable`
- **Added**: `KanbanDraggableCard` with `useDraggable`
- **Added**: `KanbanOverlayCard` export (used by WorkspaceShell DragOverlay)
- **Added**: `statusOptions` re-export (used by WorkspaceShell drag handler)

### WorkspaceShell.tsx
- **Added**: `DndContext` wrapping entire app shell
- **Added**: `DragOverlay` with `KanbanOverlayCard`
- **Added**: `kanbanActiveTaskId` state
- **Added**: `kanbanSensors` (MouseSensor + TouchSensor)
- **Added**: `handleKanbanDragEnd` → `applyKanbanDropFeedback`

## Sensor Configuration
- `MouseSensor distance: 6` — matches original `POINTER_DRAG_THRESHOLD = 6`
- `TouchSensor delay: 200, tolerance: 5` — long-press to activate, prevents scroll conflicts
- `touch-action: none` on `.kanbanCard` — pre-existing, required by @dnd-kit TouchSensor

## Pre-existing Issues (not introduced by Phase 12)
- `vite-plugin-pwa` bundle assignment warnings — pre-existing since Vite 8/rolldown migration
- Chunk size > 500KB warning — pre-existing, App.tsx is a large monolith (Phase 6 scope)

## Commits
- d3856e1 — DND-01: migrate KanbanView from pointer events to @dnd-kit
- beb58c7 — DND-02: lift DndContext to WorkspaceShell as shared provider
