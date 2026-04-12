import { useCallback, useMemo, useRef, useState } from 'react';
import type { Task, Tag, Priority } from '../core/domain';
import type { CalendarMode } from '../core/domain';
import {
  getDateKey, isToday as checkIsToday, formatDayLabel,
  buildMonthMatrix, buildWeek, addMonths, addDays,
  getMonthLabel, getWeekRangeLabel, formatDateTime,
} from '../core/dates';
import { isTaskRiskOverdue } from '../core/selectors';
import { getLunarDisplayText } from '../core/lunar';
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

interface CalendarViewProps {
  tasks: Task[];
  tags: Tag[];
  selectedTaskId: string | null;
  calendarMode: CalendarMode;
  calendarAnchor: string;
  onSelectTask: (taskId: string) => void;
  onCalendarModeChange: (mode: CalendarMode) => void;
  onCalendarAnchorChange: (anchor: string) => void;
  onMoveTaskToDate: (taskId: string, toDateKey: string) => void;
  onCreateTask: (dateKey: string) => void;
}

const PRIORITY_LABELS: Record<Priority, string> = { urgent: '紧急', high: '高', normal: '普通', low: '低' };
const PRIORITY_COLORS: Record<Priority, string> = { urgent: '#ef4444', high: '#f97316', normal: '#6366f1', low: '#94a3b8' };
const MAX_CHIPS_PER_CELL = 3;
const WEEKDAY_HEADERS = ['一', '二', '三', '四', '五', '六', '日'];

const getTaskDateKey = (task: Task): string | null => {
  const dateValue = task.dueAt ?? task.startAt;
  if (!dateValue) return null;
  return dateValue.slice(0, 10);
};

const buildTaskPreview = (task: Task): DragPreviewPayload => ({
  title: task.title,
  status: task.status,
  priority: task.priority,
  meta: formatDateTime(task.dueAt ?? task.startAt),
  overdue: isTaskRiskOverdue(task),
});

export function CalendarView({
  tasks, tags, selectedTaskId, calendarMode, calendarAnchor,
  onSelectTask, onCalendarModeChange, onCalendarAnchorChange,
  onMoveTaskToDate, onCreateTask,
}: CalendarViewProps) {
  const todayKey = getDateKey();

  // ─── Show completed toggle ─────────────────────────────────────────
  const [showCompleted, setShowCompleted] = useState(false);

  // ─── Focused date (month view) ────────────────────────────────────
  const [focusedDateKey, setFocusedDateKey] = useState<string | null>(null);

  // ─── Active (non-deleted) tasks grouped by date ────────────────────
  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const task of tasks) {
      if (task.deleted) continue;
      if (!showCompleted && task.completed) continue;
      const dk = getTaskDateKey(task);
      if (!dk) continue;
      if (!map[dk]) map[dk] = [];
      map[dk].push(task);
    }
    return map;
  }, [tasks, showCompleted]);

  // ─── Drag state ────────────────────────────────────────────────────
  const dragSessionRef = useRef<PointerDragSession | null>(null);
  const [dragPreview, setDragPreview] = useState<PointerDragPreviewState | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
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

    const hoveredDate = resolveDropZoneValueFromPoint(
      e.clientX, e.clientY,
      '[data-calendar-drop-zone]', 'data-calendar-drop-zone',
    );
    setDragOverDate(hoveredDate);
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== e.pointerId) return;

    if (session.dragged) {
      markClickSuppressed(clickSuppressedRef);

      const targetDate = resolveDropZoneValueFromPoint(
        e.clientX, e.clientY,
        '[data-calendar-drop-zone]', 'data-calendar-drop-zone',
      );

      if (targetDate) {
        onMoveTaskToDate(session.taskId, targetDate);
      }
    } else {
      onSelectTask(session.taskId);
    }

    try { session.sourceElement.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    dragSessionRef.current = null;
    setDragPreview(null);
    setDragOverDate(null);
  }, [onMoveTaskToDate, onSelectTask]);

  // ─── Navigation ────────────────────────────────────────────────────
  const goToday = useCallback(() => onCalendarAnchorChange(todayKey), [onCalendarAnchorChange, todayKey]);

  const goPrev = useCallback(() => {
    if (calendarMode === 'month') {
      onCalendarAnchorChange(addMonths(calendarAnchor, -1));
    } else {
      onCalendarAnchorChange(addDays(calendarAnchor, -7));
    }
  }, [calendarMode, calendarAnchor, onCalendarAnchorChange]);

  const goNext = useCallback(() => {
    if (calendarMode === 'month') {
      onCalendarAnchorChange(addMonths(calendarAnchor, 1));
    } else {
      onCalendarAnchorChange(addDays(calendarAnchor, 7));
    }
  }, [calendarMode, calendarAnchor, onCalendarAnchorChange]);

  // ─── Compute days ──────────────────────────────────────────────────
  const monthDays = useMemo(() => buildMonthMatrix(calendarAnchor), [calendarAnchor]);
  const weekDays = useMemo(() => buildWeek(calendarAnchor), [calendarAnchor]);
  const anchorMonth = calendarAnchor.slice(0, 7); // "YYYY-MM"

  // ─── Auto-focus date when task is selected ─────────────────────────
  const selectedTaskDateKey = useMemo(() => {
    if (!selectedTaskId) return null;
    const t = tasks.find(t => t.id === selectedTaskId);
    if (!t) return null;
    return getTaskDateKey(t);
  }, [tasks, selectedTaskId]);

  // Auto-focus when selectedTask changes
  useMemo(() => {
    if (selectedTaskDateKey && calendarMode === 'month') {
      setFocusedDateKey(selectedTaskDateKey);
    }
  }, [selectedTaskDateKey, calendarMode]);

  // ─── Task chip rendering ──────────────────────────────────────────
  const renderTaskChip = (task: Task) => {
    const dragStyle = getPointerDragStyle(task.id, dragSessionRef.current?.taskId ?? null, dragPreview);
    return (
      <div
        key={task.id}
        className={`tw-calendar__chip ${selectedTaskId === task.id ? 'is-selected' : ''} ${dragStyle ? 'is-dragging' : ''}`}
        style={{
          borderLeftColor: PRIORITY_COLORS[task.priority],
          ...dragStyle,
        }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={e => handlePointerDown(e, task)}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <span className="tw-calendar__chip-title">{task.title}</span>
      </div>
    );
  };

  // ─── Month view ────────────────────────────────────────────────────
  const renderMonthView = () => (
    <div className="tw-calendar__grid month">
      {WEEKDAY_HEADERS.map(d => (
        <div key={d} className="tw-calendar__weekday-header">{d}</div>
      ))}
      {monthDays.map(dayKey => {
        const dayTasks = tasksByDate[dayKey] ?? [];
        const isCurrentMonth = dayKey.slice(0, 7) === anchorMonth;
        const today = checkIsToday(dayKey);
        const isDropTarget = dragOverDate === dayKey;
        const isFocused = focusedDateKey === dayKey;
        const isMuted = focusedDateKey !== null && focusedDateKey !== dayKey;

        return (
          <div
            key={dayKey}
            className={`tw-calendar__cell ${today ? 'is-today' : ''} ${!isCurrentMonth ? 'is-other-month' : ''} ${isDropTarget ? 'is-drop-target' : ''} ${isFocused ? 'is-focused' : ''} ${isMuted ? 'is-muted' : ''}`}
            data-calendar-drop-zone={dayKey}
            onClick={() => setFocusedDateKey(prev => prev === dayKey ? null : dayKey)}
          >
            <div className="tw-calendar__cell-header">
              <span className="tw-calendar__cell-day">{parseInt(dayKey.slice(8))}</span>
              {(() => {
                const y = parseInt(dayKey.slice(0, 4));
                const m = parseInt(dayKey.slice(5, 7));
                const d = parseInt(dayKey.slice(8, 10));
                const lunar = getLunarDisplayText(y, m, d);
                return (
                  <span className={`tw-calendar__lunar ${lunar.isTerm ? 'tw-calendar__lunar--term' : ''} ${lunar.isFirstDay ? 'tw-calendar__lunar--first' : ''}`}>
                    {lunar.text}
                  </span>
                );
              })()}
              <button
                className="tw-calendar__cell-add"
                onClick={(e) => { e.stopPropagation(); onCreateTask(dayKey); }}
                title="创建任务"
              >+</button>
            </div>
            <div className="tw-calendar__cell-body">
              {dayTasks.slice(0, MAX_CHIPS_PER_CELL).map(renderTaskChip)}
              {dayTasks.length > MAX_CHIPS_PER_CELL && (
                <div className="tw-calendar__more">+{dayTasks.length - MAX_CHIPS_PER_CELL} 项</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  // ─── Week view ─────────────────────────────────────────────────────
  const renderWeekView = () => (
    <div className="tw-calendar__grid week">
      {weekDays.map(dayKey => {
        const dayTasks = tasksByDate[dayKey] ?? [];
        const today = checkIsToday(dayKey);
        const isDropTarget = dragOverDate === dayKey;

        return (
          <div
            key={dayKey}
            className={`tw-calendar__week-col ${today ? 'is-today' : ''} ${isDropTarget ? 'is-drop-target' : ''}`}
            data-calendar-drop-zone={dayKey}
          >
            <div className="tw-calendar__week-col-header">
              <span className="tw-calendar__week-col-label">{formatDayLabel(dayKey)}</span>
              {today && <span className="tw-agenda__today-badge">今天</span>}
              <button
                className="tw-calendar__cell-add"
                onClick={(e) => { e.stopPropagation(); onCreateTask(dayKey); }}
                title="创建任务"
              >+</button>
            </div>
            <div className="tw-calendar__week-col-body">
              {dayTasks.length === 0 ? (
                <div className="tw-agenda__empty">暂无安排</div>
              ) : (
                dayTasks.map(task => {
                  const taskTags = tags.filter(t => task.tagIds.includes(t.id));
                  const dragStyle = getPointerDragStyle(task.id, dragSessionRef.current?.taskId ?? null, dragPreview);
                  return (
                    <div
                      key={task.id}
                      className={`tw-agenda__card ${selectedTaskId === task.id ? 'is-selected' : ''} ${dragStyle ? 'is-dragging' : ''}`}
                      style={dragStyle}
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={e => handlePointerDown(e, task)}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                    >
                      <div className="tw-agenda__card-title">{task.title}</div>
                      <div className="tw-agenda__card-meta">
                        <span
                          className="tw-priority-badge"
                          style={{ color: PRIORITY_COLORS[task.priority], borderColor: PRIORITY_COLORS[task.priority] }}
                        >
                          {PRIORITY_LABELS[task.priority]}
                        </span>
                        {task.dueAt?.includes('T') && (
                          <span className="tw-agenda__card-due">{task.dueAt.slice(11, 16)}</span>
                        )}
                        {taskTags.map(tag => (
                          <span key={tag.id} className="tw-tag-chip" style={{ background: tag.color }}>
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  // ─── Agenda view ───────────────────────────────────────────────────
  const renderAgendaView = () => (
    <div className="tw-agenda__days">
      {weekDays.map(dayKey => {
        const today = checkIsToday(dayKey);
        const dayTasks = tasksByDate[dayKey] ?? [];
        const isDropTarget = dragOverDate === dayKey;

        return (
          <div
            key={dayKey}
            className={`tw-agenda__day ${today ? 'is-today' : ''} ${isDropTarget ? 'is-drop-target' : ''}`}
            data-calendar-drop-zone={dayKey}
          >
            <div className="tw-agenda__day-header">
              <span className="tw-agenda__day-label">{formatDayLabel(dayKey)}</span>
              {today && <span className="tw-agenda__today-badge">今天</span>}
              <span className="tw-agenda__day-count">{dayTasks.length}</span>
              <button
                className="tw-calendar__cell-add"
                onClick={(e) => { e.stopPropagation(); onCreateTask(dayKey); }}
                title="创建任务"
              >+</button>
            </div>
            <div className="tw-agenda__day-body">
              {dayTasks.length === 0 ? (
                <div className="tw-agenda__empty">暂无安排</div>
              ) : (
                dayTasks.map(task => {
                  const taskTags = tags.filter(t => task.tagIds.includes(t.id));
                  const dragStyle = getPointerDragStyle(task.id, dragSessionRef.current?.taskId ?? null, dragPreview);
                  return (
                    <div
                      key={task.id}
                      className={`tw-agenda__card ${selectedTaskId === task.id ? 'is-selected' : ''} ${dragStyle ? 'is-dragging' : ''}`}
                      style={dragStyle}
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={e => handlePointerDown(e, task)}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                    >
                      <div className="tw-agenda__card-title">{task.title}</div>
                      <div className="tw-agenda__card-meta">
                        <span
                          className="tw-priority-badge"
                          style={{ color: PRIORITY_COLORS[task.priority], borderColor: PRIORITY_COLORS[task.priority] }}
                        >
                          {PRIORITY_LABELS[task.priority]}
                        </span>
                        {task.dueAt?.includes('T') && (
                          <span className="tw-agenda__card-due">{task.dueAt.slice(11, 16)}</span>
                        )}
                        {taskTags.map(tag => (
                          <span key={tag.id} className="tw-tag-chip" style={{ background: tag.color }}>
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  // ─── Navigation label ─────────────────────────────────────────────
  const navLabel = calendarMode === 'month'
    ? getMonthLabel(calendarAnchor)
    : getWeekRangeLabel(weekDays);

  return (
    <div className="tw-calendar">
      {/* 导航栏 */}
      <div className="tw-calendar__nav">
        <div className="tw-calendar__modes">
          {(['month', 'week', 'agenda'] as CalendarMode[]).map(mode => (
            <button
              key={mode}
              className={`tw-btn-sm ${calendarMode === mode ? 'is-active' : ''}`}
              onClick={() => onCalendarModeChange(mode)}
            >
              {mode === 'month' ? '月' : mode === 'week' ? '周' : '日程'}
            </button>
          ))}
        </div>
        <div className="tw-calendar__nav-controls">
          <button className="tw-btn-sm" onClick={goPrev}>
            {calendarMode === 'month' ? '← 上月' : '← 上周'}
          </button>
          <button className="tw-btn-sm" onClick={goToday}>今天</button>
          <button className="tw-btn-sm" onClick={goNext}>
            {calendarMode === 'month' ? '下月 →' : '下周 →'}
          </button>
        </div>
        <span className="tw-calendar__nav-label">{navLabel}</span>
        <button
          className={`tw-btn-sm tw-calendar__show-completed ${showCompleted ? 'is-active' : ''}`}
          onClick={() => setShowCompleted(v => !v)}
        >
          {showCompleted ? '隐藏已完成' : '显示已完成'}
        </button>
        <input
          type="date"
          className="tw-calendar__date-picker"
          value={calendarAnchor}
          onChange={e => {
            if (e.target.value) onCalendarAnchorChange(e.target.value);
          }}
        />
      </div>

      {/* 内容 */}
      {calendarMode === 'month' && renderMonthView()}
      {calendarMode === 'week' && renderWeekView()}
      {calendarMode === 'agenda' && renderAgendaView()}

      <DragPreviewLayer preview={dragPreview} />
    </div>
  );
}
