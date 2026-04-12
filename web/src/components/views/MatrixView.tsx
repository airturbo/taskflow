import { useState, useEffect, useRef } from 'react'
import type { Task, TodoList, Tag, TaskStatus, Priority } from '../../types/domain'
import type { PointerDragPreviewState, InlineCreateRequest, PointerDragSession } from '../../types/workspace'
import { getQuadrant, getQuadrantLabel, formatTaskDualTimeSummary, SPECIAL_TAG_IDS, type MatrixQuadrantKey } from '@taskflow/core'
import { POINTER_DRAG_THRESHOLD, buildPointerDragPreviewState, buildTaskDragPreview, getPointerDragStyle, markClickSuppressed, resolveDropZoneValueFromPoint, shouldIgnorePointerDragStart, getTagToneStyle, handleCardKeyboardActivation } from '../../utils/workspace-helpers'
import { DragPreviewLayer, StatusSelectBadge, PrioritySelectBadge, TaskTimeSummary } from '../shared'

function SparseGuide({ title, description, bullets }: { title: string; description: string; bullets: string[] }) {
  return (
    <section className="sparse-guide">
      <div>
        <p className="eyebrow">sparse state polish</p>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <div className="chip-wrap dense">
        {bullets.map((bullet) => (
          <span key={bullet} className="mini-tag">
            {bullet}
          </span>
        ))}
      </div>
    </section>
  )
}

export function MatrixView({
  tasks,
  lists,
  tags,
  selectedTaskId,
  onSelectTask,
  onChangeStatus,
  onChangePriority,
  onMoveToQuadrant,
  onOpenInlineCreate,
}: {
  tasks: Task[]
  lists: TodoList[]
  tags: Tag[]
  selectedTaskId: string | null
  onSelectTask: (taskId: string) => void
  onChangeStatus: (taskId: string, status: TaskStatus) => void
  onChangePriority: (taskId: string, priority: Priority) => void
  onMoveToQuadrant: (taskId: string, quadrant: MatrixQuadrantKey) => void
  onOpenInlineCreate: (request: InlineCreateRequest) => void
}) {
  const [dragTaskId, setDragTaskId] = useState<string | null>(null)
  const [dragOverQuadrant, setDragOverQuadrant] = useState<MatrixQuadrantKey | null>(null)
  const [dragPreview, setDragPreview] = useState<PointerDragPreviewState | null>(null)
  const dragPayloadRef = useRef<string | null>(null)
  const pointerDragRef = useRef<({ quadrant: MatrixQuadrantKey } & PointerDragSession) | null>(null)
  const dragOverQuadrantRef = useRef<MatrixQuadrantKey | null>(null)
  const suppressClickRef = useRef(false)
  const quadrants: Record<MatrixQuadrantKey, Task[]> = {
    q1: [],
    q2: [],
    q3: [],
    q4: [],
  }
  tasks.forEach((task) => quadrants[getQuadrant(task)].push(task))

  const meta: Record<MatrixQuadrantKey, { title: string; hint: string; emptyHint: string; priority: Priority; tagIds: string[] }> = {
    q1: { title: '紧急且重要', hint: '立即处理', emptyHint: '重要且紧急 — 立即处理', priority: 'urgent', tagIds: [SPECIAL_TAG_IDS.urgent, SPECIAL_TAG_IDS.important] },
    q2: { title: '重要不紧急', hint: '规划安排', emptyHint: '重要不紧急 — 规划时间', priority: 'high', tagIds: [SPECIAL_TAG_IDS.important] },
    q3: { title: '紧急不重要', hint: '委派或压缩', emptyHint: '紧急不重要 — 考虑委托', priority: 'normal', tagIds: [SPECIAL_TAG_IDS.urgent] },
    q4: { title: '不紧急不重要', hint: '放弃或推迟', emptyHint: '不重要不紧急 — 可以放下', priority: 'low', tagIds: [] },
  }

  const resetDragState = () => {
    const current = pointerDragRef.current
    if (current?.sourceElement.hasPointerCapture(current.pointerId)) {
      current.sourceElement.releasePointerCapture(current.pointerId)
    }
    pointerDragRef.current = null
    dragPayloadRef.current = null
    dragOverQuadrantRef.current = null
    setDragTaskId(null)
    setDragOverQuadrant(null)
    setDragPreview(null)
  }

  const resolveDropQuadrant = (clientX: number, clientY: number) => {
    const quadrant = resolveDropZoneValueFromPoint(clientX, clientY, '[data-matrix-drop-zone]', 'data-matrix-drop-zone')
    return quadrant && quadrant in meta ? (quadrant as MatrixQuadrantKey) : null
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
      const targetQuadrant = resolveDropQuadrant(event.clientX, event.clientY)
      dragOverQuadrantRef.current = targetQuadrant
      setDragPreview(buildPointerDragPreviewState(current, event.clientX, event.clientY))
      setDragOverQuadrant(targetQuadrant)
    }

    const finalizePointerDrag = (event: PointerEvent) => {
      const current = pointerDragRef.current
      if (!current || event.pointerId !== current.pointerId) return

      const targetQuadrant = current.dragged ? dragOverQuadrantRef.current ?? resolveDropQuadrant(event.clientX, event.clientY) : null
      if (current.dragged && targetQuadrant) {
        onMoveToQuadrant(current.taskId, targetQuadrant)
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
  }, [meta, onMoveToQuadrant])

  const startCardDrag = (task: Task, quadrant: MatrixQuadrantKey) => (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || shouldIgnorePointerDragStart(event.target, event.currentTarget)) return

    dragPayloadRef.current = task.id
    pointerDragRef.current = {
      pointerId: event.pointerId,
      taskId: task.id,
      quadrant,
      startX: event.clientX,
      startY: event.clientY,
      dragged: false,
      sourceElement: event.currentTarget,
      sourceRect: event.currentTarget.getBoundingClientRect(),
      preview: buildTaskDragPreview(task, `${getQuadrantLabel(quadrant)} · ${formatTaskDualTimeSummary(task, { emptyLabel: '未排期' })}`),
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
    <div className="view-stack">
      {tasks.length <= 3 && (
        <SparseGuide title="当前象限偏轻，但优先级边界要更清楚。" description="特殊标签已经替代隐式规则；需要时直接拖拽卡片，就能把任务放回正确象限。" bullets={['拖拽改标签', '即时回写', '减少误判']} />
      )}
      <div className="matrix-grid">
        {(Object.keys(meta) as MatrixQuadrantKey[]).map((key) => (
          <section key={key} className="matrix-quadrant">
            <header>
              <div>
                <h3>{meta[key].title}</h3>
                <p>{meta[key].hint}</p>
              </div>
              <div className="matrix-quadrant-actions">
                <span>{quadrants[key].length}</span>
                <button
                  className="create-icon-button"
                  aria-label={`在${meta[key].title}象限创建任务`}
                  title={`在${meta[key].title}象限创建任务`}
                  onClick={(event) => {
                    event.stopPropagation()
                    onOpenInlineCreate({
                      view: 'matrix',
                      anchorRect: (event.currentTarget as HTMLElement).getBoundingClientRect(),
                      priority: meta[key].priority,
                      tagIds: meta[key].tagIds,
                      guidance: meta[key].title,
                    })
                  }}
                >
                  +
                </button>
              </div>
            </header>
            <div
              data-matrix-drop-zone={key}
              className={`matrix-stack ${dragOverQuadrant === key ? 'is-drag-over' : ''}`}
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  onOpenInlineCreate({
                    view: 'matrix',
                    anchorRect: (event.currentTarget as HTMLElement).getBoundingClientRect(),
                    priority: meta[key].priority,
                    tagIds: meta[key].tagIds,
                    guidance: meta[key].title,
                  })
                }
              }}
            >
              {quadrants[key].length === 0 ? (
                <>
                  <div className="matrix-quadrant__empty-hint">{meta[key].emptyHint}</div>
                  <button
                    className="matrix-placeholder matrix-placeholder--action"
                    aria-label={`在${meta[key].title}象限创建任务`}
                    title={`在${meta[key].title}象限创建任务`}
                    onClick={(event) =>
                      onOpenInlineCreate({
                        view: 'matrix',
                        anchorRect: (event.currentTarget as HTMLElement).getBoundingClientRect(),
                        priority: meta[key].priority,
                        tagIds: meta[key].tagIds,
                        guidance: meta[key].title,
                      })
                    }
                  >
                    +
                  </button>
                </>
              ) : (
                <>
                  {quadrants[key].map((task) => {
                    const list = lists.find((item) => item.id === task.listId)
                    const taskTags = task.tagIds.map((tagId) => tags.find((item) => item.id === tagId)).filter(Boolean) as Tag[]

                    return (
                      <article
                        key={task.id}
                        className={`matrix-card status-${task.status} ${selectedTaskId === task.id ? 'is-selected' : ''} ${dragTaskId === task.id ? 'is-dragging' : ''}`}
                        style={getPointerDragStyle(task.id, dragTaskId, dragPreview)}
                        role="button"
                        tabIndex={0}
                        aria-label={`打开任务 ${task.title}`}
                        onPointerDown={startCardDrag(task, key)}
                        onClick={handleCardClick(task.id)}
                        onKeyDown={(event) => handleCardKeyboardActivation(event, () => onSelectTask(task.id))}
                      >
                        <div className="matrix-card__top">
                          <div className="matrix-card__badge-group" onClick={(event) => event.stopPropagation()}>
                            <StatusSelectBadge status={task.status} compact onChange={(status) => onChangeStatus(task.id, status)} />
                            <PrioritySelectBadge priority={task.priority} compact onChange={(priority) => onChangePriority(task.id, priority)} />
                          </div>
                          <TaskTimeSummary task={task} compact />
                        </div>
                        <strong className="matrix-card__title">{task.title}</strong>
                        <p>
                          <span className="matrix-card__list-dot" style={{ background: list?.color || 'var(--text-3)' }} />
                          {list?.name ?? '未知清单'}
                        </p>
                        <div className="chip-wrap dense">
                          {taskTags.slice(0, 3).map((tag) => (
                            <span key={tag.id} className="mini-tag" style={getTagToneStyle(tag.color)}>
                              <i style={{ background: tag.color }} />#{tag.name}
                            </span>
                          ))}
                        </div>
                      </article>
                    )
                  })}
                  <button
                    className="matrix-create-card"
                    aria-label={`在${meta[key].title}象限创建任务`}
                    title={`在${meta[key].title}象限创建任务`}
                    onClick={(event) => {
                      event.stopPropagation()
                      onOpenInlineCreate({
                        view: 'matrix',
                        anchorRect: (event.currentTarget as HTMLElement).getBoundingClientRect(),
                        priority: meta[key].priority,
                        tagIds: meta[key].tagIds,
                        guidance: meta[key].title,
                      })
                    }}
                  >
                    +
                  </button>
                </>
              )}
            </div>
          </section>
        ))}
      </div>
      <DragPreviewLayer preview={dragPreview} />
    </div>
  )
}
