import { useRef } from 'react'
import type { Task, TodoList, Tag } from '../../types/domain'
import { priorityMeta } from '@taskflow/core'
import { EmptyState, TaskTimeSummary } from '../shared'
import { getTagToneStyle, handleCardKeyboardActivation } from '../../utils/workspace-helpers'

export function ListView({
  tasks,
  lists,
  tags,
  selectedTaskId,
  onSelectTask,
  onToggleTaskComplete,
  onDelete,
  onRestore,
  onDuplicate,
  bulkMode = false,
  bulkSelectedIds = new Set(),
  onToggleBulkSelect,
  onBulkRangeSelect,
  completingTaskIds = new Set(),
}: {
  tasks: Task[]
  lists: TodoList[]
  tags: Tag[]
  selectedTaskId: string | null
  onSelectTask: (taskId: string) => void
  onToggleTaskComplete: (taskId: string) => void
  onDelete: (taskId: string) => void
  onRestore: (taskId: string) => void
  onDuplicate: (taskId: string) => void
  bulkMode?: boolean
  bulkSelectedIds?: Set<string>
  onToggleBulkSelect?: (taskId: string) => void
  onBulkRangeSelect?: (ids: string[]) => void
  completingTaskIds?: Set<string>
}) {
  const lastClickedIdx = useRef<number>(-1)

  if (!tasks.length) return <EmptyState title="这个工作区现在很干净。" description="可以直接在顶部快速创建一条新任务。" />

  const handleBulkClick = (task: Task, idx: number, shiftKey: boolean) => {
    if (shiftKey && lastClickedIdx.current >= 0 && onBulkRangeSelect) {
      const lo = Math.min(lastClickedIdx.current, idx)
      const hi = Math.max(lastClickedIdx.current, idx)
      onBulkRangeSelect(tasks.slice(lo, hi + 1).map((t) => t.id))
    } else {
      lastClickedIdx.current = idx
      onToggleBulkSelect?.(task.id)
    }
  }

  return (
    <div className="task-list">
      {tasks.map((task) => {
        const list = lists.find((item) => item.id === task.listId)
        const taskTags = task.tagIds.map((tagId) => tags.find((item) => item.id === tagId)).filter(Boolean) as Tag[]
        const subtaskDone = task.subtasks.filter((item) => item.completed).length
        const isBulkSelected = bulkSelectedIds.has(task.id)
        const isCompleting = completingTaskIds.has(task.id)

        const idx = tasks.indexOf(task)

        return (
          <article
            key={task.id}
            className={`task-card ${selectedTaskId === task.id ? 'is-selected' : ''} ${isBulkSelected ? 'is-bulk-selected' : ''} ${isCompleting ? 'is-completing' : ''}`}
            data-priority={task.priority}
            role="button"
            tabIndex={0}
            aria-label={`打开任务 ${task.title}`}
            onClick={(e) => bulkMode ? handleBulkClick(task, idx, e.shiftKey) : onSelectTask(task.id)}
            onKeyDown={(event) => handleCardKeyboardActivation(event, () => bulkMode ? handleBulkClick(task, idx, false) : onSelectTask(task.id))}
          >
            {bulkMode ? (
              <input
                type="checkbox"
                checked={isBulkSelected}
                onChange={() => onToggleBulkSelect?.(task.id)}
                onClick={e => e.stopPropagation()}
                style={{ width: 16, height: 16, flexShrink: 0, cursor: 'pointer' }}
                aria-label={`选中任务 ${task.title}`}
              />
            ) : (
              <button
                className={`check-button ${task.completed ? 'is-checked' : ''} ${isCompleting ? 'is-completing' : ''}`}
                onClick={(event) => {
                  event.stopPropagation()
                  onToggleTaskComplete(task.id)
                }}
              >
                {task.completed ? '✓' : ''}
              </button>
            )}
            <div className="task-main">
              <div className="task-headline">
                <h3>{task.title}</h3>
                <span className={`priority-pill priority-${task.priority}`}>{priorityMeta[task.priority].short}</span>
              </div>
              {task.note && <p>{task.note}</p>}
              <div className="task-meta">
                <span>{list?.name ?? '未知清单'}</span>
                {task.repeatRule && task.repeatRule !== '不重复' && <span title={task.repeatRule}>🔄</span>}
                <TaskTimeSummary task={task} compact />
                {task.subtasks.length > 0 && (
                  <span>
                    子任务 {subtaskDone}/{task.subtasks.length}
                  </span>
                )}
                {task.assignee && <span>👤 {task.assignee}</span>}
              </div>
              {taskTags.length > 0 && (
                <div className="chip-wrap dense">
                  {taskTags.slice(0, 2).map((tag) => (
                    <span key={tag.id} className="mini-tag" style={getTagToneStyle(tag.color)}>
                      <i style={{ background: tag.color }} />#{tag.name}
                    </span>
                  ))}
                  {taskTags.length > 2 && (
                    <span className="task-tags-more">+{taskTags.length - 2}</span>
                  )}
                </div>
              )}
            </div>
            {!bulkMode && (
              <div className="task-actions" onClick={(event) => event.stopPropagation()}>
                <button className="ghost-button small" onClick={() => onDuplicate(task.id)}>
                  复制
                </button>
                {task.deleted ? (
                  <button className="ghost-button small" onClick={() => onRestore(task.id)}>
                    恢复
                  </button>
                ) : (
                  <button className="ghost-button small" onClick={() => onDelete(task.id)}>
                    删除
                  </button>
                )}
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}
