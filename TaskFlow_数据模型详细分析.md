# TaskFlow 项目数据模型与功能特性深度分析

**分析时间**: 2026-04-10  
**分析范围**: `/Users/turbo/WorkBuddy/20260330162606`

---

## 目录

1. [核心数据结构](#核心数据结构)
2. [任务状态流转](#任务状态流转)
3. [时间系统](#时间系统)
4. [提醒系统](#提醒系统)
5. [重复任务](#重复任务)
6. [子任务实现](#子任务实现)
7. [标签与分类](#标签与分类)
8. [排序与筛选](#排序与筛选)
9. [Core 库架构](#core-库架构)
10. [Obsidian 插件差异](#obsidian-插件差异)
11. [UX 设计决策](#ux-设计决策)

---

## 核心数据结构

### Task 对象完整字段定义

位置: `packages/taskflow-core/src/domain.ts`

```typescript
interface Task {
  // 基础标识
  id: string                                // 唯一标识符
  title: string                             // 任务标题
  note: string                              // 任务描述/备注
  
  // 组织维度
  listId: string                            // 所属列表/项目 ID
  tagIds: string[]                          // 关联标签 ID 数组
  
  // 优先级与状态
  priority: 'urgent' | 'high' | 'normal' | 'low'  // 4 级优先级
  status: 'todo' | 'doing' | 'done'        // 3 态状态
  completed: boolean                        // 完成标志位（与 status 冗余但用于快速查询）
  
  // 时间维度（三层时间模型）
  startAt: string | null                    // 计划开始时间 (ISO 8601)
  dueAt: string | null                      // 计划完成时间 (ISO 8601)
  deadlineAt?: string | null                // 硬性截止时间 (DDL) - 可选
  
  // 重复与提醒
  repeatRule: string                        // 重复规则 (见下文)
  reminders: Reminder[]                     // 提醒列表
  
  // 任务分解
  subtasks: Subtask[]                       // 子任务列表
  
  // 协作与注释
  assignee: string | null                   // 被分配人
  collaborators: string[]                   // 协作者列表
  comments: Comment[]                       // 评论列表
  activity: ActivityItem[]                  // 活动日志
  
  // 焦点与生产力
  estimatedPomodoros: number                // 估计番茄钟数
  completedPomodoros: number                // 已完成番茄钟数
  focusMinutes: number                      // 累计专注时间(分钟)
  
  // 文件与附件
  attachments: TaskAttachment[]             // 附件列表
  
  // 内部元数据
  deleted: boolean                          // 软删除标志
  createdAt: string                         // 创建时间戳 (ISO 8601)
  updatedAt: string                         // 最后修改时间戳 (ISO 8601)
}
```

**字段总数**: 25 个字段  
**核心设计原则**:
- 使用 ISO 8601 格式统一所有时间
- 支持软删除 (deleted 标志)
- 并行支持 status + completed 冗余设计便于快速检查
- deadlineAt 为可选字段，与 dueAt 形成"计划vs硬性"二分

### 相关结构体

#### Folder (文件夹)
```typescript
interface Folder {
  id: string        // 唯一ID
  name: string      // 文件夹名
  color: string     // 色值 (e.g., '#7c9cff')
}
```

#### TodoList (待办列表/项目)
```typescript
interface TodoList {
  id: string                    // 唯一ID
  name: string                  // 列表名
  color: string                 // 色值
  folderId: string | null       // 所属文件夹 ID
  kind: 'system' | 'custom'    // 系统列表还是用户创建
}

// 系统列表包括: inbox, today, upcoming, completed, trash
```

#### Tag (标签)
```typescript
interface Tag {
  id: string        // 唯一ID
  name: string      // 标签名
  color: string     // 色值
}

// 特殊标签 ID (用于矩阵视图)
const SPECIAL_TAG_IDS = {
  urgent: 'tag-urgent',      // 紧急 (红色 #ff6b7a)
  important: 'tag-important'  // 重要 (橙色 #ffb454)
}
```

#### Reminder (提醒)
```typescript
interface Reminder {
  id: string                      // 唯一ID
  label: string                   // 用户自定义标签
  value: string                   // 规则值（见提醒系统）
  kind: 'relative' | 'absolute'  // 相对或绝对时间
}
```

#### Subtask (子任务)
```typescript
interface Subtask {
  id: string        // 唯一ID
  title: string     // 子任务标题
  completed: boolean  // 完成状态
}
```

#### TaskAttachment (任务附件)
```typescript
interface TaskAttachment {
  id: string                              // 唯一ID
  name: string                            // 文件名
  source: 'embedded' | 'desktop-path'    // 嵌入副本或本地路径引用
  path: string | null                     // 文件路径(desktop-path 时有效)
  dataUrl: string | null                  // 数据 URI (embedded 时有效)
  mimeType: string | null                 // MIME 类型
  size: number | null                     // 文件大小字节
  addedAt: string                         // 添加时间
}
```

#### SavedFilter (保存的筛选器)
```typescript
interface SavedFilter {
  id: string                    // 唯一ID
  name: string                  // 筛选器名
  icon: string                  // 图标 emoji
  listIds: string[]            // 包含的列表 ID (空=全部)
  tagIds: string[]             // 必含的标签 ID (空=任意)
  priority: Priority[]          // 包含的优先级 (空=全部)
  due: 'overdue' | 'today' | 'week' | 'none'  // 时间筛选
}
```

---

## 任务状态流转

### 三态状态模型

位置: `packages/taskflow-core/src/domain.ts`

```typescript
type TaskStatus = 'todo' | 'doing' | 'done'

// 状态元数据
const statusMeta: Record<TaskStatus, string> = {
  todo: '待办',
  doing: '进行中',
  done: '已完成',
}

const statusUiMeta: Record<TaskStatus, { icon: string; label: string }> = {
  todo: { icon: '○', label: '待办' },
  doing: { icon: '◔', label: '进行中' },
  done: { icon: '✓', label: '已完成' },
}
```

### 状态流转逻辑

**标准流转**: `todo` → `doing` → `done`

**双向冗余设计** (位置: `selectors.ts`)
```typescript
// status 和 completed 双向同步
if (patch.status) {
  next.completed = patch.status === 'done'
} else if (typeof patch.completed === 'boolean') {
  next.status = patch.completed ? 'done' 
    : task.status === 'done' ? 'todo' : task.status
}
```

**设计原因**:
- `status` 用于精细化的 3 态流程
- `completed` 用于快速布尔判断 (性能优化)
- 两者在修改时自动同步，保证数据一致性

### 完成时的自动行为

**重复任务处理** (位置: `repeat-rule.ts`)
```typescript
export const createNextRepeatTask = (task: T): Omit<T, 'id'> | null => {
  if (!task.repeatRule || !task.dueAt) return null
  
  const nextDue = nextDueDate(task.repeatRule, task.dueAt)
  if (!nextDue) return null
  
  return {
    ...task,
    dueAt: nextDue,
    deadlineAt: 重新计算(保持相对偏移),
    completed: false,
    completedPomodoros: 0,
    focusMinutes: 0,
    subtasks: 重置为未完成,
    activity: []  // 清空活动日志
  }
}
```

---

## 时间系统

### 三层时间模型

TaskFlow 采用**三层递进式时间定义**，允许"计划 vs 现实"的时间差异:

```
startAt (计划开始时间)
    ↓
dueAt (计划完成时间/优先时间)
    ↓
deadlineAt (硬性截止时间 DDL)
```

| 时间字段 | 格式 | 用途 | 示例 |
|---------|------|------|------|
| `startAt` | ISO 8601 | 任务何时开始(可选) | `2024-04-10T09:00` |
| `dueAt` | ISO 8601 | 任务何时完成(主要) | `2024-04-10T17:00` |
| `deadlineAt` | ISO 8601 | 硬性截止(可选) | `2024-04-12T23:59` |

### 时间值规范化

位置: `packages/taskflow-core/src/dates.ts`

```typescript
// 日期键格式 (YYYY-MM-DD)
getDateKey(): '2024-04-10'

// 日期时间格式 (ISO 8601)
getNowIso(): '2024-04-10T15:30:45.123Z'

// 时间字段可以有两种形式
'2024-04-10'      // 仅日期
'2024-04-10T09:00' // 日期+时间
```

### 时间计算工具

```typescript
// 比较
isToday(value)                    // 是否今天
isOverdue(value)                  // 是否已过期
isWithinDays(value, days)        // 是否在 N 天内

// 转换
addDays(dateKey, amount)         // 增加天数
addMonths(dateKey, amount)       // 增加月份
shiftDateTimeByDays(value, days) // 平移时间戳

// 格式化
formatDateTime(value)            // 格式化显示 (今天 14:30)
formatDayLabel(dateKey)          // 格式化日 (06/15 周日)
formatMonthLabel(dateKey)        // 格式化月 (2024 年 4 月)

// 周期
buildWeek(dateKey)              // 获取该周 7 天
buildMonthMatrix(dateKey)       // 获取月份 42 天矩阵
startOfWeek(dateKey)            // 获取周一
```

### 显示模式切换

位置: `selectors.ts`

```typescript
type TimeFieldMode = 'planned' | 'deadline'

// 获取任务在当前模式下显示的时间值
getTaskDisplayTimeValue(task, mode: 'planned' | 'deadline')
  // 若 mode='deadline' 且 deadlineAt 存在，显示 deadlineAt
  // 否则显示 dueAt

// 系统选择 (today/upcoming) 支持切换显示维度
const selectionTimeModes: Partial<Record<TimeSelectionKey, TimeFieldMode>> = {
  today: 'planned',    // 可切换为 'deadline'
  upcoming: 'planned'
}
```

---

## 提醒系统

### 提醒数据结构

位置: `packages/taskflow-core/src/reminder-engine.ts`

```typescript
interface Reminder {
  id: string
  label: string          // 用户可见标签
  value: string          // 规则编码
  kind: 'relative' | 'absolute'
}

// 提醒事件 (触发时)
type ReminderEvent = {
  key: string            // 去重键
  title: string          // "提醒 · 任务标题"
  body: string           // 详细内容
  tone: 'default' | 'danger' | 'success'
  sound: 'reminder'
  taskId: string
  allowSnooze: boolean
}
```

### 相对提醒规则格式

```
格式: [anchor|]amount[unit]
  anchor: 'deadline' | 'planned' | 'start' | 'auto' (默认)
  amount: 正整数
  unit: 'm' | 'h' | 'd' (分钟/小时/天)

示例:
  '15m'              → 到点前 15 分钟
  '1h'               → 到点前 1 小时
  'deadline|2d'      → 相对 DDL 前 2 天
  'planned|0m'       → 计划时间到时提醒
  'start|30m'        → 开始时间前 30 分钟
```

### 绝对提醒

```typescript
// absolute 类型
kind: 'absolute'
value: '2024-04-10T09:00'  // ISO 8601 时间戳
label: '固定时间提醒'
```

### 提醒触发锚点解析

位置: `reminder-engine.ts` 中的 `getReminderAnchor`

```typescript
// 1. 首先检查 reminder 中是否指定了锚点
//    (如 'deadline|15m' 指定以 deadline 为锚)
// 
// 2. 若无指定，根据任务时间优先级自动选择:
//    deadline > dueAt > startAt
//
// 3. 若任务缺少对应时间，提醒被禁用

const getReminderAnchor = (task: Task, reminder?: Reminder | null): ReminderAnchor | null => {
  if (task.deadlineAt) return { kind: 'deadline', value: task.deadlineAt }
  if (task.dueAt) return { kind: 'planned', value: task.dueAt }
  if (task.startAt) return { kind: 'start', value: task.startAt }
  return null
}
```

### 风险时间点检测

```typescript
// 自动检测任务"风险时间"(deadline 或 dueAt)
const getTaskRiskAnchor = (task: Task): ReminderAnchor | null => {
  if (task.deadlineAt) return { kind: 'deadline', value: task.deadlineAt }
  if (task.dueAt) return { kind: 'planned', value: task.dueAt }
  return null
}

// 生成自动 DDL 到期/计划时间到达 的提醒事件
// tone: 'danger' (紧急红色)
```

### 提醒事件集合

位置: `reminder-engine.ts` - `collectReminderEvents`

```typescript
export const collectReminderEvents = (
  tasks: Task[],
  firedReminderKeys: string[],  // 已发射过的提醒去重集
  now = Date.now()
) => {
  const nextKeys = new Set(firedReminderKeys)
  const events: ReminderEvent[] = []
  
  // 对每个未删除/未完成的任务
  // 对每个提醒
  //   如果触发时间 < 现在且未发射过
  //   则生成 ReminderEvent
  
  // 同时检测风险时间 (DDL/dueAt)
  // 生成自动风险提醒
  
  return { events, nextKeys }
}

// 提醒键格式 (用于去重)
'reminder:taskId:reminderId:triggerAtMs'
'due:taskId:triggerAtMs'
```

### 提醒显示描述

```typescript
// 描述提醒 (用于 UI)
describeReminder(task, reminder): ReminderDescription => {
  label: string           // 显示标签
  anchorLabel: string     // 锚点标签 (如 "DDL" "计划完成")
  triggerAt: string | null
  triggerAtLabel: string
  disabledReason?: string // 若禁用，原因是什么
}

// 示例输出:
{
  label: '提前 15 分钟',
  anchorLabel: '按 DDL',
  triggerAt: '2024-04-10T08:45',
  triggerAtLabel: '今天 08:45'
}
```

---

## 重复任务

### 重复规则编码

位置: `packages/taskflow-core/src/repeat-rule.ts`

```typescript
type RepeatRule = 
  | ''                        // 无重复
  | 'daily'                   // 每天
  | 'weekdays'                // 每工作日(周一~五)
  | 'weekly'                  // 每周(同星期几)
  | 'monthly'                 // 每月(同日期)
  | 'yearly'                  // 每年(同月日)
  | `custom:${number}${'d'|'w'|'m'}`  // 自定义: custom:3d (每3天)
```

### 重复规则选项

```typescript
const REPEAT_RULE_OPTIONS = [
  { value: '', label: '不重复' },
  { value: 'daily', label: '每天' },
  { value: 'weekdays', label: '每个工作日' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'yearly', label: '每年' },
  { value: 'custom:2d', label: '每2天' },
  { value: 'custom:3d', label: '每3天' },
  { value: 'custom:2w', label: '每2周' },
]

// 描述规则
describeRepeatRule('custom:3d') → '每 3 天'
describeRepeatRule('weekdays') → '每个工作日'
```

### 下一周期计算

```typescript
const nextDueDate = (rule: string, fromDate: string): string | null => {
  // 根据规则，从 fromDate 计算下一个到期时间
  // 
  // daily:    date + 1 天
  // weekdays: date + 1 天，跳过周末
  // weekly:   date + 7 天
  // monthly:  date + 1 月
  // yearly:   date + 1 年
  // custom:Nd: date + N 天
  // custom:Nw: date + N*7 天
  // custom:Nm: date + N 月
}

// 示例
nextDueDate('daily', '2024-04-10') → '2024-04-11'
nextDueDate('weekdays', '2024-04-12') // 周五 → '2024-04-15' // 周一
nextDueDate('custom:3d', '2024-04-10') → '2024-04-13'
```

### 重复任务完成处理

当重复任务完成时，自动生成下一周期副本:

```typescript
const nextTask = createNextRepeatTask(completedTask)
// 返回的新任务:
{
  ...completedTask,
  dueAt: 下一周期到期时间,
  deadlineAt: 按比例重新计算(保持与 dueAt 的偏移),
  completed: false,
  completedPomodoros: 0,
  focusMinutes: 0,
  subtasks: 全部重置为未完成,
  activity: [] // 清空日志
}
```

**设计特点**:
- 维持 deadline 与 dueAt 的相对时间差
- 番茄钟数重置为 0
- 子任务全部恢复未完成状态
- 活动日志清空

---

## 子任务实现

### 子任务结构

位置: `domain.ts`

```typescript
interface Subtask {
  id: string        // 唯一ID
  title: string     // 子任务标题
  completed: boolean  // 完成状态
}
```

### 特点

1. **简洁二态设计**: 仅含 `title` 和 `completed`
2. **平面存储**: 存储在父任务的 `subtasks` 数组中
3. **无嵌套**: 子任务不支持再分解
4. **完成时影响**: 重复任务完成时，子任务全部重置为 `completed: false`

### 子任务的生命周期

```typescript
// 创建
subtasks: [
  { id: 'sub-1', title: '准备资料', completed: false },
  { id: 'sub-2', title: '审核方案', completed: false }
]

// 更新
subtasks[0].completed = true

// 父任务完成 + 有重复规则时
// → 子任务全部重置
subtasks[0].completed = false
subtasks[1].completed = false
```

---

## 标签与分类

### 标签系统

位置: `domain.ts`

```typescript
interface Tag {
  id: string
  name: string
  color: string
}

// 预设色板
const TAG_COLOR_PRESETS = [
  '#7c9cff',  // 蓝
  '#54d2a0',  // 绿
  '#ffb454',  // 橙
  '#a78bfa',  // 紫
  '#93c5fd',  // 浅蓝
  '#ff6b7a',  // 红
  '#34d399',  // 青
  '#f472b6'   // 粉
]
```

### 特殊标签 (用于矩阵视图)

位置: `meta.ts`

```typescript
const SPECIAL_TAG_IDS = {
  urgent: 'tag-urgent',      // 紧急
  important: 'tag-important'  // 重要
}

const SPECIAL_TAG_META = {
  urgent: { id: 'tag-urgent', name: '紧急', color: '#ff6b7a' },
  important: { id: 'tag-important', name: '重要', color: '#ffb454' }
}

// 确保特殊标签存在
ensureSpecialTags(tags: Tag[]): Tag[]
```

### 列表/项目结构

```typescript
interface TodoList {
  id: string
  name: string
  color: string
  folderId: string | null
  kind: 'system' | 'custom'
}

// 系统列表
'inbox'       // 收件箱
'today'       // 今日
'upcoming'    // 本周
'completed'   // 已完成
'trash'       // 回收站
```

### 文件夹结构

```typescript
interface Folder {
  id: string
  name: string
  color: string
}

// 层级: Folder > TodoList > Task > Subtask
```

### 标签关联

```typescript
// 任务与标签的关联
task.tagIds: string[]  // 多对多关联

// 筛选器中的标签逻辑
filter.tagIds: string[]  // 若非空，任务必须包含所有这些标签 (AND 逻辑)
```

### 四象限矩阵

位置: `selectors.ts`

```typescript
type MatrixQuadrantKey = 'q1' | 'q2' | 'q3' | 'q4'

// 象限定义
q1: urgent && important   // 紧急且重要
q2: !urgent && important   // 重要不紧急
q3: urgent && !important   // 紧急不重要
q4: !urgent && !important  // 不紧急不重要

// 获取象限
getQuadrant(task: Task): MatrixQuadrantKey

// 设置象限 (修改标签)
getTagIdsForQuadrant(tagIds, 'q1')
  // 返回: 添加 urgent + important 标签，移除其他

// 获取象限标签
getQuadrantLabel('q1') → '紧急且重要'
```

---

## 排序与筛选

### 筛选器系统

位置: `selectors.ts`

#### SavedFilter 结构

```typescript
interface SavedFilter {
  id: string
  name: string
  icon: string
  listIds: string[]       // 包含的列表(空=全部)
  tagIds: string[]       // 必含的标签(AND)
  priority: Priority[]    // 包含的优先级
  due: 'overdue' | 'today' | 'week' | 'none'
}
```

#### 应用筛选器

```typescript
const applySavedFilter = (
  tasks: Task[],
  filter: SavedFilter,
  includeCompleted = false
): Task[] => {
  return tasks.filter(task => {
    // 列表匹配: 空=全部，否则必须在 listIds 中
    const matchList = filter.listIds.length === 0 
      || filter.listIds.includes(task.listId)
    
    // 标签匹配: 空=任意，否则任务必须包含所有标签 (AND)
    const matchTags = filter.tagIds.length === 0 
      || filter.tagIds.every(tagId => task.tagIds.includes(tagId))
    
    // 优先级匹配: 空=全部
    const matchPriority = filter.priority.length === 0 
      || filter.priority.includes(task.priority)
    
    // 时间范围匹配
    const matchDue =
      filter.due === 'none' ? true
      : filter.due === 'today' ? isToday(task.dueAt)
      : filter.due === 'week' ? isWithinDays(task.dueAt, 7)
      : isOverdue(task.dueAt)  // 'overdue'
    
    return matchList && matchTags && matchPriority && matchDue
      && (includeCompleted || !task.completed)
  })
}
```

### 选择器系统

#### 选择类型

```typescript
// 系统选择
getTasksForSelection({
  selectionKind: 'system',
  selectionId: 'today'         // all | today | upcoming | inbox | completed | trash
})

// 列表选择
getTasksForSelection({
  selectionKind: 'list',
  selectionId: 'listId'
})

// 标签选择
getTasksForSelection({
  selectionKind: 'tag',
  selectionId: 'tagId'
})

// 筛选器选择
getTasksForSelection({
  selectionKind: 'filter',
  selectionId: 'filterId'
})

// 工具选择
getTasksForSelection({
  selectionKind: 'tool',
  selectionId: 'any'  // 返回所有非删除任务
})
```

#### 系统选择定义

```typescript
// today: isToday(dueAt) || isOverdue(dueAt)
// upcoming: isWithinDays(dueAt, 7)
// inbox: listId === 'inbox'
// completed: completed === true
// trash: deleted === true

// 时间模式切换 (仅 today/upcoming)
selectionTimeModes: {
  today: 'planned',    // 可切换为 'deadline'
  upcoming: 'planned'
}
```

### 搜索

```typescript
const matchesSearch = (task: Task, keyword: string, tags: Tag[]): boolean => {
  if (!keyword) return true
  
  // 搜索范围: 标题 + 描述 + 关联标签名
  const tagText = task.tagIds
    .map(tagId => tags.find(item => item.id === tagId)?.name ?? '')
    .join(' ')
    .toLowerCase()
  
  const text = `${task.title} ${task.note} ${tagText}`.toLowerCase()
  return text.includes(keyword.toLowerCase())
}
```

### 标签多选筛选

```typescript
const matchesSelectedTags = (task: Task, selectedTagIds: string[]): boolean => {
  if (selectedTagIds.length === 0) return true
  // AND 逻辑: 任务必须包含所有选中的标签
  return selectedTagIds.every(tagId => task.tagIds.includes(tagId))
}
```

### 排序逻辑

#### 按投影距离排序

```typescript
const compareTasksByProjectionDistance = (
  left: Task,
  right: Task,
  anchorDateKey: string,
  view: WorkspaceView
): number => {
  // 1. 计算每个任务的投影锚点 (开始日期或计划日期)
  const leftAnchor = getProjectionAnchorDateKey(left, view)
  const rightAnchor = getProjectionAnchorDateKey(right, view)
  
  // 2. 若都有锚点，按距离排序
  if (leftAnchor && rightAnchor) {
    const distance = Math.abs(diffDateKeys(anchorDateKey, leftAnchor))
                   - Math.abs(diffDateKeys(anchorDateKey, rightAnchor))
    if (distance !== 0) return distance
    return leftAnchor.localeCompare(rightAnchor)
  }
  
  // 3. 有锚点的排前，无锚点的排后
  if (leftAnchor) return -1
  if (rightAnchor) return 1
  
  // 4. 都无锚点，按标题中文排序
  return left.title.localeCompare(right.title, 'zh-CN')
}
```

#### 按状态/优先级排序

```typescript
// 常见排序维度
- priority (urgent > high > normal > low)
- status (todo > doing > done)
- dueAt (过期 > 今天 > 本周 > 无时间)
- createdAt/updatedAt
```

---

## Core 库架构

位置: `packages/taskflow-core/`

### 库结构

```
taskflow-core/
├── src/
│   ├── index.ts           # 公开 API
│   ├── domain.ts          # 核心数据结构定义
│   ├── dates.ts           # 日期/时间工具
│   ├── selectors.ts       # 选择器/筛选逻辑
│   ├── smart-entry.ts     # 自然语言解析
│   ├── reminder-engine.ts # 提醒引擎
│   ├── repeat-rule.ts     # 重复规则
│   ├── meta.ts            # 元数据 (优先级/状态/色板)
│   ├── timeline.ts        # 时间线视图计算
│   └── lunar.ts           # 农历支持 (可选)
└── package.json
```

### 导出内容

```typescript
// src/index.ts 导出:
export * from './domain'           // 所有类型定义
export * from './dates'            // 日期工具
export * from './selectors'        // 选择器
export * from './smart-entry'      // 自然语言解析
export * from './reminder-engine'  // 提醒
export * from './repeat-rule'      // 重复规则
export * from './meta'             // 元数据
export * from './timeline'         // 时间线
```

### 使用方式

```typescript
// Web 应用
import {
  type Task, type Priority,
  getTasksForSelection,
  parseSmartEntry,
  collectReminderEvents,
  // ... 其他
} from '@taskflow/core'

// Obsidian 插件
import { type Task, describeRepeatRule } from '@taskflow/core'
```

### 设计原则

1. **纯逻辑库**: 无 UI、无外部依赖
2. **函数式**: 工具函数，无类或复杂状态
3. **类型安全**: 充分利用 TypeScript 类型
4. **可测试**: 所有函数纯函数，易于单元测试
5. **跨平台**: Web 和 Obsidian 插件共享

---

## Obsidian 插件差异

位置: `todo-obsidian-plugin/`

### 插件类型定义

```typescript
// 插件任务类型 (与 core 完全相同)
type PluginTask = Task
type TodoTask = PluginTask  // 向后兼容别名

interface TodoPluginSettings {
  leafTarget: 'right' | 'main'      // 在右侧面板还是主面板打开
  autoLinkActiveNote: boolean       // 是否自动链接当前笔记
}

interface TodoPluginData {
  tasks: PluginTask[]
  lists: TodoList[]
  tags: Tag[]
  folders: Folder[]
  filters: SavedFilter[]
  settings: TodoPluginSettings
}
```

### 创建任务时的输入

```typescript
interface CreateTaskPayload {
  title: string
  note?: string
  listId?: string
  tagIds?: string[]
  priority?: Priority
  status?: TaskStatus
  startAt?: string | null
  dueAt?: string | null
  deadlineAt?: string | null
  repeatRule?: string
  sourcePath?: string  // 关联的笔记路径 (插件特有)
}
```

### 插件特有功能

1. **笔记链接**: `sourcePath` 字段记录任务来自哪个笔记
2. **面板位置**: 支持在右侧或主面板打开
3. **自动链接**: 编辑笔记时自动关联任务
4. **存储方式**: 数据存储在 Obsidian vault 中 (JSON 文件)

### 与 Web 应用的关系

```
┌─────────────────────────────────────────────┐
│     @taskflow/core (纯逻辑库)                │
│  - 数据结构定义                              │
│  - 算法 (筛选/排序/计算)                      │
└──────────────────┬──────────────────────────┘
                   │
       ┌───────────┼───────────┐
       │           │           │
   ┌───▼──┐    ┌──▼───┐   ┌──▼───┐
   │ Web  │    │Plugin│   │Test  │
   │      │    │      │   │      │
   └──────┘    └──────┘   └──────┘
```

### 插件的存储层

- **Obsidian 插件**: 使用 Obsidian API 读写 vault 文件
- **Web 应用**: 使用 IndexedDB + Supabase 云同步

数据模型完全相同，只是存储后端不同。

---

## UX 设计决策

### 1. 双层时间模型

```
设计决策: 引入 deadlineAt (可选)
原因:
- 现实中常见"计划 vs 硬性期限"的差异
- dueAt: 项目预期完成时间，可灵活调整
- deadlineAt: 不可推迟的硬性截止，固定
- 显示模式切换: 在两者间切换查看
```

### 2. 状态 + Completed 双冗余

```
设计决策: 同时维护 status 和 completed
原因:
- status 支持 3 态流程 (todo/doing/done)
- completed 为快速布尔检查 (性能)
- 快速查询不完成的任务时无需解析 status
- 两者自动同步，确保数据一致
```

### 3. 重复任务完成时重置子任务

```
设计决策: 重复任务完成 → 生成新任务，子任务全部重置
原因:
- 避免跨周期污染
- 清晰的周期边界
- 用户预期: 新周期 = 新工作，旧状态清除
```

### 4. 特殊标签系统

```
设计决策: 预置 urgent + important 标签，用于四象限
原因:
- 四象限矩阵视图需要二维分类
- 特殊标签 ID 固定，便于系统识别
- 自动确保存在，无需用户手动创建
```

### 5. 自然语言解析

```
设计决策: parseSmartEntry 支持自然语言快速输入
原因:
- 改进输入体验 (特别是移动端)
- 支持格式: "明天下午2点开会 #工作 !高"
- 从文本中提取: 日期、时间、标签、优先级
- 自动清理标题
```

### 6. 提醒锚点灵活选择

```
设计决策: 提醒可相对 deadline/dueAt/startAt
原因:
- 不同任务类型有不同重要时间点
- DDL 任务: 相对 deadline 提醒
- 日常任务: 相对 dueAt 提醒
- 时间块任务: 相对 startAt 提醒
- 自动锚点选择降低配置复杂度
```

### 7. 投影视图 (Calendar/Timeline/Matrix)

```
设计决策: 多维度投影渲染任务
原因:
- 不同视图适应不同工作流程
- Calendar: 按日期组织
- Timeline: 时间块可视化
- Kanban: 按状态流动
- Matrix: 按优先级分类

任务通过投影锚点 (startAt/dueAt) 在各视图中定位
```

### 8. 离线优先 + 云同步

```
设计决策: 本地 IndexedDB + 后台 Supabase 同步
原因:
- 离线可用性强
- 即时反馈 (不阻塞 UI)
- 云备份与跨设备同步
- 冲突检测与合并
```

### 9. 时间线拖拽编辑

```
设计决策: Timeline 视图支持直接拖拽改变时间
原因:
- 可视化编辑时间块
- 直观的时间感受
- 支持拖拽改变开始/结束时间
- 最小时长限制 (30 分钟)
```

### 10. 自动提醒去重

```
设计决策: firedReminderKeys 记录已发射提醒
原因:
- 防止重复提醒
- 提醒键包含 taskId + reminderId + triggerTime
- 系统重启后仍能正确去重
- 保留最近 300 条历史记录
```

---

## 其他关键文件位置

### 存储与同步
- `web/src/utils/storage.ts` - 本地存储管理
- `web/src/utils/offline-queue.ts` - 离线队列
- `web/src/hooks/useRealtimeSync.ts` - 云同步 Hook
- `web/src/utils/supabase.ts` - Supabase 配置

### 组件与 UI
- `web/src/components/` - React 组件
- `web/src/hooks/` - React Hooks

### 数据库
- Supabase 表:
  - `profiles` - 用户信息
  - `workspace_states` - 工作区状态快照
  - `sync_cursors` - 同步游标

---

## 总结

**TaskFlow 核心特征**:

1. ✅ **三层时间模型**: startAt + dueAt + deadlineAt
2. ✅ **灵活重复系统**: 支持预定义 + 自定义规则
3. ✅ **智能提醒**: 相对/绝对、锚点选择、自动去重
4. ✅ **多视图投影**: Calendar/List/Kanban/Timeline/Matrix
5. ✅ **共享 Core 库**: Web + Plugin 完全共享逻辑
6. ✅ **离线优先**: IndexedDB 本地 + Supabase 云同步
7. ✅ **自然语言支持**: 快速输入解析
8. ✅ **四象限矩阵**: 基于 urgent + important 标签
9. ✅ **子任务管理**: 平面列表，重复时重置
10. ✅ **完善的筛选系统**: SavedFilter + 动态选择器

