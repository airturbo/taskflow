import { useState, useEffect, useRef, useMemo } from 'react'
import type { Task, TodoList, Tag, Priority, TaskStatus, Comment, TaskAttachment } from '../types/domain'
import { priorityMeta, isTaskPlannedAfterDeadline } from '@taskflow/core'
import { formatDateTime, getDateKey, getNowIso } from '../utils/dates'
import { describeReminder } from '../utils/reminder-engine'
import { describeRepeatRule } from '../utils/repeat-rule'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import {
  REMINDER_ANCHOR_OPTIONS, REMINDER_UNIT_OPTIONS, NOTE_EDITOR_LINE_HEIGHT,
  buildRelativeReminderValue, formatReminderOffsetLabel, formatReminderAnchorLabel,
  MAX_EMBEDDED_ATTACHMENT_BYTES, buildTaskAttachment, readFileAsDataUrl,
  canUseBrowserFilePicker, getAttachmentMetaLabel, makeId, toLocalInputValue,
} from '../utils/workspace-helpers'
import { StatusSelectBadge, TaskTimeSummary, EmptyState } from './shared'
import styles from './TaskDetailPanel.module.css'
import { TagPicker } from './TagManagementDialog'
import { templateFromTask, saveTemplate } from '../utils/templates'
import { TemplatePickerDialog } from './TemplatePickerDialog'

export function NoteEditorField({
  label,
  value,
  onChange,
  placeholder,
  minRows = 3,
  maxRows = 10,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  minRows?: number
  maxRows?: number
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    const minHeight = minRows * NOTE_EDITOR_LINE_HEIGHT
    const maxHeight = maxRows * NOTE_EDITOR_LINE_HEIGHT
    textarea.style.height = '0px'
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight)
    textarea.style.height = `${nextHeight}px`
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [maxRows, minRows, value])

  const charCount = value.trim().length

  return (
    <div className={`field ${styles.noteEditorField}`}>
      <div className={styles.noteEditorLabelRow}>
        <span>{label}</span>
        {charCount > 0 && <small>{charCount} 字</small>}
      </div>
      <div className={`${styles.noteEditor} ${styles.noteEditorMinimal}`}>
        <textarea
          ref={textareaRef}
          rows={minRows}
          className={styles.noteEditorTextarea}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      </div>
    </div>
  )
}

export interface WorkspaceMember {
  id: string
  name?: string
  email?: string
  avatarUrl?: string
}

export function TaskDetailPanel({
  task,
  lists,
  tags,
  members = [],
  desktopMode,
  onUpdateTask,
  onChangeStatus,
  onToggleComplete,
  onAddReminder,
  onRemoveReminder,
  onAddSubtask,
  onToggleSubtask,
  onAddComment,
  onAddAttachments,
  onRemoveAttachment,
  onOpenAttachment,
  onManageTags,
}: {
  task: Task | null
  lists: TodoList[]
  tags: Tag[]
  members?: WorkspaceMember[]
  desktopMode: boolean
  onUpdateTask: (taskId: string, patch: Partial<Task>) => void
  onChangeStatus: (taskId: string, status: TaskStatus) => void
  onToggleComplete: (taskId: string) => void
  onAddReminder: (taskId: string, label: string, value: string, kind: 'relative' | 'absolute') => void
  onRemoveReminder: (taskId: string, reminderId: string) => void
  onAddSubtask: (taskId: string, title: string) => void
  onToggleSubtask: (taskId: string, subtaskId: string) => void
  onAddComment: (taskId: string, comment: Comment) => void
  onAddAttachments: (taskId: string, attachments: TaskAttachment[]) => void
  onRemoveAttachment: (taskId: string, attachmentId: string) => void
  onOpenAttachment: (attachment: TaskAttachment) => Promise<void>
  onManageTags: () => void
}) {
  const [subtaskDraft, setSubtaskDraft] = useState('')
  const [commentDraft, setCommentDraft] = useState('')
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [relativeAnchor, setRelativeAnchor] = useState<(typeof REMINDER_ANCHOR_OPTIONS)[number]>('deadline')
  const [relativeAmount, setRelativeAmount] = useState('30')
  const [relativeUnit, setRelativeUnit] = useState<(typeof REMINDER_UNIT_OPTIONS)[number]>('m')
  const [absoluteReminderAt, setAbsoluteReminderAt] = useState('')
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const reminderAnchors = useMemo(
    () =>
      task
        ? REMINDER_ANCHOR_OPTIONS.map((anchor) => ({
            value: anchor,
            label: formatReminderAnchorLabel(anchor),
            timeValue: anchor === 'deadline' ? task.deadlineAt ?? null : anchor === 'planned' ? task.dueAt ?? null : task.startAt ?? null,
          }))
        : [],
    [task],
  )

  const firstAvailableReminderAnchor = reminderAnchors.find((item) => item.timeValue)?.value ?? 'deadline'
  const reminderRows = useMemo(() => {
    if (!task) return []

    return [...task.reminders]
      .map((reminder) => ({ reminder, description: describeReminder(task, reminder) }))
      .sort((left, right) => {
        if (left.description.triggerAt && right.description.triggerAt) {
          return left.description.triggerAt.localeCompare(right.description.triggerAt)
        }
        if (left.description.triggerAt) return -1
        if (right.description.triggerAt) return 1
        return left.description.label.localeCompare(right.description.label, 'zh-CN')
      })
  }, [task])

  useEffect(() => {
    setAttachmentError(null)
    setRelativeAmount('30')
    setRelativeUnit('m')
    setRelativeAnchor(firstAvailableReminderAnchor)

    if (!task) {
      setAbsoluteReminderAt('')
      return
    }

    setAbsoluteReminderAt(toLocalInputValue(task.deadlineAt ?? task.dueAt ?? task.startAt ?? `${getDateKey()}T09:00`))
  }, [firstAvailableReminderAnchor, task?.id])

  if (!task) {
    return <EmptyState title="选中一条任务继续深入。" description="右侧详情会承载提醒、子任务、评论和附件等高级属性。" compact />
  }

  const handleBrowserFileSelection = async (files: File[]) => {
    const oversized = files.find((file) => file.size > MAX_EMBEDDED_ATTACHMENT_BYTES)
    if (oversized) {
      setAttachmentError(`网页端当前只内嵌 ${Math.round(MAX_EMBEDDED_ATTACHMENT_BYTES / 1024 / 1024)}MB 内的小文件，建议在桌面 app 里挂本地文件。`)
      return
    }

    try {
      const attachments = await Promise.all(
        files.map(async (file) =>
          buildTaskAttachment({
            name: file.name,
            source: 'embedded',
            dataUrl: await readFileAsDataUrl(file),
            mimeType: file.type || null,
            size: file.size,
          }),
        ),
      )
      onAddAttachments(task.id, attachments)
      setAttachmentError(null)
    } catch {
      setAttachmentError('读取附件失败，请再试一次。')
    }
  }

  const handlePickAttachments = async () => {
    if (desktopMode) {
      try {
        const selected = await openDialog({ directory: false, multiple: true })
        const paths = Array.isArray(selected) ? selected : selected ? [selected] : []
        const attachments = paths
          .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
          .map((path) =>
            buildTaskAttachment({
              name: path.split(/[\\/]/).pop()?.trim() || path,
              source: 'desktop-path',
              path,
            }),
          )
        onAddAttachments(task.id, attachments)
        setAttachmentError(null)
      } catch {
        setAttachmentError('未能打开文件选择器，请确认桌面权限配置正常。')
      }
      return
    }

    if (!canUseBrowserFilePicker()) {
      setAttachmentError('当前环境不支持文件选择。')
      return
    }

    fileInputRef.current?.click()
  }

  const handleAddRelativeReminder = (anchor = relativeAnchor, amount = Number(relativeAmount || '0'), unit = relativeUnit) => {
    if (!Number.isFinite(amount) || amount < 0) return
    onAddReminder(task.id, formatReminderOffsetLabel(amount, unit), buildRelativeReminderValue(anchor, amount, unit), 'relative')
  }

  const handleAddAbsoluteReminder = () => {
    if (!absoluteReminderAt) return
    onAddReminder(task.id, '固定提醒', absoluteReminderAt, 'absolute')
  }

  return (
    <section className={`panel ${styles.detailCard}`}>
      <div className="panel-header">
        <div>
          <p className="eyebrow">当前选中</p>
          <h3>任务详情</h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className="ghost-button small"
            onClick={() => {
              const name = window.prompt('模板名称', task.title)
              if (name) saveTemplate(templateFromTask(task, name))
            }}
          >
            另存为模板
          </button>
          <button
            type="button"
            className="ghost-button small"
            onClick={() => setShowTemplatePicker(true)}
          >
            应用模板
          </button>
          <StatusSelectBadge status={task.status} onChange={(status) => onChangeStatus(task.id, status)} />
        </div>
      </div>

      {showTemplatePicker && (
        <TemplatePickerDialog
          onApply={(partial) => onUpdateTask(task.id, partial)}
          onClose={() => setShowTemplatePicker(false)}
        />
      )}

      <label className="field">
        <span>标题</span>
        <input value={task.title} onChange={(event) => onUpdateTask(task.id, { title: event.target.value })} />
      </label>

      <NoteEditorField
        label="笔记 / 描述"
        value={task.note}
        onChange={(note) => onUpdateTask(task.id, { note })}
        placeholder="补背景、目标、交付物或 checklist。把这条任务写成一段真正能接手的上下文。"
        minRows={6}
        maxRows={14}
      />

      <div className={`${styles.detailGrid} ${styles.detailGridMeta}`}>
        <label className="field">
          <span>清单</span>
          <select value={task.listId} onChange={(event) => onUpdateTask(task.id, { listId: event.target.value })}>
            {lists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>优先级</span>
          <select value={task.priority} onChange={(event) => onUpdateTask(task.id, { priority: event.target.value as Priority })}>
            {Object.entries(priorityMeta).map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={`${styles.detailGrid} ${styles.detailGridPeople}`}>
        <div className="field">
          <span>负责人</span>
          <div className={styles.taskDetailAssignee}>
            <select
              value={task.assignee ?? ''}
              onChange={(e) => onUpdateTask(task.id, { assignee: e.target.value || null })}
            >
              <option value="">未指定</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name || member.email || member.id}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <span>协作者</span>
          <div className={styles.taskDetailCollaborators}>
            {members.length === 0 ? (
              <span className={styles.taskDetailEmptyHint}>暂无协作者</span>
            ) : (
              members.map((member) => {
                const isSelected = (task.collaborators ?? []).includes(member.id)
                return (
                  <button
                    key={member.id}
                    type="button"
                    className={`${styles.collabChip} ${isSelected ? 'is-active' : ''}`}
                    onClick={() => {
                      const current = task.collaborators ?? []
                      onUpdateTask(task.id, {
                        collaborators: isSelected
                          ? current.filter((id) => id !== member.id)
                          : [...current, member.id],
                      })
                    }}
                  >
                    {member.name || member.email || member.id}
                  </button>
                )
              })
            )}
          </div>
        </div>
      </div>

      <div className={`${styles.detailGrid} ${styles.detailGridSchedule}`}>
        <label className="field">
          <span>开始时间</span>
          <input type="datetime-local" value={toLocalInputValue(task.startAt)} onChange={(event) => onUpdateTask(task.id, { startAt: event.target.value || null })} />
        </label>
        <label className="field">
          <span>计划完成</span>
          <input type="datetime-local" value={toLocalInputValue(task.dueAt)} onChange={(event) => onUpdateTask(task.id, { dueAt: event.target.value || null })} />
        </label>
        <label className="field">
          <span>硬性 DDL</span>
          <input type="datetime-local" value={toLocalInputValue(task.deadlineAt ?? null)} onChange={(event) => onUpdateTask(task.id, { deadlineAt: event.target.value || null })} />
        </label>
      </div>
      <div className={styles.detailScheduleNote}>
        <TaskTimeSummary task={task} />
        <p className="muted">日历与时间线继续跟随开始时间 / 计划完成；DDL 只作为风险约束与到期判断。</p>
        {isTaskPlannedAfterDeadline(task) && <p className={styles.detailScheduleWarning}>当前计划完成时间晚于 DDL，建议立即重排计划或调整承诺。</p>}
      </div>

      <div className="field">
        <span>重复</span>
        <select
          value={task.repeatRule && task.repeatRule !== '不重复' && !['每天','每周','每月','工作日'].includes(task.repeatRule) ? task.repeatRule : (
            task.repeatRule === '每天' ? 'daily' :
            task.repeatRule === '工作日' ? 'weekdays' :
            task.repeatRule === '每周' ? 'weekly' :
            task.repeatRule === '每月' ? 'monthly' :
            task.repeatRule || ''
          )}
          onChange={(event) => onUpdateTask(task.id, { repeatRule: event.target.value })}
        >
          <option value="">不重复</option>
          <option value="daily">每天</option>
          <option value="weekdays">每个工作日</option>
          <option value="weekly">每周</option>
          <option value="monthly">每月</option>
          <option value="yearly">每年</option>
          <option value="custom:2d">每 2 天</option>
          <option value="custom:3d">每 3 天</option>
          <option value="custom:2w">每 2 周</option>
        </select>
        {task.repeatRule && task.repeatRule !== '' && task.repeatRule !== '不重复' && (
          <span style={{ fontSize: 11, opacity: 0.5, marginLeft: 4 }}>
            ↻ {describeRepeatRule(task.repeatRule)}
          </span>
        )}
      </div>

      <div className={`${styles.detailSection} ${styles.detailSectionCompact}`}>
        <div className={styles.sectionTitleRow}>
          <h4>完成状态</h4>
        </div>
        <div className="action-row" data-onboarding-anchor="task-complete">
          <button className={`ghost-button small ${task.completed ? 'is-pressed' : ''}`} onClick={() => onToggleComplete(task.id)}>
            {task.completed ? '标记未完成' : '标记完成'}
          </button>
        </div>
      </div>

      <div className={`${styles.detailSection} ${styles.detailSectionCompact}`}>
        <TagPicker
          title="标签"
          tags={tags}
          selectedTagIds={task.tagIds}
          onToggleTag={(tagId) =>
            onUpdateTask(task.id, {
              tagIds: task.tagIds.includes(tagId) ? task.tagIds.filter((item) => item !== tagId) : [...task.tagIds, tagId],
            })
          }
          onManageTags={onManageTags}
          manageLabel="新建 / 管理标签"
        />
      </div>

      <div className={`${styles.detailSection} ${styles.detailSectionReminder}`} data-onboarding-anchor="detail-reminder">
        <div className={styles.sectionTitleRow}>
          <h4>提醒</h4>
          <span>{task.reminders.length} 条</span>
        </div>

        <div className="reminder-composer">
          <div className="reminder-composer__header">
            <strong>把提醒挂到正确的时间语义上</strong>
            <p>相对提醒会跟着所选时间锚点走；固定提醒适合一次性的精确提醒。</p>
          </div>

          <div className="reminder-anchor-grid">
            {reminderAnchors.map((anchor) => (
              <button
                key={anchor.value}
                type="button"
                className={`reminder-anchor-card ${relativeAnchor === anchor.value ? 'is-active' : ''}`}
                disabled={!anchor.timeValue}
                onClick={() => setRelativeAnchor(anchor.value)}
              >
                <strong>{anchor.label}</strong>
                <span>{anchor.timeValue ? formatDateTime(anchor.timeValue) : '先设置该时间'}</span>
              </button>
            ))}
          </div>

          <div className="reminder-preset-row">
            {[
              { amount: 0, unit: 'm' as const },
              { amount: 15, unit: 'm' as const },
              { amount: 30, unit: 'm' as const },
              { amount: 1, unit: 'h' as const },
              { amount: 2, unit: 'h' as const },
              { amount: 1, unit: 'd' as const },
            ].map((preset) => (
              <button
                key={`${preset.amount}-${preset.unit}`}
                type="button"
                className="ghost-button tiny"
                disabled={!reminderAnchors.some((item) => item.value === relativeAnchor && item.timeValue)}
                onClick={() => handleAddRelativeReminder(relativeAnchor, preset.amount, preset.unit)}
              >
                {formatReminderOffsetLabel(preset.amount, preset.unit)}
              </button>
            ))}
          </div>

          <div className="reminder-custom-grid">
            <label className="field">
              <span>自定义提前量</span>
              <div className="reminder-inline-controls">
                <input type="number" min="0" value={relativeAmount} onChange={(event) => setRelativeAmount(event.target.value)} />
                <select value={relativeUnit} onChange={(event) => setRelativeUnit(event.target.value as (typeof REMINDER_UNIT_OPTIONS)[number])}>
                  <option value="m">分钟</option>
                  <option value="h">小时</option>
                  <option value="d">天</option>
                </select>
                <button
                  type="button"
                  className="primary-button small"
                  disabled={!reminderAnchors.some((item) => item.value === relativeAnchor && item.timeValue)}
                  onClick={() => handleAddRelativeReminder()}
                >
                  添加相对提醒
                </button>
              </div>
            </label>

            <label className="field">
              <span>固定提醒时间</span>
              <div className="reminder-inline-controls reminder-inline-controls--absolute">
                <input type="datetime-local" value={absoluteReminderAt} onChange={(event) => setAbsoluteReminderAt(event.target.value)} />
                <button type="button" className="ghost-button small" onClick={handleAddAbsoluteReminder}>
                  添加固定提醒
                </button>
              </div>
            </label>
          </div>
        </div>

        <div className="stack-list reminder-rule-list">
          {reminderRows.length === 0 ? (
            <div className="reminder-empty reminder-empty--detail">
              <strong>还没有提醒</strong>
              <span>建议至少留一条"按 DDL"或"按计划完成"的相对提醒，避免任务到了才被动发现。</span>
            </div>
          ) : (
            reminderRows.map(({ reminder, description }) => (
              <div key={reminder.id} className="reminder-rule-card">
                <div className="reminder-rule-card__main">
                  <div className="reminder-rule-card__title-row">
                    <strong>{description.label}</strong>
                    <span className="reminder-rule-card__anchor">{description.anchorLabel}</span>
                  </div>
                  <p>{description.triggerAtLabel}</p>
                  {description.disabledReason && <small className={styles.detailInlineError}>{description.disabledReason}</small>}
                </div>
                <button className="ghost-button small" onClick={() => onRemoveReminder(task.id, reminder.id)}>
                  删除
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className={styles.detailSection}>
        <div className={styles.sectionTitleRow}>
          <h4>子任务</h4>
          <span>
            {task.subtasks.filter((item) => item.completed).length}/{task.subtasks.length}
          </span>
        </div>
        <div className="stack-list">
          {task.subtasks.map((subtask) => (
            <label key={subtask.id} className="stack-item subtask-item">
              <input type="checkbox" checked={subtask.completed} onChange={() => onToggleSubtask(task.id, subtask.id)} />
              <span>{subtask.title}</span>
            </label>
          ))}
        </div>
        <div className="inline-adder">
          <input value={subtaskDraft} onChange={(event) => setSubtaskDraft(event.target.value)} placeholder="添加子任务…" />
          <button
            className="ghost-button small"
            onClick={() => {
              onAddSubtask(task.id, subtaskDraft)
              setSubtaskDraft('')
            }}
          >
            添加
          </button>
        </div>
      </div>

      <div className={styles.detailSection}>
        <div className={styles.sectionTitleRow}>
          <h4>附件</h4>
          <span>{task.attachments.length} 个</span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            const files = Array.from(event.target.files ?? [])
            if (files.length > 0) {
              void handleBrowserFileSelection(files)
            }
            event.currentTarget.value = ''
          }}
        />
        <div className="stack-list attachment-list">
          {task.attachments.length === 0 ? (
            <div className="reminder-empty reminder-empty--detail">
              <strong>还没有附件</strong>
              <span>{desktopMode ? '桌面端会直接挂本地文件，适合真实工作流。' : '网页端会保留小文件副本，便于这个 demo 直接打开。'}</span>
            </div>
          ) : (
            task.attachments.map((attachment) => (
              <div key={attachment.id} className="attachment-row">
                <button type="button" className="attachment-row__main" onClick={() => void onOpenAttachment(attachment)}>
                  <strong>{attachment.name}</strong>
                  <span>{getAttachmentMetaLabel(attachment)}</span>
                </button>
                <div className="action-row">
                  <button type="button" className="ghost-button small" onClick={() => void onOpenAttachment(attachment)}>
                    打开
                  </button>
                  <button type="button" className="ghost-button small danger" onClick={() => onRemoveAttachment(task.id, attachment.id)}>
                    移除
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="attachment-toolbar">
          <button type="button" className="ghost-button small" onClick={() => void handlePickAttachments()}>
            选择文件
          </button>
          <span className="muted">
            {desktopMode
              ? '桌面端优先挂本地文件；点击附件可直接打开原文件。'
              : `网页端当前支持 ${Math.round(MAX_EMBEDDED_ATTACHMENT_BYTES / 1024 / 1024)}MB 内的小文件。`}
          </span>
        </div>
        {attachmentError && <p className={styles.detailInlineError}>{attachmentError}</p>}
      </div>

      <div className={styles.detailSection}>
        <div className={styles.sectionTitleRow}>
          <h4>评论</h4>
          <span>{task.comments.length} 条</span>
        </div>
        <div className="stack-list">
          {task.comments.map((comment) => (
            <div key={comment.id} className="comment-item">
              <div>
                <strong>{comment.author}</strong>
                <small>{formatDateTime(comment.createdAt)}</small>
              </div>
              <p>{comment.content}</p>
            </div>
          ))}
        </div>
        <div className="inline-adder textarea">
          <textarea rows={2} value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} placeholder="写一条评论…" />
          <button
            className="primary-button small"
            onClick={() => {
              if (!commentDraft.trim()) return
              onAddComment(task.id, { id: makeId('comment'), author: '我', content: commentDraft.trim(), createdAt: getNowIso() })
              setCommentDraft('')
            }}
          >
            发送
          </button>
        </div>
      </div>

      <div className={styles.detailSection}>
        <div className={styles.sectionTitleRow}>
          <h4>活动流</h4>
          <span>{task.activity.length} 条</span>
        </div>
        <div className="stack-list">
          {task.activity.map((item) => (
            <div key={item.id} className="stack-item activity-item">
              <span>{item.content}</span>
              <small>{formatDateTime(item.createdAt)}</small>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
