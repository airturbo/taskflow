# TaskFlow - Quick Reference Guide

## 🎯 Project at a Glance

**What is TaskFlow?**  
A sophisticated task management platform with 3 client implementations (Web, Desktop, Mobile) + Obsidian plugin, all sharing the same domain model.

**Tech Stack**: React 19 + TypeScript + Zustand + Tauri + SQLite/Supabase

---

## 📁 Core Packages

### 1. **@taskflow/core** (`/packages/taskflow-core`)
Shared business logic library (1,500+ lines)

**Exports:**
- `domain.ts` - Data types (Task, Tag, TodoList, etc.)
- `selectors.ts` - Task filtering/querying logic
- `dates.ts` - Date/time manipulation
- `timeline.ts` - Gantt chart visualization logic
- `smart-entry.ts` - Natural language parsing
- `reminder-engine.ts` - Reminder firing logic
- `repeat-rule.ts` - Task recurrence
- `meta.ts` - Constants and metadata

**Key Types:**
```typescript
Priority:     'urgent' | 'high' | 'normal' | 'low'
TaskStatus:   'todo' | 'doing' | 'done'
WorkspaceView: 'list' | 'calendar' | 'kanban' | 'timeline' | 'matrix'
CalendarMode: 'month' | 'week' | 'agenda'
TimelineScale: 'day' | 'week'
```

---

## 🖥️ Web App (`/web/src`)

### Views (5 total)
1. **List View** - Flat task list with filters
2. **Calendar View** - Month/week/agenda modes with lunar calendar
3. **Kanban View** - 3-column status board (todo → doing → done)
4. **Timeline View** - Gantt-like hourly scheduling
5. **Matrix View** - Eisenhower matrix (Q1-Q4 based on urgent/important tags)
6. **Stats View** - Productivity insights & recovery panel

### Task Fields
```
Title, Note (markdown)
Priority (4-level)
Status (todo/doing/done)
Schedule: startAt + dueAt + deadlineAt (3-date system)
Tags (multi-select)
ListId (which list)
Subtasks, Attachments, Comments, Reminders
Pomodoros (estimated vs completed)
Activity log (full audit trail)
```

### Features
- ✅ Inline create with smart entry parsing
- ✅ Drag-drop (across views, timeline resize)
- ✅ Batch operations (bulk complete, move, tag)
- ✅ Keyboard shortcuts (Cmd+K search, Cmd+N create, etc.)
- ✅ Dark mode toggle
- ✅ Real-time sync (Supabase optional)
- ✅ Offline queue (for sync when online)

### Storage Backends
- **Web Browser**: localStorage (5-10 MB limit)
- **Desktop (Tauri)**: SQLite (unlimited)
- **Cloud**: Supabase with real-time sync

### Mobile-Specific
- **4 tabs**: Focus, Calendar, Matrix, Me (stats)
- **Focus Tab**: Segments (Overdue → Today Planned → Today Deadline → Inbox → Upcoming)
- **Virtual scrolling** for performance
- **Bottom sheets** for task details, quick create
- **Zustand store** (`mobileUiStore`) manages mobile UI state
- **Responsive** layout adapts to screen size

---

## 📱 Mobile UI Components

### MobileFocusView
- Virtual scrolled task list with sections
- Section headers with emoji icons + counts
- Collapsible "Upcoming" section
- Task cards with priority badges

### MobileCalendarView
- Month/week/agenda mode picker
- Touch-friendly date selection

### MobileMatrixView
- 2x2 grid layout for Eisenhower matrix

### MobileMeView (Stats)
- Simplified productivity metrics
- Completion trends

---

## 🔌 Obsidian Plugin (`/todo-obsidian-plugin`)

**Status**: Independent proof-of-concept (Phase 1 complete)

### Implemented
- ✅ Custom View with React
- ✅ Ribbon icon + Command palette
- ✅ Plugin settings (leafTarget, autoLinkActiveNote)
- ✅ Full Task CRUD with complete domain model
- ✅ Subtasks, Comments, Reminders
- ✅ List/Tag/Folder/Filter management
- ✅ Bulk operations
- ✅ Vault tag integration
- ✅ Source note linking

### Commands
```
open-todo-workspace              → Show Todo Workspace view
capture-task-from-active-note   → Create task from current note
```

### Persistence
- Obsidian's `loadData()` / `saveData()`
- No external dependencies (no Supabase, no Tauri)
- Self-contained state

### Roadmap
- Phase 1 (done): Core CRUD + settings
- Phase 2: Enhanced UI (TaskDetailPanel, grouping)
- Phase 3: Core library migration (share domain logic)
- Phase 4: Advanced views (Kanban, Calendar, Timeline)

---

## 🗄️ Data Model

### Task (Central Entity)
```typescript
{
  id, title, note
  listId, tagIds[], priority, status
  startAt?, dueAt?, deadlineAt?
  repeatRule, reminders[], subtasks[], attachments[]
  assignee?, collaborators[], comments[], activity[]
  estimatedPomodoros, completedPomodoros, focusMinutes
  completed, deleted
  createdAt, updatedAt
}
```

### Supporting Entities
```
TodoList      → { id, name, color, folderId, kind }
Tag           → { id, name, color }
Folder        → { id, name, color }
Reminder      → { id, label, value, kind: 'relative'|'absolute' }
Subtask       → { id, title, completed }
SavedFilter   → { id, name, icon, listIds[], tagIds[], priority[], due }
```

---

## 🎮 UI Interactions

### Views Switching
- Top navbar buttons: List | Calendar | Kanban | Timeline | Matrix
- Or keyboard: Cmd+1, Cmd+2, Cmd+3, Cmd+4, Cmd+5

### Drag Operations
- **Task cards**: Drag between views
- **Timeline**: Drag to move, drag edges to resize (30-min snap grid)
- **Kanban**: Drag between columns (status)
- Preview shows: Title, Status, Priority, Overdue flag

### Quick Create
- **Hotkey**: Cmd+N
- **Location**: Floating popover or top-docked
- **Supports**: Smart entry parsing (see below)
- **Position memory**: Saved to localStorage

### Search
- **Hotkey**: Cmd+K
- **Scope**: Title + Note + Tag names (case-insensitive)

### Time Toggle
- Switch between "Planned" (dueAt) and "Deadline" (deadlineAt) views
- Per-selection toggle (Today vs Upcoming)

---

## 📝 Smart Entry Syntax

Natural language task creation:

**Dates:**
- "今天" → Today
- "明天" → Tomorrow
- "后天" → Day after tomorrow
- "下周一" → Next Monday
- "下个月5号" → 5th of next month
- "N天后", "N周后", "N月后"

**Times:**
- "上午" (morning), "下午" (afternoon), "晚上" (evening)
- "N点M分" (N:MM time)

**Priority:**
- "!紧急" (urgent), "!高" (high), "!普通" (normal), "!低" (low)

**Tags:**
- "#标签名" → Add tag

**Example:**
```
"明天下午2点打电话 #工作 !高"
→ Title: "打电话"
→ Due: Tomorrow at 14:00
→ Tag: "工作" (work)
→ Priority: high
```

---

## 🎨 Special Features

### Eisenhower Matrix (Q1-Q4)
Uses special tags to assign quadrants:
- `tag-urgent` = Urgent flag
- `tag-important` = Important flag

| | Important | Not Important |
|---|-----------|-------------|
| **Urgent** | Q1: Do first | Q3: Delegate |
| **Not Urgent** | Q2: Schedule | Q4: Eliminate |

### Three-Date System
- **startAt**: When work begins
- **dueAt**: Planned completion (primary scheduling)
- **deadlineAt**: Hard deadline (separate from planned)

View toggle: Show by "Planned" or "Deadline"

### Reminder Anchors
Reminders fire relative to one of three dates:
- "deadline" (deadlineAt)
- "planned" (dueAt)
- "start" (startAt)

**Example**: "Remind 1 day before planned" on a task due 4/15 → fires on 4/14

### Repeat Rules
When task marked done:
1. Check if `repeatRule` exists
2. Generate next task with shifted dates
3. Add activity log entry "Generated next recurring task"

### Pomodoro Tracking
- `estimatedPomodoros`: User's effort estimate
- `completedPomodoros`: Actual count
- `focusMinutes`: Deep work duration
- Used in stats view for productivity insights

---

## 🔄 Sync & Storage

### Desktop (Tauri)
- **Backend**: SQLite (local database)
- **Offline**: ✅ Fully functional
- **Plugins**: dialog, notification, opener, sql, store

### Web Browser
- **Backend**: localStorage (5-10 MB)
- **Offline**: ✅ Fully functional
- **Cloud**: Supabase (optional real-time)
- **Auth**: Supabase auth (email/password or OAuth)

### Offline Queue
1. User actions queue if offline
2. Stored in localStorage
3. On reconnect → batch flush to backend
4. Conflict resolution: Last-write-wins (by timestamp)

---

## 🛠️ Development Commands

```bash
# Web dev
npm run dev              # Start Vite server (:5173)
npm run build           # Build web app
npm run build:web       # Build without Tauri

# Desktop
npm run desktop:dev     # Start Tauri dev (hot reload)
npm run desktop:build   # Package desktop app

# Obsidian plugin
cd todo-obsidian-plugin
npm run dev             # esbuild watch
npm run build           # Production build
```

---

## 📊 Feature Matrix

| Feature | Web | Mobile | Obsidian |
|---------|:---:|:------:|:--------:|
| List view | ✅ | ✅ | 🚧 |
| Calendar | ✅ | ✅ | 🚧 |
| Kanban | ✅ | ❌ | 🚧 |
| Timeline | ✅ | ❌ | 🚧 |
| Matrix | ✅ | ✅ | 🚧 |
| Stats | ✅ | ✅ | ❌ |
| Task CRUD | ✅ | ✅ | ✅ |
| Subtasks | ✅ | ✅ | ✅ |
| Reminders | ✅ | ✅ | ✅ |
| Attachments | ✅ | 🚧 | 🚧 |
| Repeat rules | ✅ | ✅ | ✅ |
| Search | ✅ | ✅ | 🚧 |
| Smart entry | ✅ | ✅ | 🚧 |
| Dark mode | ✅ | ✅ | 🚧 |
| Real-time sync | ✅ | ✅ | ✅ |

Legend: ✅ = Complete | 🚧 = Partial/Planned | ❌ = N/A

---

## 🎓 Code Organization

### App.tsx Structure
Main orchestrator (~3,000 lines):
1. Auth & sync hooks
2. Workspace state (tasks, lists, tags, etc.)
3. UI state (selection, view, modals)
4. Event handlers (create, update, delete, drag, etc.)
5. Conditional rendering based on `currentView`
6. Desktop/mobile branches

### Mobile UI Store (Zustand)
```typescript
{
  mobileTab: 'focus' | 'calendar' | 'matrix' | 'me'
  mobileFocusScope: 'all' | 'today' | 'week' | 'list'
  mobileCalendarMode: 'month' | 'week' | 'agenda'
  selectedTaskId, taskSheetOpen
  quickCreateOpen, quickCreateDefaultDueAt
  completionToast
}
```

### Components
- **views/**: ListView, CalendarView, KanbanView, TimelineView, MatrixView, StatsView
- **mobile/**: MobileFocusView, MobileCalendarView, MobileMatrixView, MobileMeView
- **TaskDetailPanel**: Full task editor
- **InlineCreatePopover**: Quick create
- **TagManagementDialog**: Tag CRUD
- **WorkspaceSidebar**: Navigation

---

## 🚀 Next Steps

### To Extend TaskFlow
1. **Mobile App**: Port React UI to React Native / Flutter
2. **Browser Extension**: Capture web pages as tasks
3. **API Server**: REST/GraphQL endpoints for multi-user
4. **Email Integration**: Forward emails as tasks
5. **Calendar Sync**: iCal export, Google Calendar integration
6. **AI Features**: Auto-tagging, priority suggestions

### For Obsidian Plugin
1. Complete TaskDetailPanel UI
2. Migrate core libraries from web
3. Add calendar & kanban views
4. Vault file-based storage option

---

## 💾 Important Locations

| What | Where |
|------|-------|
| Task domain type | `/packages/taskflow-core/src/domain.ts` |
| Core selectors | `/packages/taskflow-core/src/selectors.ts` |
| Main app logic | `/web/src/App.tsx` |
| Views | `/web/src/components/views/` |
| Mobile components | `/web/src/mobile/` |
| Mobile state | `/web/src/stores/mobileUiStore.ts` |
| Desktop storage | `/web/src/utils/desktop-repository.ts` |
| Obsidian main | `/todo-obsidian-plugin/src/main.ts` |
| Smart parsing | `/packages/taskflow-core/src/smart-entry.ts` |
| Reminder logic | `/packages/taskflow-core/src/reminder-engine.ts` |
| Timeline math | `/packages/taskflow-core/src/timeline.ts` |

---

**Last Updated**: April 12, 2026  
**Total Codebase**: ~8,000 lines (+ styles)  
**Monorepo**: web/ + packages/taskflow-core + todo-obsidian-plugin
