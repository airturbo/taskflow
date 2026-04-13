# Phase 10 — Research

## Current State Analysis

### Date Model
- `dueAt` = 计划完成（planned completion）
- `deadlineAt` = 硬性截止（hard deadline）
- Selector functions in `packages/taskflow-core/src/selectors.ts`

### Existing Date Display

#### shared.tsx — TaskTimeSummary
- Shows `formatTaskDualTimeSummary(task)` as primary (dueAt or deadline if no dueAt)
- Shows `formatTaskDeadlineBadge` as a red badge
- Shows "计划晚于 DDL" warning if dueAt > deadlineAt
- **Gap**: dueAt not color-coded blue; deadline badge shows "DDL MM/DD" without distinct icon

#### ListView.tsx
- Uses `TaskTimeSummary` component — inherits above
- No explicit dual-date display beyond the shared component

#### KanbanView.tsx
- Uses `TaskTimeSummary compact` in card header

#### MatrixView.tsx
- Uses `TaskTimeSummary compact` in card top

#### CalendarView.tsx
- Tasks shown by `dueAt` anchor date (via `getCalendarTaskDateKey` → `task.dueAt ?? task.startAt`)
- `TaskDeadlineDot` shown on month chips
- `TaskDeadlineIndicators` shown in week/agenda views
- **Gap**: deadlineAt tasks don't appear on their deadline date — only on dueAt date
- **Gap**: no dual-day marking (blue dot for dueAt day, red dot for deadlineAt day)

#### MobileFocusView.tsx — MobileFocusCard
- Already has good dual display: blue clock icon for dueAt, amber/red calendar icon for deadlineAt
- **Gap**: subtitle labels could be more explicit ("计划" vs "截止")

#### Focus Segments (useWorkspaceComputed.ts)
- 5 groups: overdue / todayPlanned / todayDeadline / inbox / upcoming ✅
- Section headers exist with icons, but subtitles are single words

#### InlineCreatePopover.tsx
- Single "日期" field — maps to `dateKey` which becomes `dueAt`
- No deadlineAt field
- **Gap**: DATE-05 requires expandable deadlineAt field

### What Needs Building

1. **DATE-01**: All views — color-coded dual date display
   - Enhance `TaskTimeSummary` in `shared.tsx` to show dueAt in blue with 📅 icon
   - Already has red deadline badge; improve label ("截止" not just "DDL")

2. **DATE-02**: Focus Tab subtitle clarification
   - Section headers already have icons/titles; add subtitle/description text
   - "今天计划" → subtitle "dueAt 今天" 
   - "今天到期" → subtitle "deadlineAt 今天"

3. **DATE-03**: dueAt > deadlineAt warning badge + one-click fix
   - `isTaskPlannedAfterDeadline` already exists in selectors
   - `TaskTimeSummary` already shows "计划晚于 DDL"
   - Need: one-click fix button that swaps/sets dueAt = deadlineAt
   - Needs: callback in TaskDetailPanel or a new component

4. **DATE-04**: Calendar dual-day marking
   - Month view chips show TaskDeadlineDot (red dot) — good
   - Need: blue dot on dueAt cell when task also has deadlineAt on different day
   - When task has deadlineAt, also show it on its deadline date

5. **DATE-05**: InlineCreatePopover — default dueAt, expandable deadlineAt
   - Rename "日期" label to "计划完成"
   - Add collapsible section for deadlineAt input

### CSS Variables Available
- `--accent: #6384ff` → blue for dueAt
- `--red: #f87171` → red for deadlineAt
- `--amber: #fbbf24` → warning
