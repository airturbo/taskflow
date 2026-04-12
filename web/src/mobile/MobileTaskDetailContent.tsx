import { useState, useEffect, useRef } from 'react'
import type { Task, TodoList, Tag, Priority, TaskStatus, TaskAttachment } from '../types/domain'
import { statusMeta } from '@taskflow/core'
import { getDateKey, addDays, shiftDateTimeByDays } from '../utils/dates'
import { toLocalInputValue } from '../utils/workspace-helpers'
import { supabase } from '../utils/supabase'

/**
 * MobileTaskDetailContent — 手机端任务详情内容
 *
 * 三层信息架构：
 *   核心层（始终显示）: 标题、状态、优先级、所属清单
 *   时间层（有值才显示）: dueAt / deadlineAt / startAt
 *   扩展层（折叠）: 备注、子任务、标签
 *
 * 与 TaskDetailPanel 的区别：
 *   - 去掉提醒/附件/评论复杂模块（手机端留给后续版本）
 *   - 所有字段内联编辑
 *   - 固定底部操作栏：完成 / 推迟到明天 / 删除
 */
export function MobileTaskDetailContent({
  task,
  lists,
  tags,
  onUpdateTask,
  onToggleComplete,
  onClose,
}: {
  task: Task
  lists: TodoList[]
  tags: Tag[]
  onUpdateTask: (taskId: string, patch: Partial<Task>) => void
  onToggleComplete: (taskId: string) => void
  onClose: () => void
}) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(task.title)
  const [notesDraft, setNotesDraft] = useState(task.notes ?? '')
  const [showSubtasks, setShowSubtasks] = useState(false)
  const [subtaskDraft, setSubtaskDraft] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Sync drafts when task prop changes (e.g. external update while sheet is open)
  useEffect(() => {
    if (!editingTitle) setTitleDraft(task.title)
  }, [task.title, editingTitle])
  useEffect(() => {
    setNotesDraft(task.notes ?? '')
  }, [task.notes])

  const todayKey = getDateKey()
  const taskList = lists.find(l => l.id === task.listId)

  const priorities: { value: Priority; label: string; color: string }[] = [
    { value: 'urgent', label: 'P1 紧急', color: '#ef4444' },
    { value: 'high', label: 'P2 高', color: '#f59e0b' },
    { value: 'normal', label: 'P3 普通', color: '#6c63ff' },
    { value: 'low', label: 'P4 低', color: '#94a3b8' },
  ]

  const handleTitleBlur = () => {
    setEditingTitle(false)
    if (titleDraft.trim() && titleDraft !== task.title) {
      onUpdateTask(task.id, { title: titleDraft.trim() })
    }
  }

  const handleNotesBlur = () => {
    if (notesDraft !== (task.note ?? '')) {
      onUpdateTask(task.id, { note: notesDraft })
    }
  }

  const handleSnooze = () => {
    const newDueAt = task.dueAt
      ? shiftDateTimeByDays(task.dueAt, 1)
      : `${addDays(todayKey, 1)}T09:00:00`
    onUpdateTask(task.id, { dueAt: newDueAt, completed: false })
    onClose()
  }

  const handleDelete = () => {
    onUpdateTask(task.id, { deleted: true })
    onClose()
  }

  async function handleAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      let url = ''
      let attachPath = ''
      if (supabase) {
        const uploadPath = `${task.id}/${Date.now()}-${file.name}`
        const { data, error } = await supabase.storage.from('task-attachments').upload(uploadPath, file)
        if (!error && data) {
          const { data: pub } = supabase.storage.from('task-attachments').getPublicUrl(data.path)
          url = pub.publicUrl
          attachPath = data.path
        }
      }
      if (!url) {
        url = await new Promise<string>((res, rej) => {
          const r = new FileReader()
          r.onload = () => res(r.result as string)
          r.onerror = rej
          r.readAsDataURL(file)
        })
      }
      const attachment = {
        id: crypto.randomUUID(),
        name: file.name,
        source: 'upload' as const,
        path: attachPath || url,
        dataUrl: url,
        mimeType: file.type,
        size: file.size,
        addedAt: new Date().toISOString(),
      }
      onUpdateTask(task.id, { attachments: [...((task as any).attachments ?? []), attachment] })
    } catch (err) {
      setUploadError('上传失败，请重试')
      console.error('[Attachments]', err)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleAddSubtask = () => {
    if (!subtaskDraft.trim()) return
    // 通过在 task.subtasks 上添加新条目
    const newSubtask = { id: `sub-${Date.now()}`, title: subtaskDraft.trim(), completed: false }
    onUpdateTask(task.id, { subtasks: [...(task.subtasks ?? []), newSubtask] })
    setSubtaskDraft('')
  }

  return (
    <div className="mobile-task-detail">
      {/* ─── 核心层 ─── */}
      <div className="mobile-task-detail__core">
        {/* 标题（点击内联编辑） */}
        {editingTitle ? (
          <input
            autoFocus
            className="mobile-task-detail__title-input"
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={e => { if (e.key === 'Enter') handleTitleBlur() }}
          />
        ) : (
          <h2
            className={`mobile-task-detail__title ${task.completed ? 'is-completed' : ''}`}
            onClick={() => { setTitleDraft(task.title); setEditingTitle(true) }}
          >{task.title}</h2>
        )}

        {/* 所属清单（可切换） */}
        <div className="mobile-task-detail__meta-row">
          <div className="mobile-task-detail__list-select-wrap" style={{ borderColor: taskList?.color ?? 'var(--border)' }}>
            {taskList && <span className="mobile-task-detail__list-dot" style={{ background: taskList.color }} />}
            <select
              className="mobile-task-detail__list-select"
              value={task.listId ?? ''}
              onChange={e => onUpdateTask(task.id, { listId: e.target.value })}
            >
              {lists.map(list => (
                <option key={list.id} value={list.id}>{list.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 状态选择器 */}
        <div className="mobile-task-detail__status-row">
          {(['todo', 'doing', 'done'] as TaskStatus[]).map(s => (
            <button
              key={s}
              className={`mobile-task-detail__status-btn status-btn--${s} ${task.status === s ? 'is-active' : ''}`}
              onClick={() => onUpdateTask(task.id, { status: s })}
            >{statusMeta[s]}</button>
          ))}
        </div>
      </div>

      {/* ─── 优先级选择器 ─── */}
      <div className="mobile-task-detail__section">
        <p className="mobile-task-detail__section-label">优先级</p>
        <div className="mobile-task-detail__priority-row">
          {priorities.map(p => (
            <button
              key={p.value}
              className={`mobile-task-detail__priority-btn ${task.priority === p.value ? 'is-active' : ''}`}
              style={task.priority === p.value ? { background: p.color, borderColor: p.color } : {}}
              onClick={() => onUpdateTask(task.id, { priority: p.value })}
            >{p.label}</button>
          ))}
        </div>
      </div>

      {/* ─── 时间层 ─── */}
      <div className="mobile-task-detail__section">
        <p className="mobile-task-detail__section-label">时间</p>
        <div className="mobile-task-detail__time-fields">
          <label className="mobile-task-detail__time-field">
            <span>计划完成</span>
            <input
              type="datetime-local"
              style={{ fontSize: 16 }}
              value={task.dueAt ? toLocalInputValue(task.dueAt) : ''}
              onChange={e => onUpdateTask(task.id, { dueAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
            />
          </label>
          <label className="mobile-task-detail__time-field">
            <span>最终期限</span>
            <input
              type="datetime-local"
              style={{ fontSize: 16 }}
              value={task.deadlineAt ? toLocalInputValue(task.deadlineAt) : ''}
              onChange={e => onUpdateTask(task.id, { deadlineAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
            />
          </label>
          <label className="mobile-task-detail__time-field">
            <span>开始时间</span>
            <input
              type="datetime-local"
              style={{ fontSize: 16 }}
              value={task.startAt ? toLocalInputValue(task.startAt) : ''}
              onChange={e => onUpdateTask(task.id, { startAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
            />
          </label>
        </div>
      </div>

      {/* ─── 标签 ─── */}
      {tags.length > 0 && (
        <div className="mobile-task-detail__section">
          <p className="mobile-task-detail__section-label">标签</p>
          <div className="mobile-task-detail__tags">
            {tags.map(tag => {
              const active = (task.tagIds ?? []).includes(tag.id)
              return (
                <button
                  key={tag.id}
                  className={`mobile-task-detail__tag-chip ${active ? 'is-active' : ''}`}
                  style={active ? { background: tag.color, borderColor: tag.color } : {}}
                  onClick={() => {
                    const current = task.tagIds ?? []
                    onUpdateTask(task.id, {
                      tagIds: active ? current.filter(id => id !== tag.id) : [...current, tag.id]
                    })
                  }}
                >#{tag.name}</button>
              )
            })}
          </div>
        </div>
      )}

      {/* ─── 层 1：备注（始终可见）─── */}
      <div className="mobile-task-detail__section">
        <p className="mobile-task-detail__section-label">备注</p>
        <textarea
          className="mobile-task-detail__notes"
          placeholder="添加备注…"
          value={notesDraft}
          onChange={e => setNotesDraft(e.target.value)}
          onBlur={handleNotesBlur}
          rows={4}
        />
      </div>

      {/* ─── 扩展层：子任务 ─── */}
      <div className="mobile-task-detail__section">
        <button
          className="mobile-task-detail__expand-toggle"
          onClick={() => setShowSubtasks(v => !v)}
        >
          {showSubtasks ? '▾' : '▸'} 子任务{(task.subtasks?.length ?? 0) > 0 ? ` (${task.subtasks?.filter(s => !s.completed).length}/${task.subtasks?.length})` : ''}
        </button>
        {showSubtasks && (
          <div className="mobile-task-detail__subtasks">
            {(task.subtasks ?? []).map(sub => (
              <div key={sub.id} className={`mobile-task-detail__subtask ${sub.completed ? 'is-done' : ''}`}>
                <button
                  className={`check-button ${sub.completed ? 'is-checked' : ''}`}
                  onClick={() => {
                    onUpdateTask(task.id, {
                      subtasks: task.subtasks?.map(s =>
                        s.id === sub.id ? { ...s, completed: !s.completed } : s
                      ) ?? []
                    })
                  }}
                >{sub.completed ? '✓' : ''}</button>
                <span>{sub.title}</span>
              </div>
            ))}
            <div className="mobile-task-detail__subtask-add">
              <input
                className="mobile-task-detail__subtask-input"
                placeholder="添加子任务…"
                value={subtaskDraft}
                onChange={e => setSubtaskDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddSubtask() }}
              />
              <button
                onClick={handleAddSubtask}
                disabled={!subtaskDraft.trim()}
                className={!subtaskDraft.trim() ? 'is-disabled' : ''}
              >+</button>
            </div>
          </div>
        )}
      </div>

      {/* 附件 */}
      <div className="mobile-detail__section">
        <div className="mobile-detail__section-header">
          <span className="mobile-detail__section-icon">📎</span>
          <span className="mobile-detail__section-label">附件</span>
          {(task as any).attachments?.length ? (
            <span className="mobile-detail__section-count">{(task as any).attachments.length}</span>
          ) : null}
        </div>
        <div className="mobile-detail__attachments-list">
          {(task as any).attachments?.map((a: any) => (
            <div key={a.id} className="mobile-detail__attachment-item">
              {a.mimeType?.startsWith('image/') ? (
                <img src={a.dataUrl || a.path} alt={a.name} className="mobile-detail__attachment-thumb" />
              ) : (
                <span className="mobile-detail__attachment-file-icon">📄</span>
              )}
              <span className="mobile-detail__attachment-name">{a.name}</span>
            </div>
          ))}
        </div>
        {uploading && <p className="mobile-detail__upload-status">上传中…</p>}
        {uploadError && <p className="mobile-detail__upload-error">{uploadError}</p>}
        <div className="mobile-detail__attach-actions">
          <label className="ghost-button small">
            📷 拍照
            <input
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={handleAttach}
              disabled={uploading}
            />
          </label>
          <label className="ghost-button small">
            🖼 相册
            <input
              type="file"
              accept="image/*,application/pdf"
              style={{ display: 'none' }}
              onChange={handleAttach}
              disabled={uploading}
            />
          </label>
        </div>
        <span className="mobile-attach-hint">最大 5MB，支持图片和文档</span>
      </div>

      {/* ─── 底部操作栏（固定）─── */}
      <div className="mobile-task-detail__footer">
        <button
          className={`mobile-task-detail__footer-btn mobile-detail-footer-btn mobile-task-detail__footer-complete ${task.completed ? 'is-done' : ''}`}
          onClick={() => { onToggleComplete(task.id); onClose() }}
        >
          {task.completed ? '重新打开' : '✓ 完成'}
        </button>
        <button
          className="mobile-task-detail__footer-btn mobile-detail-footer-btn mobile-task-detail__footer-snooze"
          onClick={handleSnooze}
        >明天再做</button>
        <button
          className="mobile-task-detail__footer-btn mobile-detail-footer-btn mobile-task-detail__footer-delete"
          onClick={handleDelete}
        >删除</button>
      </div>
    </div>
  )
}
