import { useState, useRef, useMemo } from 'react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ReactNode } from 'react'
import type { Task, TodoList, Tag } from '../types/domain'
import { priorityMeta } from '@taskflow/core'
import { formatDateTime, getDateKey, addDays, shiftDateTimeByDays } from '../utils/dates'
import { useVirtualizer } from '@tanstack/react-virtual'

// ── VirtualFocusList — 虚拟化任务列表（@tanstack/react-virtual）─────────────
type VirtualFocusItem =
  | { type: 'section-header'; icon: string; title: string; count: number; tone: string; key: string; collapsible?: boolean; collapsed?: boolean }
  | { type: 'task'; task: Task; key: string }

function VirtualFocusList({
  segments,
  upcomingCollapsed,
  onToggleUpcoming,
  lists,
  completingIds,
  onSelectTask,
  onToggle,
  onSnooze,
  onDelete,
}: {
  segments: { overdue: Task[]; todayPlanned: Task[]; todayDeadline: Task[]; inbox: Task[]; upcoming: Task[] }
  upcomingCollapsed: boolean
  onToggleUpcoming: () => void
  lists: TodoList[]
  completingIds: Set<string>
  onSelectTask: (id: string) => void
  onToggle: (id: string) => void
  onSnooze: (task: Task) => void
  onDelete: (task: Task) => void
}) {
  const parentRef = useRef<HTMLDivElement>(null)

  // Build flat item list (section headers interleaved with task items)
  const items = useMemo<VirtualFocusItem[]>(() => {
    const list: VirtualFocusItem[] = []
    if (segments.overdue.length > 0) {
      list.push({ type: 'section-header', key: 'hdr-overdue', icon: '🔴', title: '逾期', count: segments.overdue.length, tone: 'danger' })
      segments.overdue.forEach(t => list.push({ type: 'task', task: t, key: t.id }))
    }
    if (segments.todayPlanned.length > 0) {
      list.push({ type: 'section-header', key: 'hdr-today-planned', icon: '📌', title: '今天计划', count: segments.todayPlanned.length, tone: 'primary' })
      segments.todayPlanned.forEach(t => list.push({ type: 'task', task: t, key: t.id }))
    }
    if (segments.todayDeadline.length > 0) {
      list.push({ type: 'section-header', key: 'hdr-today-deadline', icon: '⚡', title: '今天到期', count: segments.todayDeadline.length, tone: 'warning' })
      segments.todayDeadline.forEach(t => list.push({ type: 'task', task: t, key: t.id }))
    }
    if (segments.inbox.length > 0) {
      list.push({ type: 'section-header', key: 'hdr-inbox', icon: '📥', title: '待处理', count: segments.inbox.length, tone: 'muted' })
      segments.inbox.forEach(t => list.push({ type: 'task', task: t, key: t.id }))
    }
    if (segments.upcoming.length > 0) {
      list.push({ type: 'section-header', key: 'hdr-upcoming', icon: '📅', title: '明后天', count: segments.upcoming.length, tone: 'muted', collapsible: true, collapsed: upcomingCollapsed })
      if (!upcomingCollapsed) {
        segments.upcoming.forEach(t => list.push({ type: 'task', task: t, key: t.id }))
      }
    }
    return list
  }, [segments, upcomingCollapsed])

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => items[index].type === 'section-header' ? 44 : 76,
    overscan: 5,
    getItemKey: (index) => items[index].key,
  })

  return (
    <div ref={parentRef} className="mobile-focus-virtual-scroll">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((vItem) => {
          const item = items[vItem.index]
          return (
            <div
              key={vItem.key}
              data-index={vItem.index}
              ref={virtualizer.measureElement}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${vItem.start}px)` }}
            >
              {item.type === 'section-header' ? (
                <header
                  className={`mobile-focus-section__header mobile-focus-section__header--${item.tone}`}
                  onClick={item.collapsible ? onToggleUpcoming : undefined}
                  role={item.collapsible ? 'button' : undefined}
                >
                  <span className="mobile-focus-section__icon">{item.icon}</span>
                  <span className="mobile-focus-section__title">{item.title}</span>
                  <span className="mobile-focus-section__count">{item.count}</span>
                  {item.collapsible && <span className="mobile-focus-section__chevron">{item.collapsed ? '▸' : '▾'}</span>}
                </header>
              ) : (
                <MobileFocusCard
                  task={item.task}
                  lists={lists}
                  onSelect={() => onSelectTask(item.task.id)}
                  onToggle={() => onToggle(item.task.id)}
                  onSnooze={() => onSnooze(item.task)}
                  onDelete={() => onDelete(item.task)}
                  isCompleting={completingIds.has(item.task.id)}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── SortableTaskRow — single draggable row used inside ReorderList ────────────
function SortableTaskRow({ task, lists, onSelect }: { task: Task; lists: TodoList[]; onSelect: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: task.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <div ref={setNodeRef} style={style} className="mobile-reorder-row" {...attributes}>
      <span className="mobile-reorder-handle" {...listeners}>⠿</span>
      <span className="mobile-reorder-title" onClick={onSelect}>{task.title}</span>
    </div>
  )
}

// ── ReorderList — dnd-kit powered sortable list ───────────────────────────────
function ReorderList({
  tasks,
  lists,
  onSelectTask,
  onUpdateTask,
}: {
  tasks: Task[]
  lists: TodoList[]
  onSelectTask: (id: string) => void
  onUpdateTask: (id: string, patch: Partial<Task>) => void
}) {
  const [items, setItems] = useState(tasks)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex(t => t.id === active.id)
    const newIndex = items.findIndex(t => t.id === over.id)
    const reordered = arrayMove(items, oldIndex, newIndex)
    setItems(reordered)
    reordered.forEach((t, index) => {
      onUpdateTask(t.id, { sortOrder: index })
    })
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map(t => t.id)} strategy={verticalListSortingStrategy}>
        <div className="mobile-focus-virtual-scroll">
          {items.map(task => (
            <SortableTaskRow
              key={task.id}
              task={task}
              lists={lists}
              onSelect={() => onSelectTask(task.id)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

export function MobileFocusView({
  segments,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sortMode: _sortMode,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onToggleSortMode: _onToggleSortMode,
  upcomingCollapsed,
  onToggleUpcoming,
  lists,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  tags: _tags,
  onSelectTask,
  onToggleComplete,
  onUpdateTask,
  focusScope,
  focusScopeListId,
  completedTodayCount,
}: {
  segments: { overdue: Task[]; todayPlanned: Task[]; todayDeadline: Task[]; inbox: Task[]; upcoming: Task[] }
  sortMode: 'planned' | 'deadline'
  onToggleSortMode: () => void
  upcomingCollapsed: boolean
  onToggleUpcoming: () => void
  lists: TodoList[]
  tags: Tag[]
  onSelectTask: (id: string) => void
  onToggleComplete: (id: string) => void
  onUpdateTask: (id: string, patch: Partial<Task>) => void
  focusScope: 'all' | 'today' | 'week' | 'list'
  focusScopeListId: string | null
  completedTodayCount: number
}) {
  // Use scope from props (lifted to topbar)
  const filterByList = (tasks: Task[]) => {
    if (focusScope !== 'list' || !focusScopeListId) return tasks
    return tasks.filter(t => t.listId === focusScopeListId)
  }
  const visibleSegments = useMemo(() => {
    if (focusScope === 'all') return segments
    if (focusScope === 'today') return {
      overdue: filterByList(segments.overdue),
      todayPlanned: filterByList(segments.todayPlanned),
      todayDeadline: filterByList(segments.todayDeadline),
      inbox: [] as Task[],
      upcoming: [] as Task[],
    }
    if (focusScope === 'week') return {
      overdue: filterByList(segments.overdue),
      todayPlanned: filterByList(segments.todayPlanned),
      todayDeadline: filterByList(segments.todayDeadline),
      inbox: [] as Task[],
      upcoming: filterByList(segments.upcoming),
    }
    // list scope
    return {
      overdue: filterByList(segments.overdue),
      todayPlanned: filterByList(segments.todayPlanned),
      todayDeadline: filterByList(segments.todayDeadline),
      inbox: filterByList(segments.inbox),
      upcoming: filterByList(segments.upcoming),
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusScope, focusScopeListId, segments])

  const totalCount = visibleSegments.overdue.length + visibleSegments.todayPlanned.length + visibleSegments.todayDeadline.length + visibleSegments.inbox.length + visibleSegments.upcoming.length

  // M-P1-2 — reorder mode toggle
  const [reorderMode, setReorderMode] = useState(false)

  // Flat ordered task list for ReorderList
  const allTasksFlat = useMemo(() => [
    ...visibleSegments.overdue,
    ...visibleSegments.todayPlanned,
    ...visibleSegments.todayDeadline,
    ...visibleSegments.inbox,
    ...visibleSegments.upcoming,
  ], [visibleSegments])

  // #23 — completion animation tracking
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set())

  const handleToggle = (taskId: string) => {
    setCompletingIds(prev => new Set(prev).add(taskId))
    setTimeout(() => {
      onToggleComplete(taskId)
      setCompletingIds(prev => { const next = new Set(prev); next.delete(taskId); return next })
    }, 200)
  }

  const handleSnooze = (task: Task) => {
    const todayKey = getDateKey()
    const newDueAt = task.dueAt
      ? shiftDateTimeByDays(task.dueAt, 1)
      : `${addDays(todayKey, 1)}T09:00:00`
    onUpdateTask(task.id, { dueAt: newDueAt })
  }

  const handleDelete = (task: Task) => {
    onUpdateTask(task.id, { deleted: true })
  }

  return (
    <div className="mobile-focus-view">
      {/* #4 — scope header removed from here, now in topbar */}

      {/* #24 — 空状态情感化文案：区分「没有任务」和「全部完成」 */}
      {totalCount === 0 && (
        <div className="mobile-focus-empty-emotional">
          {completedTodayCount > 0 ? (
            <>
              <div className="emoji">🎉</div>
              <h3>今天的任务全完成了！</h3>
              <p>好好休息一下</p>
            </>
          ) : (
            <>
              <div className="emoji">☀️</div>
              <h3>今天暂时没有安排</h3>
              <p>点击右下角 + 添加任务</p>
            </>
          )}
        </div>
      )}

      {totalCount > 0 && (
        <>
          {/* 排序提示条（仅排序模式显示） */}
          {reorderMode && (
            <div className="mobile-focus-reorder-bar">
              <span>拖动调整顺序</span>
              <button className="mobile-focus-reorder-bar__done" onClick={() => setReorderMode(false)}>完成</button>
            </div>
          )}
          {reorderMode ? (
            <ReorderList
              tasks={allTasksFlat}
              lists={lists}
              onSelectTask={onSelectTask}
              onUpdateTask={onUpdateTask}
            />
          ) : (
            <VirtualFocusList
              segments={visibleSegments}
              upcomingCollapsed={upcomingCollapsed}
              onToggleUpcoming={onToggleUpcoming}
              lists={lists}
              completingIds={completingIds}
              onSelectTask={onSelectTask}
              onToggle={handleToggle}
              onSnooze={handleSnooze}
              onDelete={handleDelete}
            />
          )}
          {/* 排序浮动按钮（右上角小图标，不占列表空间） */}
          {!reorderMode && (
            <button className="mobile-focus-reorder-fab" onClick={() => setReorderMode(true)} aria-label="排序">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <rect x="2" y="3.5" width="12" height="1.5" rx=".75"/>
                <rect x="2" y="7.25" width="12" height="1.5" rx=".75"/>
                <rect x="2" y="11" width="12" height="1.5" rx=".75"/>
              </svg>
            </button>
          )}
        </>
      )}
    </div>
  )
}

export function MobileFocusSection({
  icon,
  title,
  count,
  tone,
  children,
  collapsed,
  onToggle,
}: {
  icon: string
  title: string
  count: number
  tone: 'danger' | 'primary' | 'warning' | 'muted'
  children: ReactNode
  collapsed?: boolean
  onToggle?: () => void
}) {
  return (
    <section className={`mobile-focus-section mobile-focus-section--${tone}`}>
      <header className="mobile-focus-section__header" onClick={onToggle} role={onToggle ? 'button' : undefined}>
        <span className="mobile-focus-section__icon">{icon}</span>
        <span className="mobile-focus-section__title">{title}</span>
        <span className="mobile-focus-section__count">{count}</span>
        {onToggle && <span className="mobile-focus-section__chevron">{collapsed ? '▸' : '▾'}</span>}
      </header>
      <div className="mobile-focus-section__list">
        {children}
      </div>
    </section>
  )
}

function MobileFocusCard({
  task,
  lists,
  onSelect,
  onToggle,
  onSnooze,
  onDelete,
  isCompleting,
}: {
  task: Task
  lists: TodoList[]
  onSelect: () => void
  onToggle: () => void
  onSnooze?: () => void
  onDelete?: () => void
  isCompleting?: boolean
}) {
  const dueTime = task.dueAt ? formatDateTime(task.dueAt) : null
  const dlTime = task.deadlineAt ? formatDateTime(task.deadlineAt) : null
  const todayKey = getDateKey()
  const dlDate = (task.deadlineAt ?? '')?.slice(0, 10) ?? ''
  const isDlUrgent = dlDate && dlDate <= addDays(todayKey, 1)
  const isOverdueTask = (task.dueAt?.slice(0, 10) ?? '') < todayKey || (dlDate && dlDate < todayKey)

  // 找到所属清单（用于显示清单名称+颜色小点）
  const taskList = task.listId ? lists.find(l => l.id === task.listId) : null

  // ── 滑动手势 ──────────────────────────────────────────────────
  const [swipeX, setSwipeX] = useState(0)
  const [swiping, setSwiping] = useState(false)
  const [revealed, setRevealed] = useState<'left' | 'right' | null>(null)
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  const SWIPE_THRESHOLD = 60   // px to reveal actions
  const COMPLETE_THRESHOLD = 100 // px for direct complete
  const AXIS_LOCK = 10           // px vertical movement before cancelling

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    }
    setSwiping(false)
    setSwipeX(0)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    const start = touchStartRef.current
    if (!start) return
    const dx = e.touches[0].clientX - start.x
    const dy = e.touches[0].clientY - start.y

    // Cancel if mostly vertical
    if (!swiping && Math.abs(dy) > AXIS_LOCK && Math.abs(dy) > Math.abs(dx)) {
      touchStartRef.current = null
      return
    }

    if (Math.abs(dx) > 8) {
      setSwiping(true)
      e.stopPropagation()
      setSwipeX(Math.max(-120, Math.min(120, dx)))
    }
  }

  const handleTouchEnd = () => {
    touchStartRef.current = null
    if (!swiping) return

    if (swipeX > COMPLETE_THRESHOLD) {
      // Right-swipe complete
      onToggle()
      setSwipeX(0)
      setSwiping(false)
    } else if (swipeX > SWIPE_THRESHOLD) {
      // Reveal complete confirm button
      setRevealed('right')
      setSwipeX(72)
      setSwiping(false)
    } else if (swipeX < -SWIPE_THRESHOLD) {
      // Left-swipe: reveal snooze/delete
      setRevealed('left')
      setSwipeX(-116)
      setSwiping(false)
    } else {
      // Snap back
      setSwipeX(0)
      setRevealed(null)
      setSwiping(false)
    }
  }

  const resetSwipe = () => {
    setSwipeX(0)
    setRevealed(null)
    setSwiping(false)
  }

  const cardStyle: React.CSSProperties = {
    transform: `translateX(${swipeX}px)`,
    transition: swiping ? 'none' : 'transform 0.25s cubic-bezier(0.32,0.72,0,1)',
    position: 'relative',
    zIndex: 1,
  }

  return (
    <div
      ref={cardRef}
      className="mobile-focus-card-wrapper"
      style={{ position: 'relative', overflow: 'hidden', borderRadius: 14, marginBottom: 6 }}
    >
      {/* 右滑背景：完成 — 仅在 swipeX > 0 时可见 */}
      {swipeX > 0 && (
        <div className="mobile-swipe-action mobile-swipe-action--complete" aria-hidden="true">
          <span>{swipeX >= COMPLETE_THRESHOLD ? '✓ 完成!' : '➜ 完成'}</span>
        </div>
      )}
      {/* 左滑背景：推迟 + 删除 — 仅在 swipeX < 0 时可见 */}
      {swipeX < 0 && (
        <div className="mobile-swipe-action mobile-swipe-action--actions" aria-hidden="true">
          <button
            className="mobile-swipe-btn mobile-swipe-btn--snooze"
            onClick={e => { e.stopPropagation(); onSnooze?.(); resetSwipe() }}
          >明天</button>
          <button
            className="mobile-swipe-btn mobile-swipe-btn--delete"
            onClick={e => { e.stopPropagation(); onDelete?.(); resetSwipe() }}
          >删除</button>
        </div>
      )}
      {/* 卡片主体 */}
      <div
        className={`mobile-focus-card ${isOverdueTask ? 'is-overdue' : ''} priority-${task.priority} ${isCompleting ? 'is-completing' : ''}`}
        style={{ ...cardStyle, marginBottom: 0, borderRadius: 14 }}
        onClick={() => { if (revealed) { resetSwipe(); return }; onSelect() }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <button
          className={`check-button ${task.completed ? 'is-checked' : ''}`}
          onClick={e => { e.stopPropagation(); onToggle() }}
          aria-label={task.completed ? '取消完成' : '标记完成'}
        >
          {task.completed ? '✓' : ''}
        </button>
        <div className="mobile-focus-card__content">
          <span className="mobile-focus-card__title">{task.title}</span>
          <span className="mobile-focus-card__meta">
            {dueTime && (
              <span className="mobile-focus-card__plan">
                <svg className="meta-icon" viewBox="0 0 16 16" fill="none" aria-label="计划时间">
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M8 5v3.5l2 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                {dueTime}
              </span>
            )}
            {dlTime && (
              <span className={`mobile-focus-card__ddl ${isDlUrgent ? 'is-urgent' : ''}`}>
                <svg className="meta-icon" viewBox="0 0 16 16" fill="none" aria-label="截止时间">
                  <rect x="2" y="3.5" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M5 2v3M11 2v3M2 7h12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  <path d="M10 10.5L8 9v-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {dlTime}
              </span>
            )}
            {!dueTime && !dlTime && (
              <span className="mobile-focus-card__no-date">
                <svg className="meta-icon" viewBox="0 0 16 16" fill="none" aria-label="无排期">
                  <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 2"/>
                </svg>
                无排期
              </span>
            )}
            {/* 所属清单小标签 */}
            {taskList && (
              <span className="mobile-focus-card__list-tag">
                <span
                  className="mobile-focus-card__list-dot"
                  style={{ background: taskList.color }}
                  aria-hidden="true"
                />
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
      </div>
    </div>
  )
}
