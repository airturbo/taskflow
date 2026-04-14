import { useState, useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import type { Task, TimelineScale } from '../../types/domain'
import type { TimelineDragState, TimelineDragMode, InlineCreateRequest } from '../../types/workspace'
import {
  getTaskTimelineRange, clampTimelineRange, snapTimelineMinutes, getTimelinePercent,
  buildTimelineScaleMarks, buildTimelineCreateSlots, formatTimelineBarLabel,
  getDateTimeValueFromMs, getTimelineWindowLabel,
  TIMELINE_STEP_MINUTES,
} from '@taskflow/core'
import { isTaskRiskOverdue, getTaskDeadlineMarkerTone } from '@taskflow/core'
import { addDays, getDateKey, buildWeek } from '../../utils/dates'
import { formatTaskWindow } from '../../utils/reminder-engine'
import { getDateTimeMs, MINUTE, DAY_MINUTES, WEEK_MINUTES } from '../../utils/workspace-helpers'
import { EmptyState, StatusBadge, TaskDeadlineIndicators, getTaskDeadlineMarkerOffset } from '../shared'
import styles from './TimelineView.module.css'

export function TimelineView({
  tasks,
  selectedTaskId,
  calendarAnchor,
  timelineScale,
  onSelectTask,
  onUpdateSchedule,
  onOpenInlineCreate,
  onChangeAnchor,
  onChangeScale,
}: {
  tasks: Task[]
  selectedTaskId: string | null
  calendarAnchor: string
  timelineScale: TimelineScale
  onSelectTask: (taskId: string) => void
  onUpdateSchedule: (taskId: string, startAt: string, dueAt: string) => void
  onOpenInlineCreate: (request: InlineCreateRequest) => void
  onChangeAnchor: (value: string) => void
  onChangeScale: (value: TimelineScale) => void
}) {
  const isDayScale = timelineScale === 'day'
  const windowDates = isDayScale ? [calendarAnchor] : buildWeek(calendarAnchor)
  const windowStart = getDateTimeMs(`${windowDates[0]}T00:00`, 'start') ?? Date.now()
  const totalMinutes = isDayScale ? DAY_MINUTES : WEEK_MINUTES
  const windowEnd = windowStart + totalMinutes * MINUTE
  const stepMinutes = isDayScale ? 15 : TIMELINE_STEP_MINUTES
  const scaleMarks = buildTimelineScaleMarks(calendarAnchor, timelineScale)
  const createSlots = buildTimelineCreateSlots(calendarAnchor, timelineScale)
  const timelineGridStyle = { '--timeline-columns': scaleMarks.length } as CSSProperties
  const createRowStyle = { gridTemplateColumns: `repeat(${createSlots.length}, minmax(0, 1fr))` } as CSSProperties
  const [dragState, setDragState] = useState<TimelineDragState | null>(null)
  const dragRef = useRef<TimelineDragState | null>(null)
  const dayScrollRef = useRef<HTMLDivElement | null>(null)

  // Auto-scroll day view to current time on mount / anchor change
  useEffect(() => {
    if (!isDayScale) return
    const el = dayScrollRef.current
    if (!el) return
    const DAY_HOUR_HEIGHT_PX = 64
    const DAY_TOTAL_HEIGHT_PX = DAY_HOUR_HEIGHT_PX * 24
    const winStart = getDateTimeMs(`${calendarAnchor}T00:00`, 'start') ?? Date.now()
    const frac = (Date.now() - winStart) / (DAY_MINUTES * MINUTE)
    if (frac < 0 || frac > 1) return
    el.scrollTop = Math.max(0, frac * DAY_TOTAL_HEIGHT_PX - el.clientHeight / 2)
  }, [isDayScale, calendarAnchor])

  useEffect(() => {
    dragRef.current = dragState
  }, [dragState])

  useEffect(() => {
    if (!dragState?.taskId) return

    const onPointerMove = (event: PointerEvent) => {
      const current = dragRef.current
      if (!current) return

      const deltaMinutes = snapTimelineMinutes(((event.clientX - current.originX) / current.laneWidth) * current.totalMinutes, current.stepMinutes)
      let nextStart = current.originStart
      let nextEnd = current.originEnd

      if (current.mode === 'move') {
        const duration = current.originEnd - current.originStart
        nextStart = current.originStart + deltaMinutes * MINUTE
        nextEnd = nextStart + duration
      } else if (current.mode === 'resize-start') {
        nextStart = current.originStart + deltaMinutes * MINUTE
      } else {
        nextEnd = current.originEnd + deltaMinutes * MINUTE
      }

      const nextRange = clampTimelineRange(nextStart, nextEnd, current.windowStart, current.windowEnd)
      setDragState({ ...current, previewStart: nextRange.start, previewEnd: nextRange.end })
    }

    const finishPointerDrag = () => {
      const current = dragRef.current
      if (!current) return
      onUpdateSchedule(current.taskId, getDateTimeValueFromMs(current.previewStart), getDateTimeValueFromMs(current.previewEnd))
      dragRef.current = null
      setDragState(null)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', finishPointerDrag)
    window.addEventListener('pointercancel', finishPointerDrag)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', finishPointerDrag)
      window.removeEventListener('pointercancel', finishPointerDrag)
    }
  }, [dragState?.taskId, onUpdateSchedule])

  const scheduledTasks = tasks
    .map((task) => ({ task, range: getTaskTimelineRange(task) }))
    .filter((item): item is { task: Task; range: { start: number; end: number } } => Boolean(item.range && item.range.start < windowEnd && item.range.end > windowStart))
    .sort((left, right) => left.range.start - right.range.start)

  const startDragDirect = (task: Task, mode: TimelineDragMode, clientX: number, lane: HTMLElement) => {
    const range = getTaskTimelineRange(task)
    if (!range) return

    onSelectTask(task.id)

    setDragState({
      taskId: task.id,
      mode,
      originX: clientX,
      laneWidth: Math.max(lane.getBoundingClientRect().width, 1),
      originStart: range.start,
      originEnd: range.end,
      previewStart: range.start,
      previewEnd: range.end,
      windowStart,
      windowEnd,
      totalMinutes,
      stepMinutes,
    })
  }

  const DRAG_THRESHOLD = 6
  const pendingDragRef = useRef<{ task: Task; mode: TimelineDragMode; startX: number; startY: number; clientX: number; lane: HTMLElement } | null>(null)
  const didDragRef = useRef(false)

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const pending = pendingDragRef.current
      if (!pending) return
      const dx = e.clientX - pending.startX
      const dy = e.clientY - pending.startY
      if (Math.sqrt(dx * dx + dy * dy) >= DRAG_THRESHOLD) {
        didDragRef.current = true
        pendingDragRef.current = null
        startDragDirect(pending.task, pending.mode, pending.clientX, pending.lane)
      }
    }
    const onUp = () => {
      pendingDragRef.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [])

  const handleTimelineBarPointerDown = (event: React.PointerEvent<HTMLElement>, task: Task, mode: TimelineDragMode) => {
    if (event.button !== 0) return
    const lane = (event.currentTarget.closest('[data-timeline-lane]') as HTMLElement | null)
    if (!lane) return
    didDragRef.current = false
    pendingDragRef.current = { task, mode, startX: event.clientX, startY: event.clientY, clientX: event.clientX, lane }
  }

  const handleTimelineBarClick = (event: React.MouseEvent, task: Task) => {
    event.stopPropagation()
    if (!didDragRef.current) {
      onSelectTask(task.id)
    }
    didDragRef.current = false
  }

  const DAY_HOUR_HEIGHT = 64
  const DAY_TOTAL_HEIGHT = DAY_HOUR_HEIGHT * 24

  const getVerticalStyle = (startMs: number, endMs: number) => {
    const topFrac = (startMs - windowStart) / (windowEnd - windowStart)
    const heightFrac = (endMs - startMs) / (windowEnd - windowStart)
    return {
      top: `${topFrac * DAY_TOTAL_HEIGHT}px`,
      height: `${Math.max(heightFrac * DAY_TOTAL_HEIGHT, 24)}px`,
    }
  }

  const hourLabels = Array.from({ length: 24 }, (_, i) => i)
  const nowFrac = (Date.now() - windowStart) / (windowEnd - windowStart)
  const nowInWindow = nowFrac >= 0 && nowFrac <= 1

  return (
    <div className="view-stack">
      <div className={`${styles.timelineToolbar} panel`}>
        <div className={styles.timelineToolbarWindow}>
          <strong>{getTimelineWindowLabel(calendarAnchor, timelineScale)}</strong>
          <span>{isDayScale ? '按日聚焦' : '按周统筹'}</span>
        </div>
        <div className={styles.timelineToolbarActions}>
          <div className={`calendar-modes ${styles.timelineModes}`}>
            {(['day', 'week'] as TimelineScale[]).map((scale) => (
              <button key={scale} className={timelineScale === scale ? 'is-active' : ''} onClick={() => onChangeScale(scale)}>
                {scale === 'day' ? '日' : '周'}
              </button>
            ))}
          </div>
          <button className="ghost-button small" onClick={() => onChangeAnchor(addDays(calendarAnchor, isDayScale ? -1 : -7))}>‹</button>
          <button className="ghost-button small" onClick={() => onChangeAnchor(getDateKey())}>今天</button>
          <button className="ghost-button small" onClick={() => onChangeAnchor(addDays(calendarAnchor, isDayScale ? 1 : 7))}>›</button>
          <input type="date" className="date-picker-input" value={calendarAnchor} onChange={(event) => event.target.value && onChangeAnchor(event.target.value)} />
        </div>
      </div>

      {isDayScale ? (
        <div className={styles.timelineDayView}>
          <div className={styles.timelineDayScroll} ref={dayScrollRef}>
            <div className={styles.timelineDayInner} style={{ height: `${DAY_TOTAL_HEIGHT}px` }}>
              {hourLabels.map((h) => (
                <div
                  key={h}
                  className={styles.timelineDayHour}
                  style={{ top: `${h * DAY_HOUR_HEIGHT}px`, height: `${DAY_HOUR_HEIGHT}px` }}
                >
                  <span className={styles.timelineDayHourLabel}>{String(h).padStart(2, '0')}:00</span>
                  <div className={styles.timelineDayHourLine} />
                  <div className={styles.timelineDayHourHalfLine} style={{ top: `${DAY_HOUR_HEIGHT / 2}px` }} />
                </div>
              ))}

              {nowInWindow && (
                <div
                  className={styles.timelineDayNow}
                  style={{ top: `${nowFrac * DAY_TOTAL_HEIGHT}px` }}
                  aria-hidden="true"
                />
              )}

              <div className={styles.timelineDayEvents}>
                {scheduledTasks.map(({ task, range }) => {
                  const preview = dragState?.taskId === task.id ? { start: dragState.previewStart, end: dragState.previewEnd } : range
                  const clippedStart = Math.max(preview.start, windowStart)
                  const clippedEnd = Math.min(preview.end, windowEnd)
                  const vStyle = getVerticalStyle(clippedStart, clippedEnd)
                  const overdue = isTaskRiskOverdue(task)
                  return (
                    <button
                      key={task.id}
                      className={`${styles.timelineDayEvent} priority-${task.priority} status-${task.status} ${overdue ? 'is-overdue' : ''} ${selectedTaskId === task.id ? 'is-selected' : ''} ${dragState?.taskId === task.id ? 'is-dragging' : ''}`}
                      style={vStyle}
                      onClick={() => onSelectTask(task.id)}
                    >
                      <span className={`${styles.timelineDayEventGrip} is-top`} onPointerDown={(e) => { e.stopPropagation(); const lane = (e.currentTarget.closest('[data-timeline-lane]') as HTMLElement | null); if (lane) startDragDirect(task, 'resize-start', e.clientX, lane) }} />
                      <div className={styles.timelineDayEventContent}>
                        <strong>{task.title}</strong>
                        <small>{formatTimelineBarLabel(preview.start, preview.end)}</small>
                      </div>
                      <span className={`${styles.timelineDayEventGrip} is-bottom`} onPointerDown={(e) => { e.stopPropagation(); const lane = (e.currentTarget.closest('[data-timeline-lane]') as HTMLElement | null); if (lane) startDragDirect(task, 'resize-end', e.clientX, lane) }} />
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <button
            className={styles.timelineDayAddBtn}
            onClick={(event) =>
              onOpenInlineCreate({
                view: 'timeline',
                anchorRect: (event.currentTarget as HTMLElement).getBoundingClientRect(),
                dateKey: calendarAnchor,
                guidance: getTimelineWindowLabel(calendarAnchor, 'day'),
                time: undefined,
              })
            }
          >
            + 添加任务
          </button>

          {scheduledTasks.length === 0 && (
            <EmptyState title="这一天还没有排进时间线。" description="点击「+ 添加任务」快速补一条当天任务。" />
          )}
        </div>
      ) : (
        <>
          <div className={styles.timelineCreateRow} style={createRowStyle}>
            {createSlots.map((slot) => (
              <button
                key={slot.key}
                className={`${styles.timelineCreateSlot} ${slot.isToday ? 'is-today' : ''}`}
                aria-label={`在${slot.label}创建任务`}
                title={`在${slot.label}创建任务`}
                onClick={(event) =>
                  onOpenInlineCreate({
                    view: 'timeline',
                    anchorRect: (event.currentTarget as HTMLElement).getBoundingClientRect(),
                    dateKey: slot.dateKey,
                    guidance: slot.label,
                    time: slot.time,
                  })
                }
              >
                <span>{slot.label}</span>
                <small>{slot.subLabel}</small>
              </button>
            ))}
          </div>
          {scheduledTasks.length === 0 ? (
            <EmptyState title="这周时间线还没有任务条。" description="点上方日期即可排一条任务。" />
          ) : (
            <div className={styles.timelineView}>
              <header className={styles.timelineHeader}>
                <div>任务</div>
                <div className={styles.timelineScale} style={timelineGridStyle}>
                  {scaleMarks.map((mark) => (
                    <span key={mark.key} className={mark.isToday ? 'is-today' : ''}>{mark.label}</span>
                  ))}
                </div>
              </header>
              <div className={styles.timelineBody}>
                {scheduledTasks.map(({ task, range }) => {
                  const preview = dragState?.taskId === task.id ? { start: dragState.previewStart, end: dragState.previewEnd } : range
                  const clippedStart = Math.max(preview.start, windowStart)
                  const clippedEnd = Math.min(preview.end, windowEnd)
                  const left = getTimelinePercent(clippedStart, windowStart, windowEnd)
                  const width = Math.max(getTimelinePercent(clippedEnd, windowStart, windowEnd) - left, 1.8)
                  const overdue = isTaskRiskOverdue(task)
                  const deadlineMarkerOffset = getTaskDeadlineMarkerOffset(task, windowStart, windowEnd)
                  const deadlineMarkerTone = getTaskDeadlineMarkerTone(task)

                  return (
                    <div key={task.id} className={`${styles.timelineRow} ${selectedTaskId === task.id ? 'is-selected' : ''}`}>
                      <button className={styles.timelineTitle} onClick={() => onSelectTask(task.id)}>
                        <strong>{task.title}</strong>
                        <div className={styles.timelineTitleMeta}>
                          <small>{formatTaskWindow(getDateTimeValueFromMs(preview.start), getDateTimeValueFromMs(preview.end))}</small>
                          <TaskDeadlineIndicators task={task} compact />
                        </div>
                      </button>
                      <div className={styles.timelineLane} data-timeline-lane>
                        <div className={styles.timelineGrid} style={timelineGridStyle}>
                          {scaleMarks.map((mark) => (
                            <span key={mark.key} className={mark.isToday ? 'is-today' : ''} />
                          ))}
                        </div>
                        {deadlineMarkerOffset != null && deadlineMarkerTone && (
                          <div
                            className={`${styles.timelineDeadlineMarker} is-${deadlineMarkerTone}`}
                            style={{ left: `calc(${deadlineMarkerOffset}% - 1px)` }}
                            aria-hidden="true"
                          >
                            <span>DDL</span>
                          </div>
                        )}
                        {nowInWindow && (
                          <div
                            className={styles.timelineNowLine}
                            style={{ left: `${nowFrac * 100}%` }}
                            aria-hidden="true"
                          />
                        )}
                        <button
                          className={`${styles.timelineBar} priority-${task.priority} status-${task.status} ${overdue ? 'is-overdue' : ''} ${selectedTaskId === task.id ? 'is-selected' : ''} ${dragState?.taskId === task.id ? 'is-dragging' : ''}`}
                          style={{ left: `${left}%`, width: `${width}%` }}
                          onPointerDown={(event) => handleTimelineBarPointerDown(event, task, 'move')}
                          onClick={(event) => handleTimelineBarClick(event, task)}
                        >
                          <span className={`${styles.timelineBarGrip} is-start`} onPointerDown={(event) => { event.stopPropagation(); const lane = (event.currentTarget.closest('[data-timeline-lane]') as HTMLElement | null); if (lane) startDragDirect(task, 'resize-start', event.clientX, lane) }} />
                          <span className={styles.timelineBarContent}>
                            <StatusBadge status={task.status} compact />
                            <strong>{task.title}</strong>
                            <small>{formatTimelineBarLabel(preview.start, preview.end)}</small>
                          </span>
                          <span className={`${styles.timelineBarGrip} is-end`} onPointerDown={(event) => { event.stopPropagation(); const lane = (event.currentTarget.closest('[data-timeline-lane]') as HTMLElement | null); if (lane) startDragDirect(task, 'resize-end', event.clientX, lane) }} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
