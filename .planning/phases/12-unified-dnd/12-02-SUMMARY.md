---
plan: "12-02"
title: "DND-02 — AppShell 共享 DndProvider"
phase: "12"
status: "complete"
---

# Summary 12-02

## 完成内容

将 DndContext 从 KanbanView 提升到 WorkspaceShell，实现 app-shell 级别的共享 DndProvider。

### KanbanView 变化
- 移除内置 `DndContext`、`useSensors`、`sensors`、`handleDragEnd`、`activeTaskId` state
- 移除 `DragOverlay`（提升到 WorkspaceShell）
- 移除 `useState` 和 `DragEndEvent` import
- `KanbanOverlayCard` 导出（供 WorkspaceShell 的 DragOverlay 使用）
- `statusOptions` 重新导出（供 WorkspaceShell 的 dragEnd handler 使用）
- `onDropStatusChange` prop 保留在 interface 中（向后兼容，实际 drop 逻辑移到 WorkspaceShell）

### WorkspaceShell 变化
- 新增 import: `useState`, `DndContext`, `DragOverlay`, `MouseSensor`, `TouchSensor`, `useSensor`, `useSensors`, `DragEndEvent`
- 新增 import: `KanbanOverlayCard`, `statusOptions` from `./views/KanbanView`
- 新增 state: `kanbanActiveTaskId: string | null`
- 新增 sensors: `kanbanSensors`（MouseSensor distance:6，TouchSensor delay:200/tolerance:5）
- 新增 `handleKanbanDragEnd`: 调用 `p.applyKanbanDropFeedback`
- return 包裹 `DndContext`，末尾添加 `DragOverlay`

### 架构结果
```
WorkspaceShell (DndContext ← 共享 provider)
  ├── DragOverlay (KanbanOverlayCard)
  └── div.appShell
        └── WorkspaceViewContent
              └── KanbanView (useDraggable + useDroppable — 无 DndContext)
```

## 验证
- `npx vite build` ✅ 通过（247 modules）
