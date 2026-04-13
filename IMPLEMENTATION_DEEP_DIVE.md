# TaskFlow Codebase - Detailed Implementation Analysis

## Executive Summary
This document provides a comprehensive analysis of the TaskFlow application's key implementation details across 8 critical areas. The application uses tag-based categorization for the Matrix view, implements sophisticated NLP parsing for smart task entry, and includes mobile-optimized interactions with gesture support.

---

## 1. Matrix View Quadrant Categorization

### Location
- **Primary**: `web/src/components/views/MatrixView.tsx` (lines 55-68)
- **Logic**: `packages/taskflow-core/src/selectors.ts` (lines 242-263)
- **Metadata**: `packages/taskflow-core/src/meta.ts` (lines 24-32)

### **Exact Logic - TAG-BASED CATEGORIZATION**

```typescript
// From selectors.ts:242-249
export function getQuadrant(task: Task): MatrixQuadrantKey {
  const urgent = task.tagIds.includes(SPECIAL_TAG_IDS.urgent)      // 'tag-urgent'
  const important = task.tagIds.includes(SPECIAL_TAG_IDS.important) // 'tag-important'
  if (urgent && important) return 'q1'    // 紧急且重要 (Urgent + Important)
  if (!urgent && important) return 'q2'   // 重要不紧急 (Important only)
  if (urgent && !important) return 'q3'   // 紧急不重要 (Urgent only)
  return 'q4'                              // 不紧急不重要 (Neither)
}
```

### Special Tag IDs
```typescript
// From meta.ts:24-32
export const SPECIAL_TAG_IDS = {
  urgent: 'tag-urgent',
  important: 'tag-important',
} as const

export const SPECIAL_TAG_META: Record<keyof typeof SPECIAL_TAG_IDS, Tag> = {
  urgent: { id: SPECIAL_TAG_IDS.urgent, name: '紧急', color: '#ff6b7a' },
  important: { id: SPECIAL_TAG_IDS.important, name: '重要', color: '#ffb454' },
}

export type MatrixQuadrantKey = 'q1' | 'q2' | 'q3' | 'q4'
```

### Quadrant Metadata in UI
```typescript
// From MatrixView.tsx:63-68
const meta: Record<MatrixQuadrantKey, { title: string; hint: string; emptyHint: string; priority: Priority; tagIds: string[] }> = {
  q1: { title: '紧急且重要', hint: '立即处理', emptyHint: '重要且紧急 — 立即处理', priority: 'urgent', tagIds: [SPECIAL_TAG_IDS.urgent, SPECIAL_TAG_IDS.important] },
  q2: { title: '重要不紧急', hint: '规划安排', emptyHint: '重要不紧急 — 规划时间', priority: 'high', tagIds: [SPECIAL_TAG_IDS.important] },
  q3: { title: '紧急不重要', hint: '委派或压缩', emptyHint: '紧急不重要 — 考虑委托', priority: 'normal', tagIds: [SPECIAL_TAG_IDS.urgent] },
  q4: { title: '不紧急不重要', hint: '放弃或推迟', emptyHint: '不重要不紧急 — 可以放下', priority: 'low', tagIds: [] },
}
```

### How Dragging Works
```typescript
// From MatrixView.tsx:61
tasks.forEach((task) => quadrants[getQuadrant(task)].push(task))

// Drag-to-quadrant changes tags:
// From selectors.ts:251-263
export function getTagIdsForQuadrant(tagIds: string[], quadrant: MatrixQuadrantKey) {
  const next = new Set(tagIds.filter((tagId) => !Object.values(SPECIAL_TAG_IDS).includes(tagId)))
  
  if (quadrant === 'q1' || quadrant === 'q3') {
    next.add(SPECIAL_TAG_IDS.urgent)
  }
  
  if (quadrant === 'q1' || quadrant === 'q2') {
    next.add(SPECIAL_TAG_IDS.important)
  }
  
  return Array.from(next)
}
```

### Summary
✅ **Tag-based categorization** (NOT priority+deadline based)
✅ Uses two special tags: `tag-urgent` and `tag-important`
✅ 2×2 matrix (q1-q4) determined by tag combinations
✅ Dragging a task to a quadrant automatically updates its tags
✅ Special tags are ensured to exist via `ensureSpecialTags()`

---

## 2. NLP Smart Entry Parsing

### Location
- **Implementation**: `packages/taskflow-core/src/smart-entry.ts` (180 lines)
- **Web Re-export**: `web/src/utils/smart-entry.ts` (1 line - re-exports from core)

### **Supported Syntax & NLP Features**

```typescript
// From smart-entry.ts:23-29
export interface SmartEntryResult {
  title: string
  rawInput: string
  dueAt: string | null
  tagNames: string[]
  priority: Priority | null
}
```

### **1. Time Expression Recognition**

#### Relative Days
```
Input: "修复bug 3天后"
Parsed: dueAt = today + 3 days, title = "修复bug"
Syntax: N天后 / N日后 / N周后 / N星期后 / N个月后
```

#### Next Week Days
```
Input: "团队会议 下周三"
Parsed: dueAt = next Wednesday, title = "团队会议"
Syntax: 下周[一二三四五六七日天] / 下个星期[weekday]
```

#### Next Month
```
Input: "项目启动 下月5号"
Parsed: dueAt = first day of next month + 5 days, title = "项目启动"
Syntax: 下月 / 下个月 + optional [N号/N日]
```

#### Fixed Days
```
Input: "每日站会 今天"        → today
Input: "追进度 明天"        → tomorrow
Input: "收房验收 后天"       → day after tomorrow
Syntax: 今天/今日 / 明天/明日 / 后天
```

#### This Week Days
```
Input: "周会 本周二"
Parsed: dueAt = this or next Tuesday (depending on current day)
Syntax: 本周[weekday] / 这周[weekday]
```

### **2. Time-of-Day Parsing**

```typescript
// From smart-entry.ts:155-164
const timePattern = /(上午|下午|晚上|早上|凌晨)?\s*(\d{1,2})\s*(?::|点)\s*(\d{0,2})?\s*(?:分)?/

// Examples:
"早上8点"       → 08:00
"上午10:30"     → 10:30
"下午3点"       → 15:00
"晚上11点"      → 23:00
"凌晨12点"      → 00:00
```

Markers:
- `上午` (morning): hour stays as-is
- `下午`/`晚上` (afternoon/evening): hour += 12
- `凌晨` (midnight): 12 becomes 0
- No marker: hour used as-is

**Result format**: `YYYY-MM-DDTHH:MM:00`

### **3. Tag Extraction**

```typescript
// From smart-entry.ts:78-81
// Regex: /#([\u4e00-\u9fa5\w]+)/g
// Captures Chinese characters and word chars after #

Input: "完成报告 #紧急 #周报"
Output: tagNames = ['紧急', '周报']
Title cleaned: "完成报告"
```

### **4. Priority Recognition**

```typescript
// From smart-entry.ts:58-87
const PRIORITY_MAP: Record<string, Priority> = {
  '紧急': 'urgent', 'p1': 'urgent', '1': 'urgent',
  '高': 'high', 'p2': 'high', '2': 'high',
  '普通': 'normal', '正常': 'normal', 'p3': 'normal', '3': 'normal',
  '低': 'low', 'p4': 'low', '4': 'low',
}

Input: "修复关键bug !紧急"
Output: priority = 'urgent'
Title cleaned: "修复关键bug"

Syntax: ![priority-keyword] after !
Examples: !紧急 / !高 / !p1 / !1
```

### **5. Title Cleanup**

```typescript
// From smart-entry.ts:167-170
const title = workingText
  .replace(/\s{2,}/g, ' ')              // Collapse multiple spaces
  .replace(/^[\s，,、。·]+|[\s，,、。·]+$/g, '')  // Trim punctuation
  .trim() || value.trim()
```

### **Example Inputs**

```
1. "完成Q1总结 明天下午3点 #周报 !高"
   → title: "完成Q1总结"
   → dueAt: "tomorrow T15:00"
   → tagNames: ["周报"]
   → priority: "high"

2. "修复登录bug 2天后上午10点"
   → title: "修复登录bug"
   → dueAt: "today+2 T10:00"
   → tagNames: []
   → priority: null

3. "下周二 团队会议 下午2点"
   → title: "团队会议"
   → dueAt: "next Tuesday T14:00"
   → tagNames: []
   → priority: null
```

### **Parsing Order (Important!)**
1. Extract tags (#xxx)
2. Extract priority (!xxx)
3. Parse date (relative → next-week → next-month → fixed → this-week)
4. Parse time-of-day (if matched)
5. Clean remaining text as title

### **Preview Mechanism**
❌ **NO PREVIEW MECHANISM** in smart-entry.ts itself
✅ Preview would be implemented by **calling component** (likely InlineCreateDialog or similar)
✅ Result structure allows for UI to display parsed components before save

---

## 3. Mobile Focus View - Completion Flow

### Location
- **Main Component**: `web/src/mobile/MobileFocusView.tsx` (585 lines)
- **Key Function**: `MobileFocusCard` (lines 385-584)

### **Completion UI Flow**

#### No Confirmation Dialog
```typescript
// From MobileFocusView.tsx:528-532
<button
  className={`check-button ${task.completed ? 'is-checked' : ''}`}
  onClick={e => { e.stopPropagation(); onToggle() }}
  aria-label={task.completed ? '取消完成' : '标记完成'}
>
  {task.completed ? '✓' : ''}
</button>
```

❌ **NO CONFIRMATION DIALOG**
✅ Direct toggle on click
✅ Visual feedback: button shows `✓` when completed

### **Completion Animation (200ms)**
```typescript
// From MobileFocusView.tsx:262-271
const [completingIds, setCompletingIds] = useState<Set<string>>(new Set())

const handleToggle = (taskId: string) => {
  setCompletingIds(prev => new Set(prev).add(taskId))
  setTimeout(() => {
    onToggleComplete(taskId)
    setCompletingIds(prev => { const next = new Set(prev); next.delete(taskId); return next })
  }, 200)
}
```

**Animation sequence**:
1. Add taskId to `completingIds` Set
2. CSS class: `.is-completing` gets applied (200ms animation)
3. After 200ms: call `onToggleComplete()` callback
4. Remove from `completingIds` Set

### **Swipe Gestures for Quick Actions**

#### Right Swipe: Direct Complete
```typescript
// From MobileFocusView.tsx:456-461
if (swipeX > COMPLETE_THRESHOLD) {  // 100px right
  // Right-swipe complete
  onToggle()
  setSwipeX(0)
  setSwiping(false)
}
```

#### Right Swipe 60-100px: Reveal Complete Button
```typescript
// From MobileFocusView.tsx:461-465
else if (swipeX > SWIPE_THRESHOLD) {  // 60-100px
  // Reveal complete confirm button
  setRevealed('right')
  setSwipeX(72)  // Fixed position to show confirm button
  setSwiping(false)
}
```

#### Left Swipe 60-120px: Reveal Snooze/Delete
```typescript
// From MobileFocusView.tsx:466-470
else if (swipeX < -SWIPE_THRESHOLD) {  // -60 to -120px
  // Left-swipe: reveal snooze/delete
  setRevealed('left')
  setSwipeX(-116)  // Fixed position to show both buttons
  setSwiping(false)
}
```

#### Swipe Gesture Thresholds
```typescript
const SWIPE_THRESHOLD = 60         // px to reveal actions
const COMPLETE_THRESHOLD = 100     // px for direct complete
const AXIS_LOCK = 10               // px vertical before cancelling
```

### **Swipe Background Actions UI**

```typescript
// From MobileFocusView.tsx:499-516
{/* Right swipe background (complete) */}
{swipeX > 0 && (
  <div className="mobile-swipe-action mobile-swipe-action--complete" aria-hidden="true">
    <span>{swipeX >= COMPLETE_THRESHOLD ? '✓ 完成!' : '➜ 完成'}</span>
  </div>
)}

{/* Left swipe background (snooze + delete) */}
{swipeX < 0 && (
  <div className="mobile-swipe-action mobile-swipe-action--actions" aria-hidden="true">
    <button
      className="mobile-swipe-btn mobile-swipe-btn--snooze"
      onClick={e => { e.stopPropagation(); onSnooze?.(); resetSwipe() }}
    >明天</button>
    <button
      className="mobile-swipe-btn mobile-swipe-btn--delete"
      onClick={e => { e.stopPropagation(); onDelete?.(); resetSwipe() }}
    >删除</button>
  </div>
)}
```

### **Virtual Scrolling for Performance**
```typescript
// From MobileFocusView.tsx:73-79
const virtualizer = useVirtualizer({
  count: items.length,
  getScrollElement: () => parentRef.current,
  estimateSize: (index) => items[index].type === 'section-header' ? 44 : 76,
  overscan: 5,
  getItemKey: (index) => items[index].key,
})
```

Uses `@tanstack/react-virtual` for high-performance rendering of large task lists.

### **Task Segmentation**
```typescript
// From MobileFocusView.tsx:32-34
segments: { 
  overdue: Task[]          // 逾期 (red)
  todayPlanned: Task[]     // 今天计划 (primary blue)
  todayDeadline: Task[]    // 今天到期 (warning orange)
  inbox: Task[]            // 待处理 (muted)
  upcoming: Task[]         // 明后天 (muted, collapsible)
}
```

### **Summary**
✅ **NO confirmation dialog** - direct toggle
✅ **200ms completion animation**
✅ **Rich swipe gestures**: right=complete, left=snooze/delete
✅ **Gesture thresholds**: 60px reveal, 100px direct complete
✅ **Virtual scrolling** for performance
✅ **Emotional empty states** (different UX for "no tasks" vs "all completed")

---

## 4. Stats View - Insights & Recovery

### Location
- `web/src/components/views/StatsView.tsx` (446 lines)

### **Core Metrics**

```typescript
// From StatsView.tsx:328-361
<article className="stats-card">
  <span>已完成任务</span>
  <strong>
    {resolvedStats.completed}
    <small> / {resolvedStats.completed + resolvedStats.active}</small>
  </strong>
</article>
<article className="stats-card">
  <span>活跃任务</span>
  <strong>{resolvedStats.active}</strong>
</article>
<article className="stats-card">
  <span>已逾期</span>
  <strong style={{ color: resolvedStats.overdue > 0 ? '#ff6b7a' : undefined }}>
    {resolvedStats.overdue}
  </strong>
</article>
<article className="stats-card">
  <span>已排期</span>
  <strong>{resolvedStats.scheduled}</strong>
</article>
<article className="stats-card stats-card--highlight">
  <span>连续完成</span>
  <strong>{streak.current} <small>天</small></strong>
  <p>最长 {streak.longest} 天</p>
</article>
<article className="stats-card">
  <span>累计专注</span>
  <strong>{focusHours > 0 ? `${focusHours}h ` : ''}{focusMins}m</strong>
</article>
```

### **Visualizations**

#### 1. Completion Heatmap (Past Year)
```typescript
// From StatsView.tsx:285-326
// 52-week grid with SVG rects
// Each rect = 1 day with color intensity based on task completions
// Color scheme: 4-level intensity green (#9be9a8 → #216e39)
```

#### 2. 30-Day Completion Trend
```typescript
// From StatsView.tsx:363-393
// Bar chart showing daily completion counts
// 30 days displayed, bars scale to max daily count
// Today highlighted with special styling
```

#### 3. Priority Distribution
```typescript
// From StatsView.tsx:395-417
{(['urgent', 'high', 'normal', 'low'] as Priority[]).map((priority) => (
  <div key={priority} className="trend-row">
    <span>{priorityMeta[priority].label}</span>
    <div className="progress-bar">
      <span style={{ width: `${Math.min(100, count * 16)}%`, background: priorityMeta[priority].color }} />
    </div>
    <strong>{count}</strong>
  </div>
))}
```

#### 4. Tag Distribution (if any tags exist)
```typescript
// From StatsView.tsx:420-440
{resolvedTagDistribution.length > 0 && (
  <section className="chart-card">
    <h3>标签分布</h3>
    {resolvedTagDistribution.map(({ tag, count }) => (
      <div key={tag.id} className="trend-row">
        <span>#{tag.name}</span>
        <div className="progress-bar">
          <span style={{ width: `${Math.min(100, count * 18)}%`, background: tag.color }} />
        </div>
        <strong>{count}</strong>
      </div>
    ))}
  </section>
)}
```

### **Advanced Metrics**

#### Streak Calculation
```typescript
// From StatsView.tsx:205-232
const streak = useMemo(() => {
  const today = getDateKey()
  const completedDays = new Set(
    tasks
      .filter((t) => t.completed && t.updatedAt)
      .map((t) => t.updatedAt.slice(0, 10))
  )
  let current = 0
  let longest = 0
  let d = today
  // 从今天往前数
  while (completedDays.has(d)) {
    current++
    d = addDays(d, -1)
  }
  // 最长 streak
  const sorted = Array.from(completedDays).sort()
  let run = 0
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0 || sorted[i] === addDays(sorted[i - 1], 1)) {
      run++
      if (run > longest) longest = run
    } else {
      run = 1
    }
  }
  return { current, longest }
}, [tasks])
```

#### Focus Time Tracking
```typescript
// From StatsView.tsx:235-240
const totalFocusMinutes = useMemo(
  () => tasks.reduce((sum, t) => sum + (t.focusMinutes ?? 0), 0),
  [tasks],
)
const focusHours = Math.floor(totalFocusMinutes / 60)
const focusMins = totalFocusMinutes % 60
```

### **Recovery & Actionable Insights**

#### ProjectionRecoveryPanel Component
```typescript
// From StatsView.tsx:84-137
function ProjectionRecoveryPanel({
  mode,
  title,
  description,
  items,
  footerAction,
  onClose,
}: {
  mode: ProjectionInsightMode
  title: string
  description: string
  items: ProjectionRecoveryItem[]
  footerAction?: { label: string; onClick: () => void }
  onClose: () => void
})
```

**Each recovery item has**:
```typescript
type ProjectionRecoveryItem = {
  id: string
  title: string
  subtitle: string
  actionLabel: string  // e.g., "快速完成" / "标记完成"
  onAction: () => void  // Actionable button!
}
```

**Example UI** (lines 113-126):
```typescript
{items.length > 0 ? (
  items.map((item) => (
    <article key={item.id} className="projection-recovery-item">
      <div>
        <strong>{item.title}</strong>
        <p>{item.subtitle}</p>
      </div>
      <button className="ghost-button small" onClick={item.onAction}>
        {item.actionLabel}
      </button>
    </article>
  ))
) : (
  <div className="projection-recovery__empty">当前没有更多可回收的任务。</div>
)}
```

### **Summary**
✅ **6 core metric cards**: Completed, Active, Overdue, Scheduled, Streak, Focus Time
✅ **4 visualizations**: Heatmap (1-year), Trend (30-day), Priority Distribution, Tag Distribution
✅ **Advanced streak tracking**: Current + longest consecutive days
✅ **Focus time accumulation** from `task.focusMinutes`
✅ **Recovery suggestions** with **actionable buttons** per item
✅ **Emotional empty state**: "完成更多任务，解锁你的专属热力图 🔥"

---

## 5. Kanban View - WIP & Column Config

### Location
- `web/src/components/views/KanbanView.tsx` (254 lines)

### **Column Structure**

```typescript
// From KanbanView.tsx:37-38
const columns: Record<TaskStatus, Task[]> = { todo: [], doing: [], done: [] }
tasks.forEach((task) => columns[task.status].push(task))
```

**Columns** (exactly 3):
1. **todo** (待办) - To Do
2. **doing** (进行中) - In Progress
3. **done** (已完成) - Done

**TaskStatus type** (from domain.ts:2):
```typescript
export type TaskStatus = 'todo' | 'doing' | 'done'
```

### **Rendering** (lines 132-249)
```typescript
{(['todo', 'doing', 'done'] as TaskStatus[]).map((status) => (
  <section key={status} className="kanban-column">
    <header>
      <h3>{statusMeta[status]}</h3>
      <div className="kanban-column-actions">
        <span>{columns[status].length}</span>  {/* Count badge */}
        <button className="create-icon-button">+</button>  {/* Create button */}
      </div>
    </header>
    <div
      data-kanban-drop-zone={status}
      className={`kanban-stack ${dragOverStatus === status ? 'is-drag-over' : ''}`}
    >
      {/* Task cards rendered here */}
    </div>
  </section>
))}
```

### **WIP (Work In Progress) Limit**
❌ **NO WIP LIMIT** implemented
✅ Only limitation: implicit in `doing` column (designed for focus, but not enforced)
✅ No visual indicator or warning if `doing` column exceeds X tasks

### **Column Configuration**
❌ **NO COLUMN CONFIGURATION**
✅ Columns are **hardcoded**: todo → doing → done
✅ No ability to:
  - Rename columns
  - Reorder columns
  - Hide columns
  - Add custom columns

### **Drag-and-Drop Between Columns**

```typescript
// From KanbanView.tsx:53-56
const resolveDropStatus = (clientX: number, clientY: number) => {
  const status = resolveDropZoneValueFromPoint(clientX, clientY, '[data-kanban-drop-zone]', 'data-kanban-drop-zone')
  return statusOptions.includes(status as TaskStatus) ? (status as TaskStatus) : null
}
```

**Drop handling** (lines 77-87):
```typescript
const finalizePointerDrag = (event: PointerEvent) => {
  const current = pointerDragRef.current
  if (!current || event.pointerId !== current.pointerId) return

  const targetStatus = current.dragged ? dragOverStatusRef.current ?? resolveDropStatus(event.clientX, event.clientY) : null
  if (current.dragged && targetStatus) {
    onDropStatusChange(current.taskId, targetStatus)  // Callback to update status
    markClickSuppressed(suppressClickRef)
  }

  resetDragState()
}
```

### **Card Display** (lines 174-229)

Each task card shows:
```typescript
<article className="kanban-card status-${task.status}">
  <div className="kanban-header">
    <div className="kanban-card__badge-group">
      <StatusSelectBadge />        {/* Status selector */}
      <PrioritySelectBadge />      {/* Priority badge */}
    </div>
    <TaskTimeSummary />            {/* Due/deadline info */}
  </div>
  <h4 className="kanban-card__title">{task.title}</h4>
  {task.note && <p className="kanban-card__note">{task.note}</p>}
  <div className="chip-wrap dense kanban-card__tags">
    {taskTags.slice(0, 2).map((tag) => <span>#{tag.name}</span>)}
    {taskTags.length > 2 && <span className="kanban-card__tags-more">+{taskTags.length - 2}</span>}
  </div>
  <footer>
    <span>{list?.name}</span>
    {task.subtasks.length > 0 && (
      <div>
        <span>{completedSubtasks}/{task.subtasks.length} 子任务</span>
        <div className="kanban-subtask-bar">
          <div style={{ width: `${Math.round((completedSubtasks / task.subtasks.length) * 100)}%` }} />
        </div>
      </div>
    )}
  </footer>
</article>
```

**Card Details**:
- Status & Priority badges (inline editable)
- Title and optional note
- Up to 2 tags displayed, "+N" if more
- List name indicator
- **Subtask progress bar** (if subtasks exist)

### **Summary**
✅ **Exactly 3 columns**: todo, doing, done
✅ **No WIP limit** enforcement
✅ **No column customization** (hardcoded)
✅ **Drag-to-move** between columns
✅ **Subtask progress** visualization per card
✅ **Inline editing** of status & priority via badges

---

## 6. Task Time Fields

### Location
- `packages/taskflow-core/src/domain.ts` (lines 71-98)

### **Exact Time Fields**

```typescript
// From domain.ts:71-98
export interface Task {
  id: string
  title: string
  note: string
  listId: string
  tagIds: string[]
  priority: Priority
  status: TaskStatus
  
  // TIME FIELDS:
  startAt: string | null        // 开始时间 (ISO8601)
  dueAt: string | null          // 计划完成时间 (ISO8601)
  deadlineAt?: string | null    // 截止时间 (ISO8601, optional)
  
  // REPEAT & REMINDERS:
  repeatRule: string            // Repeat pattern (see repeat-rule.ts)
  reminders: Reminder[]         // Array of reminders
  
  // SUBTASKS & COLLABORATION:
  subtasks: Subtask[]
  attachments: TaskAttachment[]
  assignee: string | null       // Single assignee
  collaborators: string[]       // Array of collaborators
  comments: Comment[]           // Array of comments
  
  // TRACKING:
  estimatedPomodoros: number
  completedPomodoros: number
  focusMinutes: number
  
  // STATUS:
  completed: boolean
  deleted: boolean
  sortOrder?: number
  
  // TIMESTAMPS:
  createdAt: string             // ISO8601
  updatedAt: string             // ISO8601
}
```

### **Time Field Summary**

| Field | Type | Purpose | Notes |
|-------|------|---------|-------|
| `startAt` | ISO8601 nullable | When task work begins | Optional, used in Timeline view |
| `dueAt` | ISO8601 nullable | When task should be completed | Primary scheduling time |
| `deadlineAt` | ISO8601 nullable | Hard deadline if different from dueAt | Optional, for urgency tracking |
| `createdAt` | ISO8601 | When task was created | Auto-set |
| `updatedAt` | ISO8601 | Last modification time | Updated on any change |

### **Time Format Examples**
```
"2026-04-12"                 // Date only (YYYY-MM-DD)
"2026-04-12T14:30:00"        // DateTime (YYYY-MM-DDTHH:mm:ss)
"2026-04-12T14:30:00Z"       // DateTime with UTC (ISO8601 full)
```

### **Field Naming Pattern**
✅ **`*At` suffix convention** for all temporal fields
✅ **NOT** `plannedAt`/`deadlineAt` - uses `dueAt` for plan + `deadlineAt` for hard deadline
✅ Allows dual-time tracking for "plan to complete" vs "must complete by"

---

## 7. Repeat Task Completion

### Location
- `packages/taskflow-core/src/repeat-rule.ts` (151 lines)

### **Repeat Rule Format**

```typescript
// From repeat-rule.ts:18-25
export type RepeatRule =
  | ''                      // No repeat
  | 'daily'                 // Every day
  | 'weekdays'              // Mon-Fri only
  | 'weekly'                // Same weekday each week
  | 'monthly'               // Same date each month
  | 'yearly'                // Same month/day each year
  | `custom:${number}${'d' | 'w' | 'm'}`  // Custom: 3d, 2w, 1m, etc.
```

### **Predefined Options**
```typescript
// From repeat-rule.ts:27-38
export const REPEAT_RULE_OPTIONS: { value: RepeatRule; label: string }[] = [
  { value: '', label: '不重复' },
  { value: 'daily', label: '每天' },
  { value: 'weekdays', label: '每个工作日' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'yearly', label: '每年' },
  { value: 'custom:2d', label: '每2天' },
  { value: 'custom:3d', label: '每3天' },
  { value: 'custom:2w', label: '每2周' },
  { value: 'custom:2d', label: '自定义间隔…' },  // Note: duplicate value for custom
]
```

### **Completion Workflow - Next Task Generation**

```typescript
// From repeat-rule.ts:116-150
export const createNextRepeatTask = <T extends {
  id: string
  repeatRule: string
  dueAt: string | null
  deadlineAt?: string | null
  completed: boolean
  completedPomodoros: number
  focusMinutes: number
  subtasks: Array<{ completed: boolean }>
  activity: unknown[]
}>(task: T): Omit<T, 'id'> | null => {
  if (!task.repeatRule || !task.dueAt) return null

  const nextDue = nextDueDate(task.repeatRule, task.dueAt)
  if (!nextDue) return null

  // Calculate deadline offset (if it exists)
  let nextDeadline: string | null = null
  if (task.deadlineAt && task.dueAt) {
    const offset = new Date(task.deadlineAt).getTime() - new Date(task.dueAt).getTime()
    nextDeadline = new Date(new Date(nextDue).getTime() + offset).toISOString()
  }

  return {
    ...task,
    dueAt: nextDue,
    deadlineAt: nextDeadline,
    completed: false,
    completedPomodoros: 0,    // Reset tracking
    focusMinutes: 0,          // Reset focus time
    subtasks: task.subtasks.map(s => ({ ...s, completed: false })),  // Reset subtasks
    activity: [],             // Clear activity log
  }
}
```

**Returns**: New task object (excluding `id`) or `null` if no repeat

### **Next Due Date Calculation**

```typescript
// From repeat-rule.ts:66-110
export const nextDueDate = (rule: string, fromDate: string): string | null => {
  if (!rule || !fromDate) return null

  const base = new Date(fromDate)
  if (isNaN(base.getTime())) return null

  const next = new Date(base)

  switch (rule) {
    case 'daily':
      next.setDate(next.getDate() + 1)
      break
    case 'weekdays': {
      next.setDate(next.getDate() + 1)
      // Skip weekends
      while (next.getDay() === 0 || next.getDay() === 6) {
        next.setDate(next.getDate() + 1)
      }
      break
    }
    case 'weekly':
      next.setDate(next.getDate() + 7)
      break
    case 'monthly':
      next.setMonth(next.getMonth() + 1)
      break
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1)
      break
    default:
      if (rule.startsWith('custom:')) {
        const code = rule.slice(7)
        const num = parseInt(code)
        const unit = code.slice(String(num).length)
        if (unit === 'd') next.setDate(next.getDate() + num)
        else if (unit === 'w') next.setDate(next.getDate() + num * 7)
        else if (unit === 'm') next.setMonth(next.getMonth() + num)
        else return null
      } else {
        return null
      }
  }

  return next.toISOString()
}
```

### **Repeat Task Visual Indicator**

❌ **NO VISUAL INDICATOR** in current codebase
- Repeat tasks are stored with `repeatRule` field
- Frontend would need to display badge/icon indicating repeat status
- Currently: no UI component explicitly shows repeat status

### **Text Description Function**

```typescript
// From repeat-rule.ts:40-58
export const describeRepeatRule = (rule: string): string => {
  if (!rule) return ''
  switch (rule) {
    case 'daily': return '每天'
    case 'weekdays': return '每个工作日'
    case 'weekly': return '每周'
    case 'monthly': return '每月'
    case 'yearly': return '每年'
    default:
      if (rule.startsWith('custom:')) {
        const code = rule.slice(7)
        const num = parseInt(code)
        const unit = code.slice(String(num).length)
        const unitLabel = { d: '天', w: '周', m: '个月' }[unit] ?? unit
        return `每 ${num} ${unitLabel}`
      }
      return rule
  }
}
```

### **Summary**
✅ **7 repeat patterns** + custom intervals
✅ **Weekday-aware** (weekdays pattern skips weekends)
✅ **Deadline offset preservation** (maintains dueAt→deadlineAt gap)
✅ **Reset on completion**: `completedPomodoros`, `focusMinutes`, `subtasks`, `activity` all reset
✅ **Returns null** if no repeat or missing dueAt
❌ **No visual indicator** for repeat tasks in UI

---

## 8. Collaboration Fields

### Location
- `packages/taskflow-core/src/domain.ts` (lines 86-88)

### **Collaboration Interface**

```typescript
// From domain.ts:86-88 (Task interface)
assignee: string | null              // Single assignee (string ID or user ID)
collaborators: string[]              // Multiple collaborators (array of IDs)
comments: Comment[]                  // Inline comments/discussion
```

### **Comment Structure**

```typescript
// From domain.ts:47-52
export interface Comment {
  id: string
  author: string                     // User identifier
  content: string                    // Comment text
  createdAt: string                  // ISO8601 timestamp
}
```

### **Activity Log**

```typescript
// From domain.ts:54-58
export interface ActivityItem {
  id: string
  content: string                    // Activity description
  createdAt: string                  // ISO8601 timestamp
}
```

### **Current Implementation Status**

✅ **Data model includes**:
- `assignee` (single owner)
- `collaborators[]` (multiple team members)
- `comments[]` (discussion thread)
- `activity[]` (change history)

❌ **NOT visible in UI components** examined:
- MatrixView: No assignee/collaborator display
- KanbanView: No assignee/collaborator display
- MobileFocusView: No assignee/collaborator display
- StatsView: No collaboration metrics

**Status**: Collaboration fields are **defined but not utilized** in current frontend implementation

### **Summary of Collaboration**

| Feature | Type | Status | Notes |
|---------|------|--------|-------|
| Assignee | Single user | ✅ Defined | Field exists but not rendered |
| Collaborators | Array | ✅ Defined | Can store multiple, not implemented in UI |
| Comments | Thread | ✅ Defined | Full model with id/author/createdAt |
| Activity Log | Timeline | ✅ Defined | For audit trail/change history |
| Attachments | Files | ✅ Defined | Model exists (5 fields) |

---

# Appendix: Quick Reference

## Time Fields on Task
```typescript
startAt: string | null        // When work begins
dueAt: string | null          // Plan to complete
deadlineAt?: string | null    // Must complete by
createdAt: string             // Auto-set
updatedAt: string             // Auto-updated
```

## Matrix Quadrant Logic (TAG-BASED)
```
Tag urgent + Tag important  → Q1 (紧急且重要)
Tag important only          → Q2 (重要不紧急)
Tag urgent only             → Q3 (紧急不重要)
No tags                     → Q4 (不紧急不重要)
```

## Smart Entry Supported Syntax
- Time: 今天/明天/后天 | N天/周/月后 | 下周一 | 下月5号 | 本周二
- Time-of-day: 上午10点 | 下午3:30 | 晚上11点
- Tags: #标签名 (strips and collects)
- Priority: !紧急 | !高 | !p1 | !1

## Kanban Columns (Hardcoded)
1. todo (待办)
2. doing (进行中)
3. done (已完成)
**No WIP limit, no config**

## Mobile Swipe Thresholds
- 60px: Reveal actions
- 100px: Direct complete (right)
- -60px: Reveal snooze/delete (left)

## Repeat Rule Types
- daily, weekdays, weekly, monthly, yearly
- custom:Nd, custom:Nw, custom:Nm (N=number)

## Collaboration Fields (Defined but Not Used)
- assignee (single)
- collaborators[] (multiple)
- comments[] (with author/content/timestamp)
- activity[] (audit trail)

