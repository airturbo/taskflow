import { useState, useRef, useEffect, useMemo } from 'react'
import type { Task, TodoList, Tag, Priority, CalendarMode } from '../types/domain'
import type { InlineCreateRequest } from '../types/workspace'
import { priorityMeta, getCalendarTaskDateKey } from '@taskflow/core'
import { formatDateTime, formatDayLabel, getDateKey, addMonths } from '../utils/dates'
import { CalendarView } from '../components/views/CalendarView'

const CALENDAR_MODES: CalendarMode[] = ['month', 'week', 'agenda']
const CALENDAR_MODE_LABELS: Record<CalendarMode, string> = { month: '月历', week: '周历', agenda: '日程' }

/** 月历单元格里的任务点 — 按优先级着色，最多展示 3 个 */
function MobileMonthDots({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) return null
  const PRIORITY_ORDER: Priority[] = ['urgent', 'high', 'normal', 'low']
  const PRIORITY_COLORS: Record<Priority, string> = {
    urgent: '#ff3b30',
    high: '#ff9500',
    normal: '#007aff',
    low: '#8e8e93',
  }
  // 按优先级排序，取最高优先级的最多 3 个不同颜色
  const sorted = [...tasks].sort(
    (a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority),
  )
  const colors: string[] = []
  for (const t of sorted) {
    const c = PRIORITY_COLORS[t.priority]
    if (!colors.includes(c)) colors.push(c)
    if (colors.length >= 3) break
  }
  return (
    <span className="mobile-month-dots" aria-hidden="true">
      {colors.map((c, i) => (
        <span key={i} className="mobile-month-dot" style={{ background: c }} />
      ))}
    </span>
  )
}

/** 选中日期下方的任务列表面板 */
function MobileDayPanel({
  dateKey,
  tasks,
  lists,
  selectedTaskId,
  onSelectTask,
  onToggleComplete,
  onAddTask,
}: {
  dateKey: string
  tasks: Task[]
  lists: TodoList[]
  selectedTaskId: string | null
  onSelectTask: (id: string) => void
  onToggleComplete: (id: string) => void
  onAddTask: (dateKey: string) => void
}) {
  const dayLabel = formatDayLabel(dateKey)
  const todayKey = getDateKey()
  const isTodayDay = dateKey === todayKey

  if (tasks.length === 0) {
    return (
      <div className="mobile-day-panel">
        <div className="mobile-day-panel__header">
          <span className="mobile-day-panel__title">
            {dayLabel}
            {isTodayDay && <span className="mobile-day-panel__today-badge">今天</span>}
          </span>
          <button className="mobile-day-panel__add-btn" onClick={() => onAddTask(dateKey)} aria-label="添加任务">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z"/></svg>
            添加任务
          </button>
        </div>
        <p className="mobile-day-panel__empty">这一天暂无任务，轻松一下！</p>
      </div>
    )
  }

  return (
    <div className="mobile-day-panel">
      <div className="mobile-day-panel__header">
        <span className="mobile-day-panel__title">
          {dayLabel}
          {isTodayDay && <span className="mobile-day-panel__today-badge">今天</span>}
          <span className="mobile-day-panel__count">{tasks.length} 项</span>
        </span>
        <button className="mobile-day-panel__add-btn" onClick={() => onAddTask(dateKey)} aria-label="添加任务">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z"/></svg>
        </button>
      </div>
      <ul className="mobile-day-panel__list">
        {tasks.map((task) => {
          const taskList = task.listId ? lists.find(l => l.id === task.listId) : null
          const dueTime = task.dueAt ? formatDateTime(task.dueAt) : null
          return (
            <li
              key={task.id}
              className={`mobile-day-panel__item priority-accent-${task.priority} ${task.completed ? 'is-completed' : ''} ${selectedTaskId === task.id ? 'is-selected' : ''}`}
              onClick={() => onSelectTask(task.id)}
            >
              <button
                className="check-button"
                aria-label={task.completed ? '标记未完成' : '标记完成'}
                onClick={(e) => { e.stopPropagation(); onToggleComplete(task.id) }}
              />
              <div className="mobile-day-panel__item-content">
                <span className="mobile-day-panel__item-title">{task.title}</span>
                <span className="mobile-day-panel__item-meta">
                  {dueTime && <span className="mobile-day-panel__item-time">{dueTime}</span>}
                  {taskList && (
                    <span className="mobile-day-panel__item-list">
                      <span className="mobile-month-dot" style={{ background: taskList.color }} />
                      {taskList.name}
                    </span>
                  )}
                </span>
              </div>
              {task.priority !== 'normal' && (
                <span className={`mobile-focus-card__priority-badge priority--${task.priority}`}>
                  {priorityMeta[task.priority]?.short ?? ''}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function MobileCalendarView(props: {
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
  onChangeMode: (mode: CalendarMode) => void
  onToggleComplete: (taskId: string) => void
  onChangeAnchor?: (anchor: string) => void
}) {
  const todayKey = getDateKey()
  const [focusedDateKey, setFocusedDateKey] = useState<string>(() => {
    // 默认选中今天（若在当前月），否则选第一天
    return props.monthDates.includes(todayKey) ? todayKey : (props.monthDates[0] ?? todayKey)
  })

  // 切换月份时，若今天在新月份则跳今天，否则跳第一天
  useEffect(() => {
    if (props.monthDates.includes(todayKey)) {
      setFocusedDateKey(todayKey)
    } else {
      const firstOfMonth = props.monthDates.find(d => d.slice(5, 7) === props.calendarAnchor.slice(5, 7))
      setFocusedDateKey(firstOfMonth ?? props.monthDates[0] ?? todayKey)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.calendarAnchor])

  // Pre-group tasks by date key — must be at top level (Rules of Hooks)
  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of props.tasks) {
      if (!props.showCompletedTasks && t.completed) continue
      const dk = getCalendarTaskDateKey(t)
      if (!dk) continue
      let arr = map.get(dk)
      if (!arr) { arr = []; map.set(dk, arr) }
      arr.push(t)
    }
    return map
  }, [props.tasks, props.showCompletedTasks])

  const swipeTouchRef = useRef<{ startX: number; startY: number } | null>(null)

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    swipeTouchRef.current = { startX: t.clientX, startY: t.clientY }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const ref = swipeTouchRef.current
    if (!ref) return
    swipeTouchRef.current = null
    const t = e.changedTouches[0]
    const dx = t.clientX - ref.startX
    const dy = t.clientY - ref.startY
    if (Math.abs(dy) > Math.abs(dx)) return  // vertical scroll — ignore
    if (Math.abs(dx) < 50) return             // too small
    const currentIdx = CALENDAR_MODES.indexOf(props.calendarMode)
    if (dx < 0 && currentIdx < CALENDAR_MODES.length - 1) {
      props.onChangeMode(CALENDAR_MODES[currentIdx + 1])
    } else if (dx > 0 && currentIdx > 0) {
      props.onChangeMode(CALENDAR_MODES[currentIdx - 1])
    }
  }

  // 移动端月历 — 自己实现，不用桌面版 CalendarView
  if (props.calendarMode === 'month') {
    const weekdays = ['一', '二', '三', '四', '五', '六', '日']
    const currentMonth = props.calendarAnchor.slice(0, 7)

    const focusedDayTasks = tasksByDate.get(focusedDateKey) ?? []

    return (
      <div
        className="mobile-calendar-gesture-wrapper"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* 模式切换 */}
        <div className="mobile-calendar-mode-dots" aria-hidden="true">
          {CALENDAR_MODES.map((m) => (
            <button
              key={m}
              className={`mobile-calendar-mode-dot ${m === props.calendarMode ? 'is-active' : ''}`}
              onClick={() => props.onChangeMode(m)}
              aria-label={`切换到${CALENDAR_MODE_LABELS[m]}`}
            >
              {CALENDAR_MODE_LABELS[m]}
            </button>
          ))}
        </div>

        {/* 月份导航头 */}
        {props.onChangeAnchor && (
          <div className="mobile-month-nav">
            <button
              className="mobile-month-nav__arrow"
              onClick={() => props.onChangeAnchor!(addMonths(props.calendarAnchor, -1))}
              aria-label="上个月"
            >‹</button>
            <button
              className="mobile-month-nav__title"
              onClick={() => {
                const input = document.createElement('input')
                input.type = 'month'
                input.value = props.calendarAnchor.slice(0, 7)
                input.style.cssText = 'position:fixed;opacity:0;top:0;left:0'
                document.body.appendChild(input)
                input.focus()
                input.click()
                input.addEventListener('change', () => {
                  if (input.value) props.onChangeAnchor!(input.value + '-01')
                  document.body.removeChild(input)
                }, { once: true })
                input.addEventListener('blur', () => {
                  setTimeout(() => {
                    if (document.body.contains(input)) document.body.removeChild(input)
                  }, 300)
                }, { once: true })
              }}
            >
              {props.calendarAnchor.slice(0, 4)}年{parseInt(props.calendarAnchor.slice(5, 7), 10)}月
            </button>
            <button
              className="mobile-month-nav__arrow"
              onClick={() => props.onChangeAnchor!(addMonths(props.calendarAnchor, 1))}
              aria-label="下个月"
            >›</button>
          </div>
        )}

        {/* 星期标题行 */}
        <div className="mobile-month-weekdays">
          {weekdays.map((d) => <span key={d}>{d}</span>)}
        </div>

        {/* 月历网格 */}
        <div className="mobile-month-grid">
          {props.monthDates.map((dateKey) => {
            const dayTasks = tasksByDate.get(dateKey) ?? []
            const isCurMonth = dateKey.slice(0, 7) === currentMonth
            const isFocused = focusedDateKey === dateKey
            const isTodayDay = dateKey === todayKey
            const dayNum = parseInt(dateKey.slice(8), 10)
            return (
              <button
                key={dateKey}
                className={[
                  'mobile-month-cell',
                  isTodayDay ? 'is-today' : '',
                  isFocused ? 'is-focused' : '',
                  !isCurMonth ? 'is-other-month' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => setFocusedDateKey(dateKey)}
                aria-label={`${dateKey}${dayTasks.length > 0 ? `，${dayTasks.length}个任务` : ''}`}
                aria-pressed={isFocused}
              >
                <span className="mobile-month-cell__num">{dayNum}</span>
                <MobileMonthDots tasks={dayTasks} />
              </button>
            )
          })}
        </div>

        {/* 选中日任务面板 */}
        <MobileDayPanel
          dateKey={focusedDateKey}
          tasks={focusedDayTasks}
          lists={props.lists}
          selectedTaskId={props.selectedTaskId}
          onSelectTask={props.onSelectTask}
          onToggleComplete={props.onToggleComplete}
          onAddTask={(dk) =>
            props.onOpenInlineCreate({
              view: 'calendar',
              anchorRect: { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 } as DOMRect,
              dateKey: dk,
              guidance: formatDayLabel(dk),
            })
          }
        />
      </div>
    )
  }

  // week / agenda 仍使用桌面版 CalendarView
  return (
    <div
      className="mobile-calendar-gesture-wrapper"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Mode indicator dots */}
      <div className="mobile-calendar-mode-dots" aria-hidden="true">
        {CALENDAR_MODES.map((m) => (
          <button
            key={m}
            className={`mobile-calendar-mode-dot ${m === props.calendarMode ? 'is-active' : ''}`}
            onClick={() => props.onChangeMode(m)}
            aria-label={`切换到${CALENDAR_MODE_LABELS[m]}`}
          >
            {CALENDAR_MODE_LABELS[m]}
          </button>
        ))}
      </div>
      <CalendarView
        tasks={props.tasks}
        lists={props.lists}
        tags={props.tags}
        calendarMode={props.calendarMode}
        calendarAnchor={props.calendarAnchor}
        monthDates={props.monthDates}
        weekDates={props.weekDates}
        showCompletedTasks={props.showCompletedTasks}
        selectedTaskId={props.selectedTaskId}
        onSelectTask={props.onSelectTask}
        onOpenInlineCreate={props.onOpenInlineCreate}
        onMoveTaskToDate={props.onMoveTaskToDate}
      />
    </div>
  )
}
