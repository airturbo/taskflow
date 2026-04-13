import { useState } from 'react'
import type { Task, TodoList, Tag, Priority, TaskStatus } from '../types/domain'
import type { MatrixQuadrantKey } from '@taskflow/core'
import type { InlineCreateRequest } from '../types/workspace'
import { getQuadrant, priorityMeta } from '@taskflow/core'
import { formatDateTime } from '../utils/dates'
import styles from './MobileMatrixView.module.css'

const QUADRANT_META: Record<MatrixQuadrantKey, { title: string; shortTitle: string; color: string; icon: string; hint: string }> = {
  q1: { title: '紧急且重要', shortTitle: 'Q1', color: '#ff3b30', icon: '🔴', hint: '立即处理' },
  q2: { title: '重要不紧急', shortTitle: 'Q2', color: '#007aff', icon: '🔵', hint: '计划安排' },
  q3: { title: '紧急不重要', shortTitle: 'Q3', color: '#ff9500', icon: '🟠', hint: '委派他人' },
  q4: { title: '不紧急不重要', shortTitle: 'Q4', color: '#8e8e93', icon: '⚪', hint: '推迟/放弃' },
}

export function MobileMatrixView(props: {
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
  const [activeQ, setActiveQ] = useState<MatrixQuadrantKey>('q1')

  const tasksByQuadrant: Record<MatrixQuadrantKey, Task[]> = { q1: [], q2: [], q3: [], q4: [] }
  props.tasks.forEach((t) => tasksByQuadrant[getQuadrant(t)].push(t))

  const m = QUADRANT_META[activeQ]
  const tasks = tasksByQuadrant[activeQ]

  return (
    <div className={styles.mobileMatrix}>
      {/* 顶部象限切换 tab */}
      <div className={styles.mobileMatrixTabs}>
        {(Object.keys(QUADRANT_META) as MatrixQuadrantKey[]).map((key) => {
          const count = tasksByQuadrant[key].length
          return (
            <button
              key={key}
              className={`${styles.mobileMatrixTab} ${key === activeQ ? 'is-active' : ''}`}
              style={key === activeQ ? { '--q-color': QUADRANT_META[key].color } as React.CSSProperties : undefined}
              onClick={() => setActiveQ(key)}
            >
              <span className={styles.mobileMatrixTabIcon}>{QUADRANT_META[key].icon}</span>
              <span className={styles.mobileMatrixTabLabel}>{QUADRANT_META[key].shortTitle}</span>
              {count > 0 && <span className={styles.mobileMatrixTabBadge}>{count}</span>}
            </button>
          )
        })}
      </div>

      {/* 当前象限标题 */}
      <div className={styles.mobileMatrixHeader} style={{ '--q-color': m.color } as React.CSSProperties}>
        <div className={styles.mobileMatrixHeaderInfo}>
          <span className={styles.mobileMatrixHeaderTitle}>{m.title}</span>
          <span className={styles.mobileMatrixHeaderHint}>{m.hint}</span>
        </div>
        <button
          className={styles.mobileMatrixAddBtn}
          onClick={() =>
            props.onOpenInlineCreate({
              view: 'matrix',
              anchorRect: { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 } as DOMRect,
            })
          }
          aria-label="添加任务"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z"/>
          </svg>
        </button>
      </div>

      {/* 任务列表 */}
      {tasks.length === 0 ? (
        <div className={styles.mobileMatrixEmpty}>
          <span>{m.icon}</span>
          <p>此象限暂无任务</p>
        </div>
      ) : (
        <ul className={styles.mobileMatrixList}>
          {tasks.map((task) => (
            <MobileMatrixCard
              key={task.id}
              task={task}
              lists={props.lists}
              activeQ={activeQ}
              isSelected={props.selectedTaskId === task.id}
              onSelect={() => props.onSelectTask(task.id)}
              onToggle={() => props.onChangeStatus(task.id, task.completed ? 'doing' : 'done')}
              onMoveToQuadrant={(q) => props.onMoveToQuadrant(task.id, q)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function MobileMatrixCard({
  task,
  lists,
  activeQ,
  isSelected,
  onSelect,
  onToggle,
  onMoveToQuadrant,
}: {
  task: Task
  lists: TodoList[]
  activeQ: MatrixQuadrantKey
  isSelected: boolean
  onSelect: () => void
  onToggle: () => void
  onMoveToQuadrant: (q: MatrixQuadrantKey) => void
}) {
  const [showMove, setShowMove] = useState(false)
  const taskList = task.listId ? lists.find(l => l.id === task.listId) : null
  const dueTime = task.dueAt ? formatDateTime(task.dueAt) : null
  const m = QUADRANT_META[activeQ]

  return (
    <li
      className={`${styles.mobileMatrixCard} ${task.completed ? 'is-completed' : ''} ${isSelected ? 'is-selected' : ''}`}
      style={{ '--q-color': m.color } as React.CSSProperties}
    >
      <button
        className="check-button"
        aria-label={task.completed ? '取消完成' : '标记完成'}
        onClick={(e) => { e.stopPropagation(); onToggle() }}
      />
      <div className={styles.mobileMatrixCardBody} onClick={onSelect}>
        <span className={styles.mobileMatrixCardTitle}>{task.title}</span>
        <span className={styles.mobileMatrixCardMeta}>
          {dueTime && <span className={styles.mobileMatrixCardTime}>{dueTime}</span>}
          {taskList && (
            <span className={styles.mobileMatrixCardList}>
              <i style={{ background: taskList.color }} />
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
      {/* 移动到其他象限 */}
      <button
        className={styles.mobileMatrixCardMoveBtn}
        aria-label="移动到其他象限"
        onClick={(e) => { e.stopPropagation(); setShowMove(v => !v) }}
      >⋯</button>
      {showMove && (
        <div className={styles.mobileMatrixCardMoveMenu}>
          {(Object.keys(QUADRANT_META) as MatrixQuadrantKey[]).filter(k => k !== activeQ).map(k => (
            <button
              key={k}
              className={styles.mobileMatrixCardMoveItem}
              onClick={() => { onMoveToQuadrant(k); setShowMove(false) }}
            >
              {QUADRANT_META[k].icon} {QUADRANT_META[k].title}
            </button>
          ))}
          <button className={`${styles.mobileMatrixCardMoveItem} ${styles.mobileMatrixCardMoveCancel}`} onClick={() => setShowMove(false)}>取消</button>
        </div>
      )}
    </li>
  )
}
