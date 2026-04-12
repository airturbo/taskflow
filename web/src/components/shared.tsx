import { createPortal } from 'react-dom'
import type { TaskStatus, Priority, Task } from '../types/domain'
import type { PointerDragPreviewState } from '../types/workspace'
import { priorityMeta, statusMeta, statusUiMeta } from '@taskflow/core'
import { formatTaskDualTimeSummary, formatTaskDeadlineBadge, isTaskRiskOverdue, isTaskPlannedAfterDeadline, getTaskDeadlineMarkerTone, getTaskDeadlineMarkerTitle } from '@taskflow/core'
import { getTimelinePercent } from '@taskflow/core'
import { getDateTimeMs } from '../utils/workspace-helpers'

export const statusOptions: TaskStatus[] = ['todo', 'doing', 'done']

export function TaskDeadlineIndicators({ task, compact = false }: { task: Task; compact?: boolean }) {
  const deadlineBadge = formatTaskDeadlineBadge(task)
  const tone = getTaskDeadlineMarkerTone(task)
  if (!deadlineBadge || !tone) return null

  const plannedAfterDeadline = isTaskPlannedAfterDeadline(task)
  const title = getTaskDeadlineMarkerTitle(task) ?? deadlineBadge

  return (
    <div className={`task-deadline-indicators ${compact ? 'is-compact' : ''}`}>
      <span className={`time-badge ${tone === 'danger' ? 'is-danger' : tone === 'warning' ? 'is-warning' : 'is-deadline'}`} title={title} aria-label={title}>
        {compact ? 'DDL' : deadlineBadge}
      </span>
      {plannedAfterDeadline && <span className="time-badge is-warning">{compact ? '晚于 DDL' : '计划晚于 DDL'}</span>}
    </div>
  )
}

export function TaskDeadlineDot({ task }: { task: Task }) {
  const tone = getTaskDeadlineMarkerTone(task)
  const title = getTaskDeadlineMarkerTitle(task)
  if (!tone || !title) return null
  return <span className={`task-deadline-dot is-${tone}`} aria-label={title} title={title} />
}

export function getTaskDeadlineMarkerOffset(task: Task, windowStart: number, windowEnd: number) {
  const deadlineAt = getDateTimeMs(task.deadlineAt ?? null, 'end')
  if (!deadlineAt || deadlineAt < windowStart || deadlineAt > windowEnd) return null
  return getTimelinePercent(deadlineAt, windowStart, windowEnd)
}

export function TaskTimeSummary({ task, compact = false }: { task: Task; compact?: boolean }) {
  const deadlineBadge = formatTaskDeadlineBadge(task)
  const overdue = isTaskRiskOverdue(task)
  const plannedAfterDeadline = isTaskPlannedAfterDeadline(task)

  return (
    <div className={`task-time-summary ${compact ? 'is-compact' : ''}`}>
      <span className={`task-time-summary__primary ${overdue ? 'is-danger' : ''}`}>{formatTaskDualTimeSummary(task, { emptyLabel: '未排期' })}</span>
      {deadlineBadge && <span className={`time-badge ${overdue ? 'is-danger' : 'is-deadline'}`}>{deadlineBadge}</span>}
      {plannedAfterDeadline && <span className="time-badge is-warning">计划晚于 DDL</span>}
    </div>
  )
}

export function StatusBadge({ status, compact = false }: { status: TaskStatus; compact?: boolean }) {
  return (
    <span className={`status-badge status-${status} ${compact ? 'is-compact' : ''}`}>
      <i>{statusUiMeta[status].icon}</i>
      <span>{statusMeta[status]}</span>
    </span>
  )
}

export function StatusSelectBadge({
  status,
  onChange,
  compact = false,
}: {
  status: TaskStatus
  onChange: (status: TaskStatus) => void
  compact?: boolean
}) {
  return (
    <label className={`status-select-badge status-${status} ${compact ? 'is-compact' : ''}`}>
      <i>{statusUiMeta[status].icon}</i>
      <span>{statusMeta[status]}</span>
      <select value={status} aria-label="修改任务状态" onChange={(event) => onChange(event.target.value as TaskStatus)}>
        {statusOptions.map((item) => (
          <option key={item} value={item}>
            {statusMeta[item]}
          </option>
        ))}
      </select>
    </label>
  )
}

export function PrioritySelectBadge({
  priority,
  onChange,
  compact = false,
}: {
  priority: Priority
  onChange: (priority: Priority) => void
  compact?: boolean
}) {
  return (
    <label className={`priority-select-badge priority-${priority} ${compact ? 'is-compact' : ''}`}>
      <span>{priorityMeta[priority].short}</span>
      {!compact && <small>{priorityMeta[priority].label}</small>}
      <select value={priority} aria-label="修改任务优先级" onChange={(event) => onChange(event.target.value as Priority)}>
        {(Object.keys(priorityMeta) as Priority[]).map((item) => (
          <option key={item} value={item}>
            {priorityMeta[item].label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function DragPreviewLayer({ preview }: { preview: PointerDragPreviewState | null }) {
  if (!preview || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="drag-preview-layer"
      style={{ transform: `translate3d(${preview.x + 18}px, ${preview.y + 18}px, 0)` }}
      aria-hidden="true"
    >
      <article className={`drag-preview-card ${preview.overdue ? 'is-overdue' : ''}`}>
        <div className="drag-preview-card__meta-row">
          <StatusBadge status={preview.status} compact />
          <span className={`priority-pill priority-${preview.priority}`}>{priorityMeta[preview.priority].short}</span>
        </div>
        <strong>{preview.title}</strong>
        <small className={preview.overdue ? 'is-danger' : undefined}>{preview.meta}</small>
      </article>
    </div>,
    document.body,
  )
}

export function EmptyState({ title, description, compact = false }: { title: string; description: string; compact?: boolean }) {
  return (
    <div className={`empty-state ${compact ? 'is-compact' : ''}`}>
      <p className="eyebrow">等待继续</p>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  )
}
