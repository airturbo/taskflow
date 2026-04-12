# TaskFlow 架构与实现细节补充

## 1. 数据流向与架构

### 整体架构图

```
┌──────────────────────────────────────────────────────────────┐
│                         Web 应用 (React)                      │
│                     App.tsx (主组件)                          │
└──────────────────────┬───────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
    ┌───▼─────┐  ┌────▼────┐  ┌─────▼───┐
    │ Storage │  │ Hooks   │  │Components│
    │  Layer  │  │ Layer   │  │  Layer   │
    │(IndexDB)│  │(Sync...) │  │(UI)      │
    └────┬────┘  └────┬────┘  └─────┬────┘
         │            │             │
         └────────────┼─────────────┘
                      │
         ┌────────────▼─────────────┐
         │   @taskflow/core 库      │
         │  - 数据结构 (domain.ts) │
         │  - 选择器 (selectors.ts)│
         │  - 算法 (dates/repeat)  │
         └────────────┬─────────────┘
                      │
        ┌─────────────┼──────────────┐
        │             │              │
    ┌───▼────┐   ┌───▼────┐   ┌────▼────┐
    │LocalDB │   │Supabase│   │Obsidian │
    │(IDBX) │   │(Cloud) │   │Plugin   │
    └────────┘   └────────┘   └─────────┘
```

### 状态管理流

```
用户输入
   │
   ▼
解析 (parseSmartEntry)
   │
   ▼
创建/修改任务
   │
   ▼
应用到本地状态 (React State)
   │
   ▼
保存到 IndexedDB (localStorage)
   │
   ▼
后台同步到 Supabase
   │
   ▼
其他设备实时同步 (Realtime)
```

## 2. 关键类型别名解读

### TimeFieldMode 的用途

```typescript
type TimeFieldMode = 'planned' | 'deadline'

// 在日历/列表视图中切换显示维度
// 用户场景:
// - 'planned': 我什么时候计划完成?
// - 'deadline': 我最后必须在什么时候完成?

// 应用场景
"今日视图" + TimeFieldMode='planned'
  → 显示 dueAt = 今天 的任务
  
"今日视图" + TimeFieldMode='deadline'
  → 显示 deadlineAt = 今天 的任务
  
// 若 deadline 已过期但 planned 未来
// 这两个视图会显示不同的任务集合
```

### WorkspaceView 类型

```typescript
type WorkspaceView = 'list' | 'calendar' | 'kanban' | 'timeline' | 'matrix'

// 每种视图的特点
'list'     // 线性列表，支持拖拽排序
'calendar' // 月/周/日月视图，按 dueAt 或 startAt 分组
'kanban'   // 按状态 (todo/doing/done) 分列
'timeline' // 时间轴，可视化时间块，支持拖拽编辑时间
'matrix'   // 四象限矩阵，按 urgent + important 分象限
```

## 3. 关键算法解析

### 任务风险检测算法

```typescript
// 位置: selectors.ts
export const isTaskRiskOverdue = (task: Task) => {
  return !task.completed && isOverdue(getTaskRiskAt(task))
}

const getTaskRiskAt = (task: Task) => {
  // 优先级: DDL > 计划完成
  return task.deadlineAt ?? task.dueAt
}

// 应用场景:
// - 标记任务为"过期" (red icon)
// - 在"今日"视图中提示用户
// - 生成"过期风险"统计
```

### 子任务完成度计算

```typescript
// (隐含的逻辑，在 App.tsx 中)
const getSubtaskProgress = (task: Task) => {
  const total = task.subtasks.length
  if (total === 0) return null
  
  const completed = task.subtasks.filter(s => s.completed).length
  return {
    completed,
    total,
    percent: Math.round((completed / total) * 100)
  }
}

// 使用场景:
// - 进度条显示
// - 标题后缀 "3/5" 
// - 快速判断工作量
```

### 时间线可见性检查

```typescript
// 位置: timeline.ts
export function isTaskVisibleInTimelineWindow(
  task: Task,
  windowStart: number,  // ms
  windowEnd: number     // ms
) {
  const range = getTaskTimelineRange(task)
  // 任务时间块与视图窗口有重叠即可见
  return Boolean(range && range.start < windowEnd && range.end > windowStart)
}

// 这避免了渲染屏外任务，提高性能
```

### 提醒触发计算

```typescript
// 位置: reminder-engine.ts
export const getReminderTriggerAt = (task: Task, reminder: Reminder) => {
  // 绝对时间: 直接返回
  if (reminder.kind === 'absolute') {
    return getDateTimeMs(reminder.value, 'start')
  }
  
  // 相对时间: 计算触发时间 = 锚点 - 偏移
  const parsed = parseRelativeReminder(reminder.value)
  const anchor = getReminderAnchor(task, reminder)
  const anchorAt = getDateTimeMs(
    anchor?.value ?? null,
    anchor?.kind === 'deadline' ? 'end' : 'start'
  )
  
  if (!parsed || !anchorAt) return null
  
  return anchorAt - parsed.minutes * MINUTE
}

// 例子:
// 任务 dueAt='2024-04-10T17:00'
// 提醒 '30m' (相对 dueAt 前 30 分钟)
// → triggerAt = 17:00 - 30m = 16:30
```

## 4. 存储架构

### IndexedDB 存储结构

```typescript
// 应用整个 PersistedState 结构
interface PersistedState {
  folders: Folder[]
  lists: TodoList[]
  tags: Tag[]
  filters: SavedFilter[]
  tasks: Task[]
  
  // UI 状态
  theme: ThemeMode
  activeSelection: string          // 当前选中的列表/标签
  selectedTagIds: string[]         // 当前筛选的标签
  selectionTimeModes?: Partial<Record<TimeSelectionKey, TimeFieldMode>>
  currentView: WorkspaceView
  calendarMode: CalendarMode
  calendarShowCompleted: boolean
  timelineScale: TimelineScale
  
  // 提醒状态
  firedReminderKeys: string[]      // 已发射过的提醒
  
  // 新手指引
  onboarding: OnboardingState
}

// 存储到 localStorage 作为 JSON blob
// 键: 'taskflow:state:userId:deviceId'
```

### Supabase 表结构

#### profiles 表
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  subscription_tier ENUM('free', 'pro', 'team'),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
```

#### workspace_states 表
```sql
CREATE TABLE workspace_states (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  device_id TEXT NOT NULL,
  state_json JSON,  -- 存储整个 PersistedState
  schema_version INT,
  updated_at TIMESTAMP
)
```

#### sync_cursors 表
```sql
CREATE TABLE sync_cursors (
  user_id UUID NOT NULL,
  device_id TEXT NOT NULL,
  last_synced_at TIMESTAMP,
  PRIMARY KEY(user_id, device_id)
)
```

## 5. 重复任务的边界情况处理

### 场景 1: Deadline 相对于 DueAt 的偏移

```typescript
// 输入任务
task = {
  id: 'task-1',
  dueAt: '2024-04-10',      // 计划完成
  deadlineAt: '2024-04-12', // 硬性截止
  repeatRule: 'daily'
}

// 完成后生成新任务
nextTask = {
  id: 'task-2',  // 新 ID
  dueAt: '2024-04-11',      // +1 天
  deadlineAt: '2024-04-13', // +1 天(保持 2 天偏移)
  completed: false,
  completedPomodoros: 0,
  focusMinutes: 0,
  subtasks: [],
  activity: []
}

// 关键: 维持 deadline - dueAt = 2 天 的关系
```

### 场景 2: 无 DueAt 的重复任务

```typescript
task = {
  repeatRule: 'weekly',
  dueAt: null,  // 🔴 无到期时间
  startAt: '2024-04-10'
}

// 调用 createNextRepeatTask 返回 null
// 🎯 因为没有 dueAt，无法计算下一周期
// → 用户必须设置 dueAt 才能启用重复
```

## 6. 提醒的复杂场景

### 场景 1: 三个提醒+三个时间点

```typescript
task = {
  startAt: '2024-04-10T08:00',      // 开始
  dueAt: '2024-04-10T17:00',        // 计划完成
  deadlineAt: '2024-04-11T18:00',   // DDL
  
  reminders: [
    { id: 'r1', kind: 'relative', value: 'start|15m', label: '会议前 15 分钟' },
    { id: 'r2', kind: 'relative', value: 'planned|0m', label: '计划完成时' },
    { id: 'r3', kind: 'relative', value: 'deadline|2h', label: 'DDL 前 2 小时' }
  ]
}

// 触发时间:
// r1: 08:00 - 15m = 07:45 (相对 startAt)
// r2: 17:00 - 0m = 17:00 (相对 dueAt)
// r3: 18:00 - 2h = 16:00 (相对 deadlineAt)

// 去重键:
// 'reminder:task:r1:07:45'
// 'reminder:task:r2:17:00'
// 'reminder:task:r3:16:00'
```

### 场景 2: 禁用提醒 (缺少锚点)

```typescript
task = {
  dueAt: null,
  deadlineAt: null,
  startAt: null,  // 🔴 没有任何时间
  
  reminders: [
    { kind: 'relative', value: '1h', label: '提前 1 小时' }
  ]
}

// getReminderAnchor(task, reminder) → null
// getReminderTriggerAt(task, reminder) → null
// describeReminder 返回:
{
  label: '提前 1 小时',
  triggerAt: null,
  triggerAtLabel: '需要先补对应时间',
  disabledReason: '请先给任务设置对应的开始/计划/DDL时间'
}

// UI 显示为灰色禁用状态
```

## 7. 自然语言解析示例

### 位置: smart-entry.ts

```typescript
// 示例 1: 完整表达式
parseSmartEntry('明天下午2点开会 #工作 !高')
→ {
    title: '开会',
    rawInput: '明天下午2点开会 #工作 !高',
    dueAt: '2024-04-11T14:00',  // 明天 2pm
    tagNames: ['工作'],
    priority: 'high'
  }

// 示例 2: 相对时间
parseSmartEntry('3天后完成报告 #报告')
→ {
    title: '完成报告',
    dueAt: '2024-04-13',  // 3 天后
    tagNames: ['报告'],
    priority: null
  }

// 示例 3: 下周时间
parseSmartEntry('下周一上午9点评审 #项目 !紧急')
→ {
    title: '评审',
    dueAt: '2024-04-15T09:00',  // 下个周一 9am
    tagNames: ['项目'],
    priority: 'urgent'
  }

// 示例 4: 多标签
parseSmartEntry('采购物品 #采购 #办公室 !普通')
→ {
    title: '采购物品',
    dueAt: null,  // 无时间表达
    tagNames: ['采购', '办公室'],
    priority: 'normal'
  }
```

### 日期识别规则 (优先级递减)

```
1. 相对天数: "N天后", "N周后", "N个月后"
2. 下周+星期: "下周一", "下个周五"
3. 下月: "下个月", "下月5号"
4. 今/明/后: "今天", "明天", "后天"
5. 本周+星期: "本周三", "这周五"

优先级: 只能匹配一个, 一旦匹配到就停止
```

## 8. 四象限矩阵的标签操作

### 获取象限

```typescript
const getQuadrant = (task: Task): MatrixQuadrantKey => {
  const urgent = task.tagIds.includes(SPECIAL_TAG_IDS.urgent)
  const important = task.tagIds.includes(SPECIAL_TAG_IDS.important)
  
  if (urgent && important) return 'q1'      // 紧急且重要
  if (!urgent && important) return 'q2'     // 重要不紧急
  if (urgent && !important) return 'q3'     // 紧急不重要
  return 'q4'                               // 不紧急不重要
}
```

### 修改象限 (改变标签)

```typescript
const getTagIdsForQuadrant = (tagIds: string[], quadrant: MatrixQuadrantKey) => {
  const next = new Set(
    // 移除所有特殊标签
    tagIds.filter(tagId => 
      ![SPECIAL_TAG_IDS.urgent, SPECIAL_TAG_IDS.important].includes(tagId)
    )
  )
  
  // 根据目标象限添加特殊标签
  if (quadrant === 'q1' || quadrant === 'q3') next.add(SPECIAL_TAG_IDS.urgent)
  if (quadrant === 'q1' || quadrant === 'q2') next.add(SPECIAL_TAG_IDS.important)
  
  return Array.from(next)
}

// 示例
getTagIdsForQuadrant(['tag-123', 'tag-456'], 'q1')
→ ['tag-123', 'tag-456', 'tag-urgent', 'tag-important']

getTagIdsForQuadrant(['tag-123', 'tag-urgent'], 'q2')
→ ['tag-123', 'tag-important']  // 移除 urgent，添加 important
```

## 9. 投影距离排序

### 概念

```typescript
// 不同视图有不同的"锚点":
// - Calendar: 以 dueAt 为锚点
// - Timeline: 以 startAt 为优先，其次 dueAt
// - Matrix: 以 dueAt 为锚点

// 排序逻辑: 靠近"参考日期"的任务排前面
// 参考日期通常是"今天"或"当前视图焦点日期"
```

### 实现

```typescript
const compareTasksByProjectionDistance = (
  left: Task,
  right: Task,
  anchorDateKey: string,  // 参考日期, e.g., '2024-04-10'
  view: WorkspaceView
): number => {
  const leftAnchor = getProjectionAnchorDateKey(left, view)
  const rightAnchor = getProjectionAnchorDateKey(right, view)
  
  // 1. 都有锚点: 按距离排序
  if (leftAnchor && rightAnchor) {
    const leftDist = Math.abs(diffDateKeys(anchorDateKey, leftAnchor))
    const rightDist = Math.abs(diffDateKeys(anchorDateKey, rightAnchor))
    const distance = leftDist - rightDist
    if (distance !== 0) return distance
    return leftAnchor.localeCompare(rightAnchor)
  }
  
  // 2. 只有一个有锚点: 有锚点的排前
  if (leftAnchor) return -1
  if (rightAnchor) return 1
  
  // 3. 都无锚点: 按标题中文排序
  return left.title.localeCompare(right.title, 'zh-CN')
}

// 示例
tasks = [
  { id: 'a', title: '明天的任务', dueAt: '2024-04-11' },
  { id: 'b', title: '后天的任务', dueAt: '2024-04-12' },
  { id: 'c', title: '下周的任务', dueAt: '2024-04-17' }
]
anchorDateKey = '2024-04-10'  // 今天

// 距离:
// a: |10 - 11| = 1 天
// b: |10 - 12| = 2 天
// c: |10 - 17| = 7 天

// 排序结果: [a, b, c]
```

## 10. 优先级与色值体系

### 优先级元数据

```typescript
const priorityMeta: Record<Priority, { label: string; short: string; color: string }> = {
  urgent: { label: '紧急', short: 'P1', color: '#ff6b7a' },  // 红
  high: { label: '高', short: 'P2', color: '#ffb454' },      // 橙
  normal: { label: '普通', short: 'P3', color: '#7c9cff' },  // 蓝
  low: { label: '低', short: 'P4', color: '#93c5fd' },       // 浅蓝
}
```

### 标签色板

```typescript
const TAG_COLOR_PRESETS = [
  '#7c9cff',  // 蓝 (与 normal priority 同)
  '#54d2a0',  // 绿
  '#ffb454',  // 橙 (与 high priority + important tag 同)
  '#a78bfa',  // 紫
  '#93c5fd',  // 浅蓝 (与 low priority 同)
  '#ff6b7a',  // 红 (与 urgent priority + urgent tag 同)
  '#34d399',  // 青
  '#f472b6'   // 粉
]
```

### 色值应用逻辑

```typescript
// 优先级 badge: 使用 priorityMeta.color
<Badge color={priorityMeta[task.priority].color} />

// 标签 badge: 使用 tag.color
<Badge color={tag.color} />

// 特殊标签自动分配:
// - urgent: '#ff6b7a'
// - important: '#ffb454'

// Tone style (用于背景高亮)
const getTagToneStyle = (color: string) => ({
  borderColor: `${color}22`,    // 透明度 22/FF
  background: `${color}12`      // 透明度 12/FF
})

// 示例
getTagToneStyle('#ff6b7a')
→ { borderColor: '#ff6b7a22', background: '#ff6b7a12' }
```

## 11. 时间线拖拽编辑

### 拖拽状态机

```typescript
type TimelineDragMode = 'move' | 'resize-start' | 'resize-end'

interface TimelineDragState {
  taskId: string
  mode: TimelineDragMode
  originX: number          // 鼠标起始 X
  laneWidth: number        // 轨道宽度
  originStart: number      // 原始 startAt (ms)
  originEnd: number        // 原始 dueAt (ms)
  previewStart: number     // 预览 startAt
  previewEnd: number       // 预览 dueAt
  windowStart: number      // 时间线窗口起始 (ms)
  windowEnd: number        // 时间线窗口结束 (ms)
  totalMinutes: number     // 时间线跨度 (分钟)
  stepMinutes: number      // 对齐粒度 (通常 30 分钟)
}

// 鼠标移动时:
// deltaX = currentX - originX
// 转换为时间差: deltaMinutes = (deltaX / laneWidth) * totalMinutes
//
// move 模式: previewStart = originStart + deltaMinutes
//           previewEnd = originEnd + deltaMinutes
//
// resize-start: previewStart = originStart + deltaMinutes (保留 dueAt)
//
// resize-end: previewEnd = originEnd + deltaMinutes (保留 startAt)
//
// 最后: snap to grid (30 分钟)
```

## 12. 已知限制与设计妥协

| 限制项 | 当前行为 | 原因 | 可能改进 |
|-------|--------|------|--------|
| 子任务无嵌套 | 只支持 2 层 | 简化数据模型 | 支持递归树 |
| 提醒最多条数 | 任意(无限制) | 后端存储无限制 | 可考虑限制为 5 条 |
| 文件大小限制 | 1.5 MB | IndexedDB 限制 | 超过时存本地路径 |
| 同步冲突 | 按 updatedAt 时间戳 | 最后写入胜出 | CRDTs 更好但复杂 |
| 时间线粒度 | 30 分钟 | 便于拖拽 UI | 可配置(15/30/60) |
| 评论数据 | 无版本历史 | 简化实现 | 版本控制成本高 |

## 13. 性能考虑

### 关键优化

```typescript
// 1. 快速检查任务状态
if (task.completed) { ... }  // 布尔值，比 task.status === 'done' 快

// 2. 缓存任务统计
const stats = buildTaskStats(tasks)  // 一次计算，缓存结果
// 而不是每次渲染时 filter().length

// 3. 条件渲染 (时间线)
isTaskVisibleInTimelineWindow(task, start, end)
// 只渲染可见任务，屏外任务 skip

// 4. 提醒去重集合
firedReminderKeys = ['reminder:id:time', ...]  // Set 查询 O(1)
// 而不是数组遍历 O(n)

// 5. 选择器函数记忆化
// 需要在应用层使用 useMemo/useCallback

// 6. 状态分片
// 避免单个 super state，分离 UI state 和 domain state
```

### 潜在瓶颈

```
1. 大量任务 (10k+) 时的筛选
2. 每秒多个实时同步消息
3. 时间线拖拽帧数
4. 月历多周渲染
```

## 14. 未来扩展方向

### 可能的功能增强

```
1. 任务模板 (快速重复创建)
2. 循环任务的特殊处理 (skip 规则)
3. 任务链/依赖关系
4. 时间估算 + 实际对比
5. 番茄钟与深度工作时间统计
6. 更复杂的提醒 (location-based, 条件)
7. 评论 at-mention 和通知
8. 离线冲突合并 (CRDT)
9. 快捷键自定义
10. 工作流自动化 (IFTTT 风格)
```

