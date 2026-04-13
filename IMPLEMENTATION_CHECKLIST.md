# TaskFlow Implementation Checklist

## Analysis Matrix (8 Areas × 5 Dimensions)

| Area | Implementation | Code Location | Key Finding | Preview/Config | Status |
|------|---|---|---|---|---|
| **1. Matrix Quadrants** | Tag-based (2 special) | `packages/taskflow-core/src/selectors.ts:242` | `tag-urgent` + `tag-important` = q1,q2,q3,q4 | Drag-to-move updates tags | ✅ Complete |
| **2. Smart Entry NLP** | Chinese parser | `packages/taskflow-core/src/smart-entry.ts` | Supports time/tags/priority, 180 lines | No UI preview | ✅ Complete |
| **3. Mobile Completion** | Direct + gestures | `web/src/mobile/MobileFocusView.tsx:385-584` | No dialog, 200ms anim, swipe thresholds | Right 100px=complete | ✅ Complete |
| **4. Stats View** | 6 metrics + recovery | `web/src/components/views/StatsView.tsx:139` | Heatmap, trend, distribution, streak | Actionable buttons | ✅ Complete |
| **5. Kanban Columns** | 3 hardcoded | `web/src/components/views/KanbanView.tsx:37` | todo→doing→done, no WIP limit | Drag-to-move | ✅ Complete |
| **6. Time Fields** | `startAt`/`dueAt`/`deadlineAt` | `packages/taskflow-core/src/domain.ts:79-81` | Not `plannedAt`, ISO8601 strings | All nullable | ✅ Correct |
| **7. Repeat Rules** | 7 patterns + custom | `packages/taskflow-core/src/repeat-rule.ts:18` | daily/weekdays/weekly/monthly/yearly/custom | No UI indicator | ✅ Complete |
| **8. Collaboration** | Defined but unused | `packages/taskflow-core/src/domain.ts:86-88` | assignee, collaborators[], comments[], activity[] | Model ready | ✅ Defined |

---

## Detailed Findings

### 1. Matrix View Quadrants

#### Question: Tag-based or priority+deadline based?
**Answer: TAG-BASED**

**Logic Flow**:
```
Task.tagIds includes 'tag-urgent'? + includes 'tag-important'?
├─ Yes + Yes    → Q1 (紧急且重要)
├─ No + Yes     → Q2 (重要不紧急)
├─ Yes + No     → Q3 (紧急不重要)
└─ No + No      → Q4 (不紧急不重要)
```

**Exact Code**:
```typescript
export function getQuadrant(task: Task): MatrixQuadrantKey {
  const urgent = task.tagIds.includes(SPECIAL_TAG_IDS.urgent)
  const important = task.tagIds.includes(SPECIAL_TAG_IDS.important)
  if (urgent && important) return 'q1'
  if (!urgent && important) return 'q2'
  if (urgent && !important) return 'q3'
  return 'q4'
}
```

---

### 2. Smart Entry NLP Parsing

#### Question: What syntax is supported? Is there preview?
**Answer: Comprehensive Chinese NLP, NO preview**

**Supported Syntax**:

| Category | Pattern | Example | Result |
|----------|---------|---------|--------|
| **Time (Relative)** | N天/周/月后 | "3天后" | +3 days |
| **Time (Absolute)** | 今天/明天/后天 | "明天" | tomorrow |
| **Time (Weekday)** | 下周X / 本周X | "下周三" | next Wednesday |
| **Time (Month)** | 下月 [N号] | "下月5号" | next month, 5th |
| **Time (Hour)** | [上午/下午/晚上] N:M | "下午3:30" | 15:30 |
| **Tags** | #标签名 | "#周报" | tagNames=['周报'] |
| **Priority** | !紧急/!高/!p1/!1 | "!高" | priority='high' |

**Parsing Order**: Tags → Priority → Date → Time → Title cleanup

**Example**:
```
Input: "完成Q1报告 下周二下午3点 #周报 !高"
Output: {
  title: "完成Q1报告",
  dueAt: "2026-04-22T15:00:00",
  tagNames: ["周报"],
  priority: "high",
  rawInput: "完成Q1报告 下周二下午3点 #周报 !高"
}
```

**Preview Status**: ❌ NO built-in preview in `smart-entry.ts`
- Calling component responsible for preview UI
- Result structure allows UI to display parsed parts

---

### 3. Mobile Focus View Completion

#### Question: Is there confirmation dialog? How does toggle work?
**Answer: NO dialog, direct toggle, rich swipes**

**Interaction Flow**:

```
┌─────────────────────────────────────┐
│  MobileFocusCard                    │
├─────────────────────────────────────┤
│  User Action              Behavior  │
├─────────────────────────────────────┤
│  Tap checkmark          Immediate   │
│  Right swipe 100px      Immediate   │
│  Right swipe 60px       Show hint   │
│  Left swipe 60px        Show delete │
│  Vertical move >10px    Cancel      │
└─────────────────────────────────────┘
```

**Animation**: 200ms fade (tracked via `completingIds` Set)

**Swipe Thresholds**:
```typescript
const SWIPE_THRESHOLD = 60px         // Reveal actions
const COMPLETE_THRESHOLD = 100px     // Direct complete
const AXIS_LOCK = 10px               // Vertical cancels
```

**Left Swipe Actions**:
- "明天" (Snooze to tomorrow)
- "删除" (Delete with soft flag)

---

### 4. Stats View Insights & Recovery

#### Question: What insights/recovery suggestions? Do they have actionable buttons?
**Answer: 6 metrics + 4 visualizations + recovery items WITH buttons**

**Metrics**:
| # | Metric | Display | Highlight |
|---|--------|---------|-----------|
| 1 | Completed | `N / Total` | Count |
| 2 | Active | Count | Count |
| 3 | Overdue | Count | Red if > 0 |
| 4 | Scheduled | Count | Blue |
| 5 | Streak | `N days + longest M days` | Highlight box |
| 6 | Focus Time | `Xh Ym` | Count |

**Visualizations**:
1. **Heatmap**: 52 weeks (SVG grid, 4-intensity green)
2. **Trend**: 30 days (bar chart, today marked)
3. **Priority Distribution**: 4 horizontal bars with counts
4. **Tag Distribution**: N bars (if tags exist)

**Recovery Suggestions**:
```typescript
interface ProjectionRecoveryItem {
  id: string
  title: string
  subtitle: string
  actionLabel: string    // e.g. "快速完成"
  onAction: () => void   // ACTIONABLE BUTTON!
}
```

**Status**: ✅ Each item has **actionable button with callback**

---

### 5. Kanban View - WIP & Columns

#### Question: Is there WIP limit concept? How many columns? Any config?
**Answer: NO WIP limit, 3 hardcoded columns, NO config**

**Columns** (immutable):
1. `todo` (待办)
2. `doing` (进行中)
3. `done` (已完成)

**Column Rendering**:
```typescript
const columns: Record<TaskStatus, Task[]> = { todo: [], doing: [], done: [] }
tasks.forEach((task) => columns[task.status].push(task))

// Render:
(['todo', 'doing', 'done'] as TaskStatus[]).map((status) => (
  <section className="kanban-column">
    <header>
      <h3>{statusMeta[status]}</h3>
      <span>{columns[status].length}</span>  {/* Count */}
    </header>
    {/* Tasks rendered in drop zone */}
  </section>
))
```

**Per-Card Display**:
- Status badge (editable)
- Priority badge (editable)
- Title + optional note
- First 2 tags ("+N" if more)
- List name (colored dot)
- Subtask progress (if exists)

**Configuration Status**: ❌ **NO user config**
- Column order hardcoded
- Column names hardcoded
- Cannot rename/add/remove/reorder
- No WIP limit UI

---

### 6. Task Time Fields

#### Question: What are exact time fields? startAt/dueAt/deadlineAt or plannedAt/deadlineAt?
**Answer: startAt/dueAt/deadlineAt (NOT plannedAt)**

**Field Definitions** (Task interface):

| Field | Type | Purpose | ISO8601 |
|-------|------|---------|---------|
| `startAt` | str\|null | Work begins | ✅ |
| `dueAt` | str\|null | Plan to complete | ✅ |
| `deadlineAt` | str\|null | Must complete by | ✅ |
| `createdAt` | str | Auto-set | ✅ |
| `updatedAt` | str | Auto-updated | ✅ |

**Why NOT `plannedAt`?**
- `dueAt` = primary scheduling field
- `deadlineAt` = optional hard deadline
- Together: `dueAt` is plan, `deadlineAt` is worst-case

**Example**:
```typescript
Task {
  dueAt: "2026-04-15T14:00:00",      // Plan: Tue 2pm
  deadlineAt: "2026-04-16T17:00:00", // Deadline: Wed 5pm
  // = 1 day 3 hour buffer
}
```

---

### 7. Repeat Task Completion

#### Question: How does repeat task completion work? Visual indicator?
**Answer: 7 patterns, calculate next due, preserve deadline offset, NO UI indicator**

**Repeat Patterns**:
| Pattern | Description | Example |
|---------|-------------|---------|
| `''` | No repeat | (disabled) |
| `'daily'` | Every day | 每天 |
| `'weekdays'` | Mon-Fri only | 每个工作日 |
| `'weekly'` | Same weekday | 每周 |
| `'monthly'` | Same date | 每月 |
| `'yearly'` | Same month/day | 每年 |
| `'custom:Nd'` | Every N days | custom:3d → 每3天 |
| `'custom:Nw'` | Every N weeks | custom:2w → 每2周 |
| `'custom:Nm'` | Every N months | custom:1m → 每个月 |

**Completion Flow**:
```typescript
export const createNextRepeatTask = (task: Task) => {
  if (!task.repeatRule || !task.dueAt) return null
  
  const nextDue = nextDueDate(task.repeatRule, task.dueAt)
  if (!nextDue) return null
  
  // Preserve deadline offset
  let nextDeadline = null
  if (task.deadlineAt && task.dueAt) {
    const offset = new Date(task.deadlineAt) - new Date(task.dueAt)
    nextDeadline = new Date(new Date(nextDue) + offset).toISOString()
  }
  
  return {
    ...task,
    dueAt: nextDue,
    deadlineAt: nextDeadline,
    completed: false,
    completedPomodoros: 0,    // RESET
    focusMinutes: 0,          // RESET
    subtasks: subtasks.map(s => ({...s, completed: false})), // RESET
    activity: [],             // CLEAR
  }
}
```

**UI Indicator**: ❌ **NO BADGE/ICON**
- No "🔄" or "Repeats daily" text in UI
- Must be added to MatrixCard/KanbanCard/MobileCard

---

### 8. Collaboration Fields

#### Question: Are there assignee, collaborators, comments fields?
**Answer: YES defined, NO used in UI**

**Collaboration Interface**:
```typescript
Task {
  assignee: string | null              // Single owner ID
  collaborators: string[]              // Multiple team member IDs
  comments: Comment[]                  // Discussion thread
    ├─ id: string
    ├─ author: string
    ├─ content: string
    └─ createdAt: string (ISO8601)
  activity: ActivityItem[]             // Audit log
    ├─ id: string
    ├─ content: string
    └─ createdAt: string (ISO8601)
}
```

**Status**:
- ✅ **Model complete** (5 collaboration fields)
- ✅ **Schema ready** (database layer prepared)
- ❌ **Frontend not implemented**
  - No assignee avatars
  - No mention @collaborators
  - No comment thread UI
  - No activity history display
  - Not referenced in MatrixView, KanbanView, StatsView, MobileFocusView

**Implementation Gap**: All data fields exist but zero UI components use them

---

## Summary Table: What's Implemented vs Missing

| Feature | Data Model | UI Component | Status | Gap |
|---------|-----------|-------------|--------|-----|
| Matrix Quadrants | ✅ | ✅ | Complete | None |
| Smart Entry NLP | ✅ | ⚠️ Partial | Core works, no preview | Add preview UI |
| Mobile Gestures | ✅ | ✅ | Complete | None |
| Stats Metrics | ✅ | ✅ | Complete | None |
| Kanban Columns | ✅ | ✅ | Hardcoded | Add config UI |
| WIP Limits | ❌ | ❌ | Not started | Add model + enforcement |
| Time Fields | ✅ | ✅ | Complete | None |
| Repeat Tasks | ✅ | ❌ | No UI indicator | Add badge |
| Collaboration | ✅ | ❌ | Not started | Add assignee/comment UI |

---

## File Locations (Quick Reference)

```
Matrix Logic        → packages/taskflow-core/src/selectors.ts:242-249
Smart Entry         → packages/taskflow-core/src/smart-entry.ts (180 lines)
Mobile Views        → web/src/mobile/MobileFocusView.tsx (585 lines)
Stats Display       → web/src/components/views/StatsView.tsx (446 lines)
Kanban Layout       → web/src/components/views/KanbanView.tsx (254 lines)
Domain Types        → packages/taskflow-core/src/domain.ts (136 lines)
Repeat Logic        → packages/taskflow-core/src/repeat-rule.ts (151 lines)
Metadata            → packages/taskflow-core/src/meta.ts
Matrix UI           → web/src/components/views/MatrixView.tsx (296 lines)
```

