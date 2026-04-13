# Phase 12 Research — 统一拖拽

## 现状分析

### KanbanView 拖拽实现（手写 pointer events）

**文件**: `web/src/components/views/KanbanView.tsx` (~255 行)

状态管理：
```
dragTaskId: string | null          — 当前被拖动的任务 ID（触发 is-dragging 样式）
dragOverStatus: TaskStatus | null  — 当前 hover 的列（触发 is-drag-over 样式）
dragPreview: PointerDragPreviewState | null — 浮层位置/数据
pointerDragRef: PointerDragSession — 拖拽会话数据（不触发重渲染）
```

事件绑定：全局 `window.addEventListener(pointermove/pointerup/pointercancel)`

关键工具函数（`workspace-helpers.ts`）：
- `POINTER_DRAG_THRESHOLD = 6` — 最小移动量才激活拖拽
- `resolveDropZoneValueFromPoint(x, y, selector, attr)` — elementFromPoint 碰撞检测
- `buildPointerDragPreviewState(session, x, y)` — 计算预览位置
- `buildTaskDragPreview(task, meta)` — 构造预览数据
- `getPointerDragStyle(taskId, dragTaskId, preview)` — 当前被拖任务的 transform style
- `shouldIgnorePointerDragStart(target, currentTarget)` — 忽略 button/input/select 等元素
- `markClickSuppressed(ref)` — drop 后抑制 click 事件

Drop zone 标记：`data-kanban-drop-zone={status}` 属性

### MatrixView 拖拽实现（同样手写 pointer events）

**文件**: `web/src/components/views/MatrixView.tsx`

与 KanbanView 完全相同的模式：
- Drop zone: `data-matrix-drop-zone={quadrant}`
- `resolveDropZoneValueFromPoint` 碰撞检测
- 同一组 workspace-helper 工具函数

**MatrixView 不在本 Phase 改动范围。**

### @dnd-kit 已安装包

```json
"@dnd-kit/core": "^6.3.1",
"@dnd-kit/sortable": "^8.0.0",
"@dnd-kit/utilities": "^3.2.2"
```

**当前 @dnd-kit 使用情况**：代码库中无任何使用（grep 结果为空）。所有 drag 均是手写实现。

### DragPreviewLayer / 样式

`shared.tsx:113` — `DragPreviewLayer({ preview })` 组件：
- createPortal 到 document.body
- CSS: `.drag-preview-layer`, `.drag-preview-card`, `.drag-preview-card__meta-row` 定义在 `shared-components.css:559`

替换后：使用 @dnd-kit `DragOverlay` + 同样的 `.drag-preview-card` 样式（保持视觉一致）。

### WorkspaceShell 结构

```
WorkspaceShell (WorkspaceShell.tsx)
  └── WorkspaceViewContent (WorkspaceViewContent.tsx)
        ├── DesktopViewSwitch
        │     └── KanbanView (onDropStatusChange prop)
        └── MobileViewSwitch
              └── KanbanView (onDropStatusChange prop)
```

`p.applyKanbanDropFeedback(id, status)` — WorkspaceShell 中的 drop 回调。

## @dnd-kit API 计划

### Sensors
```typescript
const sensors = useSensors(
  useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
  useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
)
```

### DndContext 事件
- `onDragStart(event)` → 记录 `activeTaskId`
- `onDragEnd(event)` → 检查 `over?.id` 为 TaskStatus，调用 `onDropStatusChange`
- `onDragCancel()` → 清空 `activeTaskId`

### Droppable（列）
```typescript
const { setNodeRef, isOver } = useDroppable({ id: status })
```

### Draggable（任务卡片）
```typescript
const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({ id: task.id })
const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined
```

### DragOverlay（预览层）
```typescript
<DragOverlay dropAnimation={null}>
  {activeTask ? <DragPreviewCard task={activeTask} /> : null}
</DragOverlay>
```

## 迁移路径

### Phase 1: KanbanView 自包含 DndContext (Plan 12-01)

先在 KanbanView 内置 DndContext，快速验证：
- 删除所有 pointer events 代码
- 使用 useDraggable + useDroppable
- DragOverlay 替代 DragPreviewLayer
- 确保 build 通过

### Phase 2: 提升到 WorkspaceShell (Plan 12-02)

将 DndContext 从 KanbanView 移出，提升到 WorkspaceShell：
- WorkspaceShell 持有 DndContext + activeTaskId state + onDragEnd handler
- KanbanView 成为纯 presentational（无 DndContext 内部状态）
- DragOverlay 也移到 WorkspaceShell

### Phase 3: 验证 + 精调 (Plan 12-03)

- vite build 验证
- Sensor 参数确认
- 移动端 touch-action 确认

## 风险点

1. **KanbanCard 内的 button/select 触发 drag** — @dnd-kit Draggable 的 listeners 默认绑定在整个元素，需确保 badge/button 区域不触发拖拽。解决：在 badge group `onClick` 已有 `event.stopPropagation()`，但 pointerdown 需要单独处理。`@dnd-kit` 支持 `disabled` 选项，或在内部元素上 stop propagation。

2. **touch-action: none** — @dnd-kit TouchSensor 需要 `touch-action: none` 在可拖拽元素上。KanbanView.module.css 中已有 `.kanbanCard { touch-action: none }`。✅

3. **DragOverlay 会离开 DndContext** — DragOverlay 必须在 DndContext 内部渲染，这是 WorkspaceShell 包裹的理由。
