/**
 * ConflictResolutionDialog — SYNC-02
 *
 * Shows field-level merge conflicts to the user and lets them choose
 * 'local' or 'remote' for each conflicting field.
 * Displayed when mergeTaskList() returns conflicts during a remote update.
 */
import { useState } from 'react'
import type { FieldConflict } from '../utils/field-merge'
import styles from './ConflictResolutionDialog.module.css'

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '(空)'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'string') return value.length > 80 ? value.slice(0, 80) + '…' : value
  return String(value)
}

function formatVersion(iso: string): string {
  if (!iso) return '未知'
  try {
    const d = new Date(iso)
    return d.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

const FIELD_LABELS: Record<string, string> = {
  title: '标题',
  note: '备注',
  status: '状态',
  priority: '优先级',
  completed: '完成',
  deleted: '已删除',
  listId: '所属列表',
  isUrgent: '紧急',
  isImportant: '重要',
  startAt: '开始时间',
  dueAt: '截止时间',
  deadlineAt: '最终期限',
  repeatRule: '重复规则',
  assignee: '负责人',
  estimatedPomodoros: '预计番茄数',
  sortOrder: '排序',
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  conflicts: FieldConflict[]
  onResolve: (resolutions: Record<string, 'local' | 'remote'>) => void
  onDismiss: () => void
}

export function ConflictResolutionDialog({ conflicts, onResolve, onDismiss }: Props) {
  // Group by task
  const taskGroups = conflicts.reduce<Record<string, FieldConflict[]>>((acc, c) => {
    ;(acc[c.taskId] ??= []).push(c)
    return acc
  }, {})

  // Initial resolutions: all default to 'local'
  const [resolutions, setResolutions] = useState<Record<string, 'local' | 'remote'>>(() => {
    const init: Record<string, 'local' | 'remote'> = {}
    for (const c of conflicts) {
      init[`${c.taskId}:${c.field}`] = 'local'
    }
    return init
  })

  const choose = (taskId: string, field: string, side: 'local' | 'remote') => {
    setResolutions(prev => ({ ...prev, [`${taskId}:${field}`]: side }))
  }

  const handleConfirm = () => onResolve(resolutions)

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="同步冲突">
      <div className={styles.dialog}>
        <header className={styles.header}>
          <h2 className={styles.title}>同步冲突</h2>
          <p className={styles.subtitle}>
            以下 {conflicts.length} 个字段在本地与云端均有修改，请选择保留哪个版本。
          </p>
        </header>

        <div className={styles.body}>
          {Object.entries(taskGroups).map(([, taskConflicts]) => {
            const first = taskConflicts[0]
            return (
              <section key={first.taskId} className={styles.taskSection}>
                <h3 className={styles.taskTitle}>{first.taskTitle || first.taskId}</h3>
                {taskConflicts.map(c => {
                  const key = `${c.taskId}:${c.field}`
                  const choice = resolutions[key]
                  return (
                    <div key={key} className={styles.conflictRow}>
                      <div className={styles.fieldName}>
                        {FIELD_LABELS[c.field] ?? c.field}
                      </div>
                      <div className={styles.choices}>
                        <button
                          className={`${styles.choiceBtn} ${choice === 'local' ? styles.selected : ''}`}
                          onClick={() => choose(c.taskId, c.field, 'local')}
                          type="button"
                        >
                          <span className={styles.choiceLabel}>本地</span>
                          <span className={styles.choiceValue}>{formatValue(c.localValue)}</span>
                          <span className={styles.choiceTime}>{formatVersion(c.localVersion)}</span>
                        </button>
                        <button
                          className={`${styles.choiceBtn} ${choice === 'remote' ? styles.selected : ''}`}
                          onClick={() => choose(c.taskId, c.field, 'remote')}
                          type="button"
                        >
                          <span className={styles.choiceLabel}>云端</span>
                          <span className={styles.choiceValue}>{formatValue(c.remoteValue)}</span>
                          <span className={styles.choiceTime}>{formatVersion(c.remoteVersion)}</span>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </section>
            )
          })}
        </div>

        <footer className={styles.footer}>
          <button className={styles.dismissBtn} onClick={onDismiss} type="button">
            忽略（保留本地）
          </button>
          <button className={styles.confirmBtn} onClick={handleConfirm} type="button">
            确认应用
          </button>
        </footer>
      </div>
    </div>
  )
}
