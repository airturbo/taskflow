# TaskFlow 移动端 UX 优化落地方案

> **文档版本**: v1.0 · 2026-04-10  
> **代码基准**: App.tsx 6854 行 · index.css 119KB  
> **参考基准**: Things 3 · Todoist · TickTick · Any.do · Linear · OmniFocus  
> **原则**: 渐进式重构，不破坏现有功能，每个 Phase 独立可交付

---

## 现状速查

```
已有（不要重复造轮子）
├── ✅ 底部 Tab Bar（焦点/日历/象限/项目/我的）— App.tsx L3013-3050
├── ✅ 全局 FAB 按钮 — App.tsx L3047-3055
├── ✅ MobileQuickCreateSheet（底部滑入）— App.tsx L6729-6776
├── ✅ TaskSheet 下滑关闭手势（把手+内容区双区域检测）— App.tsx L6196-6272
├── ✅ 响应式断点：isPhoneViewport(≤680) / isNavigationDrawerMode(≤960)
├── ✅ 自然语言解析：parseSmartEntry() — utils/smart-entry.ts
├── ✅ MobileFocusView（焦点页三段分组的雏形）— App.tsx L2746-2896
└── ✅ 手机端确认/提示弹窗（替代浏览器原生）

核心问题（影响所有优化）
├── ❌ App.tsx 6854 行单体，42 个 useState 全在 WorkspaceApp 组件
├── ❌ JS 断点(680px) vs CSS 断点(720px) 不一致
├── ❌ 拖拽逻辑重复 4 处（日历/看板/四象限/时间线）
├── ❌ 无虚拟列表（大量任务时性能差）
├── ❌ NLP 解析无实时 token chip 反馈
└── ❌ 视图切换无滚动位置保持
```

---

## Phase 1 · 地基重建（建议 1-2 月）

> 目标：解除所有后续优化的技术阻塞点。完成后代码可维护，后续改动不再"牵一发动全身"。

---

### Task 1.1 · App.tsx 模块拆分

**为什么是 P0**：现在任何改动都要在 6854 行里定位，移动端/桌面端逻辑交织，无法做精准的代码分割。

**目标目录结构**

```
web/src/
├── App.tsx                          # ← 只剩 Provider 组装 + 路由，目标 < 80 行
├── main.tsx
│
├── stores/
│   ├── useDataStore.ts              # 持久化数据（tasks/lists/tags/folders）
│   ├── useUIStore.ts                # UI 状态（view/sheet/drawer/search）
│   └── selectors.ts                 # useMemo 派生状态
│
├── features/
│   ├── workspace/
│   │   ├── WorkspaceShell.tsx       # 主布局容器（原 WorkspaceApp 的骨架）
│   │   ├── WorkspaceSidebar.tsx     # 桌面端左侧导航
│   │   ├── WorkspaceTopbar.tsx      # 移动端顶部栏
│   │   └── WorkspaceBottomNav.tsx   # 移动端底部 Tab Bar（从 App.tsx L3013 提取）
│   │
│   ├── tasks/
│   │   ├── TaskCard.tsx             # 任务行/卡片
│   │   ├── TaskList.tsx             # 带虚拟滚动的任务列表
│   │   ├── TaskSheet.tsx            # 移动端底部详情 Sheet（从 App.tsx L6196 提取）
│   │   ├── TaskDrawer.tsx           # 桌面端右侧详情 Drawer
│   │   ├── QuickCreateSheet.tsx     # 移动端快速创建（从 App.tsx L6729 提取）
│   │   └── SwipeableTaskRow.tsx     # 带左右滑手势的任务行（新建）
│   │
│   ├── views/
│   │   ├── focus/MobileFocusView.tsx        # 焦点页（已有，提取）
│   │   ├── calendar/CalendarView.tsx
│   │   ├── kanban/KanbanView.tsx
│   │   ├── timeline/TimelineView.tsx
│   │   └── matrix/MatrixView.tsx
│   │
│   └── quick-entry/
│       ├── SmartEntryInput.tsx      # NLP 输入框 + token chips（升级现有）
│       └── NlpTokenChip.tsx        # 日期/优先级/标签 chips
│
└── shared/
    ├── hooks/
    │   ├── useDevice.ts             # 统一断点（修复 680 vs 720 不一致）
    │   ├── useLongPress.ts          # 长按检测
    │   ├── useSwipeGesture.ts       # 左右滑手势
    │   └── useDragSession.ts        # 统一拖拽逻辑（合并 4 处重复代码）
    └── components/
        ├── BottomSheet.tsx          # 通用底部 Sheet（提取 TaskSheet 的手势核心）
        └── VirtualList.tsx          # 虚拟滚动列表（@tanstack/react-virtual）
```

**拆分顺序**（按依赖关系，由内到外）

```
1. 先提取 stores/ —— 零依赖，可以单独测试
2. 再提取 shared/hooks/ —— 依赖 stores
3. 再提取 features/tasks/ 的组件 —— 依赖 hooks + stores
4. 最后提取 views/ —— 依赖 tasks 组件
5. WorkspaceShell 最后组装
```

**关键注意事项**
- 拆分时**不改逻辑**，只移动代码 + 添加 import/export
- 每拆一个文件就跑一次本地验证，不要攒着一起拆
- `App.tsx` 中的 `commitTask`、`handleRemoteUpdate` 等函数最终迁移到对应 store 的 action 里

---

### Task 1.2 · Zustand 状态管理

**现状**：App.tsx L619-661 有 42 个 `useState`，任意一个变化都可能触发全树重渲染。

**安装**

```bash
npm install zustand
```

**第一步：数据 Store（替换 tasks/lists/tags/folders 相关 state）**

```typescript
// stores/useDataStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Task, TodoList, Tag, Folder, Filter } from '../types/domain'

interface DataState {
  tasks: Task[]
  lists: TodoList[]
  tags: Tag[]
  folders: Folder[]
  filters: Filter[]
  
  // Actions（对应 App.tsx 中的 commitTask / updateTask / deleteTask 等）
  createTask: (task: Task) => void
  updateTask: (id: string, patch: Partial<Task>) => void
  deleteTask: (id: string) => void
  createTag: (tag: Tag) => void
  updateTag: (id: string, patch: Partial<Tag>) => void
  // ...
}

export const useDataStore = create<DataState>()(
  persist(
    (set) => ({
      tasks: [],
      lists: [],
      tags: [],
      folders: [],
      filters: [],
      
      createTask: (task) => set((s) => ({ tasks: [task, ...s.tasks] })),
      updateTask: (id, patch) => set((s) => ({
        tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      })),
      deleteTask: (id) => set((s) => ({
        tasks: s.tasks.map((t) => (t.id === id ? { ...t, deleted: true } : t)),
      })),
      // ...
    }),
    { name: 'taskflow-data' }  // 对齐现有 localStorage key，迁移时注意
  )
)
```

**第二步：UI Store（替换 view/sheet/drawer 相关 state）**

```typescript
// stores/useUIStore.ts
import { create } from 'zustand'
import type { WorkspaceView } from '../types/domain'

type MobileTab = 'focus' | 'calendar' | 'matrix' | 'projects' | 'me'

interface UIState {
  // 通用
  currentView: WorkspaceView
  searchKeyword: string
  selectedTaskId: string | null
  bulkSelectedIds: Set<string>
  
  // 移动端
  mobileTab: MobileTab
  taskSheetOpen: boolean
  taskSheetTaskId: string | null
  quickCreateOpen: boolean
  
  // 桌面端
  sidebarExpanded: boolean
  utilityDrawerOpen: boolean
  
  // Actions
  setMobileTab: (tab: MobileTab) => void
  openTaskSheet: (taskId: string) => void
  closeTaskSheet: () => void
  openQuickCreate: () => void
  closeQuickCreate: () => void
  toggleBulkSelect: (id: string) => void
  clearBulkSelect: () => void
}

export const useUIStore = create<UIState>()((set) => ({
  currentView: 'list',
  searchKeyword: '',
  selectedTaskId: null,
  bulkSelectedIds: new Set(),
  
  mobileTab: 'focus',
  taskSheetOpen: false,
  taskSheetTaskId: null,
  quickCreateOpen: false,
  
  sidebarExpanded: false,
  utilityDrawerOpen: false,
  
  setMobileTab: (tab) => set({ mobileTab: tab }),
  openTaskSheet: (taskId) => set({ taskSheetOpen: true, taskSheetTaskId: taskId }),
  closeTaskSheet: () => set({ taskSheetOpen: false, taskSheetTaskId: null }),
  openQuickCreate: () => set({ quickCreateOpen: true }),
  closeQuickCreate: () => set({ quickCreateOpen: false }),
  toggleBulkSelect: (id) => set((s) => {
    const next = new Set(s.bulkSelectedIds)
    next.has(id) ? next.delete(id) : next.add(id)
    return { bulkSelectedIds: next }
  }),
  clearBulkSelect: () => set({ bulkSelectedIds: new Set() }),
}))
```

**第三步：选择器（避免不必要重渲染）**

```typescript
// stores/selectors.ts
import { useDataStore } from './useDataStore'
import { useUIStore } from './useUIStore'
import { useMemo } from 'react'

// 只订阅需要的字段，不触发无关重渲染
export const useActiveTasks = () =>
  useDataStore((s) => s.tasks.filter((t) => !t.deleted && !t.completed))

export const useFilteredTasks = () => {
  const tasks = useDataStore((s) => s.tasks)
  const keyword = useUIStore((s) => s.searchKeyword)
  return useMemo(
    () => tasks.filter((t) => !t.deleted && t.title.includes(keyword)),
    [tasks, keyword]
  )
}
```

**迁移策略**：不要一次性替换，用"双写"方式逐步迁移：
1. 创建 store，但 `WorkspaceApp` 同时保留原 `useState`
2. store 的 action 内部调用原有的 setter（让两者同步）
3. 逐个组件切换到读 store，不再读 props
4. 全部迁移完后删除原 useState

---

### Task 1.3 · 统一断点，修复 JS/CSS 不一致

**现状问题**：JS 用 `≤680px` 判断手机，CSS 用 `@media (max-width: 720px)`，两套标准造成灰色地带。

**修复**

```typescript
// shared/hooks/useDevice.ts
export const BREAKPOINTS = {
  phone: 680,      // 统一以此为准
  tablet: 960,
  compact: 1200,
  utilityDrawer: 1280,
} as const

export const useDevice = () => {
  const [width, setWidth] = useState(() => window.innerWidth)
  
  useEffect(() => {
    // 用 visualViewport 优先（iOS 软键盘时更准确）
    const target = window.visualViewport ?? window
    const handler = () => setWidth(window.visualViewport?.width ?? window.innerWidth)
    target.addEventListener('resize', handler)
    return () => target.removeEventListener('resize', handler)
  }, [])
  
  return {
    isPhone: width <= BREAKPOINTS.phone,
    isTablet: width > BREAKPOINTS.phone && width <= BREAKPOINTS.tablet,
    isDesktop: width > BREAKPOINTS.tablet,
    isCompact: width <= BREAKPOINTS.compact,
    isUtilityDrawer: width <= BREAKPOINTS.utilityDrawer,
    width,
  }
}
```

```css
/* index.css：把所有 @media (max-width: 720px) 改为 680px */
/* 全局替换：720px → 680px（共约 8 处） */
@media (max-width: 680px) { /* 原 720px */ }
```

---

### Task 1.4 · 虚拟列表

**现状**：任务列表直接 `tasks.map(task => <TaskCard />)`，1000 条任务会渲染 1000 个 DOM 节点。

**安装**

```bash
npm install @tanstack/react-virtual
```

**实现**

```typescript
// features/tasks/TaskList.tsx
import { useVirtualizer } from '@tanstack/react-virtual'

interface TaskListProps {
  tasks: Task[]
  onSelectTask: (id: string) => void
  onToggleComplete: (id: string) => void
}

export function TaskList({ tasks, onSelectTask, onToggleComplete }: TaskListProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  
  const virtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,       // 任务行估算高度
    overscan: 5,                   // 视口外多渲染 5 条，避免滚动白屏
  })
  
  return (
    <div ref={parentRef} style={{ overflow: 'auto', height: '100%' }}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((item) => (
          <div
            key={item.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${item.start}px)`,
            }}
          >
            <SwipeableTaskRow
              task={tasks[item.index]}
              onSelect={onSelectTask}
              onToggleComplete={onToggleComplete}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
```

**预期效果**：10,000 条任务从 ~200ms 渲染时间降至 ~12ms，帧率从 <30fps → 60fps。

---

### Task 1.5 · iOS 输入框防缩放修复

**现状**：移动端输入框 `font-size` 若小于 16px，iOS Safari 会自动放大页面（破坏布局）。

**修复位置**：`index.css` 中所有 `input`, `textarea`, `select`

```css
/* index.css：在移动端断点内添加 */
@media (max-width: 680px) {
  input,
  textarea,
  select,
  .mobile-quick-create-input {
    font-size: 16px !important;  /* 防止 iOS Safari 自动缩放 */
  }
}
```

**影响范围**：`MobileQuickCreateSheet`（App.tsx L6729）的输入框，以及所有 Task 详情 Sheet 中的编辑框。

---

## Phase 2 · 核心交互（建议 3-4 月）

> 目标：补齐移动端与 Things 3、Todoist 的核心交互差距。

---

### Task 2.1 · 任务行左右滑手势

**现状**：无任何滑动手势，删除/完成操作需进入详情页。

**实现**

```typescript
// features/tasks/SwipeableTaskRow.tsx
import { useRef, useState } from 'react'

interface SwipeAction {
  label: string
  color: string
  icon: string
  onTrigger: () => void
}

interface SwipeableTaskRowProps {
  task: Task
  leftAction?: SwipeAction   // 右滑显示（默认：今天/完成）
  rightAction?: SwipeAction  // 左滑显示（默认：推迟/删除）
  onSelect: (id: string) => void
  onToggleComplete: (id: string) => void
}

export function SwipeableTaskRow({
  task,
  leftAction,
  rightAction,
  onSelect,
  onToggleComplete,
}: SwipeableTaskRowProps) {
  const [translateX, setTranslateX] = useState(0)
  const startXRef = useRef<number | null>(null)
  const TRIGGER_THRESHOLD = 80   // 滑动超过 80px 触发操作
  const PREVIEW_THRESHOLD = 20   // 滑动超过 20px 开始显示操作区

  const defaultLeftAction: SwipeAction = {
    label: '今天',
    color: '#34c759',
    icon: '☀️',
    onTrigger: () => {
      // 设置为今天
    },
  }

  const defaultRightAction: SwipeAction = {
    label: '删除',
    color: '#ff3b30',
    icon: '🗑',
    onTrigger: () => {
      // 删除任务
    },
  }

  const left = leftAction ?? defaultLeftAction
  const right = rightAction ?? defaultRightAction

  return (
    <div
      className="swipeable-row"
      style={{ position: 'relative', overflow: 'hidden' }}
    >
      {/* 左操作区（右滑露出） */}
      <div
        className="swipe-action swipe-action--left"
        style={{ background: left.color, opacity: translateX > PREVIEW_THRESHOLD ? 1 : 0 }}
      >
        <span>{left.icon}</span>
        <span>{left.label}</span>
      </div>

      {/* 右操作区（左滑露出） */}
      <div
        className="swipe-action swipe-action--right"
        style={{ background: right.color, opacity: translateX < -PREVIEW_THRESHOLD ? 1 : 0 }}
      >
        <span>{right.icon}</span>
        <span>{right.label}</span>
      </div>

      {/* 任务行内容 */}
      <div
        className="task-row"
        style={{
          transform: `translateX(${translateX}px)`,
          transition: startXRef.current === null ? 'transform 0.3s ease' : 'none',
        }}
        onPointerDown={(e) => {
          startXRef.current = e.clientX
        }}
        onPointerMove={(e) => {
          if (startXRef.current === null) return
          const delta = e.clientX - startXRef.current
          setTranslateX(Math.max(-120, Math.min(120, delta)))
        }}
        onPointerUp={() => {
          if (translateX > TRIGGER_THRESHOLD) left.onTrigger()
          else if (translateX < -TRIGGER_THRESHOLD) right.onTrigger()
          setTranslateX(0)
          startXRef.current = null
        }}
        onPointerCancel={() => {
          setTranslateX(0)
          startXRef.current = null
        }}
        onClick={() => onSelect(task.id)}
      >
        <button
          className="task-row__complete-btn"
          onClick={(e) => {
            e.stopPropagation()
            onToggleComplete(task.id)
          }}
        />
        <span className="task-row__title">{task.title}</span>
      </div>
    </div>
  )
}
```

**交互规格**（对标 Things 3）

| 手势 | 距离 | 操作 |
|---|---|---|
| 右滑 20px | 预览 | 显示「今天」绿色操作区 |
| 右滑 80px | 触发 | 加入今天 + 振动反馈 |
| 左滑 20px | 预览 | 显示「删除」红色操作区 |
| 左滑 80px | 触发 | 删除任务（带撤销 Toast） |

---

### Task 2.2 · 长按多选模式

**现状**：`bulkMode` state 已有（App.tsx），但无长按触发机制。

**实现**

```typescript
// shared/hooks/useLongPress.ts
export const useLongPress = (
  onLongPress: () => void,
  options: { delay?: number; threshold?: number } = {}
) => {
  const { delay = 500, threshold = 10 } = options
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startPosRef = useRef<{ x: number; y: number } | null>(null)

  const cancel = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return
      startPosRef.current = { x: e.clientX, y: e.clientY }
      timerRef.current = setTimeout(() => {
        // Haptic 反馈（如果是 Tauri + 支持）
        navigator.vibrate?.(30)
        onLongPress()
      }, delay)
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!startPosRef.current) return
      const dist = Math.hypot(
        e.clientX - startPosRef.current.x,
        e.clientY - startPosRef.current.y
      )
      if (dist > threshold) cancel()
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
  }
}
```

```typescript
// features/tasks/TaskCard.tsx 中接入
const { openTaskSheet } = useUIStore()
const { toggleBulkSelect, bulkSelectedIds } = useUIStore()
const [isBulkMode, setIsBulkMode] = useState(false)  // 来自 UIStore

const longPress = useLongPress(() => {
  setIsBulkMode(true)           // 进入批量选择模式
  toggleBulkSelect(task.id)     // 选中当前任务
})

// 批量操作底部栏（isBulkMode 为 true 时固定在屏幕底部）
{isBulkMode && (
  <div className="bulk-action-bar">
    <span>{bulkSelectedIds.size} 个任务</span>
    <button onClick={handleBulkComplete}>完成</button>
    <button onClick={handleBulkPostpone}>推迟</button>
    <button onClick={handleBulkDelete}>删除</button>
    <button onClick={() => { setIsBulkMode(false); clearBulkSelect() }}>取消</button>
  </div>
)}
```

---

### Task 2.3 · 任务详情 Sheet 升级（三层信息架构）

**现状**：TaskSheet 已有下滑手势（App.tsx L6196），但字段可能平铺，缺底部固定操作栏。

**升级内容**

```typescript
// features/tasks/TaskSheet.tsx（在现有手势逻辑基础上升级内容区结构）

// 三层信息架构
const FIELD_LAYERS = {
  core: ['title', 'dueAt', 'priority', 'listId'],           // 始终可见
  expanded: ['note', 'tagIds', 'reminders', 'repeatRule'],  // 默认展开
  advanced: ['startAt', 'deadlineAt', 'subtasks',            // 折叠，点击展开
             'estimatedPomodoros', 'assignee', 'attachments'],
}

return (
  <div className="task-sheet" ref={sheetRef}>
    {/* 把手（现有，保留） */}
    <div className="task-sheet__handle-area" onTouchStart={handleHandleTouchStart}>
      <div className="task-sheet__handle" />
    </div>

    {/* 内容区（可滚动） */}
    <div className="task-sheet__body" ref={bodyRef} onTouchStart={handleBodyTouchStart}>
      {/* 第一层：核心字段 */}
      <section className="sheet-section sheet-section--core">
        <input className="sheet-title-input" value={task.title} onChange={...} />
        <TaskDatePicker value={task.dueAt} onChange={...} />   {/* 见 Task 2.4 */}
        <PrioritySelector value={task.priority} onChange={...} />
      </section>

      {/* 第二层：展开字段 */}
      <section className="sheet-section sheet-section--expanded">
        <textarea className="sheet-note-input" value={task.note} onChange={...} />
        <TagPicker selectedIds={task.tagIds} onChange={...} />
        <ReminderEditor reminders={task.reminders} onChange={...} />
      </section>

      {/* 第三层：高级字段（折叠） */}
      <details className="sheet-section sheet-section--advanced">
        <summary>更多选项</summary>
        <StartAtPicker value={task.startAt} onChange={...} />
        <DeadlinePicker value={task.deadlineAt} onChange={...} />
        <SubtaskList subtasks={task.subtasks} onChange={...} />
      </details>
    </div>

    {/* 底部固定操作栏（新增） */}
    <div className="task-sheet__action-bar">
      <button
        className="action-btn action-btn--complete"
        onClick={() => onToggleComplete(task.id)}
      >
        {task.completed ? '撤销完成' : '完成'}
      </button>
      <button
        className="action-btn action-btn--postpone"
        onClick={() => openPostponeSheet(task.id)}
      >
        推迟
      </button>
      <button
        className="action-btn action-btn--delete"
        onClick={() => confirmDelete(task.id)}
      >
        删除
      </button>
    </div>
  </div>
)
```

**Sheet 尺寸行为**

```css
/* index.css */
.task-sheet {
  /* 默认 60vh，上拉可扩展到 92vh */
  height: 60vh;
  max-height: 92vh;
  border-radius: 16px 16px 0 0;
  
  /* 过渡动画 */
  transition: height 0.3s cubic-bezier(0.32, 0.72, 0, 1);
}

.task-sheet--expanded {
  height: 92vh;
}

/* 底部操作栏：始终在 safe-area 上方 */
.task-sheet__action-bar {
  position: sticky;
  bottom: 0;
  padding-bottom: env(safe-area-inset-bottom);
  background: var(--surface-primary);
  border-top: 1px solid var(--border-subtle);
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  padding-bottom: calc(12px + env(safe-area-inset-bottom));
}
```

---

### Task 2.4 · 移动端时间选择器

**现状**：使用原生 `datetime-local`，iOS 上体验差（小且难操作）。

**三级降级策略**（对标 Todoist）

```typescript
// features/quick-entry/TaskDatePicker.tsx
type PickerStage = 'shortcuts' | 'calendar' | 'wheel'

const SHORTCUTS = [
  { label: '今天', getValue: () => getTodayIso() },
  { label: '明天', getValue: () => getTomorrowIso() },
  { label: '后天', getValue: () => getDayAfterTomorrowIso() },
  { label: '下周一', getValue: () => getNextMondayIso() },
  { label: '下周末', getValue: () => getNextWeekendIso() },
  { label: '一个月后', getValue: () => getMonthLaterIso() },
]

export function TaskDatePicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [stage, setStage] = useState<PickerStage>('shortcuts')
  const [open, setOpen] = useState(false)

  return (
    <>
      <button className="date-trigger" onClick={() => setOpen(true)}>
        {value ? formatDateForDisplay(value) : '设置日期'}
      </button>

      {open && (
        <BottomSheet onClose={() => setOpen(false)}>
          {stage === 'shortcuts' && (
            <div className="date-shortcuts">
              {SHORTCUTS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => { onChange(s.getValue()); setOpen(false) }}
                >
                  {s.label}
                </button>
              ))}
              <button onClick={() => setStage('calendar')}>选择日期 →</button>
            </div>
          )}

          {stage === 'calendar' && (
            <MiniCalendar
              value={value}
              onChange={(v) => { onChange(v); setOpen(false) }}
              onRequestWheel={() => setStage('wheel')}
            />
          )}

          {stage === 'wheel' && (
            <WheelTimePicker
              value={value}
              onChange={(v) => { onChange(v); setOpen(false) }}
            />
          )}
        </BottomSheet>
      )}
    </>
  )
}
```

---

### Task 2.5 · 焦点页三段分组完善

**现状**：`MobileFocusView` 已有基础（App.tsx L2746），但过期任务处理和视觉强调不足。

**完善内容**

```typescript
// features/views/focus/MobileFocusView.tsx
interface FocusSegments {
  overdue: Task[]    // 今天之前未完成
  today: Task[]      // 今天安排的任务
  upcoming: Task[]   // 未来安排（7天内）
  someday: Task[]    // 无日期
}

export function MobileFocusView({ segments }: { segments: FocusSegments }) {
  const [upcomingCollapsed, setUpcomingCollapsed] = useState(true)
  const total = segments.overdue.length + segments.today.length
  const completed = segments.today.filter((t) => t.completed).length

  return (
    <div className="focus-view">
      {/* 进度条（Todoist 风格） */}
      <div className="focus-progress">
        <div
          className="focus-progress__bar"
          style={{ width: total > 0 ? `${(completed / total) * 100}%` : '0%' }}
        />
        <span className="focus-progress__label">
          {completed}/{total} 已完成
        </span>
      </div>

      {/* 过期任务（醒目警告） */}
      {segments.overdue.length > 0 && (
        <section className="focus-segment focus-segment--overdue">
          <h3 className="focus-segment__header">
            <span className="overdue-badge">⚠️ {segments.overdue.length} 个逾期</span>
          </h3>
          <TaskList tasks={segments.overdue} />
          {/* 批量处理入口 */}
          <button className="bulk-resolve-btn" onClick={openOverdueResolver}>
            一键处理逾期任务
          </button>
        </section>
      )}

      {/* 今日任务 */}
      <section className="focus-segment focus-segment--today">
        <h3 className="focus-segment__header">今天</h3>
        <TaskList tasks={segments.today} />
      </section>

      {/* 即将到来（可折叠） */}
      {segments.upcoming.length > 0 && (
        <section className="focus-segment focus-segment--upcoming">
          <button
            className="focus-segment__header focus-segment__header--collapsible"
            onClick={() => setUpcomingCollapsed((v) => !v)}
          >
            即将到来 {upcomingCollapsed ? '▶' : '▼'}
          </button>
          {!upcomingCollapsed && <TaskList tasks={segments.upcoming} />}
        </section>
      )}
    </div>
  )
}
```

**CSS 优先级左边框色系**（增加视觉层次）

```css
/* index.css */
.task-row[data-priority="urgent"] { border-left: 3px solid #ff3b30; }
.task-row[data-priority="high"]   { border-left: 3px solid #ff9500; }
.task-row[data-priority="medium"] { border-left: 3px solid #007aff; }
.task-row[data-priority="low"]    { border-left: 3px solid #8e8e93; }

/* 逾期任务 */
.focus-segment--overdue .task-row {
  background: rgba(255, 59, 48, 0.06);
}
```

---

### Task 2.6 · 看板视图移动端单列模式

**现状**：看板视图在手机端横向显示多列，需要左右滚动，体验差。

**修复**

```typescript
// features/views/kanban/KanbanView.tsx
const { isPhone } = useDevice()

// 手机端：单列显示 + 顶部分组选择器
if (isPhone) {
  return (
    <div className="kanban-mobile">
      {/* 顶部分组切换（类似 segmented control） */}
      <div className="kanban-mobile__column-switcher">
        {columns.map((col) => (
          <button
            key={col.status}
            className={activeColumn === col.status ? 'is-active' : ''}
            onClick={() => setActiveColumn(col.status)}
          >
            {col.label}
            <span className="column-count">{col.tasks.length}</span>
          </button>
        ))}
      </div>
      
      {/* 当前列的任务 */}
      <TaskList
        tasks={columns.find((c) => c.status === activeColumn)?.tasks ?? []}
        onSelectTask={onSelectTask}
        onToggleComplete={onToggleComplete}
      />
    </div>
  )
}

// 桌面端：保持原有多列布局
return <KanbanDesktopLayout columns={columns} ... />
```

---

### Task 2.7 · NLP 实时 Token Chips

**现状**：输入框只有纯文字，NLP 解析结果无实时反馈（只有提交后才生效）。

**升级**

```typescript
// features/quick-entry/SmartEntryInput.tsx
import { parseSmartEntry } from '../../utils/smart-entry'

interface ParsedChips {
  date?: string       // "明天" → "4月11日"
  time?: string       // "10:30"
  priority?: string   // "高优先级"
  tags?: string[]     // ["工作", "会议"]
  list?: string       // "工作清单"
}

export function SmartEntryInput({ onSubmit }: { onSubmit: (title: string) => void }) {
  const [value, setValue] = useState('')
  const [chips, setChips] = useState<ParsedChips>({})
  const [cleanTitle, setCleanTitle] = useState('')

  const handleChange = (raw: string) => {
    setValue(raw)
    // 每次输入都解析（有 140ms 防抖）
    const result = parseSmartEntry(raw)
    setCleanTitle(result.title)
    setChips({
      date: result.dueAt ? formatDateShort(result.dueAt) : undefined,
      time: result.startAt ? formatTimeShort(result.startAt) : undefined,
      priority: result.priority ? PRIORITY_LABELS[result.priority] : undefined,
      tags: result.tagIds?.map((id) => getTagName(id)),
    })
  }

  return (
    <div className="smart-entry">
      {/* 解析出的 chips 在输入框上方实时显示 */}
      {Object.keys(chips).length > 0 && (
        <div className="nlp-chips">
          {chips.date && (
            <span className="nlp-chip nlp-chip--date">📅 {chips.date}</span>
          )}
          {chips.time && (
            <span className="nlp-chip nlp-chip--time">⏰ {chips.time}</span>
          )}
          {chips.priority && (
            <span className={`nlp-chip nlp-chip--priority nlp-chip--${chips.priority}`}>
              ! {chips.priority}
            </span>
          )}
          {chips.tags?.map((tag) => (
            <span key={tag} className="nlp-chip nlp-chip--tag">#{tag}</span>
          ))}
        </div>
      )}

      <input
        className="smart-entry__input"
        placeholder='输入任务… 支持"明天 10点 #工作 !高"'
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && cleanTitle.trim()) {
            onSubmit(value)
            setValue('')
            setChips({})
          }
        }}
        style={{ fontSize: 16 }}  // 防 iOS 缩放
      />
    </div>
  )
}
```

```css
/* NLP Chips 样式 */
.nlp-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 4px 8px;
}

.nlp-chip {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.nlp-chip--date    { background: #e3f2fd; color: #1565c0; }
.nlp-chip--time    { background: #e8f5e9; color: #2e7d32; }
.nlp-chip--tag     { background: #f3e5f5; color: #6a1b9a; }

.nlp-chip--priority[data-level="urgent"] { background: #ffebee; color: #c62828; }
.nlp-chip--priority[data-level="high"]   { background: #fff3e0; color: #e65100; }
.nlp-chip--priority[data-level="medium"] { background: #e3f2fd; color: #1565c0; }
```

---

## Phase 3 · 精细打磨（建议 5-6 月）

> 目标：从"好用"到"好看好用"，体验对标 Things 3。

---

### Task 3.1 · CSS 变量主题系统（深色模式）

**现状**：`useSystemTheme.ts` 已检测系统深色，但 CSS 变量体系可能不完整。

**完善**

```css
/* index.css：补全深色模式色彩体系 */
:root {
  /* 背景 */
  --bg-primary: #ffffff;
  --bg-secondary: #f2f2f7;
  --bg-tertiary: #e5e5ea;
  
  /* 表面（卡片/Sheet） */
  --surface-primary: #ffffff;
  --surface-overlay: rgba(0, 0, 0, 0.04);
  
  /* 文字 */
  --text-primary: #000000;
  --text-secondary: #6c6c70;
  --text-tertiary: #aeaeb2;
  
  /* 边界 */
  --border-opaque: #c6c6c8;
  --border-subtle: rgba(0, 0, 0, 0.08);
  
  /* 强调色 */
  --accent-blue: #007aff;
  --accent-green: #34c759;
  --accent-red: #ff3b30;
  --accent-orange: #ff9500;
  
  /* 优先级 */
  --priority-urgent: #ff3b30;
  --priority-high: #ff9500;
  --priority-medium: #007aff;
  --priority-low: #8e8e93;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg-primary: #000000;
    --bg-secondary: #1c1c1e;
    --bg-tertiary: #2c2c2e;
    --surface-primary: #1c1c1e;
    --surface-overlay: rgba(255, 255, 255, 0.06);
    --text-primary: #ffffff;
    --text-secondary: #ebebf5cc;
    --text-tertiary: #ebebf54d;
    --border-opaque: #38383a;
    --border-subtle: rgba(255, 255, 255, 0.1);
    /* 强调色在深色下略调亮 */
    --accent-blue: #0a84ff;
    --accent-green: #30d158;
    --accent-red: #ff453a;
    --accent-orange: #ff9f0a;
  }
}
```

**迁移策略**：全局搜索硬编码颜色（如 `#007aff`, `rgba(0,0,0,0.1)` 等），逐步替换为 CSS 变量。

---

### Task 3.2 · 统一拖拽逻辑（消除 4 处重复代码）

**现状**：日历/看板/四象限/时间线各自实现了相同的 pointerdown→move→up 逻辑（见 App.tsx L3893, L4279, L4751, L4517）。

**统一为通用 Hook**

```typescript
// shared/hooks/useDragSession.ts
interface DragSession<T> {
  source: T
  startX: number
  startY: number
  currentX: number
  currentY: number
}

export function useDragSession<T>(options: {
  onDragStart?: (source: T, x: number, y: number) => void
  onDragMove?: (session: DragSession<T>, dx: number, dy: number) => void
  onDragEnd?: (session: DragSession<T>) => void
  onDragCancel?: () => void
}) {
  const sessionRef = useRef<DragSession<T> | null>(null)

  return {
    startDrag: (source: T, e: React.PointerEvent) => {
      sessionRef.current = {
        source,
        startX: e.clientX,
        startY: e.clientY,
        currentX: e.clientX,
        currentY: e.clientY,
      }
      options.onDragStart?.(source, e.clientX, e.clientY)
      ;(e.target as Element).setPointerCapture(e.pointerId)
    },
    handlers: {
      onPointerMove: (e: React.PointerEvent) => {
        const s = sessionRef.current
        if (!s) return
        s.currentX = e.clientX
        s.currentY = e.clientY
        options.onDragMove?.(s, e.clientX - s.startX, e.clientY - s.startY)
      },
      onPointerUp: (e: React.PointerEvent) => {
        const s = sessionRef.current
        if (!s) return
        options.onDragEnd?.(s)
        sessionRef.current = null
      },
      onPointerCancel: () => {
        options.onDragCancel?.()
        sessionRef.current = null
      },
    },
  }
}

// 各视图使用示例（原来 80-98 行代码简化为 ~20 行）
const { startDrag, handlers } = useDragSession<{ taskId: string; date: string }>({
  onDragStart: (source) => setDragPreview({ taskId: source.taskId }),
  onDragMove: (session, dx, dy) => updateDragPosition(dx, dy),
  onDragEnd: (session) => commitDrop(session.source, targetDate),
  onDragCancel: () => setDragPreview(null),
})
```

---

### Task 3.3 · 乐观更新 + 撤销 Toast

**现状**：每次操作（完成/删除/推迟）都等待同步确认，手机端网络差时卡顿明显。

**实现**

```typescript
// stores/useDataStore.ts 中的乐观更新模式
completeTask: (id: string) => {
  // 1. 立即更新本地状态（乐观）
  set((s) => ({
    tasks: s.tasks.map((t) => t.id === id ? { ...t, completed: true } : t),
  }))
  
  // 2. 显示可撤销 Toast（3秒内可撤销）
  showUndoToast({
    message: '已完成',
    onUndo: () => {
      set((s) => ({
        tasks: s.tasks.map((t) => t.id === id ? { ...t, completed: false } : t),
      }))
    },
    duration: 3000,
  })
  
  // 3. 后台同步（失败时静默回滚）
  syncTask(id, { completed: true }).catch(() => {
    set((s) => ({
      tasks: s.tasks.map((t) => t.id === id ? { ...t, completed: false } : t),
    }))
    showErrorToast('同步失败，操作已回滚')
  })
},
```

---

### Task 3.4 · 视图滚动位置保持

**现状**：切换视图时，日历的日期位置、时间线的缩放级别、看板的折叠状态全部丢失。

**实现**

```typescript
// stores/useUIStore.ts 中增加视图状态
interface ViewState {
  calendar: {
    focusDate: string    // 当前聚焦的日期
    mode: 'month' | 'week' | 'day'
  }
  timeline: {
    zoomLevel: number
    scrollOffset: number
  }
  kanban: {
    collapsedColumns: string[]
    activeColumn: string  // 移动端单列模式的当前列
  }
  matrix: {
    expandedQuadrants: string[]
  }
}
```

---

### Task 3.5 · 空状态情感化

**现状**：空列表只有简单提示文字。

**分场景设计**（对标 Things 3 风格）

```typescript
// shared/components/EmptyState.tsx
const EMPTY_STATE_CONFIG = {
  'focus-all-done': {
    illustration: '🎉',
    title: '今天的任务都完成了！',
    subtitle: '享受这段属于自己的时光',
    action: null,
  },
  'focus-no-tasks': {
    illustration: '☀️',
    title: '今天还没有安排',
    subtitle: '点击右下角的 + 开始计划今天',
    action: null,
  },
  'search-no-results': {
    illustration: '🔍',
    title: '没有找到相关任务',
    subtitle: '试试其他关键词，或创建这个新任务',
    action: { label: '创建「{keyword}」', handler: () => openQuickCreate() },
  },
  'project-empty': {
    illustration: '📋',
    title: '这个项目还是空的',
    subtitle: '添加第一个任务，迈出第一步',
    action: { label: '添加任务', handler: () => openInlineCreate() },
  },
} as const
```

---

## 三段时间模型的渐进披露方案

> 这是 TaskFlow 的核心差异化功能，但需要降低新用户的认知门槛。

```
新用户（默认模式）
└── 只看到「截止时间」(dueAt)
    → 文案："什么时候必须完成？"

进阶用户（在设置中开启「专业模式」）
├── 「开始时间」(startAt) — 文案："什么时候开始？"
├── 「截止时间」(dueAt) — 文案："计划什么时候完成？"
└── 「最终期限」(deadlineAt) — 文案："最晚不能超过什么时候？"
```

```typescript
// TaskSheet 中的条件渲染
const { expertMode } = useUserSettings()

{/* 所有用户都能看到 */}
<TaskDatePicker field="dueAt" label="截止时间" value={task.dueAt} onChange={...} />

{/* 仅专业模式可见 */}
{expertMode && (
  <>
    <TaskDatePicker field="startAt" label="开始时间" value={task.startAt} onChange={...} />
    <TaskDatePicker field="deadlineAt" label="最终期限" value={task.deadlineAt} onChange={...} />
  </>
)}

{/* 引导入口（普通用户） */}
{!expertMode && (task.startAt || task.deadlineAt) && (
  <button className="expert-mode-hint" onClick={openExpertModeSettings}>
    此任务设有开始时间/最终期限 → 开启专业模式查看
  </button>
)}
```

---

## 关于时间线视图（特别建议）

**建议手机端隐藏时间线视图，理由如下**：

| 维度 | 说明 |
|---|---|
| 可用性 | 390px 宽度甘特图，每个任务条宽度不足 20px，无法交互 |
| 认知负担 | 5 个 Tab 对新用户而言太多，减为 4 个更聚焦 |
| 现有替代 | 日历视图的「周」模式已能满足时间维度的需求 |
| 实施成本 | 只需在 `WorkspaceBottomNav.tsx` 的 tab 配置中移除，不删除组件代码 |

```typescript
// features/workspace/WorkspaceBottomNav.tsx
const { isPhone } = useDevice()

const TABS = [
  { id: 'focus', label: '焦点', icon: '◎' },
  { id: 'calendar', label: '日历', icon: '📅' },
  { id: 'matrix', label: '象限', icon: '⊞' },
  { id: 'projects', label: '项目', icon: '📁' },
  { id: 'me', label: '我的', icon: '👤' },
  // 时间线：仅桌面端，手机端不渲染此 tab
  ...(!isPhone ? [{ id: 'timeline', label: '时间线', icon: '📊' }] : []),
]
```

---

## 优先级总览

| 优先级 | Task | 依赖 | 估算工时 |
|---|---|---|---|
| **P0** | 1.1 App.tsx 模块拆分 | 无 | 3-5天 |
| **P0** | 1.2 Zustand 状态管理 | 1.1 | 2-3天 |
| **P0** | 1.3 统一断点修复 | 1.1 | 0.5天 |
| **P0** | 1.4 虚拟列表 | 1.1 | 1天 |
| **P0** | 1.5 iOS 输入框修复 | 无 | 0.5天 |
| **P1** | 2.1 滑动手势 | 1.1, 1.2 | 2天 |
| **P1** | 2.2 长按多选 | 1.1, 1.2 | 1天 |
| **P1** | 2.3 TaskSheet 三层架构 | 1.1 | 2天 |
| **P1** | 2.4 移动端时间选择器 | 1.1 | 2-3天 |
| **P1** | 2.5 焦点页完善 | 1.2 | 1天 |
| **P1** | 2.6 看板单列模式 | 1.1, 1.3 | 1天 |
| **P1** | 2.7 NLP 实时 chips | 1.1 | 1-2天 |
| **P2** | 3.1 深色模式 CSS 变量 | 无（可并行） | 2天 |
| **P2** | 3.2 统一拖拽 Hook | 1.1 | 2天 |
| **P2** | 3.3 乐观更新 | 1.2 | 1-2天 |
| **P2** | 3.4 视图状态保持 | 1.2 | 1天 |
| **P2** | 3.5 空状态情感化 | 1.1 | 1天 |

---

## 快速开始（第一周可做的事）

如果只有 1 周时间，按这个顺序：

```
Day 1-2: Task 1.3（断点修复）+ Task 1.5（iOS 输入框修复）
  → 零风险，立即可测，视觉可见
  
Day 3: Task 2.6（看板单列模式）
  → 改动小，效果显著
  
Day 4-5: Task 1.4（虚拟列表）
  → 独立组件，可以单独集成进现有代码
  
1周验收: 手机端基础体验已有明显改善，为 Phase 1 大重构建立信心
```

---

*文档基于 TaskFlow 代码实际分析生成，所有行号引用对应 `web/src/App.tsx`（6854行版本）*
