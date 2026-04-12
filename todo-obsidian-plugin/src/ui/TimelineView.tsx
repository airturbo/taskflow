import { useCallback, useMemo, useRef, useState } from 'react';
import type { Task, Tag, Priority, TimelineScale } from '../core/domain';
import { getDateKey, addDays, formatDayLabel, buildWeek, formatDateTime } from '../core/dates';
import { isTaskRiskOverdue } from '../core/selectors';
import { markClickSuppressed } from './drag-system';

interface TimelineViewProps {
  tasks: Task[];
  tags: Tag[];
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, patch: Partial<Task>) => Promise<void>;
  onCreateTask: (startAt: string, dueAt: string) => void;
}

const PRIORITY_COLORS: Record<Priority, string> = {
  urgent: '#ef4444',
  high: '#f97316',
  normal: '#6366f1',
  low: '#94a3b8',
};

const DAY_MS = 24 * 60 * 60 * 1000;

/* ─── helpers ─── */

function parseDateTime(value: string | null): number | null {
  if (!value) return null;
  const d = new Date(value.includes('T') ? value : `${value}T00:00`);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

function toIsoDateTime(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${day}T${h}:${mi}`;
}

interface TimelineRow {
  task: Task;
  startMs: number;
  endMs: number;
}

/* eslint-disable @typescript-eslint/no-unused-vars */
export function TimelineView({
  tasks,
  tags: _tags,
  selectedTaskId,
  onSelectTask,
  onUpdateTask,
  onCreateTask,
}: TimelineViewProps) {
  /* eslint-enable @typescript-eslint/no-unused-vars */
  const [scale, setScale] = useState<TimelineScale>('day');
  const [anchor, setAnchor] = useState(getDateKey());
  const containerRef = useRef<HTMLDivElement>(null);

  // ─── Drag state ────────────────────────────────────────────────────
  const dragRef = useRef<{
    taskId: string;
    mode: 'move' | 'resize-start' | 'resize-end';
    startX: number;
    origStartMs: number;
    origEndMs: number;
  } | null>(null);
  const [dragDelta, setDragDelta] = useState(0);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragMode, setDragMode] = useState<string | null>(null);
  const clickSuppressedRef = useRef(false);

  // ─── Time range ────────────────────────────────────────────────────
  const { rangeStartMs, rangeEndMs, slots, slotLabelFn, totalWidth } = useMemo(() => {
    if (scale === 'day') {
      const dayStart = new Date(`${anchor}T00:00`).getTime();
      const dayEnd = dayStart + DAY_MS;
      const slotCount = 12; // 2-hour intervals
      const slotArr = Array.from({ length: slotCount }, (_, i) => dayStart + i * 2 * 60 * 60 * 1000);
      return {
        rangeStartMs: dayStart,
        rangeEndMs: dayEnd,
        slots: slotArr,
        slotLabelFn: (ms: number) => {
          const h = new Date(ms).getHours();
          return `${String(h).padStart(2, '0')}:00`;
        },
        totalWidth: 960,
      };
    }
    // week view
    const weekDays = buildWeek(anchor);
    const weekStart = new Date(`${weekDays[0]}T00:00`).getTime();
    const weekEnd = new Date(`${weekDays[6]}T00:00`).getTime() + DAY_MS;
    const slotArr = weekDays.map(d => new Date(`${d}T00:00`).getTime());
    return {
      rangeStartMs: weekStart,
      rangeEndMs: weekEnd,
      slots: slotArr,
      slotLabelFn: (ms: number) => {
        const d = new Date(ms);
        return `${d.getMonth() + 1}/${d.getDate()}`;
      },
      totalWidth: 960,
    };
  }, [scale, anchor]);

  const msPerPx = (rangeEndMs - rangeStartMs) / totalWidth;

  // ─── Rows ──────────────────────────────────────────────────────────
  const rows: TimelineRow[] = useMemo(() => {
    const result: TimelineRow[] = [];
    for (const task of tasks) {
      if (task.deleted || task.completed) continue;
      const s = parseDateTime(task.startAt) ?? parseDateTime(task.dueAt);
      const e = parseDateTime(task.dueAt) ?? (s !== null ? s + 2 * 60 * 60 * 1000 : null);
      if (s === null || e === null) continue;
      // Only include if overlapping range
      if (e < rangeStartMs || s > rangeEndMs) continue;
      result.push({ task, startMs: s, endMs: Math.max(e, s + 30 * 60 * 1000) });
    }
    result.sort((a, b) => a.startMs - b.startMs);
    return result;
  }, [tasks, rangeStartMs, rangeEndMs]);

  // ─── DDL markers ───────────────────────────────────────────────────
  const ddlMarkers = useMemo(() => {
    const markers: { taskId: string; ms: number; title: string }[] = [];
    for (const task of tasks) {
      if (task.deleted || task.completed) continue;
      const dl = parseDateTime(task.deadlineAt ?? null);
      if (dl !== null && dl >= rangeStartMs && dl <= rangeEndMs) {
        markers.push({ taskId: task.id, ms: dl, title: task.title });
      }
    }
    return markers;
  }, [tasks, rangeStartMs, rangeEndMs]);

  // ─── Navigation ────────────────────────────────────────────────────
  const goPrev = useCallback(() => {
    setAnchor(prev => addDays(prev, scale === 'day' ? -1 : -7));
  }, [scale]);

  const goNext = useCallback(() => {
    setAnchor(prev => addDays(prev, scale === 'day' ? 1 : 7));
  }, [scale]);

  const goToday = useCallback(() => {
    setAnchor(getDateKey());
  }, []);

  // ─── Bar position ─────────────────────────────────────────────────
  const getBarStyle = (row: TimelineRow) => {
    let sMs = row.startMs;
    let eMs = row.endMs;

    if (draggingTaskId === row.task.id && dragRef.current) {
      const deltaPx = dragDelta;
      const deltaMs = deltaPx * msPerPx;
      if (dragMode === 'move') {
        sMs += deltaMs;
        eMs += deltaMs;
      } else if (dragMode === 'resize-start') {
        sMs += deltaMs;
        if (sMs >= eMs) sMs = eMs - 30 * 60 * 1000;
      } else if (dragMode === 'resize-end') {
        eMs += deltaMs;
        if (eMs <= sMs) eMs = sMs + 30 * 60 * 1000;
      }
    }

    const left = Math.max(0, (sMs - rangeStartMs) / msPerPx);
    const right = Math.min(totalWidth, (eMs - rangeStartMs) / msPerPx);
    const width = Math.max(right - left, 4);
    return { left, width };
  };

  // ─── Pointer handlers ─────────────────────────────────────────────
  const handleBarPointerDown = useCallback((e: React.PointerEvent, task: Task, mode: 'move' | 'resize-start' | 'resize-end', row: TimelineRow) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      taskId: task.id,
      mode,
      startX: e.clientX,
      origStartMs: row.startMs,
      origEndMs: row.endMs,
    };
    setDraggingTaskId(task.id);
    setDragMode(mode);
    setDragDelta(0);
  }, []);

  const handleBarPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    setDragDelta(dx);
  }, []);

  const handleBarPointerUp = useCallback((e: React.PointerEvent) => {
    const session = dragRef.current;
    if (!session) return;

    const deltaPx = e.clientX - session.startX;
    const deltaMs = deltaPx * msPerPx;

    if (Math.abs(deltaPx) > 4) {
      markClickSuppressed(clickSuppressedRef);

      let newStart = session.origStartMs;
      let newEnd = session.origEndMs;

      if (session.mode === 'move') {
        newStart += deltaMs;
        newEnd += deltaMs;
      } else if (session.mode === 'resize-start') {
        newStart += deltaMs;
        if (newStart >= newEnd) newStart = newEnd - 30 * 60 * 1000;
      } else if (session.mode === 'resize-end') {
        newEnd += deltaMs;
        if (newEnd <= newStart) newEnd = newStart + 30 * 60 * 1000;
      }

      const patch: Partial<Task> = {};
      patch.startAt = toIsoDateTime(newStart);
      patch.dueAt = toIsoDateTime(newEnd);
      void onUpdateTask(session.taskId, patch);
    } else {
      onSelectTask(session.taskId);
    }

    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
    dragRef.current = null;
    setDraggingTaskId(null);
    setDragMode(null);
    setDragDelta(0);
  }, [msPerPx, onUpdateTask, onSelectTask]);

  // ─── Slot click to create ─────────────────────────────────────────
  const handleSlotClick = useCallback((slotMs: number) => {
    const slotDuration = scale === 'day' ? 2 * 60 * 60 * 1000 : DAY_MS;
    onCreateTask(toIsoDateTime(slotMs), toIsoDateTime(slotMs + slotDuration));
  }, [scale, onCreateTask]);

  // ─── Navigation label ─────────────────────────────────────────────
  const navLabel = useMemo(() => {
    if (scale === 'day') {
      return formatDayLabel(anchor);
    }
    const week = buildWeek(anchor);
    const s = week[0];
    const e = week[6];
    return `${s} ~ ${e}`;
  }, [scale, anchor]);

  return (
    <div className="tw-timeline">
      {/* Toolbar */}
      <div className="tw-timeline__toolbar">
        <div className="tw-timeline__toolbar-left">
          <button className={`tw-btn-sm ${scale === 'day' ? 'is-active' : ''}`} onClick={() => setScale('day')}>日</button>
          <button className={`tw-btn-sm ${scale === 'week' ? 'is-active' : ''}`} onClick={() => setScale('week')}>周</button>
        </div>
        <div className="tw-timeline__toolbar-center">
          <button className="tw-btn-sm" onClick={goPrev}>{scale === 'day' ? '← 前一天' : '← 前一周'}</button>
          <button className="tw-btn-sm" onClick={goToday}>今天</button>
          <button className="tw-btn-sm" onClick={goNext}>{scale === 'day' ? '后一天 →' : '后一周 →'}</button>
        </div>
        <span className="tw-timeline__toolbar-label">{navLabel}</span>
        <input
          type="date"
          className="tw-calendar__date-picker"
          value={anchor}
          onChange={e => { if (e.target.value) setAnchor(e.target.value); }}
        />
      </div>

      {/* Header + Body */}
      <div className="tw-timeline__content" ref={containerRef}>
        {/* Scale header */}
        <div className="tw-timeline__header">
          <div className="tw-timeline__label-col">任务</div>
          <div className="tw-timeline__scale-area" style={{ width: totalWidth }}>
            {slots.map((slotMs, i) => {
              const left = (slotMs - rangeStartMs) / msPerPx;
              return (
                <div
                  key={i}
                  className="tw-timeline__scale"
                  style={{ left }}
                >
                  <span className="tw-timeline__scale-label">{slotLabelFn(slotMs)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="tw-timeline__body">
          {rows.length === 0 ? (
            <div className="tw-empty-state tw-empty-state--compact">
              <div className="tw-empty-state__icon">📅</div>
              <strong className="tw-empty-state__title">暂无排期任务</strong>
              <p className="tw-empty-state__desc">点击时间轴上的 + 创建排期任务</p>
            </div>
          ) : (
            rows.map(row => {
              const bar = getBarStyle(row);
              const overdue = isTaskRiskOverdue(row.task);
              return (
                <div key={row.task.id} className="tw-timeline__row">
                  <div
                    className={`tw-timeline__row-label ${selectedTaskId === row.task.id ? 'is-selected' : ''}`}
                    onClick={() => onSelectTask(row.task.id)}
                  >
                    <span className="tw-timeline__row-title">{row.task.title}</span>
                    {overdue && <span className="tw-overdue" style={{ fontSize: 10 }}>逾期</span>}
                  </div>
                  <div className="tw-timeline__bar-area" style={{ width: totalWidth, position: 'relative' }}>
                    {/* Slot click zones */}
                    {slots.map((slotMs, i) => {
                      const slotLeft = (slotMs - rangeStartMs) / msPerPx;
                      const nextSlot = i < slots.length - 1 ? slots[i + 1] : rangeEndMs;
                      const slotWidth = (nextSlot - slotMs) / msPerPx;
                      return (
                        <div
                          key={i}
                          className="tw-timeline__slot-zone"
                          style={{ left: slotLeft, width: slotWidth }}
                        />
                      );
                    })}
                    {/* DDL markers */}
                    {ddlMarkers.filter(m => m.taskId === row.task.id).map(m => {
                      const left = (m.ms - rangeStartMs) / msPerPx;
                      return (
                        <div
                          key={m.ms}
                          className="tw-timeline__deadline-marker"
                          style={{ left }}
                          title={`DDL: ${formatDateTime(toIsoDateTime(m.ms))}`}
                        />
                      );
                    })}
                    {/* Bar */}
                    <div
                      className={`tw-timeline__bar ${selectedTaskId === row.task.id ? 'is-selected' : ''} ${draggingTaskId === row.task.id ? 'is-dragging-bar' : ''}`}
                      style={{
                        left: bar.left,
                        width: bar.width,
                        background: PRIORITY_COLORS[row.task.priority],
                      }}
                      onClick={e => { e.stopPropagation(); if (clickSuppressedRef.current) return; onSelectTask(row.task.id); }}
                      onPointerDown={e => handleBarPointerDown(e, row.task, 'move', row)}
                      onPointerMove={handleBarPointerMove}
                      onPointerUp={handleBarPointerUp}
                    >
                      <div
                        className="tw-timeline__bar__grip tw-timeline__bar__grip--start"
                        onPointerDown={e => { e.stopPropagation(); handleBarPointerDown(e, row.task, 'resize-start', row); }}
                        onPointerMove={handleBarPointerMove}
                        onPointerUp={handleBarPointerUp}
                      />
                      <span className="tw-timeline__bar-title">{row.task.title}</span>
                      <div
                        className="tw-timeline__bar__grip tw-timeline__bar__grip--end"
                        onPointerDown={e => { e.stopPropagation(); handleBarPointerDown(e, row.task, 'resize-end', row); }}
                        onPointerMove={handleBarPointerMove}
                        onPointerUp={handleBarPointerUp}
                      />
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {/* Create entry per slot */}
          <div className="tw-timeline__row tw-timeline__row--create">
            <div className="tw-timeline__row-label" style={{ color: 'var(--text-faint)' }}>+ 新建</div>
            <div className="tw-timeline__bar-area" style={{ width: totalWidth, position: 'relative' }}>
              {slots.map((slotMs, i) => {
                const slotLeft = (slotMs - rangeStartMs) / msPerPx;
                const nextSlot = i < slots.length - 1 ? slots[i + 1] : rangeEndMs;
                const slotWidth = (nextSlot - slotMs) / msPerPx;
                return (
                  <button
                    key={i}
                    className="tw-timeline__create-btn"
                    style={{ left: slotLeft, width: slotWidth }}
                    onClick={() => handleSlotClick(slotMs)}
                    title="创建任务"
                  >+</button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
