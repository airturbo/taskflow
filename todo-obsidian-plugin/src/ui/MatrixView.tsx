import { useCallback, useMemo, useRef, useState } from 'react';
import type { Task, Tag, Priority } from '../core/domain';
import type { MatrixQuadrantKey } from '../core/selectors';
import { getQuadrant, getQuadrantLabel, isTaskRiskOverdue } from '../core/selectors';
import { formatDateTime } from '../core/dates';
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

interface MatrixViewProps {
  tasks: Task[];
  tags: Tag[];
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  onMoveToQuadrant: (taskId: string, quadrant: MatrixQuadrantKey) => void;
  onCreateTaskInQuadrant?: (title: string, quadrant: MatrixQuadrantKey) => void;
}

const PRIORITY_LABELS: Record<Priority, string> = { urgent: '紧急', high: '高', normal: '普通', low: '低' };
const PRIORITY_COLORS: Record<Priority, string> = { urgent: '#ef4444', high: '#f97316', normal: '#6366f1', low: '#94a3b8' };

const QUADRANT_META: Record<MatrixQuadrantKey, { emoji: string; hint: string }> = {
  q1: { emoji: '🔥', hint: '立刻处理' },
  q2: { emoji: '🎯', hint: '制定计划' },
  q3: { emoji: '⚡', hint: '委派或快速完成' },
  q4: { emoji: '📦', hint: '减少或消除' },
};

const QUADRANT_ORDER: MatrixQuadrantKey[] = ['q1', 'q2', 'q3', 'q4'];

const buildTaskPreview = (task: Task): DragPreviewPayload => ({
  title: task.title,
  status: task.status,
  priority: task.priority,
  meta: formatDateTime(task.dueAt ?? task.startAt),
  overdue: isTaskRiskOverdue(task),
});

export function MatrixView({ tasks, tags, selectedTaskId, onSelectTask, onMoveToQuadrant, onCreateTaskInQuadrant }: MatrixViewProps) {
  const [inlineCreateQuadrant, setInlineCreateQuadrant] = useState<MatrixQuadrantKey | null>(null);
  const [inlineCreateTitle, setInlineCreateTitle] = useState('');

  const handleInlineCreate = useCallback((quadrant: MatrixQuadrantKey) => {
    const title = inlineCreateTitle.trim();
    if (!title || !onCreateTaskInQuadrant) return;
    onCreateTaskInQuadrant(title, quadrant);
    setInlineCreateTitle('');
    setInlineCreateQuadrant(null);
  }, [inlineCreateTitle, onCreateTaskInQuadrant]);

  const quadrants = useMemo(() => {
    const map: Record<MatrixQuadrantKey, Task[]> = { q1: [], q2: [], q3: [], q4: [] };
    for (const task of tasks) {
      if (task.deleted || task.completed) continue;
      map[getQuadrant(task)].push(task);
    }
    return map;
  }, [tasks]);

  // ─── Drag state ────────────────────────────────────────────────────
  const dragSessionRef = useRef<PointerDragSession | null>(null);
  const [dragPreview, setDragPreview] = useState<PointerDragPreviewState | null>(null);
  const [dragOverQuadrant, setDragOverQuadrant] = useState<string | null>(null);
  const clickSuppressedRef = useRef(false);
  const sourceQuadrantRef = useRef<MatrixQuadrantKey | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>, task: Task, quadrant: MatrixQuadrantKey) => {
    if (e.button !== 0) return;
    if (shouldIgnorePointerDragStart(e.target, e.currentTarget)) return;

    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    sourceQuadrantRef.current = quadrant;

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

    const hoveredQuadrant = resolveDropZoneValueFromPoint(
      e.clientX, e.clientY,
      '[data-matrix-drop-zone]', 'data-matrix-drop-zone',
    );
    setDragOverQuadrant(hoveredQuadrant);
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== e.pointerId) return;

    if (session.dragged) {
      markClickSuppressed(clickSuppressedRef);

      const targetQuadrant = resolveDropZoneValueFromPoint(
        e.clientX, e.clientY,
        '[data-matrix-drop-zone]', 'data-matrix-drop-zone',
      ) as MatrixQuadrantKey | null;

      if (targetQuadrant && targetQuadrant !== sourceQuadrantRef.current) {
        onMoveToQuadrant(session.taskId, targetQuadrant);
      }
    } else {
      onSelectTask(session.taskId);
    }

    try { session.sourceElement.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    dragSessionRef.current = null;
    setDragPreview(null);
    setDragOverQuadrant(null);
    sourceQuadrantRef.current = null;
  }, [onMoveToQuadrant, onSelectTask]);

  return (
    <div className="tw-matrix">
      {QUADRANT_ORDER.map(qKey => {
        const meta = QUADRANT_META[qKey];
        const items = quadrants[qKey];
        return (
          <div
            key={qKey}
            className={`tw-matrix__quadrant tw-matrix__quadrant--${qKey} ${dragOverQuadrant === qKey ? 'is-drag-over' : ''}`}
            data-matrix-drop-zone={qKey}
          >
            <div className="tw-matrix__quadrant-header">
              <span className="tw-matrix__quadrant-emoji">{meta.emoji}</span>
              <span className="tw-matrix__quadrant-title">{getQuadrantLabel(qKey)}</span>
              <span className="tw-matrix__quadrant-count">{items.length}</span>
              {onCreateTaskInQuadrant && (
                <button
                  className="tw-btn-xs"
                  onClick={() => { setInlineCreateQuadrant(qKey); setInlineCreateTitle(''); }}
                  title="新建任务"
                >+</button>
              )}
            </div>
            <div className="tw-matrix__quadrant-hint">{meta.hint}</div>
            <div className="tw-matrix__quadrant-body">
              {items.map(task => {
                const taskTags = tags.filter(t => task.tagIds.includes(t.id));
                const dragStyle = getPointerDragStyle(task.id, dragSessionRef.current?.taskId ?? null, dragPreview);
                return (
                  <div
                    key={task.id}
                    className={`tw-matrix__card ${selectedTaskId === task.id ? 'is-selected' : ''} ${dragStyle ? 'is-dragging' : ''}`}
                    style={dragStyle}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={e => handlePointerDown(e, task, qKey)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                  >
                    <div className="tw-matrix__card-title">{task.title}</div>
                    <div className="tw-matrix__card-meta">
                      <span
                        className="tw-priority-badge"
                        style={{ color: PRIORITY_COLORS[task.priority], borderColor: PRIORITY_COLORS[task.priority] }}
                      >
                        {PRIORITY_LABELS[task.priority]}
                      </span>
                      {task.dueAt && (
                        <span className="tw-matrix__card-due">{formatDateTime(task.dueAt)}</span>
                      )}
                    </div>
                    {taskTags.length > 0 && (
                      <div className="tw-matrix__card-tags">
                        {taskTags.map(tag => (
                          <span key={tag.id} className="tw-tag-chip" style={{ background: tag.color }}>
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {items.length === 0 && (
                <div className="tw-matrix__empty">暂无任务</div>
              )}
              {/* Inline create area */}
              {onCreateTaskInQuadrant && inlineCreateQuadrant === qKey && (
                <div className="tw-matrix__inline-create">
                  <input
                    className="tw-matrix__inline-create-input"
                    placeholder="输入任务标题，回车创建"
                    value={inlineCreateTitle}
                    onChange={e => setInlineCreateTitle(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleInlineCreate(qKey);
                      if (e.key === 'Escape') setInlineCreateQuadrant(null);
                    }}
                    autoFocus
                  />
                </div>
              )}
              {onCreateTaskInQuadrant && inlineCreateQuadrant !== qKey && (
                <button
                  className="tw-btn-xs tw-matrix__inline-create-btn"
                  onClick={() => { setInlineCreateQuadrant(qKey); setInlineCreateTitle(''); }}
                >
                  + 新建任务
                </button>
              )}
            </div>
          </div>
        );
      })}
      <DragPreviewLayer preview={dragPreview} />
    </div>
  );
}
