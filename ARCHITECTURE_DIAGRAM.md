# TaskFlow Architecture Diagrams

## System Architecture (High Level)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          TaskFlow Platform                              │
│                     (Multi-Platform Task Management)                    │
└─────────────────────────────────────────────────────────────────────────┘

                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
                    ▼                 ▼                 ▼
        ┌─────────────────────┐ ┌──────────────┐ ┌──────────────────┐
        │   Web Browser App   │ │ Desktop App  │ │ Obsidian Plugin  │
        │  (React + Vite)     │ │  (Tauri)     │ │ (React Component)│
        │                     │ │              │ │                  │
        │ - 5 Views           │ │ - Same UI    │ │ - Custom View    │
        │ - Mobile Responsive │ │ - SQLite DB  │ │ - Self-contained │
        │ - localStorage      │ │ - Plugins    │ │ - loadData/save  │
        └──────────┬──────────┘ └──────┬───────┘ └────────┬─────────┘
                   │                   │                   │
                   └───────────────────┼───────────────────┘
                                       │
                   ┌───────────────────┴───────────────────┐
                   │                                       │
                   ▼                                       ▼
        ┌──────────────────────────┐        ┌──────────────────────┐
        │  @taskflow/core Package  │        │   Storage Backends   │
        │  (Shared Domain Logic)   │        │                      │
        │                          │        │ - localStorage       │
        │ - domain.ts              │        │ - SQLite (Tauri)     │
        │ - selectors.ts           │        │ - Supabase (Cloud)   │
        │ - dates.ts               │        │ - Obsidian loadData  │
        │ - timeline.ts            │        └──────────────────────┘
        │ - smart-entry.ts         │
        │ - reminder-engine.ts     │
        │ - repeat-rule.ts         │
        │ - meta.ts                │
        └──────────────────────────┘
```

---

## Core Domain Model

```
┌──────────────────────────────────────────────────────────────────┐
│                        TASK CENTRAL ENTITY                        │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─ Basic Info                                                   │
│  ├─ id, title, note                                              │
│  ├─ listId (which list), priority, status                        │
│  │                                                                │
│  ├─ Organization                                                 │
│  ├─ tagIds[] (multi-select)                                      │
│  │                                                                │
│  ├─ Scheduling (3-date system)                                   │
│  ├─ startAt (when to begin)                                      │
│  ├─ dueAt (planned completion)                                   │
│  ├─ deadlineAt (hard deadline)                                   │
│  │                                                                │
│  ├─ Automation & Recurrence                                      │
│  ├─ repeatRule (recurrence pattern)                              │
│  ├─ reminders[] (multiple, relative or absolute)                 │
│  │                                                                │
│  ├─ Breakdown & Details                                          │
│  ├─ subtasks[]                                                   │
│  ├─ attachments[] (embedded or path references)                  │
│  │                                                                │
│  ├─ Collaboration (future)                                       │
│  ├─ assignee, collaborators[]                                    │
│  ├─ comments[]                                                   │
│  │                                                                │
│  ├─ Tracking & Insights                                          │
│  ├─ estimatedPomodoros / completedPomodoros                      │
│  ├─ focusMinutes                                                 │
│  ├─ activity[] (full audit log)                                  │
│  │                                                                │
│  ├─ Status                                                       │
│  ├─ completed (boolean)                                          │
│  ├─ deleted (soft delete)                                        │
│  │                                                                │
│  └─ Timestamps                                                   │
│     createdAt, updatedAt                                         │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘

Supporting Entities:

TodoList ─┬─┬─ id, name, color
          ├─┬─ folderId (optional)
          └─┬─ kind: 'system' | 'custom'

Tag ──────┬─┬─ id, name, color

Folder ───┬─┬─ id, name, color

Reminder ─┬─┬─ id, label, value
          ├─┬─ kind: 'relative' | 'absolute'
          └─┬─ (values like "deadline|3d" or ISO timestamp)

SavedFilter ──┬─ id, name, icon
              ├─ listIds[], tagIds[], priority[]
              └─ due: 'overdue' | 'today' | 'week' | 'none'
```

---

## Web Application Structure

```
/web/src/
│
├─ App.tsx (3000+ lines - main orchestrator)
│  ├─ useAuth() hook
│  ├─ useRealtimeSync() hook
│  ├─ Main state (tasks, lists, tags, filters, folders)
│  ├─ UI state (selection, view, modals)
│  ├─ Event handlers (CRUD, drag, etc.)
│  └─ Conditional rendering per view
│
├─ components/
│  │
│  ├─ views/ (6 view components)
│  │  ├─ ListView.tsx
│  │  ├─ CalendarView.tsx (month/week/agenda)
│  │  ├─ KanbanView.tsx (3-column status board)
│  │  ├─ TimelineView.tsx (Gantt-like scheduling)
│  │  ├─ MatrixView.tsx (Eisenhower Q1-Q4)
│  │  └─ StatsView.tsx (productivity insights)
│  │
│  ├─ TaskDetailPanel.tsx (full task editor)
│  ├─ InlineCreatePopover.tsx (quick create)
│  ├─ TagManagementDialog.tsx (tag CRUD)
│  ├─ WorkspaceSidebar.tsx (navigation)
│  ├─ ReminderCenterPanel.tsx (notifications)
│  ├─ TaskBottomSheet.tsx (mobile)
│  ├─ AuthPage.tsx (login)
│  └─ shared.tsx (UI components)
│
├─ mobile/ (mobile-specific views)
│  ├─ MobileFocusView.tsx (inbox with sections)
│  ├─ MobileCalendarView.tsx
│  ├─ MobileMatrixView.tsx
│  ├─ MobileMeView.tsx (stats)
│  ├─ MobileProjectsView.tsx
│  ├─ MobileSheets.tsx (bottom sheets)
│  └─ MobileTaskDetailContent.tsx
│
├─ stores/
│  └─ mobileUiStore.ts (Zustand state for mobile UI)
│
├─ hooks/
│  ├─ useAuth.ts (Supabase auth)
│  ├─ useRealtimeSync.ts (real-time listener)
│  ├─ useReminderCenter.ts (reminder events)
│  ├─ useGlobalShortcuts.ts (keyboard handlers)
│  └─ useSystemTheme.ts (dark mode detection)
│
├─ types/
│  ├─ domain.ts (re-export from @taskflow/core)
│  ├─ workspace.ts (UI-specific types)
│  └─ supabase.ts (Supabase client types)
│
├─ utils/
│  ├─ storage.ts (localStorage API)
│  ├─ desktop-repository.ts (SQLite CRUD)
│  ├─ desktop-sqlite.ts (SQLite schema)
│  ├─ supabase.ts (Supabase client)
│  ├─ workspace-helpers.ts (UI helpers)
│  ├─ offline-queue.ts (offline batching)
│  ├─ notifications.ts (native alerts)
│  └─ [re-exports from @taskflow/core]
│
└─ index.css (172 KB stylesheet)
```

---

## Data Flow Diagram

```
User Interaction (Click, Drag, Type)
         │
         ▼
    ┌────────────────────┐
    │  Event Handler     │
    │  in App.tsx        │
    └────────┬───────────┘
             │
             ▼
    ┌─────────────────────────────────────┐
    │  State Update                       │
    │  (React setState or Zustand)        │
    │                                     │
    │  - Update task in memory            │
    │  - Trigger re-render                │
    │  - Queue for persistence            │
    └────────┬────────────────────────────┘
             │
      ┌──────┴──────┐
      │             │
      ▼             ▼
  ┌────────┐  ┌──────────────────┐
  │ Persist│  │ Offline Queue    │
  │ Backend│  │ (if offline)      │
  │        │  │                  │
  │- Local │  │ localStorage     │
  │- SQLite│  │                  │
  │        │  │ → Batch flush    │
  │- Cloud │  │   on reconnect   │
  └────────┘  └──────────────────┘
      │             │
      └──────┬──────┘
             │
             ▼
    ┌─────────────────────┐
    │ Audit Trail         │
    │ (Activity Log)      │
    │                     │
    │ Record change in    │
    │ task.activity[]     │
    └─────────────────────┘
```

---

## View Architecture

```
WORKSPACE VIEWS (User can switch between them)
│
├─ LIST VIEW
│  ├─ Flat task list
│  ├─ Filters: Selection, Tags, Search
│  ├─ Sorting: Priority, Date, etc.
│  └─ Interactions: Click detail, Drag reorder, Checkbox complete
│
├─ CALENDAR VIEW (3 modes)
│  ├─ MONTH
│  │  ├─ 7x6 grid (days of month)
│  │  ├─ Each cell shows tasks for that date
│  │  └─ Click date to see details
│  │
│  ├─ WEEK
│  │  ├─ 7-column agenda layout
│  │  ├─ Compact task list per day
│  │  └─ Navigate with prev/next
│  │
│  └─ AGENDA
│     ├─ Flat chronological list
│     ├─ Grouped by date
│     └─ Includes today + upcoming
│
├─ KANBAN VIEW
│  ├─ 3-column board
│  │  ├─ Column 1: Todo (status=todo)
│  │  ├─ Column 2: Doing (status=doing)
│  │  └─ Column 3: Done (status=done)
│  │
│  ├─ Within each column: sorted by priority
│  └─ Interactions: Drag card between columns
│
├─ TIMELINE VIEW (Gantt-like)
│  ├─ 2 time scales
│  │  ├─ DAY: 24-hour grid with 30-min intervals
│  │  └─ WEEK: 7 days across
│  │
│  ├─ Each task is horizontal bar (startAt → dueAt)
│  ├─ Visual blocks with labels
│  ├─ Interactions:
│  │  ├─ Drag bar = move time window
│  │  ├─ Drag edges = resize duration
│  │  └─ Snaps to 30-min grid
│  │
│  └─ Quick create buttons at: 09:00, 13:00, 18:00, 21:00
│
└─ MATRIX VIEW (Eisenhower)
   └─ 2x2 grid
      ├─ Q1 (Urgent + Important)
      │  └─ Do First
      ├─ Q2 (Not Urgent + Important)
      │  └─ Schedule
      ├─ Q3 (Urgent + Not Important)
      │  └─ Delegate
      └─ Q4 (Not Urgent + Not Important)
         └─ Eliminate
      
      Assignment via special tags:
      - tag-urgent: marks as URGENT
      - tag-important: marks as IMPORTANT

SELECTION CONTROLS
├─ Active Selection: which list/tag/filter to view
├─ Tag Filter: multi-tag AND filter
├─ Search: full-text in title, note, tag names
└─ Time Mode Toggle: "Planned" (dueAt) vs "Deadline" (deadlineAt)
   - Per selection (today vs upcoming)
```

---

## Obsidian Plugin Structure

```
/todo-obsidian-plugin/src/
│
├─ main.ts
│  ├─ Plugin class extends Obsidian.Plugin
│  ├─ onload()
│  │  ├─ registerView() → TODO_WORKSPACE_VIEW_TYPE
│  │  ├─ addRibbonIcon() → Open Todo Workspace
│  │  ├─ addCommand() → Command Palette entries
│  │  └─ addSettingTab()
│  │
│  ├─ getData() / getSettings()
│  ├─ subscribe() → listener pattern
│  ├─ updateSettings()
│  │
│  ├─ Task CRUD
│  │  ├─ createTask(payload)
│  │  ├─ updateTask(taskId, patch)
│  │  ├─ toggleTask(taskId)
│  │  ├─ softDeleteTask(taskId)
│  │  ├─ deleteTask(taskId)
│  │  └─ restoreTask(taskId)
│  │
│  ├─ Subtask CRUD
│  │  ├─ addSubtask(taskId, title)
│  │  └─ toggleSubtask(taskId, subtaskId)
│  │
│  ├─ Comment Management
│  │  └─ addComment(taskId, content)
│  │
│  ├─ Reminder Management
│  │  ├─ addReminder(taskId, label, value, kind)
│  │  ├─ removeReminder(taskId, reminderId)
│  │  └─ snoozeReminder(taskId, ruleIndex, minutes)
│  │
│  ├─ List/Tag Management
│  │  ├─ addList(name, color)
│  │  ├─ addTag(name, color)
│  │  ├─ updateTag(tagId, name, color)
│  │  └─ deleteTag(tagId)
│  │
│  ├─ Folder Management
│  │  ├─ createFolder(name, color)
│  │  ├─ renameFolder(folderId, name)
│  │  └─ deleteFolder(folderId)
│  │
│  ├─ Bulk Operations
│  │  ├─ bulkComplete(ids)
│  │  ├─ bulkDelete(ids)
│  │  ├─ bulkMoveToList(ids, listId)
│  │  └─ bulkAddTag(ids, tagId)
│  │
│  ├─ Filter Management
│  │  ├─ createFilter(name, icon, config)
│  │  └─ deleteFilter(filterId)
│  │
│  ├─ Task Navigation
│  │  ├─ moveTaskToQuadrant(taskId, quadrant)
│  │  ├─ moveTaskToDate(taskId, toDateKey)
│  │  └─ openTaskSource(taskId)
│  │
│  ├─ Vault Integration
│  │  └─ getVaultTags()
│  │
│  └─ Internal
│     ├─ loadPluginState()
│     ├─ persist()
│     └─ emitChange() → notify subscribers
│
├─ view.ts
│  └─ TodoWorkspaceView extends ItemView
│     ├─ React component renders task UI
│     └─ Communicates with plugin via ref
│
├─ settings.ts
│  └─ TodoWorkspaceSettingTab
│     ├─ leafTarget: 'right' | 'main'
│     └─ autoLinkActiveNote: boolean
│
├─ types.ts
│  ├─ Re-exports core domain types
│  ├─ TodoPluginData interface
│  ├─ TodoPluginSettings interface
│  └─ CreateTaskPayload interface
│
└─ core/ (shared logic modules)
   ├─ domain.ts (re-export from main web package)
   ├─ dates.ts
   ├─ selectors.ts
   ├─ smart-entry.ts
   ├─ repeat-rule.ts
   └─ reminder-engine.ts

PERSISTENCE
└─ Obsidian.loadData() / saveData()
   ├─ Tasks: Task[]
   ├─ Lists: TodoList[]
   ├─ Tags: Tag[]
   ├─ Folders: Folder[]
   ├─ Filters: SavedFilter[]
   └─ Settings: TodoPluginSettings

COMMANDS
├─ open-todo-workspace
└─ capture-task-from-active-note (if file active)
```

---

## Mobile UI State Management

```
Zustand Store: useMobileUiStore

┌────────────────────────────────────────────────────────────┐
│                  MOBILE UI STATE                           │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  Navigation Tab
│  ├─ mobileTab: 'focus' | 'calendar' | 'matrix' | 'me'     │
│  └─ mobileTabFading: boolean (fade transition)             │
│                                                             │
│  Focus View
│  ├─ mobileFocusScope: 'all' | 'today' | 'week' | 'list'   │
│  ├─ mobileFocusScopeListId: string | null                 │
│  ├─ mobileFocusScopeMenuOpen: boolean                     │
│  └─ mobileFocusUpcomingCollapsed: boolean                 │
│                                                             │
│  Calendar View
│  ├─ mobileCalendarMode: 'month' | 'week' | 'agenda'      │
│  └─ mobileCalendarModeMenuOpen: boolean                   │
│                                                             │
│  Task Detail
│  ├─ selectedTaskId: string | null                         │
│  └─ taskSheetOpen: boolean                                │
│                                                             │
│  Quick Create
│  ├─ quickCreateOpen: boolean                              │
│  └─ quickCreateDefaultDueAt: string | null                │
│                                                             │
│  Toast Notifications
│  └─ completionToast: { taskId, title } | null            │
│                                                             │
└────────────────────────────────────────────────────────────┘

Used by:
├─ MobileFocusView (check scope, collapsed state)
├─ MobileCalendarView (check calendar mode)
├─ MobileMatrixView (check selection)
├─ MobileMeView (check selection)
└─ Mobile Tab Navigation (switch tabs, manage transitions)
```

---

## Smart Entry Parsing Pipeline

```
User Input
│
│  "明天下午2点打电话 #工作 !高"
│
▼
┌─────────────────────────────────────────────────────────────┐
│         parseSmartEntry() Function (@taskflow/core)          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Step 1: Extract Tags (#xxx)
│  ├─ Regex: /#([\u4e00-\u9fa5\w]+)/g
│  ├─ Found: "工作" → tagNames.push("工作")
│  └─ Remove from working text
│
│  Step 2: Extract Priority (!xxx)
│  ├─ Regex: /!(紧急|高|普通|低|[1-4])/g
│  ├─ Found: "高" → priority = "high"
│  └─ Remove from working text
│
│  Step 3: Extract Date Expression
│  ├─ Check for keywords:
│  │  ├─ "今天" → today
│  │  ├─ "明天" → tomorrow
│  │  ├─ "后天" → day after tomorrow
│  │  ├─ "下周N" → next weekday
│  │  ├─ "下个月" → next month
│  │  └─ "N天后" → N days from today
│  │
│  └─ Result: dateKey = "2026-04-13"
│
│  Step 4: Extract Time Expression
│  ├─ Check for keywords:
│  │  ├─ "上午" → 09:00
│  │  ├─ "下午" → 14:00
│  │  ├─ "晚上" → 20:00
│  │  └─ "N点M分" → HH:MM
│  │
│  └─ Result: hour = 14, minute = 0
│
│  Step 5: Build Result
│  ├─ title = remaining text after removals → "打电话"
│  ├─ rawInput = original full input
│  ├─ dueAt = "2026-04-13T14:00"
│  ├─ tagNames = ["工作"]
│  └─ priority = "high"
│
└─────────────────────────────────────────────────────────────┘
│
▼
SmartEntryResult {
  title: "打电话"
  rawInput: "明天下午2点打电话 #工作 !高"
  dueAt: "2026-04-13T14:00"
  tagNames: ["工作"]
  priority: "high"
}
│
▼
Caller (usually InlineCreatePopover)
├─ Convert tagNames to tagIds (via tag lookup)
├─ Create task with all fields
└─ Notify user of creation
```

---

## Desktop vs Mobile Branch Points

```
App.tsx Main Component
│
├─ Detect platform (useMediaQuery or user agent)
│
├─ If Desktop (1024px+):
│  ├─ Render full workspace sidebar
│  ├─ Render full views
│  │  ├─ ListView
│  │  ├─ CalendarView (full size)
│  │  ├─ KanbanView
│  │  ├─ TimelineView
│  │  └─ MatrixView
│  │
│  ├─ Task detail panel (side panel or modal)
│  ├─ Inline create popover (floating/docked)
│  └─ Full toolbar & shortcuts
│
└─ If Mobile (<1024px):
   ├─ Hide sidebar (or hamburger menu)
   ├─ Render tab navigation (4 tabs)
   │  ├─ Focus (MobileFocusView)
   │  ├─ Calendar (MobileCalendarView)
   │  ├─ Matrix (MobileMatrixView)
   │  └─ Me (MobileMeView)
   │
   ├─ Tab content area (single active tab)
   ├─ Bottom sheets for details & quick create
   └─ Simplified toolbar
```

---

## Timeline Drag Operations

```
User initiates drag on task bar in TimelineView
│
▼
┌──────────────────────────────────────────────────────┐
│  Drag Session Starts                                  │
│  - Store original positions (startAt ms, dueAt ms)   │
│  - Detect drag mode:                                  │
│    ├─ Left edge → resize-start                       │
│    ├─ Right edge → resize-end                        │
│    └─ Middle → move                                  │
└────────┬─────────────────────────────────────────────┘
         │
         ▼
    ┌──────────────────────────────────────────────────┐
    │  Pointer Move Events                             │
    │  - Calculate delta from original mouse position  │
    │  - Snap to TIMELINE_STEP_MINUTES (30 min)       │
    │  - Show preview (blue bar with label)           │
    └────────┬─────────────────────────────────────────┘
             │
      ┌──────┴──────┐
      │             │
      ▼             ▼
  [Move]       [Resize-Start/End]
  │             │
  ├─ Apply      ├─ Apply delta
  │  delta      │  to edge
  │  to both    │
  │  dates      ├─ Enforce 30-min
  │             │  minimum
  │             └─ Clamp to
  │                window
  │
  └──────┬──────┘
         │
         ▼
    ┌──────────────────────────────────────────────────┐
    │  Drag End                                         │
    │  - Validate final state                          │
    │  - updateTask() with new startAt/dueAt          │
    │  - Add to activity log                           │
    │  - Persist to backend                            │
    └──────────────────────────────────────────────────┘
```

---

**End of Architecture Diagrams**
