import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Notice } from 'obsidian';
import type { App } from 'obsidian';
import type { Task, TodoList, Tag, Priority, TaskStatus, CalendarMode, Folder, SavedFilter, TimeFieldMode } from '../core/domain';
import type { MatrixQuadrantKey } from '../core/selectors';
import type { TodoPluginSettings, CreateTaskPayload } from '../types';
import { parseSmartEntry } from '../core/smart-entry';
import { buildTaskStats, matchesSearch, matchesSelectedTags, getTasksForSelection, isTaskRiskOverdue } from '../core/selectors';
import { formatDateTime, getDateKey, addDays, buildWeek, buildMonthMatrix } from '../core/dates';
import { collectReminderEvents } from '../core/reminder-engine';
import { TaskDetailPanel } from './TaskDetailPanel';
import { KanbanView } from './KanbanView';
import { MatrixView } from './MatrixView';
import { CalendarView } from './CalendarView';
import { StatsView } from './StatsView';
import { TimelineView } from './TimelineView';
import { InlineCreatePopover } from './InlineCreatePopover';
import { TagManagementDialog } from './TagManagementDialog';
import { ProjectionSummary, type ProjectionFilter } from './ProjectionSummary';
import { ReminderPanel, type FiredReminder } from './ReminderPanel';
import { ShortcutHelpDialog } from './ShortcutHelpDialog';
import { ObsidianCommandPalette } from './ObsidianCommandPalette';

type ViewMode = 'list' | 'kanban' | 'matrix' | 'calendar' | 'timeline';
type TaskFilter = 'all' | 'open' | 'done';

interface TodoWorkspaceAppProps {
  tasks: Task[];
  lists: TodoList[];
  tags: Tag[];
  folders: Folder[];
  filters: SavedFilter[];
  vaultTags: string[];
  app: App;
  settings: TodoPluginSettings;
  onCreateTask: (payload: CreateTaskPayload) => Promise<void>;
  onToggleTask: (taskId: string) => Promise<void>;
  onUpdateTask: (taskId: string, patch: Partial<Task>) => Promise<void>;
  onSoftDeleteTask: (taskId: string) => Promise<void>;
  onRestoreTask: (taskId: string) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onDuplicateTask: (taskId: string) => Promise<void>;
  onAddSubtask: (taskId: string, title: string) => Promise<void>;
  onToggleSubtask: (taskId: string, subtaskId: string) => Promise<void>;
  onAddComment: (taskId: string, content: string) => Promise<void>;
  onOpenSource: (taskId: string) => Promise<void>;
  onAddReminder: (taskId: string, label: string, value: string, kind: 'relative' | 'absolute') => Promise<void>;
  onRemoveReminder: (taskId: string, reminderId: string) => Promise<void>;
  onUpdateTag: (tagId: string, name: string, color: string) => Promise<void>;
  onDeleteTag: (tagId: string) => Promise<void>;
  onAddTag: (name: string, color: string) => Promise<void>;
  onMoveToQuadrant: (taskId: string, quadrant: MatrixQuadrantKey) => Promise<void>;
  onMoveTaskToDate: (taskId: string, toDateKey: string) => void;
  onCreateTaskInStatus: (title: string, status: import('../core/domain').TaskStatus) => void;
  onCreateTaskInQuadrant: (title: string, quadrant: MatrixQuadrantKey) => void;
  onBulkComplete: (ids: string[]) => Promise<void>;
  onBulkDelete: (ids: string[]) => Promise<void>;
  onBulkMoveToList: (ids: string[], listId: string) => Promise<void>;
  onBulkAddTag: (ids: string[], tagId: string) => Promise<void>;
  onRenameList: (listId: string, name: string) => Promise<void>;
  onDeleteList: (listId: string) => Promise<void>;
  onUpdateListColor: (listId: string, color: string) => Promise<void>;
  onCreateFolder: (name: string, color: string) => Promise<void>;
  onRenameFolder: (folderId: string, name: string) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
  onUpdateFolderColor: (folderId: string, color: string) => Promise<void>;
  onAddListToFolder: (listId: string, folderId: string | null) => Promise<void>;
  onCreateFilter: (name: string, icon: string, config: Partial<SavedFilter>) => Promise<void>;
  onDeleteFilter: (filterId: string) => Promise<void>;
  onSnoozeReminder: (taskId: string, ruleIndex: number, minutes: number) => void;
  onDismissReminder: (taskId: string, ruleIndex: number) => void;
  onClearAllReminders: () => void;
}

const PRIORITY_LABELS: Record<Priority, string> = {
  urgent: 'P1',
  high: 'P2',
  normal: 'P3',
  low: 'P4',
};

const PRIORITY_COLORS: Record<Priority, string> = {
  urgent: '#ff6b7a',
  high: '#ffb454',
  normal: '#7c9cff',
  low: '#93c5fd',
};

const STATUS_ICONS: Record<string, string> = {
  todo: '○',
  doing: '◔',
  done: '✓',
};

const LIST_COLOR_PRESETS = ['#6366f1', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6', '#eab308', '#64748b', '#22c55e'];

interface SidebarSelection {
  kind: string;
  id: string;
  label: string;
  icon?: string;
  dot?: string;
}

const SYSTEM_SELECTIONS: SidebarSelection[] = [
  { kind: 'system', id: 'all', label: '全部', icon: '📋' },
  { kind: 'system', id: 'today', label: '今日', icon: '☀️' },
  { kind: 'system', id: 'upcoming', label: '未来 7 天', icon: '📅' },
  { kind: 'system', id: 'inbox', label: '收件箱', icon: '📥' },
  { kind: 'system', id: 'completed', label: '已完成', icon: '✅' },
  { kind: 'system', id: 'trash', label: '回收站', icon: '🗑️' },
  { kind: 'tool', id: 'stats', label: '统计', icon: '📊' },
  { kind: 'tool', id: 'reminders', label: '提醒', icon: '🔔' },
];

/* ─── Multi-dimensional sort (Task #4) ─── */
function compareTaskCards(a: Task, b: Task): number {
  // 1st: completed status (incomplete first)
  if (a.completed !== b.completed) return a.completed ? 1 : -1;
  // 2nd: priority
  const priorityOrder: Record<Priority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
  const pa = priorityOrder[a.priority] ?? 2;
  const pb = priorityOrder[b.priority] ?? 2;
  if (pa !== pb) return pa - pb;
  // 3rd: date (dueAt or startAt, no date last)
  const dateA = a.dueAt ?? a.startAt ?? null;
  const dateB = b.dueAt ?? b.startAt ?? null;
  if (dateA !== dateB) {
    if (!dateA) return 1;
    if (!dateB) return -1;
    if (dateA < dateB) return -1;
    if (dateA > dateB) return 1;
  }
  // 4th: updatedAt (most recent first)
  if (a.updatedAt !== b.updatedAt) {
    return a.updatedAt > b.updatedAt ? -1 : 1;
  }
  // 5th: id fallback
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/* ─── Status change feedback type (Task #3) ─── */
interface StatusChangeFeedback {
  taskId: string;
  title: string;
  fromStatus: TaskStatus;
  toStatus: TaskStatus;
  fromCompleted: boolean;
}

type SizeClass = 'narrow' | 'medium' | 'wide';

export function TodoWorkspaceApp(props: TodoWorkspaceAppProps) {
  const {
    tasks, lists, tags, folders, filters, vaultTags, app,
    onCreateTask, onToggleTask, onUpdateTask,
    onSoftDeleteTask, onRestoreTask, onDeleteTask,
    onDuplicateTask, onAddSubtask, onToggleSubtask,
    onAddComment, onAddReminder, onRemoveReminder,
    onAddTag, onMoveToQuadrant, onMoveTaskToDate,
    onBulkComplete, onBulkDelete, onBulkMoveToList, onBulkAddTag,
    onRenameList, onDeleteList, onUpdateListColor,
    onCreateFolder, onRenameFolder, onDeleteFolder,
    onDeleteFilter,
    onSnoozeReminder, onDismissReminder, onClearAllReminders,
  } = props;

  // ─── Responsive layout via ResizeObserver ─────────────────────────
  const appContainerRef = useRef<HTMLDivElement>(null);
  const [sizeClass, setSizeClass] = useState<SizeClass>('wide');

  useEffect(() => {
    const el = appContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w < 640) setSizeClass('narrow');
        else if (w <= 900) setSizeClass('medium');
        else setSizeClass('wide');
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const [draftTitle, setDraftTitle] = useState('');
  const [filter, setFilter] = useState<TaskFilter>('open');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectionKind, setSelectionKind] = useState('system');
  const [selectionId, setSelectionId] = useState('all');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarOverlayOpen, setSidebarOverlayOpen] = useState(false);

  // Calendar state
  const [calendarMode, setCalendarMode] = useState<CalendarMode>('month');
  const [calendarAnchor, setCalendarAnchor] = useState(getDateKey());

  // Tag AND intersection filter (Task #3 — tags)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  // InlineCreatePopover state (Task #2 — popover)
  const [inlineCreate, setInlineCreate] = useState<{
    visible: boolean;
    defaultListId?: string;
    defaultStatus?: TaskStatus;
    defaultPriority?: Priority;
    defaultDueAt?: string;
  } | null>(null);

  // Reminder center state (Task #5)
  const [firedReminderKeys, setFiredReminderKeys] = useState<string[]>([]);
  const [recentReminders, setRecentReminders] = useState<FiredReminder[]>([]);

  // Projection filter state (advanced)
  const [projectionFilter, setProjectionFilter] = useState<ProjectionFilter>(null);

  // Folder state
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');

  // Toast state (Task #3 — undoable)
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [statusChangeFeedback, setStatusChangeFeedback] = useState<StatusChangeFeedback | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setStatusChangeFeedback(null);
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 4000);
  }, []);

  const dismissToast = useCallback(() => {
    setToastMessage(null);
    setStatusChangeFeedback(null);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  // Bulk mode state (Task #1)
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(new Set());

  const toggleBulkSelect = useCallback((taskId: string) => {
    setBulkSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  const exitBulkMode = useCallback(() => {
    setBulkMode(false);
    setBulkSelectedIds(new Set());
  }, []);

  // Sidebar list editing state (Task #5)
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editingListName, setEditingListName] = useState('');

  // Quick create enhancements
  const [quickListId, setQuickListId] = useState('inbox');
  const [quickPriority, setQuickPriority] = useState<Priority>('normal');

  // Task 1: Search ref for Cmd+K shortcut
  const searchRef = useRef<HTMLInputElement>(null);

  // Task 2: Date field mode toggle (planned vs deadline)
  const [dateFieldModes, setDateFieldModes] = useState<Partial<Record<'today' | 'upcoming', TimeFieldMode>>>({});

  // Task 3: Toast action (jump button)
  const [toastAction, setToastAction] = useState<{ label: string; kind: string; id: string } | null>(null);

  // Task 4: Tag management dialog
  const [tagMgmtOpen, setTagMgmtOpen] = useState(false);

  // Shortcut help dialog
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);

  // Command palette (Cmd+K)
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);

  // Search debounce (140ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKeyword(searchInput);
    }, 140);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Reminder engine polling (Task #5)
  useEffect(() => {
    const tick = () => {
      const { events, nextKeys } = collectReminderEvents(tasks, firedReminderKeys);
      if (events.length > 0) {
        setFiredReminderKeys(nextKeys);
        for (const ev of events) {
          new Notice(ev.title, 8000);
        }
        setRecentReminders(prev => {
          const now = Date.now();
          const next: FiredReminder[] = [
            ...events.map(e => ({
              key: e.key,
              taskId: e.key.split(':')[0] ?? '',
              ruleIndex: parseInt(e.key.split(':')[1] ?? '0', 10),
              title: e.title,
              body: e.body,
              ts: now,
              dismissed: false,
            })),
            ...prev,
          ];
          return next.slice(0, 20);
        });
      }
    };
    tick();
    const intervalId = setInterval(tick, 15000);
    return () => clearInterval(intervalId);
  }, [tasks, firedReminderKeys]);

  // Task 1: Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;

      // Cmd/Ctrl + N — open create popover
      if (meta && e.key === 'n') {
        e.preventDefault();
        setInlineCreate({ visible: true });
        return;
      }

      // Cmd/Ctrl + K — open command palette
      if (meta && e.key === 'k') {
        e.preventDefault();
        setCmdPaletteOpen(true);
        return;
      }

      // Skip number keys and Escape if user is in an input
      if (isInput) return;

      // ? — open shortcut help
      if (e.key === '?') {
        e.preventDefault();
        setShortcutHelpOpen(true);
        return;
      }

      // Number keys 1-5 — switch view mode
      const viewMap: Record<string, ViewMode> = { '1': 'list', '2': 'kanban', '3': 'matrix', '4': 'calendar', '5': 'timeline' };
      if (viewMap[e.key]) {
        e.preventDefault();
        setViewMode(viewMap[e.key]);
        return;
      }

      // Escape — close detail panel / deselect
      if (e.key === 'Escape') {
        if (cmdPaletteOpen) {
          setCmdPaletteOpen(false);
        } else if (shortcutHelpOpen) {
          setShortcutHelpOpen(false);
        } else if (inlineCreate?.visible) {
          setInlineCreate(null);
        } else if (tagMgmtOpen) {
          setTagMgmtOpen(false);
        } else if (selectedTaskId) {
          setSelectedTaskId(null);
        }
        return;
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [inlineCreate, tagMgmtOpen, selectedTaskId, shortcutHelpOpen, cmdPaletteOpen]);

  // #1 只显示任务中实际在使用的标签
  const usedTagIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of tasks) {
      if (t.deleted) continue;
      for (const tid of t.tagIds) ids.add(tid);
    }
    return ids;
  }, [tasks]);

  const usedTags = useMemo(() => tags.filter(t => usedTagIds.has(t.id)), [tags, usedTagIds]);

  const stats = useMemo(() => buildTaskStats(tasks), [tasks]);

  const selectionTasks = useMemo(
    () => getTasksForSelection({
      tasks,
      selectionKind,
      selectionId,
      filters,
      selectionTimeModes: dateFieldModes,
      includeCompleted: selectionId === 'completed' || selectionId === 'trash' || filter === 'done' || filter === 'all',
    }),
    [tasks, selectionKind, selectionId, filter, filters, dateFieldModes],
  );

  const filteredTasks = useMemo(() => {
    let result = selectionTasks;

    // Tag AND intersection filter
    if (selectedTagIds.length > 0) {
      result = result.filter(t => matchesSelectedTags(t, selectedTagIds));
    }

    if (debouncedKeyword) {
      const kw = debouncedKeyword.trim().toLowerCase();
      result = result.filter(t => matchesSearch(t, kw, tags));
    }

    switch (filter) {
      case 'open':
        result = result.filter(t => !t.completed);
        break;
      case 'done':
        result = result.filter(t => t.completed);
        break;
    }

    // Multi-dimensional sort (Task #4)
    result = [...result].sort(compareTaskCards);

    return result;
  }, [selectionTasks, debouncedKeyword, filter, tags, selectedTagIds]);

  const selectedTask = useMemo(
    () => (selectedTaskId ? tasks.find(t => t.id === selectedTaskId) ?? null : null),
    [tasks, selectedTaskId],
  );

  const selectionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of SYSTEM_SELECTIONS) {
      counts[`${s.kind}:${s.id}`] = getTasksForSelection({
        tasks, selectionKind: s.kind, selectionId: s.id, filters: [],
      }).length;
    }
    for (const list of lists) {
      counts[`list:${list.id}`] = getTasksForSelection({
        tasks, selectionKind: 'list', selectionId: list.id, filters: [],
      }).length;
    }
    for (const tag of usedTags) {
      counts[`tag:${tag.id}`] = getTasksForSelection({
        tasks, selectionKind: 'tag', selectionId: tag.id, filters: [],
      }).length;
    }
    return counts;
  }, [tasks, lists, usedTags]);

  // Projection window computation for calendar/timeline
  const projectionWindow = useMemo(() => {
    if (viewMode === 'calendar') {
      if (calendarMode === 'month') {
        const days = buildMonthMatrix(calendarAnchor);
        return { start: days[0], end: days[days.length - 1] };
      } else {
        const days = buildWeek(calendarAnchor);
        return { start: days[0], end: days[days.length - 1] };
      }
    }
    // timeline — use ±7 days as window
    const start = addDays(calendarAnchor, -3);
    const end = addDays(calendarAnchor, 7);
    return { start, end };
  }, [viewMode, calendarMode, calendarAnchor]);

  // Unprocessed reminder count for badge
  const activeReminderCount = useMemo(
    () => recentReminders.filter(r => !r.dismissed).length,
    [recentReminders],
  );

  // Reminder center handlers
  const handleSnoozeReminder = useCallback((taskId: string, ruleIndex: number, minutes: number) => {
    onSnoozeReminder(taskId, ruleIndex, minutes);
    setRecentReminders(prev => prev.map(r =>
      r.taskId === taskId && r.ruleIndex === ruleIndex ? { ...r, dismissed: true } : r
    ));
  }, [onSnoozeReminder]);

  const handleDismissReminder = useCallback((taskId: string, ruleIndex: number) => {
    onDismissReminder(taskId, ruleIndex);
    setRecentReminders(prev => prev.map(r =>
      r.taskId === taskId && r.ruleIndex === ruleIndex ? { ...r, dismissed: true } : r
    ));
  }, [onDismissReminder]);

  const handleClearAllReminders = useCallback(() => {
    onClearAllReminders();
    setRecentReminders(prev => prev.map(r => ({ ...r, dismissed: true })));
  }, [onClearAllReminders]);

  const handleSelect = useCallback((kind: string, id: string) => {
    setSelectionKind(kind);
    setSelectionId(id);
    if (id === 'completed') setFilter('done');
    else if (id === 'trash') setFilter('all');
    else setFilter('open');
  }, []);

  // Resolve effective list options for quick create
  const allLists = useMemo(() => {
    const sys: { id: string; name: string }[] = [{ id: 'inbox', name: '收件箱' }];
    return [...sys, ...lists.filter(l => l.kind === 'custom')];
  }, [lists]);

  const handleSubmit = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = draftTitle.trim();
    if (!title) return;

    setSubmitting(true);
    try {
      const parsed = parseSmartEntry(title);
      const targetListId = quickListId;
      await onCreateTask({
        title: parsed.title,
        dueAt: parsed.dueAt,
        listId: targetListId,
        priority: quickPriority,
      });
      const listName = allLists.find(l => l.id === targetListId)?.name ?? targetListId;
      // Task 3: Check if the created task would be visible under current filters
      const isCurrentListSelected = selectionKind === 'list' && selectionId === targetListId;
      const isAllSelected = selectionKind === 'system' && selectionId === 'all';
      const isInboxSelected = selectionKind === 'system' && selectionId === 'inbox' && targetListId === 'inbox';
      const isVisible = isCurrentListSelected || isAllSelected || isInboxSelected;

      if (!isVisible) {
        setToastAction({ label: listName, kind: 'list', id: targetListId === 'inbox' ? 'inbox' : targetListId });
        setStatusChangeFeedback(null);
        setToastMessage(`任务已创建，但当前筛选下不可见`);
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => { setToastMessage(null); setToastAction(null); }, 5000);
      } else {
        setToastAction(null);
        showToast(`已添加到「${listName}」`);
      }
      setDraftTitle('');
    } finally {
      setSubmitting(false);
    }
  }, [draftTitle, onCreateTask, quickListId, quickPriority, allLists, showToast, selectionKind, selectionId]);

  const handleTaskClick = useCallback((taskId: string) => {
    if (bulkMode) {
      toggleBulkSelect(taskId);
      return;
    }
    setSelectedTaskId(prev => (prev === taskId ? null : taskId));
  }, [bulkMode, toggleBulkSelect]);

  // Status change with undo toast (Task #3)
  const handleStatusChangeWithToast = useCallback(async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const fromStatus = task.status;
    const fromCompleted = task.completed;
    await onToggleTask(taskId);
    const toStatus: TaskStatus = task.completed ? 'todo' : 'done';
    const toLabel = task.completed ? '进行中' : '已完成';

    setStatusChangeFeedback({
      taskId,
      title: task.title,
      fromStatus,
      toStatus,
      fromCompleted,
    });
    setToastMessage(`已将「${task.title}」调整为${toLabel}`);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
      setStatusChangeFeedback(null);
    }, 4000);
  }, [tasks, onToggleTask]);

  const handleUndoStatusChange = useCallback(() => {
    if (!statusChangeFeedback) return;
    const { taskId, fromStatus, fromCompleted } = statusChangeFeedback;
    void onUpdateTask(taskId, { status: fromStatus, completed: fromCompleted });
    dismissToast();
  }, [statusChangeFeedback, onUpdateTask, dismissToast]);

  // List rename handlers (Task #5)
  const startListRename = useCallback((listId: string, currentName: string) => {
    setEditingListId(listId);
    setEditingListName(currentName);
  }, []);

  const saveListRename = useCallback(() => {
    if (editingListId && editingListName.trim()) {
      void onRenameList(editingListId, editingListName);
    }
    setEditingListId(null);
    setEditingListName('');
  }, [editingListId, editingListName, onRenameList]);

  const cancelListRename = useCallback(() => {
    setEditingListId(null);
    setEditingListName('');
  }, []);

  const handleDeleteList = useCallback((listId: string) => {
    if (selectionKind === 'list' && selectionId === listId) {
      setSelectionKind('system');
      setSelectionId('all');
    }
    void onDeleteList(listId);
  }, [selectionKind, selectionId, onDeleteList]);

  const handleCycleListColor = useCallback((listId: string, currentColor: string) => {
    const idx = LIST_COLOR_PRESETS.indexOf(currentColor);
    const next = LIST_COLOR_PRESETS[(idx + 1) % LIST_COLOR_PRESETS.length];
    void onUpdateListColor(listId, next);
  }, [onUpdateListColor]);

  // Determine effective sidebar visibility
  const isNarrow = sizeClass === 'narrow';
  const showSidebar = isNarrow ? false : sidebarOpen;
  const showSidebarOverlay = isNarrow && sidebarOverlayOpen;

  return (
    <div
      ref={appContainerRef}
      className={`tw-app tw-app--${sizeClass}`}
    >
      {/* Sidebar overlay backdrop (narrow mode) */}
      {showSidebarOverlay && (
        <div className="tw-sidebar-overlay-backdrop" onClick={() => setSidebarOverlayOpen(false)} />
      )}

      {/* 侧边栏 */}
      {(showSidebar || showSidebarOverlay) && (
        <aside className={`tw-sidebar ${showSidebarOverlay ? 'tw-sidebar--overlay' : ''}`}>
          <div className="tw-sidebar__header">
            <h2 className="tw-sidebar__title">Todo Workspace</h2>
            <button className="tw-btn-icon" onClick={() => { if (isNarrow) setSidebarOverlayOpen(false); else setSidebarOpen(false); }} title="收起侧边栏">{'✕'}</button>
          </div>

          <nav className="tw-sidebar__nav">
            <div className="tw-sidebar__group-label">系统</div>
            {SYSTEM_SELECTIONS.map(s => {
              const hasModePill = s.kind === 'system' && (s.id === 'today' || s.id === 'upcoming');
              const currentMode = hasModePill ? (dateFieldModes[s.id as 'today' | 'upcoming'] ?? 'planned') : null;
              return (
                <button
                  key={`${s.kind}:${s.id}`}
                  className={`tw-sidebar__item ${selectionKind === s.kind && selectionId === s.id ? 'is-active' : ''}`}
                  onClick={() => handleSelect(s.kind, s.id)}
                >
                  <span className="tw-sidebar__item-icon">{s.icon}</span>
                  <span className="tw-sidebar__item-label">
                    {s.label}
                    {hasModePill && (
                      <span
                        className={`tw-mode-pill ${currentMode === 'deadline' ? 'is-active' : ''}`}
                        onClick={e => {
                          e.stopPropagation();
                          const key = s.id as 'today' | 'upcoming';
                          setDateFieldModes(prev => ({
                            ...prev,
                            [key]: (prev[key] ?? 'planned') === 'planned' ? 'deadline' : 'planned',
                          }));
                        }}
                        title={currentMode === 'deadline' ? '当前按 DDL 筛选，点击切换为计划时间' : '当前按计划时间筛选，点击切换为 DDL'}
                      >
                        {currentMode === 'deadline' ? 'DDL' : '计划'}
                      </span>
                    )}
                  </span>
                  <span className="tw-sidebar__item-count">
                    {s.kind === 'tool' && s.id === 'reminders' && activeReminderCount > 0
                      ? <span className="tw-reminder-badge">{activeReminderCount}</span>
                      : (selectionCounts[`${s.kind}:${s.id}`] ?? 0)}
                  </span>
                </button>
              );
            })}

            {/* 智能清单 */}
            {filters.length > 0 && (
              <>
                <div className="tw-sidebar__group-label">智能清单</div>
                {filters.map(f => (
                  <button
                    key={`filter:${f.id}`}
                    className={`tw-sidebar__item tw-filter-item ${selectionKind === 'filter' && selectionId === f.id ? 'is-active' : ''}`}
                    onClick={() => handleSelect('filter', f.id)}
                  >
                    <span className="tw-sidebar__item-icon">{f.icon}</span>
                    <span className="tw-sidebar__item-label">{f.name}</span>
                    <span className="tw-sidebar__item-actions">
                      <span
                        className="tw-sidebar__item-action-btn tw-sidebar__item-action-btn--danger"
                        onClick={e => { e.stopPropagation(); void onDeleteFilter(f.id); }}
                        title="删除"
                      >✕</span>
                    </span>
                  </button>
                ))}
              </>
            )}

            {/* 清单与文件夹 */}
            {(lists.filter(l => l.kind === 'custom').length > 0 || folders.length > 0) && (
              <>
                <div className="tw-sidebar__group-label">
                  清单与文件夹
                  <span
                    className="tw-sidebar__item-action-btn"
                    style={{ marginLeft: 4, cursor: 'pointer' }}
                    onClick={() => void onCreateFolder('新文件夹', '#6366f1')}
                    title="新建文件夹"
                  >+📁</span>
                </div>

                {/* Folders */}
                {folders.map(folder => {
                  const folderLists = lists.filter(l => l.kind === 'custom' && l.folderId === folder.id);
                  const isCollapsed = collapsedFolders.has(folder.id);
                  return (
                    <div key={`folder:${folder.id}`} className="tw-sidebar__folder-block">
                      <div className="tw-sidebar__folder-title" onClick={() => {
                        setCollapsedFolders(prev => {
                          const next = new Set(prev);
                          if (next.has(folder.id)) next.delete(folder.id);
                          else next.add(folder.id);
                          return next;
                        });
                      }}>
                        <span style={{ color: folder.color }}>{isCollapsed ? '▶' : '▼'}</span>
                        {editingFolderId === folder.id ? (
                          <input
                            className="tw-sidebar__rename-input"
                            value={editingFolderName}
                            onChange={e => setEditingFolderName(e.target.value)}
                            onBlur={() => { if (editingFolderName.trim()) void onRenameFolder(folder.id, editingFolderName); setEditingFolderId(null); }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { if (editingFolderName.trim()) void onRenameFolder(folder.id, editingFolderName); setEditingFolderId(null); }
                              if (e.key === 'Escape') setEditingFolderId(null);
                            }}
                            onClick={e => e.stopPropagation()}
                            autoFocus
                          />
                        ) : (
                          <span className="tw-sidebar__item-label" style={{ fontWeight: 600 }}>{folder.name}</span>
                        )}
                        <span className="tw-sidebar__item-actions" style={{ opacity: 1 }}>
                          <span className="tw-sidebar__item-action-btn" onClick={e => { e.stopPropagation(); void onCreateTask({ title: '新任务', listId: folderLists[0]?.id ?? 'inbox' }); }} title="新建清单任务">+</span>
                          <span className="tw-sidebar__item-action-btn" onClick={e => { e.stopPropagation(); setEditingFolderId(folder.id); setEditingFolderName(folder.name); }} title="重命名">✎</span>
                          <span className="tw-sidebar__item-action-btn tw-sidebar__item-action-btn--danger" onClick={e => { e.stopPropagation(); void onDeleteFolder(folder.id); }} title="删除">✕</span>
                        </span>
                      </div>
                      {!isCollapsed && folderLists.map(list => (
                        editingListId === list.id ? (
                          <div key={`list:${list.id}`} className="tw-sidebar__item tw-sidebar__item--editing" style={{ paddingLeft: 24 }}>
                            <input
                              className="tw-sidebar__rename-input"
                              value={editingListName}
                              onChange={e => setEditingListName(e.target.value)}
                              onBlur={saveListRename}
                              onKeyDown={e => {
                                if (e.key === 'Enter') saveListRename();
                                if (e.key === 'Escape') cancelListRename();
                              }}
                              autoFocus
                            />
                          </div>
                        ) : (
                          <button
                            key={`list:${list.id}`}
                            className={`tw-sidebar__item ${selectionKind === 'list' && selectionId === list.id ? 'is-active' : ''}`}
                            style={{ paddingLeft: 24 }}
                            onClick={() => handleSelect('list', list.id)}
                          >
                            <span className="tw-sidebar__item-dot" style={{ background: list.color, cursor: 'pointer' }} onClick={e => { e.stopPropagation(); handleCycleListColor(list.id, list.color); }} title="点击切换颜色" />
                            <span className="tw-sidebar__item-label">{list.name}</span>
                            <span className="tw-sidebar__item-actions">
                              <span className="tw-sidebar__item-action-btn" onClick={e => { e.stopPropagation(); startListRename(list.id, list.name); }} title="重命名">✎</span>
                              <span className="tw-sidebar__item-action-btn tw-sidebar__item-action-btn--danger" onClick={e => { e.stopPropagation(); handleDeleteList(list.id); }} title="删除">✕</span>
                            </span>
                            <span className="tw-sidebar__item-count">{selectionCounts[`list:${list.id}`] ?? 0}</span>
                          </button>
                        )
                      ))}
                    </div>
                  );
                })}

                {/* Top-level lists (no folder) */}
                {lists.filter(l => l.kind === 'custom' && !l.folderId).map(list => (
                  editingListId === list.id ? (
                    <div key={`list:${list.id}`} className="tw-sidebar__item tw-sidebar__item--editing">
                      <input
                        className="tw-sidebar__rename-input"
                        value={editingListName}
                        onChange={e => setEditingListName(e.target.value)}
                        onBlur={saveListRename}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveListRename();
                          if (e.key === 'Escape') cancelListRename();
                        }}
                        autoFocus
                      />
                    </div>
                  ) : (
                    <button
                      key={`list:${list.id}`}
                      className={`tw-sidebar__item ${selectionKind === 'list' && selectionId === list.id ? 'is-active' : ''}`}
                      onClick={() => handleSelect('list', list.id)}
                    >
                      <span
                        className="tw-sidebar__item-dot"
                        style={{ background: list.color, cursor: 'pointer' }}
                        onClick={e => { e.stopPropagation(); handleCycleListColor(list.id, list.color); }}
                        title="点击切换颜色"
                      />
                      <span className="tw-sidebar__item-label">{list.name}</span>
                      <span className="tw-sidebar__item-actions">
                        <span className="tw-sidebar__item-action-btn" onClick={e => { e.stopPropagation(); startListRename(list.id, list.name); }} title="重命名">✎</span>
                        <span className="tw-sidebar__item-action-btn tw-sidebar__item-action-btn--danger" onClick={e => { e.stopPropagation(); handleDeleteList(list.id); }} title="删除">✕</span>
                      </span>
                      <span className="tw-sidebar__item-count">{selectionCounts[`list:${list.id}`] ?? 0}</span>
                    </button>
                  )
                ))}
              </>
            )}

            {/* 标签（全局过滤器模式） */}
            {usedTags.length > 0 && (
              <>
                <div className="tw-sidebar__group-label">
                  标签过滤器
                  <span
                    className="tw-sidebar__item-action-btn"
                    style={{ marginLeft: 4, cursor: 'pointer' }}
                    onClick={() => setTagMgmtOpen(true)}
                    title="管理标签"
                  >管理</span>
                </div>
                {selectedTagIds.length > 0 && (
                  <div className="tw-sidebar__filter-summary">
                    <span>需同时命中 {selectedTagIds.length} 个标签</span>
                    <button className="tw-btn-xs" onClick={() => setSelectedTagIds([])}>清空</button>
                  </div>
                )}
                {usedTags.map(tag => {
                  const isSelected = selectedTagIds.includes(tag.id);
                  return (
                    <button
                      key={`tag:${tag.id}`}
                      className={`tw-sidebar__item ${isSelected ? 'is-active' : ''}`}
                      onClick={() => {
                        setSelectedTagIds(prev =>
                          prev.includes(tag.id) ? prev.filter(id => id !== tag.id) : [...prev, tag.id]
                        );
                      }}
                    >
                      <span className="tw-sidebar__item-dot" style={{ background: tag.color }} />
                      <span className="tw-sidebar__item-label">{tag.name}</span>
                      {isSelected && <span style={{ fontSize: 10 }}>✓</span>}
                      <span className="tw-sidebar__item-count">{selectionCounts[`tag:${tag.id}`] ?? 0}</span>
                    </button>
                  );
                })}
              </>
            )}
          </nav>

          <div className="tw-sidebar__footer">
            <button
              className="tw-sidebar__item"
              onClick={() => setShortcutHelpOpen(true)}
              title="快捷键参考 (?)"
            >
              <span className="tw-sidebar__item-icon">⌨️</span>
              <span className="tw-sidebar__item-label">快捷键参考</span>
            </button>
          </div>
        </aside>
      )}

      {/* 主内容区 */}
      <main className="tw-main">
        {/* 顶栏 */}
        <header className="tw-topbar">
          {(!showSidebar || isNarrow) && (
            <button className="tw-btn-icon" onClick={() => { if (isNarrow) setSidebarOverlayOpen(true); else setSidebarOpen(true); }} title="展开侧边栏">{'☰'}</button>
          )}
          <div className="tw-topbar__stats">
            <div className="tw-stat">
              <span className="tw-stat__label">活跃</span>
              <strong className="tw-stat__value">{stats.active}</strong>
            </div>
            <div className="tw-stat">
              <span className="tw-stat__label">已完成</span>
              <strong className="tw-stat__value">{stats.completed}</strong>
            </div>
            <div className="tw-stat">
              <span className="tw-stat__label">逾期</span>
              <strong className="tw-stat__value tw-stat__value--danger">{stats.overdue}</strong>
            </div>
            <div className="tw-stat">
              <span className="tw-stat__label">已排期</span>
              <strong className="tw-stat__value">{stats.scheduled}</strong>
            </div>
          </div>
          <div className="tw-topbar__actions">
            <button
              className="tw-btn-sm tw-cmd-trigger"
              onClick={() => setCmdPaletteOpen(true)}
              title="命令面板 (Cmd+K)"
            >⌘K</button>
            <button
              className={`tw-btn-sm ${viewMode === 'list' ? 'is-active' : ''}`}
              onClick={() => setViewMode('list')}
            >列表</button>
            <button
              className={`tw-btn-sm ${viewMode === 'kanban' ? 'is-active' : ''}`}
              onClick={() => setViewMode('kanban')}
            >看板</button>
            <button
              className={`tw-btn-sm ${viewMode === 'matrix' ? 'is-active' : ''}`}
              onClick={() => setViewMode('matrix')}
            >四象限</button>
            <button
              className={`tw-btn-sm ${viewMode === 'calendar' ? 'is-active' : ''}`}
              onClick={() => setViewMode('calendar')}
            >日历</button>
            <button
              className={`tw-btn-sm ${viewMode === 'timeline' ? 'is-active' : ''}`}
              onClick={() => setViewMode('timeline')}
            >时间线</button>
          </div>
        </header>

        {/* 输入区 */}
        <div className="tw-composer-card">
          <form className="tw-composer" onSubmit={handleSubmit}>
            <input
              className="tw-composer__input"
              value={draftTitle}
              onChange={e => setDraftTitle(e.target.value)}
              placeholder={'输入任务标题（支持"今天/明天/下午3点"自然语言），回车创建'}
            />
            <button className="tw-btn-primary" type="submit" disabled={submitting || !draftTitle.trim()}>
              新建
            </button>
          </form>

          {/* 快速创建选项行 */}
          <div className="tw-composer__options">
            <div className="tw-detail__field" style={{ flex: 1, minWidth: 0 }}>
              <label>列表</label>
              <select value={quickListId} onChange={e => setQuickListId(e.target.value)}>
                {allLists.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <div className="tw-detail__field" style={{ flex: 1, minWidth: 0 }}>
              <label>优先级</label>
              <select value={quickPriority} onChange={e => setQuickPriority(e.target.value as Priority)}>
                {(['urgent', 'high', 'normal', 'low'] as const).map(p => (
                  <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="tw-toolbar">
            <div className="tw-filters">
              {(['all', 'open', 'done'] as const).map(f => (
                <button
                  key={f}
                  className={`tw-btn-filter ${filter === f ? 'is-active' : ''}`}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? '全部' : f === 'open' ? '进行中' : '已完成'}
                </button>
              ))}
            </div>
            <input
              ref={searchRef}
              className="tw-search"
              placeholder="搜索任务…"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
            />
          </div>
        </div>

        {/* Bulk toolbar (Task #1) */}
        {bulkMode && (
          <div className="tw-bulk-toolbar">
            <button className="tw-btn-xs" onClick={() => {
              const allIds = new Set(filteredTasks.map(t => t.id));
              setBulkSelectedIds(prev => prev.size === allIds.size ? new Set() : allIds);
            }}>
              {bulkSelectedIds.size === filteredTasks.length ? '取消全选' : '全选'}
            </button>
            <span className="tw-bulk-toolbar__count">已选 {bulkSelectedIds.size} 项</span>
            <button className="tw-btn-xs" disabled={bulkSelectedIds.size === 0} onClick={() => { void onBulkComplete([...bulkSelectedIds]); exitBulkMode(); }}>
              批量完成
            </button>
            <select
              className="tw-bulk-toolbar__select"
              value=""
              onChange={e => {
                if (e.target.value && bulkSelectedIds.size > 0) {
                  void onBulkMoveToList([...bulkSelectedIds], e.target.value);
                  exitBulkMode();
                }
              }}
            >
              <option value="" disabled>移动到清单</option>
              {allLists.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            <select
              className="tw-bulk-toolbar__select"
              value=""
              onChange={e => {
                if (e.target.value && bulkSelectedIds.size > 0) {
                  void onBulkAddTag([...bulkSelectedIds], e.target.value);
                  exitBulkMode();
                }
              }}
            >
              <option value="" disabled>打标签</option>
              {tags.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <button className="tw-btn-xs tw-btn-danger" disabled={bulkSelectedIds.size === 0} onClick={() => { void onBulkDelete([...bulkSelectedIds]); exitBulkMode(); }}>
              批量删除
            </button>
            <button className="tw-btn-xs" onClick={exitBulkMode}>退出</button>
          </div>
        )}

        {/* 内容区 */}
        <div className="tw-content">
          {selectionKind === 'tool' && selectionId === 'stats' ? (
            <StatsView tasks={tasks} tags={tags} />
          ) : selectionKind === 'tool' && selectionId === 'reminders' ? (
            <ReminderPanel
              reminders={recentReminders}
              onSnooze={handleSnoozeReminder}
              onDismiss={handleDismissReminder}
              onClearAll={handleClearAllReminders}
            />
          ) : viewMode === 'list' ? (
            <div className="tw-task-list">
              {filteredTasks.length === 0 ? (
                <div className="tw-empty-state">
                  <div className="tw-empty-state__icon">📋</div>
                  <strong className="tw-empty-state__title">暂无任务</strong>
                  <p className="tw-empty-state__desc">在上方输入框中创建你的第一个任务吧</p>
                </div>
              ) : (
                filteredTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    tags={tags}
                    lists={lists}
                    isSelected={task.id === selectedTaskId}
                    bulkMode={bulkMode}
                    bulkSelected={bulkSelectedIds.has(task.id)}
                    onToggle={() => void handleStatusChangeWithToast(task.id)}
                    onClick={() => handleTaskClick(task.id)}
                    onDuplicateTask={() => void onDuplicateTask(task.id)}
                    onSoftDeleteTask={() => void onSoftDeleteTask(task.id)}
                    onRestoreTask={() => void onRestoreTask(task.id)}
                  />
                ))
              )}
              {/* Bulk mode toggle at bottom of list */}
              {!bulkMode && filteredTasks.length > 0 && (
                <div style={{ textAlign: 'center', marginTop: 8 }}>
                  <button className="tw-btn-sm" onClick={() => setBulkMode(true)}>☑ 批量操作</button>
                </div>
              )}
            </div>
          ) : viewMode === 'kanban' ? (
            <KanbanView
              tasks={tasks.filter(t => !t.deleted)}
              tags={tags}
              lists={lists}
              selectedTaskId={selectedTaskId}
              onSelectTask={handleTaskClick}
              onToggleTask={onToggleTask}
              onUpdateTask={onUpdateTask}
              onCreateTaskInStatus={(title, status) => {
                setInlineCreate({ visible: true, defaultStatus: status });
              }}
            />
          ) : viewMode === 'matrix' ? (
            <MatrixView
              tasks={tasks}
              tags={tags}
              selectedTaskId={selectedTaskId}
              onSelectTask={handleTaskClick}
              onMoveToQuadrant={onMoveToQuadrant}
              onCreateTaskInQuadrant={(title, quadrant) => {
                const priority: Priority = (quadrant === 'q1' || quadrant === 'q3') ? 'urgent' : 'normal';
                setInlineCreate({ visible: true, defaultPriority: priority });
              }}
            />
          ) : viewMode === 'calendar' ? (
            <>
              <ProjectionSummary
                tasks={tasks}
                windowStart={projectionWindow.start}
                windowEnd={projectionWindow.end}
                activeFilter={projectionFilter}
                onFilterChange={setProjectionFilter}
              />
              <CalendarView
                tasks={tasks}
                tags={tags}
                selectedTaskId={selectedTaskId}
                calendarMode={calendarMode}
                calendarAnchor={calendarAnchor}
                onSelectTask={handleTaskClick}
                onCalendarModeChange={setCalendarMode}
                onCalendarAnchorChange={setCalendarAnchor}
                onMoveTaskToDate={onMoveTaskToDate}
                onCreateTask={(dateKey) => {
                  setInlineCreate({ visible: true, defaultDueAt: dateKey });
                }}
              />
            </>
          ) : (
            <>
              <ProjectionSummary
                tasks={tasks}
                windowStart={projectionWindow.start}
                windowEnd={projectionWindow.end}
                activeFilter={projectionFilter}
                onFilterChange={setProjectionFilter}
              />
              <TimelineView
                tasks={tasks}
                tags={tags}
                selectedTaskId={selectedTaskId}
                onSelectTask={handleTaskClick}
                onUpdateTask={onUpdateTask}
                onCreateTask={(startAt, dueAt) => {
                  setInlineCreate({ visible: true, defaultDueAt: dueAt });
                }}
              />
            </>
          )}
        </div>
      </main>

      {/* 详情面板 */}
      {selectedTask && (
        <>
          {isNarrow && <div className="tw-detail-overlay-backdrop" onClick={() => setSelectedTaskId(null)} />}
          <TaskDetailPanel
          task={selectedTask}
          lists={lists}
          tags={tags}
          vaultTags={vaultTags}
          app={app}
          onClose={() => setSelectedTaskId(null)}
          onUpdateTask={onUpdateTask}
          onToggleTask={onToggleTask}
          onSoftDeleteTask={onSoftDeleteTask}
          onRestoreTask={onRestoreTask}
          onDeleteTask={onDeleteTask}
          onDuplicateTask={onDuplicateTask}
          onAddSubtask={onAddSubtask}
          onToggleSubtask={onToggleSubtask}
          onAddComment={onAddComment}
          onAddReminder={onAddReminder}
          onRemoveReminder={onRemoveReminder}
          onAddTag={onAddTag}
        />
        </>
      )}

      {/* InlineCreatePopover */}
      {inlineCreate?.visible && (
        <InlineCreatePopover
          tags={tags}
          listOptions={allLists}
          defaultListId={inlineCreate.defaultListId}
          defaultStatus={inlineCreate.defaultStatus}
          defaultPriority={inlineCreate.defaultPriority}
          defaultDueAt={inlineCreate.defaultDueAt}
          onCreateTask={onCreateTask}
          onClose={() => setInlineCreate(null)}
        />
      )}

      {/* Task 4: Tag Management Dialog */}
      {tagMgmtOpen && (
        <TagManagementDialog
          tags={tags}
          tasks={tasks}
          onUpdateTag={props.onUpdateTag}
          onDeleteTag={props.onDeleteTag}
          onAddTag={onAddTag}
          onClose={() => setTagMgmtOpen(false)}
        />
      )}

      {/* Shortcut Help Dialog */}
      {shortcutHelpOpen && (
        <ShortcutHelpDialog onClose={() => setShortcutHelpOpen(false)} />
      )}

      {/* Command Palette (Cmd+K) */}
      <ObsidianCommandPalette
        open={cmdPaletteOpen}
        onClose={() => setCmdPaletteOpen(false)}
        tasks={tasks}
        lists={lists}
        tags={tags}
        onSelectTask={(id) => {
          setSelectedTaskId(id);
          setCmdPaletteOpen(false);
        }}
        onSelectList={(id) => {
          handleSelect('list', id);
          setCmdPaletteOpen(false);
        }}
      />

      {/* Toast with optional undo / jump (Task #3) */}
      {toastMessage && (
        <div className={`tw-toast ${statusChangeFeedback ? 'tw-status-toast--undoable' : ''} ${toastAction ? 'tw-toast--feedback' : ''}`}>
          <span className="tw-toast__text">{toastMessage}</span>
          {statusChangeFeedback && (
            <button className="tw-toast__undo-btn" onClick={handleUndoStatusChange}>撤销</button>
          )}
          {toastAction && (
            <button
              className="tw-toast__action-btn"
              onClick={() => {
                if (toastAction.id === 'inbox') {
                  handleSelect('system', 'inbox');
                } else {
                  handleSelect('list', toastAction.id);
                }
                dismissToast();
                setToastAction(null);
              }}
            >
              跳转到「{toastAction.label}」
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Task Card (Task #2 — card action buttons) ─── */

interface TaskCardProps {
  task: Task;
  tags: Tag[];
  lists: TodoList[];
  isSelected: boolean;
  bulkMode: boolean;
  bulkSelected: boolean;
  onToggle: () => void;
  onClick: () => void;
  onDuplicateTask: () => void;
  onSoftDeleteTask: () => void;
  onRestoreTask: () => void;
}

function TaskCard({ task, tags, lists, isSelected, bulkMode, bulkSelected, onToggle, onClick, onDuplicateTask, onSoftDeleteTask, onRestoreTask }: TaskCardProps) {
  const taskTags = tags.filter(t => task.tagIds.includes(t.id));
  const listName = lists.find(l => l.id === task.listId)?.name ?? '';

  // DDL risk badges
  const now = Date.now();
  const deadlineMs = task.deadlineAt ? new Date(task.deadlineAt).getTime() : null;
  const dueMs = task.dueAt ? new Date(task.dueAt).getTime() : null;
  const isDeadlineOverdue = !task.completed && deadlineMs !== null && now > deadlineMs;
  const isDuePastDeadline = !task.completed && dueMs !== null && deadlineMs !== null && dueMs > deadlineMs;

  // Subtask progress
  const completedSubs = task.subtasks.filter(s => s.completed).length;
  const totalSubs = task.subtasks.length;
  const subProgress = totalSubs > 0 ? completedSubs / totalSubs : 0;

  // Note preview
  const notePreview = task.note ? task.note.slice(0, 60).replace(/\n/g, ' ') : '';

  return (
    <article
      className={`tw-task-card ${task.completed ? 'is-done' : ''} ${isSelected ? 'is-selected' : ''} ${bulkSelected ? 'is-bulk-selected' : ''}`}
      onClick={onClick}
    >
      {bulkMode ? (
        <label className="tw-task-card__check" onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={bulkSelected} onChange={() => onClick()} />
        </label>
      ) : (
        <label className="tw-task-card__check" onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={task.completed} onChange={onToggle} />
        </label>
      )}
      <div className="tw-task-card__body">
        <div className="tw-task-card__title">
          <span className="tw-task-card__status-icon">{STATUS_ICONS[task.status] ?? '○'}</span>
          {task.title}
        </div>
        <div className="tw-task-card__note-preview">
          {notePreview || '暂无描述'}
        </div>
        <div className="tw-task-card__meta">
          <span
            className="tw-priority-badge"
            style={{ color: PRIORITY_COLORS[task.priority], borderColor: PRIORITY_COLORS[task.priority] }}
          >
            {PRIORITY_LABELS[task.priority]}
          </span>
          {listName && (
            <span className="tw-task-card__list-name">📂 {listName}</span>
          )}
          {task.dueAt && (
            <span className={`tw-task-card__due ${isTaskRiskOverdue(task) ? 'tw-overdue' : ''}`}>
              {formatDateTime(task.dueAt)}
            </span>
          )}
          {isDeadlineOverdue && (
            <span className="tw-ddl-badge tw-ddl-badge--danger">DDL 已到</span>
          )}
          {isDuePastDeadline && (
            <span className="tw-ddl-badge tw-ddl-badge--warning">计划晚于 DDL</span>
          )}
          {taskTags.map(tag => (
            <span key={tag.id} className="tw-tag-chip--toned" style={{
              borderColor: `${tag.color}22`,
              background: `${tag.color}12`,
            }}>
              <i className="tw-tag-chip__dot" style={{ background: tag.color }} />
              {tag.name}
            </span>
          ))}
        </div>
        {totalSubs > 0 && (
          <div className="tw-subtask-progress">
            <div className="tw-subtask-progress__bar">
              <div className="tw-subtask-progress__fill" style={{ width: `${subProgress * 100}%` }} />
            </div>
            <span className="tw-subtask-progress__text">{completedSubs}/{totalSubs}</span>
          </div>
        )}
      </div>
      {/* Card action buttons (Task #2) — hover to show */}
      {!bulkMode && (
        <div className="tw-task-card__actions" onClick={e => e.stopPropagation()}>
          {task.deleted ? (
            <button className="tw-btn-xs" onClick={onRestoreTask} title="恢复">恢复</button>
          ) : (
            <>
              <button className="tw-btn-xs" onClick={onDuplicateTask} title="复制">复制</button>
              <button className="tw-btn-xs tw-btn-danger" onClick={onSoftDeleteTask} title="删除">删除</button>
            </>
          )}
        </div>
      )}
    </article>
  );
}
