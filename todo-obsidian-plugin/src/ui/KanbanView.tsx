import { useCallback, useMemo, useRef, useState } from 'react';
import type { Task, Tag, TodoList, Priority, TaskStatus } from '../core/domain';
import { formatDateTime } from '../core/dates';
import { isTaskRiskOverdue } from '../core/selectors';
import {
  type PointerDragSession,
  type PointerDragPreviewState,
  type DragPreviewPayload,
  POINTER_DRAG_THRESHOLD,
  shouldIgnorePointerDragStart,
  resolveDropZoneValueFromPoint,
  buildPointerDragPreviewState,
  getPointerDragStyle,
  markClickSuppressed,
} from './drag-system';
import { DragPreviewLayer } from './DragPreviewLayer';

interface KanbanViewProps {
  tasks: Task[];
  tags: Tag[];
  lists: TodoList[];
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  onToggleTask: (taskId: string) => Promise<void>;
  onUpdateTask: (taskId: string, patch: Partial<Task>) => Promise<void>;
  onDropStatusChange?: (taskId: string, status: TaskStatus) => void;
  onCreateTaskInStatus?: (title: string, status: TaskStatus) => void;
}

const PRIORITY_LABELS: Record<Priority, string> = { urgent: 'P1', high: 'P2', normal: 'P3', low: 'P4' };
const PRIORITY_COLORS: Record<Priority, string> = { urgent: '#ff6b7a', high: '#ffb454', normal: '#7c9cff', low: '#93c5fd' };
const STATUS_ICONS: Record<string, string> = { todo: '○', doing: '◔', done: '✓' };
const STATUS_OPTIONS: TaskStatus[] = ['todo', 'doing', 'done'];
const STATUS_LABELS: Record<TaskStatus, string> = { todo: '待办', doing: '进行中', done: '已完成' };
const PRIORITY_OPTIONS: Priority[] = ['urgent', 'high', 'normal', 'low'];

interface KanbanColumn {
  key: TaskStatus;
  label: string;
  tasks: Task[];
}

const buildTaskPreview = (task: Task): DragPreviewPayload => ({
  title: task.title,
  status: task.status,
  priority: task.priority,
  meta: formatDateTime(task.dueAt ?? task.startAt),
  overdue: isTaskRiskOverdue(task),
});

export function KanbanView({ tasks, tags, lists, selectedTaskId, onSelectTask, onUpdateTask, onDropStatusChange, onCreateTaskInStatus }: KanbanViewProps) {
  const [inlineCreateStatus, setInlineCreateStatus] = useState<TaskStatus | null>(null);
  const [inlineCreateTitle, setInlineCreateTitle] = useState('');

  const handleInlineCreate = useCallback((status: TaskStatus) => {
    const title = inlineCreateTitle.trim();
    if (!title || !onCreateTaskInStatus) return;
    onCreateTaskInStatus(title, status);
    setInlineCreateTitle('');
    setInlineCreateStatus(null);
  }, [inlineCreateTitle, onCreateTaskInStatus]);

  const columns = useMemo((): KanbanColumn[] => {
    const todo = tasks.filter(t => t.status === 'todo' && !t.completed);
    const doing = tasks.filter(t => t.status === 'doing' && !t.completed);
    const done = tasks.filter(t => t.status === 'done' || t.completed);

    return [
      { key: 'todo', label: '待办', tasks: todo },
      { key: 'doing', label: '进行中', tasks: doing },
      { key: 'done', label: '已完成', tasks: done },
    ];
  }, [tasks]);

  // ─── Drag state ────────────────────────────────────────────────────
  const dragSessionRef = useRef<PointerDragSession | null>(null);
  const [dragPreview, setDragPreview] = useState<PointerDragPreviewState | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);
  const clickSuppressedRef = useRef(false);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>, task: Task) => {
    if (e.button !== 0) return;
    if (shouldIgnorePointerDragStart(e.target, e.currentTarget)) return;

    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);

    dragSessionRef.current = {
      pointerId: e.pointerId,
      taskId: task.id,
      startX: e.clientX,
      startY: e.clientY,
      dragged: false,
      sourceElement: el,
      sourceRect: el.getBoundingClientRect(),
      preview: buildTaskPreview(task),
    };
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== e.pointerId) return;

    const dx = e.clientX - session.startX;
    const dy = e.clientY - session.startY;

    if (!session.dragged) {
      if (Math.abs(dx) + Math.abs(dy) < POINTER_DRAG_THRESHOLD) return;
      session.dragged = true;
    }

    setDragPreview(buildPointerDragPreviewState(session, e.clientX, e.clientY));

    const hoveredStatus = resolveDropZoneValueFromPoint(
      e.clientX, e.clientY,
      '[data-kanban-drop-zone]', 'data-kanban-drop-zone',
    );
    setDragOverStatus(hoveredStatus);
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== e.pointerId) return;

    if (session.dragged) {
      markClickSuppressed(clickSuppressedRef);

      const targetStatus = resolveDropZoneValueFromPoint(
        e.clientX, e.clientY,
        '[data-kanban-drop-zone]', 'data-kanban-drop-zone',
      );

      if (targetStatus && (targetStatus as TaskStatus) !== session.preview.status) {
        const status = targetStatus as TaskStatus;
        if (onDropStatusChange) {
          onDropStatusChange(session.taskId, status);
        } else {
          void onUpdateTask(session.taskId, {
            status,
            completed: status === 'done',
          });
        }
      }
    } else {
      onSelectTask(session.taskId);
    }

    try { session.sourceElement.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    dragSessionRef.current = null;
    setDragPreview(null);
    setDragOverStatus(null);
  }, [onUpdateTask, onDropStatusChange, onSelectTask]);

  return (
    <div className="tw-kanban">
      {columns.map(col => (
        <div
          key={col.key}
          className={`tw-kanban__column ${dragOverStatus === col.key ? 'is-drag-over' : ''}`}
          data-kanban-drop-zone={col.key}
        >
          <div className="tw-kanban__column-header">
            <span className="tw-kanban__column-title">{col.label}</span>
            <span className="tw-kanban__column-count">{col.tasks.length}</span>
            {onCreateTaskInStatus && (
              <button
                className="tw-btn-xs"
                onClick={() => { setInlineCreateStatus(col.key); setInlineCreateTitle(''); }}
                title="新建任务"
              >+</button>
            )}
          </div>
          <div className="tw-kanban__column-body">
            {col.tasks.map(task => {
              const taskTags = tags.filter(t => task.tagIds.includes(t.id));
              const dragStyle = getPointerDragStyle(task.id, dragSessionRef.current?.taskId ?? null, dragPreview);
              const listName = lists.find(l => l.id === task.listId)?.name ?? '';
              const notePreview = task.note ? task.note.slice(0, 40).replace(/\n/g, ' ') : '';
              const completedSubs = task.subtasks.filter(s => s.completed).length;
              const totalSubs = task.subtasks.length;
              return (
                <div
                  key={task.id}
                  className={`tw-kanban__card ${selectedTaskId === task.id ? 'is-selected' : ''} ${dragStyle ? 'is-dragging' : ''}`}
                  style={dragStyle}
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={e => handlePointerDown(e, task)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                >
                  <div className="tw-kanban__card-title">{task.title}</div>
                  {notePreview && (
                    <div className="tw-task-card__note-preview">{notePreview}</div>
                  )}
                  <div className="tw-kanban__card-meta">
                    <span
                      className="tw-priority-badge tw-badge--clickable"
                      style={{ color: PRIORITY_COLORS[task.priority], borderColor: PRIORITY_COLORS[task.priority] }}
                      onClick={e => {
                        e.stopPropagation();
                        const idx = PRIORITY_OPTIONS.indexOf(task.priority);
                        const next = PRIORITY_OPTIONS[(idx + 1) % PRIORITY_OPTIONS.length];
                        void onUpdateTask(task.id, { priority: next });
                      }}
                      title={`优先级: ${PRIORITY_LABELS[task.priority]}（点击切换）`}
                    >
                      {PRIORITY_LABELS[task.priority]}
                    </span>
                    <span
                      className="tw-status-badge tw-badge--clickable"
                      onClick={e => {
                        e.stopPropagation();
                        const idx = STATUS_OPTIONS.indexOf(task.status);
                        const next = STATUS_OPTIONS[(idx + 1) % STATUS_OPTIONS.length];
                        void onUpdateTask(task.id, { status: next, completed: next === 'done' });
                      }}
                      title={`状态: ${STATUS_LABELS[task.status]}（点击切换）`}
                    >
                      {STATUS_ICONS[task.status]} {STATUS_LABELS[task.status]}
                    </span>
                    {listName && (
                      <span className="tw-task-card__list-name">📂 {listName}</span>
                    )}
                    {task.dueAt && (
                      <span className={`tw-kanban__card-due ${isTaskRiskOverdue(task) ? 'tw-overdue' : ''}`}>{formatDateTime(task.dueAt)}</span>
                    )}
                    {totalSubs > 0 && (
                      <span className="tw-task-card__subtask-count">{completedSubs}/{totalSubs}</span>
                    )}
                  </div>
                  {taskTags.length > 0 && (
                    <div className="tw-kanban__card-tags">
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
                  )}
                </div>
              );
            })}
            {col.tasks.length === 0 && (
              <div className="tw-empty-state tw-empty-state--compact">
                <div className="tw-empty-state__icon">{STATUS_ICONS[col.key]}</div>
                <span className="tw-empty-state__title">暂无任务</span>
              </div>
            )}
            {/* Inline create area */}
            {onCreateTaskInStatus && inlineCreateStatus === col.key && (
              <div className="tw-kanban__inline-create">
                <input
                  className="tw-kanban__inline-create-input"
                  placeholder="输入任务标题，回车创建"
                  value={inlineCreateTitle}
                  onChange={e => setInlineCreateTitle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleInlineCreate(col.key);
                    if (e.key === 'Escape') setInlineCreateStatus(null);
                  }}
                  autoFocus
                />
              </div>
            )}
            {onCreateTaskInStatus && inlineCreateStatus !== col.key && (
              <button
                className="tw-btn-xs tw-kanban__inline-create-btn"
                onClick={() => { setInlineCreateStatus(col.key); setInlineCreateTitle(''); }}
              >
                + 新建任务
              </button>
            )}
          </div>
        </div>
      ))}
      <DragPreviewLayer preview={dragPreview} />
    </div>
  );
}
