---
plan: "12-01"
title: "DND-01 — KanbanView 迁移到 @dnd-kit（自包含 DndContext）"
phase: "12"
status: "complete"
---

# Summary 12-01

## 完成内容

完全替换 KanbanView 的手写 pointer events 拖拽实现，迁移到 @dnd-kit。

### 删除
- 所有 pointer events 状态：`dragTaskId`, `dragOverStatus`, `dragPreview`
- 所有 pointer events refs：`dragPayloadRef`, `pointerDragRef`, `dragOverStatusRef`, `suppressClickRef`
- `useEffect` 中的 `window.addEventListener(pointermove/pointerup/pointercancel)`
- `startCardDrag`, `resetDragState`, `resolveDropStatus`, `finalizePointerDrag` 函数
- `DragPreviewLayer` 组件使用
- workspace-helpers 中的 pointer drag 相关工具函数引用

### 新增
- `KanbanDroppableColumn` 子组件：`useDroppable({ id: status })`，`isOver` 驱动 `is-drag-over` class
- `KanbanDraggableCard` 子组件：`useDraggable({ id: task.id })`，`isDragging` 驱动 `is-dragging` class
- Badge group 上 `onPointerDown: stopPropagation` 防止拖拽误触发

### 初始化（后在 12-02 中提升）
- 内置 `DndContext` + `sensors`（MouseSensor distance:6，TouchSensor delay:200/tolerance:5）
- `DragOverlay` 渲染 `KanbanOverlayCard`

## 验证
- `npx vite build` ✅ 通过（247 modules）
