import { useState, useEffect, useRef, useMemo } from 'react'
import type { Task, TodoList, Tag, CalendarMode } from '../../types/domain'
import type { PointerDragPreviewState, InlineCreateRequest } from '../../types/workspace'
import { getPreferredFocusedCalendarDate, getCalendarTaskDateKey, getCalendarTaskAnchor, groupTasksByDay } from '@taskflow/core'
import { formatDateTime, formatDayLabel, isToday } from '../../utils/dates'
import { getLunarDate } from '../../utils/lunar'
import { POINTER_DRAG_THRESHOLD, buildPointerDragPreviewState, buildTaskDragPreview, getPointerDragStyle, markClickSuppressed, resolveDropZoneValueFromPoint } from '../../utils/workspace-helpers'
import type { PointerDragSession } from '../../types/workspace'
import { DragPreviewLayer, TaskDeadlineIndicators, TaskDeadlineDot } from '../shared'
import { EmptyState } from '../shared'
import { getTagToneStyle } from '../../utils/workspace-helpers'

export function CalendarView({
  tasks,
  lists,
  tags,
  calendarMode,
  calendarAnchor,
  monthDates,
  weekDates,
  showCompletedTasks,
  selectedTaskId,
  onSelectTask,
  onOpenInlineCreate,
  onMoveTaskToDate,
}: {
  tasks: Task[]
  lists: TodoList[]
  tags: Tag[]
  calendarMode: CalendarMode
  calendarAnchor: string
  monthDates: string[]
  weekDates: string[]
  showCompletedTasks: boolean
  selectedTaskId: string | null
  onSelectTask: (taskId: string) => void
  onOpenInlineCreate: (request: InlineCreateRequest) => void
  onMoveTaskToDate: (taskId: string, fromDateKey: string, toDateKey: string) => void
}) {
  const [dragTaskId, setDragTaskId] = useState<string | null>(null)
  const [longPressTaskId, setLongPressTaskId] = useState<string | null>(null)
  const [dragOverDateKey, setDragOverDateKey] = useState<string | null>(null)
  const [dragPreview, setDragPreview] = useState<PointerDragPreviewState | null>(null)
  const [focusedDateKey, setFocusedDateKey] = useState<string | null>(() => getPreferredFocusedCalendarDate(monthDates, calendarAnchor))
  const dragPayloadRef = useRef<{ taskId: string; sourceDateKey: string } | null>(null)
  const pointerDragRef = useRef<({ sourceDateKey: string } & PointerDragSession) | null>(null)
  const dragOverDateKeyRef = useRef<string | null>(null)
  const suppressClickRef = useRef(false)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressPendingRef = useRef<({ sourceDateKey: string } & PointerDragSession) | null>(null)
  const selectedTaskDateKey = useMemo(() => {
    if (!selectedTaskId) return null
    const selectedTask = tasks.find((task) => task.id === selectedTaskId)
    return selectedTask ? getCalendarTaskDateKey(selectedTask) : null
  }, [selectedTaskId, tasks])
  const agendaTaskMap = groupTasksByDay(
    tasks.filter((task) => {
      const dateKey = getCalendarTaskDateKey(task)
      return Boolean(dateKey && weekDates.includes(dateKey))
    }),
  )

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    longPressPendingRef.current = null
    setLongPressTaskId(null)
  }

  const finishDrag = () => {
    const current = pointerDragRef.current
    if (current?.sourceElement.hasPointerCapture(current.pointerId)) {
      current.sourceElement.releasePointerCapture(current.pointerId)
    }
    pointerDragRef.current = null
    dragPayloadRef.current = null
    dragOverDateKeyRef.current = null
    setDragTaskId(null)
    setDragOverDateKey(null)
    setDragPreview(null)
    cancelLongPress()
  }

  const resolveDropDateKey = (clientX: number, clientY: number) => resolveDropZoneValueFromPoint(clientX, clientY, '[data-calendar-drop-zone]', 'data-calendar-drop-zone')

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      // Cancel long-press if finger moves too much before timer fires
      if (longPressPendingRef.current && event.pointerId === longPressPendingRef.current.pointerId) {
        const moved = Math.hypot(event.clientX - longPressPendingRef.current.startX, event.clientY - longPressPendingRef.current.startY)
        if (moved > 8) cancelLongPress()
      }

      const current = pointerDragRef.current
      if (!current || event.pointerId !== current.pointerId) return

      const moved = Math.hypot(event.clientX - current.startX, event.clientY - current.startY)
      if (!current.dragged && moved < POINTER_DRAG_THRESHOLD) return
      if (!current.dragged) {
        current.dragged = true
        setDragTaskId(current.taskId)
      }

      event.preventDefault()
      const targetDateKey = resolveDropDateKey(event.clientX, event.clientY)
      dragOverDateKeyRef.current = targetDateKey
      setDragPreview(buildPointerDragPreviewState(current, event.clientX, event.clientY))
      setDragOverDateKey(targetDateKey)
    }

    const finalizePointerDrag = (event: PointerEvent) => {
      // If long-press timer hasn't fired yet, cancel it (it was just a tap)
      if (longPressPendingRef.current && event.pointerId === longPressPendingRef.current.pointerId) {
        cancelLongPress()
      }

      const current = pointerDragRef.current
      if (!current || event.pointerId !== current.pointerId) return

      const targetDateKey = current.dragged ? dragOverDateKeyRef.current ?? resolveDropDateKey(event.clientX, event.clientY) : null
      if (current.dragged && targetDateKey) {
        onMoveTaskToDate(current.taskId, current.sourceDateKey, targetDateKey)
        setFocusedDateKey(targetDateKey)
        markClickSuppressed(suppressClickRef)
      }

      finishDrag()
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', finalizePointerDrag)
    window.addEventListener('pointercancel', finalizePointerDrag)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', finalizePointerDrag)
      window.removeEventListener('pointercancel', finalizePointerDrag)
    }
  }, [onMoveTaskToDate])

  useEffect(() => {
    if (calendarMode !== 'month') return
    if (!selectedTaskDateKey || !monthDates.includes(selectedTaskDateKey)) return
    setFocusedDateKey(selectedTaskDateKey)
  }, [calendarMode, monthDates, selectedTaskDateKey])

  useEffect(() => {
    if (calendarMode !== 'month') return
    setFocusedDateKey((current) => (current && monthDates.includes(current) ? current : getPreferredFocusedCalendarDate(monthDates, calendarAnchor)))
  }, [calendarAnchor, calendarMode, monthDates])

  const activateDrag = (task: Task, sourceDateKey: string, session: PointerDragSession & { sourceDateKey: string }) => {
    dragPayloadRef.current = { taskId: task.id, sourceDateKey }
    pointerDragRef.current = session
    if (session.sourceElement.setPointerCapture) {
      session.sourceElement.setPointerCapture(session.pointerId)
    }
    setFocusedDateKey(sourceDateKey)
  }

  const startTaskDrag = (task: Task, sourceDateKey: string) => (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return

    const session = {
      pointerId: event.pointerId,
      taskId: task.id,
      sourceDateKey,
      startX: event.clientX,
      startY: event.clientY,
      dragged: false,
      sourceElement: event.currentTarget,
      sourceRect: event.currentTarget.getBoundingClientRect(),
      preview: buildTaskDragPreview(task, `${formatDayLabel(sourceDateKey)} · ${formatDateTime(getCalendarTaskAnchor(task))}`),
    }

    // Touch devices: require long-press (~450ms) before activating drag to prevent
    // accidental drags while scrolling or tapping
    if (event.pointerType === 'touch') {
      longPressPendingRef.current = session
      setLongPressTaskId(task.id)
      longPressTimerRef.current = setTimeout(() => {
        longPressPendingRef.current = null
        longPressTimerRef.current = null
        setLongPressTaskId(null)
        activateDrag(task, sourceDateKey, session)
        // vibrate as haptic feedback if supported
        if (navigator.vibrate) navigator.vibrate(40)
      }, 450)
      return
    }

    // Mouse: activate drag immediately (original behavior)
    activateDrag(task, sourceDateKey, session)
  }

  const handleTaskClick = (taskId: string, sourceDateKey: string) => (event: React.MouseEvent<HTMLElement>) => {
    if (suppressClickRef.current) {
      event.preventDefault()
      event.stopPropagation()
      return
    }

    event.stopPropagation()
    setFocusedDateKey(sourceDateKey)
    onSelectTask(taskId)
  }

  if (calendarMode === 'month') {
    const weekdays = ['一', '二', '三', '四', '五', '六', '日']
    const currentMonth = calendarAnchor.slice(0, 7)
    return (
      <div className="view-stack">
        <div className="calendar-weekday-header">
          {weekdays.map((d) => <span key={d}>{d}</span>)}
        </div>
        <div className="calendar-grid month">
          {monthDates.map((dateKey) => {
            const dayTasks = tasks.filter((task) => getCalendarTaskDateKey(task) === dateKey)
            const lunar = getLunarDate(dateKey)
            const isCurrentMonth = dateKey.slice(0, 7) === currentMonth
            const isFocusedDay = focusedDateKey === dateKey
            const isMutedDay = !isFocusedDay && !isToday(dateKey)
            const dayNum = dateKey.slice(8)
            return (
              <article
                key={dateKey}
                data-calendar-drop-zone={dateKey}
                className={`calendar-cell ${isToday(dateKey) ? 'is-today' : ''} ${isFocusedDay ? 'is-focused' : ''} ${isMutedDay ? 'is-muted' : ''} ${!isCurrentMonth ? 'is-other-month' : ''} ${dragOverDateKey === dateKey ? 'is-drop-target' : ''}`}
                onClick={() => setFocusedDateKey(dateKey)}
              >
                <header>
                  <span className="cal-day">{dayNum.replace(/^0/, '')}</span>
                  <span className="cal-lunar">{lunar.display}</span>
                </header>
                <div className="calendar-stack">
                  {dayTasks.slice(0, 3).map((task) => (
                    <button
                      key={task.id}
                      className={`calendar-chip priority-accent-${task.priority} ${selectedTaskId === task.id ? 'is-selected' : ''} ${task.completed ? 'is-completed' : ''} ${dragTaskId === task.id ? 'is-dragging' : ''} ${longPressTaskId === task.id ? 'is-long-press' : ''}`}
                      style={getPointerDragStyle(task.id, dragTaskId, dragPreview)}
                      onPointerDown={task.completed ? undefined : startTaskDrag(task, dateKey)}
                      onClick={handleTaskClick(task.id, dateKey)}
                    >
                      <span className="calendar-chip__title">{task.title}</span>
                      <TaskDeadlineDot task={task} />
                    </button>
                  ))}
                  {dayTasks.length > 3 && <span className="cal-more">+{dayTasks.length - 3} 项</span>}
                  <button
                    className="calendar-create-chip"
                    aria-label={`在${formatDayLabel(dateKey)}创建任务`}
                    title={`在${formatDayLabel(dateKey)}创建任务`}
                    onClick={(event) => {
                      event.stopPropagation()
                      setFocusedDateKey(dateKey)
                      onOpenInlineCreate({
                        view: 'calendar',
                        anchorRect: (event.currentTarget as HTMLElement).getBoundingClientRect(),
                        dateKey,
                        guidance: formatDayLabel(dateKey),
                      })
                    }}
                  >
                    +
                  </button>
                </div>
              </article>
            )
          })}
        </div>
        <DragPreviewLayer preview={dragPreview} />
      </div>
    )
  }

  if (calendarMode === 'week') {
    return (
      <div className="view-stack">
        <div className="calendar-grid week">
          {weekDates.map((dateKey) => {
            const dayTasks = tasks.filter((task) => getCalendarTaskDateKey(task) === dateKey)
            const lunar = getLunarDate(dateKey)
            return (
              <article
                key={dateKey}
                data-calendar-drop-zone={dateKey}
                className={`calendar-column ${isToday(dateKey) ? 'is-today' : ''} ${dragOverDateKey === dateKey ? 'is-drop-target' : ''}`}
              >
                <header>
                  <div>
                    <p>{formatDayLabel(dateKey)}</p>
                    <span className="cal-lunar">{lunar.display}</span>
                  </div>
                  <strong>{dayTasks.length || ''}</strong>
                </header>
                <div className={`calendar-day-body ${dragOverDateKey === dateKey ? 'is-drop-target' : ''}`}>
                  {dayTasks.map((task) => (
                    <button
                      key={task.id}
                      className={`day-task ${task.completed ? 'is-completed' : ''} ${dragTaskId === task.id ? 'is-dragging' : ''} ${longPressTaskId === task.id ? 'is-long-press' : ''}`}
                      style={getPointerDragStyle(task.id, dragTaskId, dragPreview)}
                      onPointerDown={task.completed ? undefined : startTaskDrag(task, dateKey)}
                      onClick={handleTaskClick(task.id, dateKey)}
                    >
                      <span className={`priority-line priority-${task.priority}`} />
                      <div className="day-task__body">
                        <strong>{task.title}</strong>
                        <small>{formatDateTime(getCalendarTaskAnchor(task))}</small>
                        <TaskDeadlineIndicators task={task} compact />
                      </div>
                    </button>
                  ))}
                  <button
                    className="calendar-create-chip calendar-create-chip--week"
                    aria-label={`在${formatDayLabel(dateKey)}创建任务`}
                    title={`在${formatDayLabel(dateKey)}创建任务`}
                    onClick={(event) => {
                      event.stopPropagation()
                      onOpenInlineCreate({
                        view: 'calendar',
                        anchorRect: (event.currentTarget as HTMLElement).getBoundingClientRect(),
                        dateKey,
                        guidance: formatDayLabel(dateKey),
                      })
                    }}
                  >
                    +
                  </button>
                </div>
              </article>
            )
          })}
        </div>
        <DragPreviewLayer preview={dragPreview} />
      </div>
    )
  }

  const agendaTaskCount = weekDates.reduce((sum, dateKey) => sum + (agendaTaskMap[dateKey]?.length ?? 0), 0)
  return (
    <div className="view-stack">
      <div className="calendar-create-strip" data-onboarding-anchor="calendar-create">
        {weekDates.map((dateKey) => (
          <button
            key={dateKey}
            className={`calendar-strip-button ${isToday(dateKey) ? 'is-today' : ''}`}
            aria-label={`在${formatDayLabel(dateKey)}创建任务`}
            title={`在${formatDayLabel(dateKey)}创建任务`}
            onClick={(event) =>
              onOpenInlineCreate({
                view: 'calendar',
                anchorRect: (event.currentTarget as HTMLElement).getBoundingClientRect(),
                dateKey,
                guidance: formatDayLabel(dateKey),
              })
            }
          >
            <span>{formatDayLabel(dateKey)}</span>
            <strong>+</strong>
          </button>
        ))}
      </div>
      {agendaTaskCount === 0 ? (
        <EmptyState title="这周还没有日程安排。" description={showCompletedTasks ? '点上方日期即可补一条任务，已完成任务也会在这里一起展示。' : '点上方日期即可补一条任务。'} />
      ) : (
        <div className="agenda-view">
          {weekDates.map((dateKey) => {
            const dayTasks = agendaTaskMap[dateKey] ?? []
            return (
              <section key={dateKey} className="agenda-group">
                <header>
                  <h3>{formatDayLabel(dateKey)}</h3>
                  <div className="agenda-group-actions">
                    <span>{dayTasks.length} 项</span>
                    <button
                      className="create-icon-button"
                      aria-label={`在${formatDayLabel(dateKey)}创建任务`}
                      title={`在${formatDayLabel(dateKey)}创建任务`}
                      onClick={(event) => {
                        event.stopPropagation()
                        onOpenInlineCreate({
                          view: 'calendar',
                          anchorRect: (event.currentTarget as HTMLElement).getBoundingClientRect(),
                          dateKey,
                          guidance: formatDayLabel(dateKey),
                        })
                      }}
                    >
                      +
                    </button>
                  </div>
                </header>
                <div data-calendar-drop-zone={dateKey} className={`agenda-items ${dragOverDateKey === dateKey ? 'is-drop-target' : ''}`}>
                  {dayTasks.length === 0 ? (
                    <button
                      className="agenda-create-card"
                      aria-label={`在${formatDayLabel(dateKey)}创建任务`}
                      title={`在${formatDayLabel(dateKey)}创建任务`}
                      onClick={(event) =>
                        onOpenInlineCreate({
                          view: 'calendar',
                          anchorRect: (event.currentTarget as HTMLElement).getBoundingClientRect(),
                          dateKey,
                          guidance: formatDayLabel(dateKey),
                        })
                      }
                    >
                      +
                    </button>
                  ) : (
                    dayTasks.map((task) => {
                      const list = lists.find((item) => item.id === task.listId)
                      const taskTags = task.tagIds.map((tagId) => tags.find((item) => item.id === tagId)).filter(Boolean) as Tag[]
                      return (
                        <button
                          key={task.id}
                          className={`agenda-item ${task.completed ? 'is-completed' : ''} ${dragTaskId === task.id ? 'is-dragging' : ''} ${longPressTaskId === task.id ? 'is-long-press' : ''}`}
                          style={getPointerDragStyle(task.id, dragTaskId, dragPreview)}
                          onPointerDown={task.completed ? undefined : startTaskDrag(task, dateKey)}
                          onClick={handleTaskClick(task.id, dateKey)}
                        >
                          <div className="agenda-item__body">
                            <strong>{task.title}</strong>
                            <small>{list?.name ?? '未知清单'} · {formatDateTime(getCalendarTaskAnchor(task))}</small>
                            <TaskDeadlineIndicators task={task} />
                          </div>
                          <div className="chip-wrap dense">
                            {taskTags.slice(0, 2).map((tag) => (
                              <span key={tag.id} className="mini-tag" style={getTagToneStyle(tag.color)}>
                                <i style={{ background: tag.color }} />#{tag.name}
                              </span>
                            ))}
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
              </section>
            )
          })}
        </div>
      )}
      <DragPreviewLayer preview={dragPreview} />
    </div>
  )
}
