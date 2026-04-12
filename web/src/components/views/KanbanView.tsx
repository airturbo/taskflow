import { useState, useEffect, useRef } from 'react'
import type { Task, TodoList, Tag, TaskStatus, Priority } from '../../types/domain'
import type { PointerDragPreviewState, InlineCreateRequest, PointerDragSession } from '../../types/workspace'
import { statusMeta } from '@taskflow/core'
import { formatTaskDualTimeSummary } from '@taskflow/core'
import { POINTER_DRAG_THRESHOLD, buildPointerDragPreviewState, buildTaskDragPreview, getPointerDragStyle, markClickSuppressed, resolveDropZoneValueFromPoint, shouldIgnorePointerDragStart, getTagToneStyle, handleCardKeyboardActivation } from '../../utils/workspace-helpers'
import { DragPreviewLayer, StatusSelectBadge, PrioritySelectBadge, TaskTimeSummary, statusOptions } from '../shared'

export function KanbanView({
  tasks,
  lists,
  tags,
  selectedTaskId,
  onSelectTask,
  onChangeStatus,
  onChangePriority,
  onDropStatusChange,
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
  const [dragTaskId, setDragTaskId] = useState<string | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null)
  const [dragPreview, setDragPreview] = useState<PointerDragPreviewState | null>(null)
  const dragPayloadRef = useRef<string | null>(null)
  const pointerDragRef = useRef<({ status: TaskStatus } & PointerDragSession) | null>(null)
  const dragOverStatusRef = useRef<TaskStatus | null>(null)
  const suppressClickRef = useRef(false)
  const columns: Record<TaskStatus, Task[]> = { todo: [], doing: [], done: [] }
  tasks.forEach((task) => columns[task.status].push(task))

  const resetDragState = () => {
    const current = pointerDragRef.current
    if (current?.sourceElement.hasPointerCapture(current.pointerId)) {
      current.sourceElement.releasePointerCapture(current.pointerId)
    }
    pointerDragRef.current = null
    dragPayloadRef.current = null
    dragOverStatusRef.current = null
    setDragTaskId(null)
    setDragOverStatus(null)
    setDragPreview(null)
  }

  const resolveDropStatus = (clientX: number, clientY: number) => {
    const status = resolveDropZoneValueFromPoint(clientX, clientY, '[data-kanban-drop-zone]', 'data-kanban-drop-zone')
    return statusOptions.includes(status as TaskStatus) ? (status as TaskStatus) : null
  }

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const current = pointerDragRef.current
      if (!current || event.pointerId !== current.pointerId) return

      const moved = Math.hypot(event.clientX - current.startX, event.clientY - current.startY)
      if (!current.dragged && moved < POINTER_DRAG_THRESHOLD) return
      if (!current.dragged) {
        current.dragged = true
        setDragTaskId(current.taskId)
      }

      event.preventDefault()
      const targetStatus = resolveDropStatus(event.clientX, event.clientY)
      dragOverStatusRef.current = targetStatus
      setDragPreview(buildPointerDragPreviewState(current, event.clientX, event.clientY))
      setDragOverStatus(targetStatus)
    }

    const finalizePointerDrag = (event: PointerEvent) => {
      const current = pointerDragRef.current
      if (!current || event.pointerId !== current.pointerId) return

      const targetStatus = current.dragged ? dragOverStatusRef.current ?? resolveDropStatus(event.clientX, event.clientY) : null
      if (current.dragged && targetStatus) {
        onDropStatusChange(current.taskId, targetStatus)
        markClickSuppressed(suppressClickRef)
      }

      resetDragState()
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', finalizePointerDrag)
    window.addEventListener('pointercancel', finalizePointerDrag)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', finalizePointerDrag)
      window.removeEventListener('pointercancel', finalizePointerDrag)
    }
  }, [onDropStatusChange])

  const startCardDrag = (task: Task, status: TaskStatus) => (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || shouldIgnorePointerDragStart(event.target, event.currentTarget)) return

    dragPayloadRef.current = task.id
    pointerDragRef.current = {
      pointerId: event.pointerId,
      taskId: task.id,
      status,
      startX: event.clientX,
      startY: event.clientY,
      dragged: false,
      sourceElement: event.currentTarget,
      sourceRect: event.currentTarget.getBoundingClientRect(),
      preview: buildTaskDragPreview(task, `${statusMeta[status]} · ${formatTaskDualTimeSummary(task, { emptyLabel: '未排期' })}`),
    }
    if (event.currentTarget.setPointerCapture) {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
  }

  const handleCardClick = (taskId: string) => (event: React.MouseEvent<HTMLElement>) => {
    if (suppressClickRef.current) {
      event.preventDefault()
      event.stopPropagation()
      return
    }

    onSelectTask(taskId)
  }

  return (
    <div className="kanban-grid">
      {(['todo', 'doing', 'done'] as TaskStatus[]).map((status) => (
        <section key={status} className="kanban-column">
          <header>
            <h3>{statusMeta[status]}</h3>
            <div className="kanban-column-actions">
              <span>{columns[status].length}</span>
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
          </header>
          <div
            data-kanban-drop-zone={status}
            data-onboarding-anchor={status === 'todo' ? 'kanban-column' : undefined}
            className={`kanban-stack ${dragOverStatus === status ? 'is-drag-over' : ''}`}
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
            {columns[status].length === 0 && (
              <div className="kanban-col__empty">拖拽任务至此列</div>
            )}
            {columns[status].map((task) => {
              const list = lists.find((item) => item.id === task.listId)
              const taskTags = task.tagIds.map((tagId) => tags.find((item) => item.id === tagId)).filter(Boolean) as Tag[]
              const completedSubtasks = task.subtasks.filter((item) => item.completed).length

              return (
                <article
                  key={task.id}
                  className={`kanban-card status-${task.status} ${selectedTaskId === task.id ? 'is-selected' : ''} ${dragTaskId === task.id ? 'is-dragging' : ''}`}
                  style={getPointerDragStyle(task.id, dragTaskId, dragPreview)}
                  role="button"
                  tabIndex={0}
                  aria-label={`打开任务 ${task.title}`}
                  onPointerDown={startCardDrag(task, task.status)}
                  onClick={handleCardClick(task.id)}
                  onKeyDown={(event) => handleCardKeyboardActivation(event, () => onSelectTask(task.id))}
                >
                  <div className="kanban-header">
                    <div className="kanban-card__badge-group" onClick={(event) => event.stopPropagation()}>
                      <StatusSelectBadge status={task.status} compact onChange={(status) => onChangeStatus(task.id, status)} />
                      <PrioritySelectBadge priority={task.priority} compact onChange={(priority) => onChangePriority(task.id, priority)} />
                    </div>
                    <TaskTimeSummary task={task} compact />
                  </div>
                  <div className="kanban-card__title-row">
                    <h4 className="kanban-card__title">{task.title}</h4>
                  </div>
                  {task.note && <p className="kanban-card__note">{task.note}</p>}
                  <div className="chip-wrap dense kanban-card__tags">
                    {taskTags.slice(0, 2).map((tag) => (
                      <span key={tag.id} className="mini-tag" style={getTagToneStyle(tag.color)}>
                        <i style={{ background: tag.color }} />#{tag.name}
                      </span>
                    ))}
                    {taskTags.length > 2 && (
                      <span className="kanban-card__tags-more">+{taskTags.length - 2}</span>
                    )}
                  </div>
                  <footer>
                    <span>{list?.name ?? '未知清单'}</span>
                    <div className="kanban-card__footer-actions">
                      {task.subtasks.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span>{completedSubtasks}/{task.subtasks.length} 子任务</span>
                          <div className="kanban-subtask-bar" style={{ width: 40 }}>
                            <div
                              className="kanban-subtask-bar__fill"
                              style={{ width: `${Math.round((completedSubtasks / task.subtasks.length) * 100)}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </footer>
                </article>
              )
            })}
            <button
              className="kanban-create-card"
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
      ))}
      <DragPreviewLayer preview={dragPreview} />
    </div>
  )
}
