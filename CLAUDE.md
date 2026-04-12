# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**TaskFlow** — Monorepo multi-client task management platform  
**Tech Stack**: React 19 + TypeScript 5.9 + Zustand + Tauri + SQLite/Supabase  
**Codebase**: ~8,000 lines TypeScript/React + 500+ lines Rust

---

## 📦 Project Structure

```
/Users/turbo/WorkBuddy/20260330162606/
├── web/                              # React web + Tauri desktop app
│   ├── src/
│   │   ├── App.tsx                  # Main orchestrator (~3,000 lines)
│   │   ├── main.tsx                 # React entry point
│   │   ├── components/              # UI components
│   │   │   ├── views/               # 6 view implementations
│   │   │   │   ├── ListView.tsx
│   │   │   │   ├── CalendarView.tsx (month/week/agenda + lunar calendar)
│   │   │   │   ├── KanbanView.tsx   (todo→doing→done)
│   │   │   │   ├── TimelineView.tsx (Gantt-like hourly scheduling)
│   │   │   │   ├── MatrixView.tsx   (Eisenhower 2x2)
│   │   │   │   └── StatsView.tsx    (productivity + recovery)
│   │   │   ├── mobile/              # Mobile-specific components
│   │   │   │   ├── MobileFocusView.tsx
│   │   │   │   ├── MobileCalendarView.tsx
│   │   │   │   ├── MobileMatrixView.tsx
│   │   │   │   ├── MobileProjectsView.tsx
│   │   │   │   ├── MobileMeView.tsx (stats tab)
│   │   │   │   └── MobileSheets.tsx (bottom sheets)
│   │   │   ├── TaskDetailPanel.tsx  # Full task editor
│   │   │   ├── InlineCreatePopover.tsx
│   │   │   ├── CommandPalette.tsx
│   │   │   ├── WorkspaceSidebar.tsx
│   │   │   ├── AuthPage.tsx, AuthGate.tsx
│   │   │   ├── ReminderCenterPanel.tsx
│   │   │   ├── PwaInstallBanner.tsx
│   │   │   └── [other UI components]
│   │   ├── hooks/                   # React hooks
│   │   │   ├── useAuth.ts           # Supabase auth
│   │   │   ├── useRealtimeSync.ts   # Cloud sync
│   │   │   ├── useReminderCenter.ts # Reminder firing logic
│   │   │   ├── useGlobalShortcuts.ts
│   │   │   ├── usePushNotifications.ts
│   │   │   └── useSystemTheme.ts
│   │   ├── stores/                  # Zustand state
│   │   │   └── mobileUiStore.ts     # Mobile UI state
│   │   ├── utils/                   # Business logic
│   │   │   ├── storage.ts           # localStorage + Supabase
│   │   │   ├── desktop-repository.ts # Tauri SQLite
│   │   │   ├── sync-shared.ts
│   │   │   ├── offline-queue.ts
│   │   │   ├── supabase.ts
│   │   │   ├── dates.ts             # Re-export from core
│   │   │   ├── reminder-engine.ts   # Re-export from core
│   │   │   ├── repeat-rule.ts       # Re-export from core
│   │   │   ├── smart-entry.ts       # Re-export from core
│   │   │   ├── workspace-helpers.ts
│   │   │   ├── auth-events.ts
│   │   │   └── [other utilities]
│   │   ├── types/                   # TypeScript types
│   │   │   ├── domain.ts
│   │   │   ├── workspace.ts
│   │   │   └── supabase.ts
│   │   ├── data/                    # Static data
│   │   │   └── seed.ts
│   │   ├── assets/
│   │   ├── App.css, index.css
│   ├── src-tauri/                   # Tauri desktop shell (Rust)
│   │   ├── src/
│   │   │   └── main.rs
│   │   ├── Cargo.toml               # Rust dependencies
│   │   ├── tauri.conf.json          # Desktop app config
│   │   ├── capabilities/
│   │   └── icons/                   # App icons (32x32, 128x128, etc.)
│   ├── public/                      # Static assets
│   ├── supabase/                    # Supabase migrations
│   ├── dist/                        # Built web app output
│   ├── package.json                 # npm scripts & dependencies
│   ├── vite.config.ts               # Vite + PWA config
│   ├── tsconfig.json, tsconfig.app.json, tsconfig.node.json
│   ├── eslint.config.js
│   ├── index.html                   # PWA manifest setup
│   ├── .env.local.example           # Supabase env vars
│   └── README.md
├── packages/
│   └── taskflow-core/               # Shared business logic library
│       ├── src/
│       │   ├── domain.ts            # Data types (Task, Tag, TodoList, etc.)
│       │   ├── selectors.ts         # Task filtering/querying (1,000+ lines)
│       │   ├── dates.ts             # Date/time manipulation
│       │   ├── timeline.ts          # Gantt chart math
│       │   ├── smart-entry.ts       # Chinese NLP parsing
│       │   ├── reminder-engine.ts   # When/how reminders fire
│       │   ├── repeat-rule.ts       # Task recurrence logic
│       │   ├── meta.ts              # Constants (colors, statuses, etc.)
│       │   └── index.ts
│       └── package.json
├── todo-obsidian-plugin/            # Obsidian integration (Phase 1 complete)
│   ├── src/
│   │   ├── main.ts                  # Plugin entry point
│   │   ├── TaskFlowView.tsx         # React view component
│   │   ├── components/              # Task CRUD UI
│   │   └── types.ts
│   ├── manifest.json                # Obsidian plugin config
│   ├── package.json
│   ├── tsconfig.json
│   ├── esbuild.config.mjs
│   ├── eslint.config.mjs
│   └── README.md
├── agent-team/                      # Python orchestration (GSD workflow)
│   ├── src/
│   ├── roles/
│   ├── runtime/
│   ├── pyproject.toml
│   └── README.md
└── docs/                            # Project documentation

```

---

## 🚀 Build/Test/Lint Commands

### Web Development

```bash
# Start development server (:1420 for Tauri hot reload)
npm run dev

# Type check (strict mode)
npm run build   # or tsc -b

# Production build (web only, relative paths for CloudBase hosting)
npm run build:web
# Output: dist/ (ready for static hosting)

# Lint TypeScript/React
npm run lint    # eslint

# Preview built app
npm run preview
```

### Desktop App (Tauri)

```bash
# Development with hot reload (opens native window)
npm run desktop:dev

# Build production desktop app (macOS, Windows, Linux)
npm run desktop:build
# Outputs: src-tauri/target/release/
```

### Obsidian Plugin

```bash
cd todo-obsidian-plugin

# Type check
npm run check

# Development (watch mode with esbuild)
npm run dev

# Production build
npm run build

# Lint
npm run lint
```

### CI/Build Details

- **Build tool**: Vite (web), esbuild (Obsidian plugin), Cargo (Tauri)
- **Type checking**: TypeScript 5.9 with strict mode enabled
  - `noUnusedLocals: true`
  - `noUnusedParameters: true`
  - `noFallthroughCasesInSwitch: true`
  - `erasableSyntaxOnly: true`
- **Linting**: ESLint with TypeScript plugin, React hooks plugin
- **No CI config found** (no GitHub Actions, Jenkins, etc.)

---

## 🏗️ Architecture Overview

### High-Level Design

**TaskFlow** is a sophisticated task management platform with three client implementations sharing a unified domain model:

1. **Web Client** (React 19) - Responsive SPA with desktop/mobile layouts
2. **Desktop Client** (Tauri 2) - Native app wrapping web UI + local SQLite
3. **Obsidian Plugin** - Note-taking integration (Phase 1 complete)

**Key Architectural Principles:**

- **Monorepo**: Single repo, multiple buildable packages (`web/`, `packages/`, `todo-obsidian-plugin/`)
- **Shared Domain**: `@taskflow/core` library exports all business logic
  - No database-specific code (domain types are pure)
  - Works across web (localStorage), desktop (SQLite), Obsidian (plugin storage)
- **Local-first**: Data persists to local storage first, syncs to cloud asynchronously
- **Offline-capable**: All clients function fully offline with queue-based sync on reconnect
- **Multi-view**: 6 different visualizations of the same task data

### Data Flow

```
User Input (UI Event)
  ↓
App.tsx Event Handler (+ validation)
  ↓
Update PersistedState (in-memory)
  ↓
Dual writes:
  ├→ localStorage / SQLite (synchronous)
  └→ Supabase upsert (async, with retry queue)
  ↓
UI re-renders (React state)
  ↓
Real-time sync listener (optional, if Supabase configured)
  ↑
Conflicts resolved by Last-Write-Wins (timestamp-based)
```

### State Management

**In-Memory State** (React component state in App.tsx):
- `tasks`, `lists`, `tags`, `folders`, `filters`
- `activeSelection`, `currentView`, `theme`
- Derived: `visibleTasks`, `taskStats`, etc.

**Persistent State** (localStorage / SQLite / Supabase):
- `PersistedState` interface contains all above
- Loaded at app startup via `loadState()`
- Saved after each mutation via `saveState()`

**Mobile UI State** (Zustand store):
- `mobileTab`, `mobileFocusScope`, `selectedTaskId`, `taskSheetOpen`, etc.
- Isolated to mobile-specific UX (not synced)

### Sync Architecture

**Desktop (Tauri)**:
- Backend: SQLite via `@tauri-apps/plugin-sql`
- Storage: `desktop-repository.ts` handles all SQL operations
- Offline: ✅ Fully functional (no network needed)
- Optional cloud: Can sync to Supabase if configured

**Web (Browser)**:
- Backend: localStorage (5-10 MB typical quota)
- Storage: `storage.ts` handles serialization/versioning
- Offline: ✅ Fully functional
- Cloud: Supabase real-time (optional via Supabase auth)

**Offline Queue**:
- Location: `offline-queue.ts`
- Strategy: Store mutations while offline, flush on reconnect
- Conflict resolution: Last-write-wins by `updatedAt` timestamp

---

## 📋 Domain Model

### Core Types (from `@taskflow/core/domain`)

```typescript
// Priority levels
type Priority = 'urgent' | 'high' | 'normal' | 'low'

// Task lifecycle
type TaskStatus = 'todo' | 'doing' | 'done'

// UI modes
type WorkspaceView = 'list' | 'calendar' | 'kanban' | 'timeline' | 'matrix'
type CalendarMode = 'month' | 'week' | 'agenda'
type TimelineScale = 'day' | 'week'
type ThemeMode = 'midnight' | 'paper' | 'system'

// Main entity
interface Task {
  id: string                          // UUID
  title: string
  note: string                        // Markdown
  listId: string                      // Which TodoList
  tagIds: string[]                    // Multi-tag support
  priority: Priority
  status: TaskStatus
  
  // 3-date scheduling system
  startAt: string | null              // ISO 8601 (when work starts)
  dueAt: string | null                // ISO 8601 (planned completion)
  deadlineAt?: string | null          // ISO 8601 (hard deadline)
  
  // Recurring
  repeatRule: string                  // RFC 5545 RRULE format
  
  // Notifications & tracking
  reminders: Reminder[]
  subtasks: Subtask[]
  attachments: TaskAttachment[]
  
  // Collaboration
  assignee: string | null
  collaborators: string[]
  comments: Comment[]
  activity: ActivityItem[]
  
  // Pomodoro tracking
  estimatedPomodoros: number
  completedPomodoros: number
  focusMinutes: number
  
  // Metadata
  completed: boolean
  deleted: boolean                    // Soft delete
  sortOrder?: number                  // Custom ordering
  createdAt: string
  updatedAt: string
}

// Supporting entities
interface TodoList {
  id: string
  name: string
  color: string
  folderId: string | null
  kind: 'system' | 'custom'
}

interface Tag {
  id: string
  name: string
  color: string
}

interface Folder {
  id: string
  name: string
  color: string
}

interface Reminder {
  id: string
  label: string                       // "1 day", "09:00 AM"
  value: string                       // RFC 5545 format or ISO time
  kind: 'relative' | 'absolute'
}

interface Subtask {
  id: string
  title: string
  completed: boolean
}

interface Comment {
  id: string
  author: string
  content: string
  createdAt: string
}

interface TaskAttachment {
  id: string
  name: string
  source: 'embedded' | 'desktop-path'
  path: string | null                 // For desktop file references
  dataUrl: string | null              // For embedded images
  mimeType: string | null
  size: number | null
  addedAt: string
}

// Root persisted state
interface PersistedState {
  folders: Folder[]
  lists: TodoList[]
  tags: Tag[]
  filters: SavedFilter[]
  tasks: Task[]
  theme: ThemeMode
  activeSelection: string             // Currently selected list
  selectedTagIds: string[]
  currentView: WorkspaceView
  calendarMode: CalendarMode
  calendarShowCompleted: boolean
  timelineScale: TimelineScale
  firedReminderKeys: string[]         // Reminder deduplication
  onboarding: OnboardingState
}
```

---

## 🔧 Key Modules & APIs

### @taskflow/core (Shared Library)

**domain.ts**
- Exports all TypeScript interfaces
- No dependencies on storage backends

**selectors.ts** (~1,000 lines)
- `getTasksForSelection(state, selection, filters)` → Task[]
- `matchesSearch(task, query)` → boolean
- `matchesSelectedTags(task, tagIds)` → boolean
- `buildTaskStats(tasks)` → { total, done, overdue, ... }
- `getQuadrant(task)` → 'Q1' | 'Q2' | 'Q3' | 'Q4'
- `isTaskVisibleInCalendarWindow(task, startDate, endDate)` → boolean
- `compareTasksByProjectionDistance(t1, t2)` → -1 | 0 | 1

**dates.ts** (~150 lines, extends core)
- `getDateKey(date)` → "YYYY-MM-DD"
- `formatDateTime(date, format)` → string
- `getNowIso()` → ISO string
- `isToday(date)` → boolean
- `isOverdue(dueAt, completedAt?)` → boolean
- `buildWeek(startDate)` → { start, end, days }
- `buildMonthMatrix(year, month)` → Matrix of weeks

**smart-entry.ts** (~150 lines)
- `parseSmartEntry(input, referenceDate)` → { title, dueAt, tagIds, priority }
- Supports Chinese date expressions ("今天", "明天", "下周一", etc.)
- Time expressions ("上午", "下午", "2点30分")
- Priority flags ("!紧急", "!高")
- Tag references ("#标签")

**reminder-engine.ts** (~200 lines)
- `collectReminderEvents(task, referenceDate)` → ReminderEvent[]
- Calculates when reminders fire based on task dates
- `describeReminder(reminder)` → "1 day before"

**repeat-rule.ts** (~100 lines)
- `createNextRepeatTask(task)` → Task | null
- Generates next recurring task with shifted dates
- Uses RFC 5545 RRULE format

**timeline.ts** (~200 lines)
- `getTasksForTimeline(tasks, windowStart, windowEnd)` → Task[]
- `getTimelinePercent(startMs, endMs, referenceStart)` → 0-100
- `buildTimelineScaleMarks(date, scale)` → Marks for rendering
- `snapTimelineMinutes(minutes, gridSize)` → Snapped minutes

**meta.ts**
- `priorityMeta` → { urgent: {...}, high: {...}, ... }
- `statusMeta` → Colors, labels, icons
- `TAG_COLOR_PRESETS` → Array of color codes
- `SPECIAL_TAG_IDS` → { urgent, important, ... }

### Web App (React)

**App.tsx** (~3,000 lines)
- Main orchestrator for all views
- Manages workspace state (tasks, lists, tags)
- Event handlers: create, update, delete, drag, bulk ops
- Conditional rendering: desktop vs mobile, view selection
- Real-time sync coordination

**Hooks**:
- `useAuth()` → { user, isLoading, login, logout, signUp }
- `useRealtimeSync()` → Manages Supabase subscription
- `useReminderCenter()` → Active reminders with UI state
- `useGlobalShortcuts()` → Keyboard shortcuts (Cmd+K, Cmd+N, etc.)
- `usePushNotifications()` → Browser notification permission + firing

**Views**:
- `ListView` → Scrollable task list with inline editing
- `CalendarView` → Month/week/agenda + lunar calendar
- `KanbanView` → 3-column drag-drop board
- `TimelineView` → Gantt chart with hourly grid
- `MatrixView` → Eisenhower 2x2 quadrant
- `StatsView` → Completion trends + recovery insights

**Mobile Components**:
- `MobileFocusView` → Tabbed focus (Overdue, Today, Upcoming)
- `MobileCalendarView` → Calendar month/week
- `MobileMatrixView` → Eisenhower matrix
- `MobileMeView` → Stats tab
- `MobileSheets` → Bottom sheets for create/edit

**Components**:
- `TaskDetailPanel` → Full task editor (modal)
- `InlineCreatePopover` → Quick create with smart entry
- `CommandPalette` → Search/filter palette
- `WorkspaceSidebar` → List/folder/filter navigation
- `TagManagementDialog` → Tag CRUD
- `ReminderCenterPanel` → Active reminders
- `PwaInstallBanner` → Web app install prompt

**Storage**:
- `storage.ts` → localStorage + Supabase dual-write
- `desktop-repository.ts` → SQLite (Tauri) with schema
- `offline-queue.ts` → Mutation queue when offline
- `sync-shared.ts` → Shared sync utilities

**Utils**:
- `workspace-helpers.ts` → Common workspace operations
- `auth-events.ts` → Global auth event bus
- `export.ts` → Export tasks to CSV/JSON
- `notifications.ts` → Toast/notification helpers
- `lunar.ts` → Chinese lunar calendar

---

## 📱 Mobile UI State (Zustand)

**mobileUiStore.ts**:
```typescript
{
  // Current active tab
  mobileTab: 'focus' | 'calendar' | 'matrix' | 'me'
  
  // Focus tab segmentation
  mobileFocusScope: 'all' | 'today' | 'week' | 'list'
  
  // Calendar mode for mobile
  mobileCalendarMode: 'month' | 'week' | 'agenda'
  
  // Sheet state
  selectedTaskId: string | null
  taskSheetOpen: boolean
  quickCreateOpen: boolean
  quickCreateDefaultDueAt: string | null
  
  // Notifications
  completionToast: { taskId: string; title: string } | null
  
  // Actions
  setTab(tab): void
  setFocusScope(scope): void
  openTaskSheet(taskId): void
  closeTaskSheet(): void
  openQuickCreate(dueAt?): void
  closeQuickCreate(): void
  showCompletionToast(taskId, title): void
}
```

---

## 🎨 Special Features

### 1. Three-Date Scheduling System

**Fields**:
- `startAt` (ISO 8601) - When work begins
- `dueAt` (ISO 8601) - Planned completion date
- `deadlineAt` (ISO 8601) - Hard deadline (separate from planned)

**Use Cases**:
- Schedule: "Start 4/14, due 4/15, deadline 4/17"
- Calendar view toggles between showing `dueAt` vs `deadlineAt`
- Reminders can anchor to any of the three dates

### 2. Eisenhower Matrix (Q1-Q4)

**Implementation**:
- Special tags: `tag-urgent`, `tag-important`
- Matrix formula: `getQuadrant(task)` checks tag presence
- Q1 (Do First): urgent + important
- Q2 (Schedule): not urgent + important
- Q3 (Delegate): urgent + not important
- Q4 (Eliminate): not urgent + not important

### 3. Smart Entry Parsing

**Syntax Examples**:
```
"明天下午2点打电话 #工作 !高"
→ Title: "打电话"
  Due: Tomorrow 14:00
  Tags: ["工作"]
  Priority: "high"

"下周一开会 !紧急"
→ Title: "开会"
  Due: Next Monday (00:00)
  Priority: "urgent"

"3天后 1点审单据 #财务 !普通"
→ Title: "审单据"
  Due: 3 days from now at 01:00
  Tags: ["财务"]
  Priority: "normal"
```

### 4. Recurring Tasks

**Field**: `repeatRule` (RFC 5545 format)
- e.g., `"FREQ=DAILY;INTERVAL=1"` (daily)
- e.g., `"FREQ=WEEKLY;BYDAY=MO,WE,FR"` (Mon/Wed/Fri)

**On Completion**:
1. Check if task has `repeatRule`
2. Call `createNextRepeatTask(task)` → new Task with shifted dates
3. Log activity: "Generated next recurring task"

### 5. Reminders

**Storage**: Array of Reminder objects in Task
```typescript
{
  id: "reminder-123",
  label: "1 day before",
  value: "1d" | "09:00" | "2024-04-15T09:00:00Z",
  kind: "relative" | "absolute"
}
```

**Firing Logic**:
- `collectReminderEvents(task)` → when to fire
- Can anchor to `startAt`, `dueAt`, or `deadlineAt`
- Deduplication via `firedReminderKeys` in PersistedState

### 6. Pomodoro Tracking

**Fields**:
- `estimatedPomodoros` - User's effort estimate (1-10 typically)
- `completedPomodoros` - Actual completed count
- `focusMinutes` - Deep work duration (minutes)

**Used in**: Stats view for productivity insights

---

## 🌍 Tech Stack Details

### Frontend
- **React 19.2.4** - UI framework
- **TypeScript 5.9** - Type safety
- **Vite 8** - Build tool + dev server
- **React Virtual 3.13** - Virtual scrolling for performance
- **dnd-kit 6** - Drag-and-drop library
- **Zustand 5** - State management (mobile UI only)
- **cmdk 1** - Command palette component

### Backend/Storage
- **Supabase 2.102** - Optional cloud sync (auth + realtime)
- **SQLite** (via Tauri) - Desktop storage
- **localStorage** - Browser storage (web)

### Desktop (Tauri)
- **Tauri 2.10** - Cross-platform app shell
- **Tauri plugins**:
  - `plugin-sql` - SQLite database
  - `plugin-store` - Persistent config storage
  - `plugin-notification` - Native notifications
  - `plugin-dialog` - File/folder pickers
  - `plugin-opener` - Open URLs/files

### PWA
- **vite-plugin-pwa** - Service worker generation
- Workbox runtime caching for Supabase API

### Build & Linting
- **esbuild** - Fast bundling (Obsidian plugin)
- **ESLint 9** with TypeScript plugin
- **eslint-plugin-react-hooks**
- **eslint-plugin-react-refresh**

### Obsidian Plugin
- **Obsidian API** - latest
- Inherits React/TypeScript from monorepo

---

## 📂 Important File Locations

| What | Path |
|------|------|
| Main app orchestrator | `/web/src/App.tsx` |
| React entry point | `/web/src/main.tsx` |
| Domain types | `/packages/taskflow-core/src/domain.ts` |
| Shared selectors | `/packages/taskflow-core/src/selectors.ts` |
| Task filtering logic | `/packages/taskflow-core/src/selectors.ts` |
| Smart entry parser | `/packages/taskflow-core/src/smart-entry.ts` |
| Reminder logic | `/packages/taskflow-core/src/reminder-engine.ts` |
| Repeat rules | `/packages/taskflow-core/src/repeat-rule.ts` |
| Timeline math | `/packages/taskflow-core/src/timeline.ts` |
| Date utilities | `/packages/taskflow-core/src/dates.ts` |
| Storage (web) | `/web/src/utils/storage.ts` |
| Storage (desktop) | `/web/src/utils/desktop-repository.ts` |
| Mobile UI state | `/web/src/stores/mobileUiStore.ts` |
| Real-time sync | `/web/src/hooks/useRealtimeSync.ts` |
| Auth | `/web/src/hooks/useAuth.ts` |
| Offline queue | `/web/src/utils/offline-queue.ts` |
| Views | `/web/src/components/views/` |
| Mobile components | `/web/src/mobile/` |
| Tauri config | `/web/src-tauri/tauri.conf.json` |
| Tauri Rust entry | `/web/src-tauri/src/main.rs` |
| Cargo deps | `/web/src-tauri/Cargo.toml` |
| Obsidian plugin main | `/todo-obsidian-plugin/src/main.ts` |
| Obsidian manifest | `/todo-obsidian-plugin/manifest.json` |
| Vite config | `/web/vite.config.ts` |
| TypeScript config | `/web/tsconfig.app.json` |
| ESLint config | `/web/eslint.config.js` |
| Obsidian eslint | `/todo-obsidian-plugin/eslint.config.mjs` |
| Package root (web) | `/web/package.json` |
| Package root (core) | `/packages/taskflow-core/package.json` |
| Package root (plugin) | `/todo-obsidian-plugin/package.json` |

---

## 🔑 Key Patterns & Conventions

### Component Structure
- **Views**: Large containers handling their own state/logic
- **Leaf components**: Shared UI (buttons, cards, etc.) in `components/shared.tsx`
- **Mobile vs Desktop**: Conditional rendering in App.tsx based on screen size

### Event Handling
- All mutations in App.tsx → `handleCreate`, `handleUpdate`, `handleDelete`, `handleDragEnd`
- Handlers call `saveState()` after mutation (triggers storage + sync)

### TypeScript
- Strict mode enabled
- Path aliases: `@taskflow/core` resolves to `/packages/taskflow-core/src`
- No `any` types (enforced by ESLint)

### Styling
- **App.css** - Main application styles
- **index.css** - Global styles + Tailwind-like utilities
- Component-specific styles co-located when needed
- **CSS Modules**: Not used; BEM naming for specificity

### Storage Versioning
- `STORAGE_KEY` includes version: `taskflow-v2`
- Migration path for legacy data exists (from `ticktick-parity-demo-v2`)
- Schema versioning in `sync-shared.ts`: `SCHEMA_VERSION_CONST`

### Error Handling
- Silent fallback: If Supabase unreachable, app continues offline
- Retry queue: Mutations queued when offline
- No error boundaries visible in code review (may need addition)

---

## 🧪 Testing Notes

目前代码库中**没有任何测试文件**。
