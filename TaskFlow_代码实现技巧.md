# TaskFlow 代码实现技巧与最佳实践

## 1. 字段级约束与验证

### Task 字段的类型安全

```typescript
// ✅ 好: 使用类型守卫
if (task.deadlineAt && task.dueAt) {
  const isPlannedAfterDeadline = new Date(task.dueAt) > new Date(task.deadlineAt)
  // ...
}

// ❌ 坏: 可能的 null 访问
const diff = new Date(task.deadlineAt) - new Date(task.dueAt)
```

### 时间字段的格式验证

```typescript
// ✅ 标准格式
startAt: '2024-04-10'           // 仅日期
startAt: '2024-04-10T09:00'     // 带时间
startAt: null                    // 无时间

// 规范化函数
const normalizeDateTime = (value: string | null): string | null => {
  if (!value) return null
  // 确保 ISO 格式
  const date = new Date(value)
  return date.toISOString().split('.')[0] + 'Z' ?? null
}
```

### 数组字段的防御

```typescript
// ✅ 安全初始化
task.reminders = task.reminders ?? []
task.subtasks = task.subtasks ?? []
task.tagIds = task.tagIds ?? []

// ❌ 可能崩溃
task.reminders.push(newReminder)  // 若 reminders 为 undefined
```

## 2. 状态转换模式

### 完成状态同步

```typescript
// ✅ 明确的双向映射
const syncTaskStatus = (task: Task, patch: Partial<Task>): Task => {
  const next = { ...task, ...patch }
  
  // 若明确修改 status，同步 completed
  if ('status' in patch) {
    next.completed = patch.status === 'done'
  }
  // 若明确修改 completed，同步 status
  else if ('completed' in patch) {
    next.status = patch.completed ? 'done' : 'todo'
  }
  
  return next
}

// ❌ 容易不一致
task.status = 'done'
// 忘记更新 completed
```

### 状态机验证

```typescript
// 合法的状态转换
const isValidStatusTransition = (from: TaskStatus, to: TaskStatus): boolean => {
  // 允许任意方向流转 (不是严格的 todo->doing->done)
  return from !== to
}

// 或者更严格的 Eisenhower 矩阵
const isValidTransition = (from: TaskStatus, to: TaskStatus): boolean => {
  const transitions: Record<TaskStatus, TaskStatus[]> = {
    'todo': ['doing', 'done'],
    'doing': ['todo', 'done'],
    'done': ['todo', 'doing']  // 允许撤销
  }
  return transitions[from].includes(to)
}
```

## 3. 日期处理的标准化

### 日期键 vs 日期时间

```typescript
// 日期键: YYYY-MM-DD (用于分组)
type DateKey = string & { readonly __brand: 'DateKey' }
const getDateKey = (date = new Date()): DateKey => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}` as DateKey
}

// 时间戳: ISO 8601 (用于精确比较)
type DateTime = string & { readonly __brand: 'DateTime' }
const getNowIso = (): DateTime => {
  return new Date().toISOString() as DateTime
}

// 避免混淆
const isToday = (value: string | null, today = getDateKey()): boolean => {
  if (!value) return false
  return value.slice(0, 10) === today
}
```

### 时区处理

```typescript
// ⚠️  TaskFlow 使用 ISO 8601 (UTC)
// 客户端使用本地时区显示，但存储统一为 UTC

// 显示本地时间
const formatDisplayTime = (isoString: string): string => {
  const date = new Date(isoString)
  // 浏览器自动转换为本地时区
  return date.toLocaleString('zh-CN')
}

// 创建任务时自动转 UTC
const createTask = (input: { dueAt: string }): Task => {
  const dueAt = new Date(input.dueAt).toISOString()
  return { ...input, dueAt }
}
```

## 4. 重复任务的实现细节

### 完成循环的完整流程

```typescript
// 1. 用户点击完成按钮
const completeTask = (taskId: string) => {
  const task = tasks.find(t => t.id === taskId)
  
  // 2. 标记为完成
  const completedTask = {
    ...task,
    status: 'done',
    completed: true,
    updatedAt: getNowIso()
  }
  
  // 3. 若有重复规则，生成下一任务
  const nextTask = createNextRepeatTask(completedTask)
  if (nextTask) {
    // 4. 新任务需要新 ID
    const newTask: Task = {
      ...nextTask,
      id: generateId()
    }
    
    // 5. 同时保存已完成任务 + 新任务
    tasks = updateTask(completedTask)
    tasks = insertTask(newTask)
  } else {
    // 普通任务，仅保存完成状态
    tasks = updateTask(completedTask)
  }
}
```

### 重复规则解析

```typescript
// ✅ 安全的规则解析
const parseRepeatRule = (rule: string): { value: number; unit: string } | null => {
  if (!rule.startsWith('custom:')) return null
  
  const match = rule.match(/custom:(\d+)([dwm])/)
  if (!match) return null
  
  return {
    value: parseInt(match[1], 10),
    unit: match[2]
  }
}

// ❌ 容易出错
const value = parseInt(rule.slice(7))  // 不检查格式
const unit = rule[rule.length - 1]     // 假设长度正确
```

## 5. 提醒系统的实现

### 相对提醒的解析与缓存

```typescript
// 缓存已解析的提醒规则，避免重复解析
const reminderCache = new Map<string, ParsedRelativeReminder>()

const parseReminder = (value: string): ParsedRelativeReminder | null => {
  if (reminderCache.has(value)) {
    return reminderCache.get(value)!
  }
  
  const pattern = /^(?:(auto|deadline|planned|start)\|)?(\d+)(m|h|d)$/i
  const match = value.match(pattern)
  if (!match) return null
  
  const result = {
    anchor: (match[1] ?? 'auto') as ReminderAnchorKind,
    amount: parseInt(match[2], 10),
    unit: match[3].toLowerCase() as 'm' | 'h' | 'd'
  }
  
  reminderCache.set(value, result)
  return result
}
```

### 提醒去重的正确方式

```typescript
// ✅ 使用 Set 实现高效去重
const collectReminders = (
  tasks: Task[],
  firedKeys: Set<string> = new Set()
): { events: ReminderEvent[]; nextKeys: Set<string> } => {
  const nextKeys = new Set(firedKeys)  // 复制现有的
  const events: ReminderEvent[] = []
  
  for (const task of tasks) {
    if (task.deleted || task.completed) continue
    
    for (const reminder of task.reminders) {
      const triggerAt = getReminderTriggerAt(task, reminder)
      if (!triggerAt || triggerAt > Date.now()) continue
      
      const key = `reminder:${task.id}:${reminder.id}:${triggerAt}`
      if (nextKeys.has(key)) continue  // 已发射过
      
      nextKeys.add(key)
      events.push({
        key,
        taskId: task.id,
        // ... 其他字段
      })
    }
  }
  
  return { events, nextKeys }
}

// ❌ 低效的数组查找
const hasReminded = firedReminderKeys.includes(key)  // O(n)
```

## 6. 选择器与筛选的优化

### 单一职责的筛选函数

```typescript
// ✅ 分离关注点
const filterByStatus = (tasks: Task[], status: TaskStatus): Task[] =>
  tasks.filter(t => t.status === status)

const filterByDate = (tasks: Task[], from: DateKey, to: DateKey): Task[] =>
  tasks.filter(t => {
    const date = getDateKey(new Date(t.dueAt ?? t.startAt ?? ''))
    return date >= from && date <= to
  })

const filterByTag = (tasks: Task[], tagIds: string[]): Task[] =>
  tasks.filter(t => tagIds.every(id => t.tagIds.includes(id)))

// 组合使用
const filtered = filterByStatus(
  filterByDate(
    filterByTag(tasks, selectedTags),
    today,
    endOfWeek
  ),
  'doing'
)

// ❌ 单一巨大函数
const complexFilter = (tasks, status, from, to, tagIds) => {
  return tasks.filter(t =>
    t.status === status &&
    getDateKey(new Date(t.dueAt ?? t.startAt ?? '')) >= from &&
    getDateKey(new Date(t.dueAt ?? t.startAt ?? '')) <= to &&
    tagIds.every(id => t.tagIds.includes(id))
  )
}
```

### 缓存筛选结果

```typescript
// ✅ 使用 memoization
const getMemoizedSelector = (() => {
  let cachedTasks: Task[] | null = null
  let cachedResult: Task[] | null = null
  
  return (tasks: Task[], predicate: (t: Task) => boolean): Task[] => {
    if (cachedTasks === tasks) {
      return cachedResult!
    }
    
    cachedTasks = tasks
    cachedResult = tasks.filter(predicate)
    return cachedResult
  }
})()

// React 中使用 useMemo
const selectedTasks = useMemo(() => {
  return getTasksForSelection({ tasks, selectionKind, selectionId })
}, [tasks, selectionKind, selectionId])
```

## 7. 时间线渲染的性能优化

### 虚拟滚动与可见性检查

```typescript
// ✅ 只渲染可见任务
const renderTimelineWindow = (
  tasks: Task[],
  windowStart: number,
  windowEnd: number
): Task[] => {
  return tasks.filter(task =>
    isTaskVisibleInTimelineWindow(task, windowStart, windowEnd)
  )
}

// 结合虚拟化库 (如 react-window)
const visibleTasks = renderTimelineWindow(tasks, scrollStart, scrollEnd)
return (
  <FixedSizeList>
    {visibleTasks.map(task => <TaskBar key={task.id} task={task} />)}
  </FixedSizeList>
)

// ❌ 渲染所有任务
return tasks.map(task => <TaskBar key={task.id} task={task} />)
```

### 拖拽优化

```typescript
// ✅ 使用预测值进行实时反馈
const onPointerMove = (e: PointerEvent) => {
  const delta = e.clientX - dragState.originX
  
  // 预览新的时间
  const previewStart = calculateNewStart(delta)
  const previewEnd = calculateNewEnd(delta)
  
  // 立即更新 UI (不等待 API)
  setDragPreview({ startAt: previewStart, dueAt: previewEnd })
}

const onPointerUp = () => {
  // 最后才保存到状态
  updateTask(dragState.taskId, dragPreview)
}
```

## 8. 自然语言解析的鲁棒性

### 容错的日期识别

```typescript
// ✅ 逐个匹配，容错处理
const parseDate = (text: string): string | null => {
  const patterns = [
    { pattern: /(\d+)\s*(?:天|日|周|个?月)后/, handler: handleRelative },
    { pattern: /下(?:个?周|星期)([一-日])/, handler: handleNextWeek },
    { pattern: /(?:今|明|后)天/, handler: handleToday },
    { pattern: /(\d{4})-(\d{1,2})-(\d{1,2})/, handler: handleISO }
  ]
  
  for (const { pattern, handler } of patterns) {
    const match = text.match(pattern)
    if (match) {
      try {
        return handler(match)
      } catch {
        console.warn(`Failed to parse date: ${text}`)
        continue  // 尝试下一个模式
      }
    }
  }
  
  return null
}

// ❌ 单一模式，容易失败
const naiveDate = text.match(/(\d+)天后/)?.[1]  // 可能为 undefined
```

### 标签和优先级的提取

```typescript
// ✅ 去重和规范化
const extractTags = (text: string): string[] => {
  const matches = text.match(/#([\u4e00-\u9fa5\w]+)/g) ?? []
  
  return [
    ...new Set(  // 去重
      matches
        .map(m => m.slice(1))  // 移除 #
        .map(m => m.trim())    // 规范化
        .filter(m => m.length > 0 && m.length <= 20)  // 验证长度
    )
  ]
}

// ❌ 可能重复或包含无效字符
const tags = text.match(/#(\w+)/g).map(t => t.slice(1))
```

## 9. 数据持久化的最佳实践

### IndexedDB 操作的错误处理

```typescript
// ✅ 完整的错误处理
const saveState = async (state: PersistedState): Promise<void> => {
  try {
    const db = await openDatabase()
    const tx = db.transaction(['state'], 'readwrite')
    const store = tx.objectStore('state')
    
    await store.put({
      key: 'taskflow:state',
      value: state,
      timestamp: Date.now()
    })
  } catch (error) {
    console.error('Failed to save state:', error)
    
    // 回退策略
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      // 存储空间不足，可能需要清理旧数据
      await cleanOldSnapshots()
      // 重试
      return saveState(state)
    }
    
    throw error
  }
}

// ❌ 无错误处理
const save = (state) => {
  db.put(state)  // 假设总是成功
}
```

### 云同步的冲突解决

```typescript
// ✅ 基于时间戳的简单策略
const mergeStates = (
  local: PersistedState,
  remote: PersistedState
): PersistedState => {
  // 比较 updatedAt，保留更新的版本
  return local.updatedAt > remote.updatedAt ? local : remote
}

// 更好的做法: 字段级合并
const mergeStateFine = (local: PersistedState, remote: PersistedState) => {
  return {
    tasks: mergeArrays(local.tasks, remote.tasks, 'id', 'updatedAt'),
    tags: mergeArrays(local.tags, remote.tags, 'id', 'updatedAt'),
    // ... 其他字段
  }
}

const mergeArrays = <T extends { id: string; updatedAt: string }>(
  local: T[],
  remote: T[],
  idKey: keyof T,
  updateKey: keyof T
): T[] => {
  const map = new Map<string, T>()
  
  // 先加入本地
  local.forEach(item => map.set(String(item[idKey]), item))
  
  // 再加入远程 (若更新)
  remote.forEach(item => {
    const existing = map.get(String(item[idKey]))
    if (!existing || item[updateKey] > existing[updateKey]) {
      map.set(String(item[idKey]), item)
    }
  })
  
  return Array.from(map.values())
}
```

## 10. 测试友好的代码结构

### 可测试的选择器函数

```typescript
// ✅ 纯函数，易于测试
export const getTasksForSelection = (config: {
  tasks: Task[]
  selectionKind: string
  selectionId: string
  filters: SavedFilter[]
}): Task[] => {
  // 逻辑清晰，无副作用
  if (config.selectionKind === 'today') {
    return config.tasks.filter(t =>
      !t.deleted && (isToday(t.dueAt) || isOverdue(t.dueAt))
    )
  }
  // ...
}

// 测试
describe('getTasksForSelection', () => {
  it('should return today tasks', () => {
    const tasks = [
      { id: '1', dueAt: '2024-04-10', deleted: false, completed: false },
      { id: '2', dueAt: '2024-04-11', deleted: false, completed: false }
    ]
    
    const result = getTasksForSelection({
      tasks,
      selectionKind: 'today',
      selectionId: 'today'
    })
    
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })
})

// ❌ 难以测试
const getTodayTasks = () => {
  return getAllTasks().filter(t => isToday(t.dueAt))  // 全局状态耦合
}
```

### 模拟和桩

```typescript
// ✅ 注入依赖
const createReminderEngine = (
  getCurrentTime: () => number = Date.now
) => {
  return {
    collectEvents: (tasks: Task[]) => {
      const now = getCurrentTime()
      // 使用注入的时间函数
      return tasks.filter(t => getReminderTriggerAt(t) < now)
    }
  }
}

// 测试 (注入固定时间)
const mockTime = 1712745600000  // 固定时间点
const engine = createReminderEngine(() => mockTime)
const events = engine.collectEvents(tasks)
```

## 11. 国际化与本地化考虑

### 字符串的中文排序

```typescript
// ✅ 使用 Intl.Collator
const chineseSorter = new Intl.Collator('zh-CN', {
  numeric: true,
  sensitivity: 'base'
})

const sorted = tasks.sort((a, b) =>
  chineseSorter.compare(a.title, b.title)
)

// ❌ localeCompare 可能不支持所有浏览器
const sorted = tasks.sort((a, b) =>
  a.title.localeCompare(b.title, 'zh-CN')  // 需要检查浏览器支持
)
```

### 日期格式化的国际化

```typescript
// ✅ 使用 Intl
const formatDate = (date: Date, locale = 'zh-CN'): string => {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    weekday: 'short'
  }).format(date)
}

// 示例输出
formatDate(new Date('2024-04-10'), 'zh-CN')  // "4月10日 周三"
formatDate(new Date('2024-04-10'), 'en-US')  // "Wed, Apr 10"
```

## 12. 调试技巧

### 提醒触发的调试

```typescript
// 添加调试函数
const debugReminder = (task: Task, reminder: Reminder) => {
  const anchor = getReminderAnchor(task, reminder)
  const trigger = getReminderTriggerAt(task, reminder)
  
  console.log('Reminder Debug:', {
    taskId: task.id,
    taskTitle: task.title,
    reminderId: reminder.id,
    reminderValue: reminder.value,
    anchor: anchor ? `${anchor.kind} at ${anchor.value}` : 'no anchor',
    triggerAt: trigger ? new Date(trigger).toLocaleString() : 'not calculable',
    status: !trigger ? 'disabled' : Date.now() < trigger ? 'pending' : 'ready'
  })
}
```

### 状态一致性检查

```typescript
// 验证数据完整性
const validateTaskIntegrity = (task: Task): string[] => {
  const errors: string[] = []
  
  if (!task.id) errors.push('Missing id')
  if (!task.title) errors.push('Missing title')
  if (task.completed && task.status !== 'done') {
    errors.push('completed=true but status !== done')
  }
  if (task.deadlineAt && task.dueAt) {
    if (new Date(task.deadlineAt) < new Date(task.dueAt)) {
      errors.push('deadline before planned')
    }
  }
  
  return errors
}

// 批量验证
tasks.forEach(task => {
  const errors = validateTaskIntegrity(task)
  if (errors.length > 0) {
    console.warn(`Task ${task.id} validation failed:`, errors)
  }
})
```

