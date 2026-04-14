import { useState, memo } from 'react'
import type { Task, TodoList, Tag, TaskStatus, Priority } from '../../types/domain'
import type { InlineCreateRequest } from '../../types/workspace'
import {
  useDroppable,
  useDraggable,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { statusMeta } from '@taskflow/core'
import { formatTaskDualTimeSummary } from '@taskflow/core'
import { getTagToneStyle } from '../../utils/workspace-helpers'
import { StatusSelectBadge, PrioritySelectBadge, TaskTimeSummary, statusOptions } from '../shared'
import styles from './KanbanView.module.css'

// ---- Droppable Column ----

const KanbanDroppableColumn = memo(function KanbanDroppableColumn({
  status,
  children,
  onOpenInlineCreate,
  isEmpty,
  count,
  wipLimit,
  onChangeWipLimit,
}: {
  status: TaskStatus
  children: React.ReactNode
  onOpenInlineCreate: (request: InlineCreateRequest) => void
  isEmpty: boolean
  count: number
  wipLimit: number
  onChangeWipLimit: (limit: number) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const isOverWip = wipLimit > 0 && count > wipLimit
  const [editingWip, setEditingWip] = useState(false)

  return (
    <section className={styles.kanbanColumn}>
      <header className={isOverWip ? styles.kanbanColumnOverWip : undefined}>
        <h3>{statusMeta[status]}</h3>
        <div className={styles.kanbanColumnHeaderRight}>
          {editingWip ? (
            <input
              className={styles.kanbanWipInput}
              type="number"
              min={0}
              defaultValue={wipLimit}
              autoFocus
              onBlur={(e) => {
                const v = parseInt(e.target.value, 10)
                onChangeWipLimit(Number.isFinite(v) && v >= 0 ? v : 0)
                setEditingWip(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') setEditingWip(false)
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              className={`${styles.kanbanCountBadge} ${isOverWip ? styles.kanbanCountBadgeWarn : ''}`}
              title={wipLimit > 0 ? `${count}/${wipLimit} WIP · 点击修改限制` : `${count} 个任务 · 点击设置 WIP 限制`}
              onClick={() => setEditingWip(true)}
            >
              {count}{wipLimit > 0 ? `/${wipLimit}` : ''}
            </span>
          )}
          <div className={styles.kanbanColumnActions}>
            <button
              className="create-icon-button"
              aria-label={`在看板${statusMeta[status]}列创建任务`}
              title={`在看板${statusMeta[status]}列创建任务`}
              onClick={(event) => {
                event.stopPropagation()
                onOpenInlineCreate({
                  view: 'kanban',
                  anchorRect: (event.currentTarget as HTMLElement).getBoundingClientRect(),
                  status,
                  guidance: `${statusMeta[status]} · 看板`,
                })
              }}
            >
              +
            </button>
          </div>
        </div>
      </header>
      <div
        ref={setNodeRef}
        data-onboarding-anchor={status === 'todo' ? 'kanban-column' : undefined}
        className={`${styles.kanbanStack} ${isOver ? 'is-drag-over' : ''}`}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            onOpenInlineCreate({
              view: 'kanban',
              anchorRect: (event.currentTarget as HTMLElement).getBoundingClientRect(),
              status,
              guidance: `${statusMeta[status]} · 看板`,
            })
          }
        }}
      >
        {isEmpty && (
          <div className={styles.kanbanColEmpty}>拖拽任务至此列</div>
        )}
        {children}
        <button
          className={styles.kanbanCreateCard}
          aria-label={`在看板${statusMeta[status]}列创建任务`}
          title={`在看板${statusMeta[status]}列创建任务`}
          onClick={(event) => {
            event.stopPropagation()
            onOpenInlineCreate({
              view: 'kanban',
              anchorRect: (event.currentTarget as HTMLElement).getBoundingClientRect(),
              status,
              guidance: `${statusMeta[status]} · 看板`,
            })
          }}
        >
          +
        </button>
      </div>
    </section>
  )
})

// ---- Draggable Card ----

/** Custom comparator: only re-render when displayed data changes.
 *  Skips lists/tags array identity (passed via stable parent state). */
function kanbanCardPropsEqual(
  prev: Readonly<{
    task: Task
    lists: TodoList[]
    tags: Tag[]
    selectedTaskId: string | null
    onSelectTask: (taskId: string) => void
    onChangeStatus: (taskId: string, status: TaskStatus) => void
    onChangePriority: (taskId: string, priority: Priority) => void
  }>,
  next: Readonly<{
    task: Task
    lists: TodoList[]
    tags: Tag[]
    selectedTaskId: string | null
    onSelectTask: (taskId: string) => void
    onChangeStatus: (taskId: string, status: TaskStatus) => void
    onChangePriority: (taskId: string, priority: Priority) => void
  }>,
): boolean {
  if (prev.task.id !== next.task.id) return false
  if (prev.task.updatedAt !== next.task.updatedAt) return false
  if (prev.task.title !== next.task.title) return false
  if (prev.task.status !== next.task.status) return false
  if (prev.task.priority !== next.task.priority) return false
  if (prev.task.completed !== next.task.completed) return false
  if (prev.task.note !== next.task.note) return false
  if (prev.task.subtasks.length !== next.task.subtasks.length) return false
  if (prev.task.tagIds.length !== next.task.tagIds.length) return false
  if (prev.task.listId !== next.task.listId) return false
  if ((prev.selectedTaskId === prev.task.id) !== (next.selectedTaskId === next.task.id)) return false
  return true
}

const KanbanDraggableCard = memo(function KanbanDraggableCard({
  task,
  lists,
  tags,
  selectedTaskId,
  onSelectTask,
  onChangeStatus,
  onChangePriority,
}: {
  task: Task
  lists: TodoList[]
  tags: Tag[]
  selectedTaskId: string | null
  onSelectTask: (taskId: string) => void
  onChangeStatus: (taskId: string, status: TaskStatus) => void
  onChangePriority: (taskId: string, priority: Priority) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({ id: task.id })
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined

  const list = lists.find((item) => item.id === task.listId)
  const taskTags = task.tagIds.map((tagId) => tags.find((item) => item.id === tagId)).filter(Boolean) as Tag[]
  const completedSubtasks = task.subtasks.filter((item) => item.completed).length

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`${styles.kanbanCard} status-${task.status} ${selectedTaskId === task.id ? 'is-selected' : ''} ${isDragging ? 'is-dragging' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`打开任务 ${task.title}`}
      {...listeners}
      {...attributes}
      onClick={() => onSelectTask(task.id)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onSelectTask(task.id)
      }}
    >
      <div className={styles.kanbanHeader}>
        <div
          className={styles.kanbanBadgeGroup}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <StatusSelectBadge status={task.status} compact onChange={(status) => onChangeStatus(task.id, status)} />
          <PrioritySelectBadge priority={task.priority} compact onChange={(priority) => onChangePriority(task.id, priority)} />
        </div>
        <TaskTimeSummary task={task} compact />
      </div>
      <div className={styles.kanbanTitleRow}>
        <h4 className={styles.kanbanTitle}>{task.title}</h4>
        {task.repeatRule && task.repeatRule !== '不重复' && <span title={task.repeatRule} style={{ fontSize: 12, opacity: 0.7 }}>🔄</span>}
      </div>
      {task.note && <p className={styles.kanbanNote}>{task.note}</p>}
      <div className={`chip-wrap dense ${styles.kanbanTags}`}>
        {taskTags.slice(0, 2).map((tag) => (
          <span key={tag.id} className="mini-tag" style={getTagToneStyle(tag.color)}>
            <i style={{ background: tag.color }} />#{tag.name}
          </span>
        ))}
        {taskTags.length > 2 && (
          <span className={styles.kanbanTagsMore}>+{taskTags.length - 2}</span>
        )}
      </div>
      <footer>
        <span>{list?.name ?? '未知清单'}</span>
        <div className={styles.kanbanFooterActions}>
          {task.subtasks.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>{completedSubtasks}/{task.subtasks.length} 子任务</span>
              <div className={styles.kanbanSubtaskBar} style={{ width: 40 }}>
                <div
                  className={styles.kanbanSubtaskBarFill}
                  style={{ width: `${Math.round((completedSubtasks / task.subtasks.length) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </footer>
    </article>
  )
}, kanbanCardPropsEqual)

// ---- Drag Overlay Card (preview while dragging) — exported for WorkspaceShell ----

export function KanbanOverlayCard({ task }: { task: Task }) {
  return (
    <article className="drag-preview-card">
      <div className="drag-preview-card__meta-row">
        <strong style={{ fontSize: 13 }}>{task.title}</strong>
      </div>
      <small>{formatTaskDualTimeSummary(task, { emptyLabel: '未排期' })}</small>
    </article>
  )
}

// ---- KanbanView — requires DndContext ancestor (provided by WorkspaceShell) ----

// Default WIP limits: 0 = unlimited
const DEFAULT_WIP_LIMITS: Record<TaskStatus, number> = { todo: 0, doing: 5, done: 0 }

export function KanbanView({
  tasks,
  lists,
  tags,
  selectedTaskId,
  onSelectTask,
  onChangeStatus,
  onChangePriority,
  onOpenInlineCreate,
}: {
  tasks: Task[]
  lists: TodoList[]
  tags: Tag[]
  selectedTaskId: string | null
  onSelectTask: (taskId: string) => void
  onChangeStatus: (taskId: string, status: TaskStatus) => void
  onChangePriority: (taskId: string, priority: Priority) => void
  onDropStatusChange: (taskId: string, status: TaskStatus) => void
  onOpenInlineCreate: (request: InlineCreateRequest) => void
}) {
  const [wipLimits, setWipLimits] = useState<Record<TaskStatus, number>>(DEFAULT_WIP_LIMITS)

  const columns: Record<TaskStatus, Task[]> = { todo: [], doing: [], done: [] }
  tasks.forEach((task) => columns[task.status].push(task))

  const handleChangeWipLimit = (status: TaskStatus, limit: number) => {
    setWipLimits((prev) => ({ ...prev, [status]: limit }))
  }

  return (
    <div className={styles.kanbanGrid}>
      {(['todo', 'doing', 'done'] as TaskStatus[]).map((status) => (
        <KanbanDroppableColumn
          key={status}
          status={status}
          onOpenInlineCreate={onOpenInlineCreate}
          isEmpty={columns[status].length === 0}
          count={columns[status].length}
          wipLimit={wipLimits[status]}
          onChangeWipLimit={(limit) => handleChangeWipLimit(status, limit)}
        >
          {columns[status].map((task) => (
            <KanbanDraggableCard
              key={task.id}
              task={task}
              lists={lists}
              tags={tags}
              selectedTaskId={selectedTaskId}
              onSelectTask={onSelectTask}
              onChangeStatus={onChangeStatus}
              onChangePriority={onChangePriority}
            />
          ))}
        </KanbanDroppableColumn>
      ))}
    </div>
  )
}

// Re-export statusOptions for use in WorkspaceShell drag handler
export { statusOptions }
