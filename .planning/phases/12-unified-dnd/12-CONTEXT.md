# Phase 12 Context — 统一拖拽 (@dnd-kit)

## Problem Statement

当前项目有两套并行拖拽实现：

1. **KanbanView** — 完全手写的 pointer events 实现（`pointerdown/pointermove/pointerup`）
   - 350+ 行拖拽状态管理代码
   - 自定义 `DragPreviewLayer` 浮层
   - `resolveDropZoneValueFromPoint` 碰撞检测（elementFromPoint）
   - 不使用 @dnd-kit（尽管已安装）

2. **MatrixView** — 相同的手写 pointer events 模式（来自同一工具函数）
   - 同样的 pointer drag session 管理
   - 四象限 drop zone 碰撞检测

**PROJECT.md** 明确标注：`Drag: @dnd-kit (mobile) + 手写 pointer events (kanban) — 待统一`

## Phase 12 Scope

| REQ | Target | Approach |
|-----|--------|----------|
| DND-01 | KanbanView → @dnd-kit | 完全替换 pointer events |
| DND-02 | DndContext 提升到 WorkspaceShell | 共享 provider |
| DND-03 | 鼠标 + 触摸验证 | MouseSensor + TouchSensor |

**MatrixView 不在本 Phase 范围内** — 其 pointer events 实现保持不变。

## Key Decisions

### 1. DndContext 放置位置
DND-02 要求 "AppShell 共享 DndProvider"。WorkspaceShell 是项目的 app shell，将 DndContext + DragOverlay 放在此层，KanbanView 只使用 useDraggable/useDroppable hooks。

**Trade-off**: 
- WorkspaceShell 需感知 drag state（activeTaskId）用于 DragOverlay
- 好处：单一 DndContext，避免多实例冲突；未来 MatrixView 迁移时可直接接入

### 2. Sensor 配置
- `MouseSensor`: `activationConstraint: { distance: 6 }` — 防止误触发，与原 `POINTER_DRAG_THRESHOLD=6` 一致
- `TouchSensor`: `activationConstraint: { delay: 200, tolerance: 5 }` — 移动端长按触发，避免与滚动冲突

### 3. DragOverlay
原 `DragPreviewLayer` 组件（悬浮预览层）被 @dnd-kit 的 `DragOverlay` 替代。
- 样式复用现有 `dragPreview` CSS（已有 `.drag-preview` global class）
- 不使用 @dnd-kit Sortable（本 Phase 只需跨列拖拽，不需列内重排）

### 4. KanbanView 接口变化
KanbanView 的 prop 接口不变（`onDropStatusChange`），dragEnd 逻辑提升到 WorkspaceShell 的 DndContext 处理器。

### 5. MatrixView 不干扰
MatrixView 继续使用手写 pointer events。只要 DndContext 的 sensors 配置正确（用 distance/delay threshold），不会与 MatrixView 的 pointer 事件发生冲突。实测：@dnd-kit sensor 在未激活时不拦截 pointer 事件。

## Execution Order

1. **Plan 01** (DND-01): KanbanView 自包含迁移 — 先在 KanbanView 内置 DndContext，快速验证可行性
2. **Plan 02** (DND-02): 提升 DndContext 到 WorkspaceShell，共享 provider
3. **Plan 03** (DND-03): Sensor 精调 + vite build 验证

## Files to Modify

- `web/src/components/views/KanbanView.tsx` — 主要改动
- `web/src/components/WorkspaceShell.tsx` — DndContext 提升
- `web/src/components/WorkspaceViewContent.tsx` — 可能传递 onDragEnd
- `web/src/components/views/KanbanView.module.css` — 保持不变（样式复用）
