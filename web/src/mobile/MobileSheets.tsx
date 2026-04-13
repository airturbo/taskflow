import { useState, useEffect, useRef } from 'react'
import type { TodoList, Tag, Priority } from '../types/domain'
import styles from './MobileSheets.module.css'

// Extend Window for browsers that only expose the prefixed API
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition
    webkitSpeechRecognition: typeof SpeechRecognition
  }
}
import { TAG_COLOR_PRESETS, SPECIAL_TAG_IDS } from '@taskflow/core'
import { isSystemTagId } from '../utils/workspace-helpers'
import { getDateKey, addDays } from '../utils/dates'

export function MobileQuickCreateSheet({
  onClose,
  onSubmit,
  contextLabel,
  lists,
  tags,
  defaultListId,
  defaultDueAt,
}: {
  onClose: () => void
  onSubmit: (title: string, listId: string, startAt: string | null, dueAt: string | null, deadlineAt: string | null, priority: Priority, tagIds: string[]) => void
  contextLabel: string
  lists: TodoList[]
  tags: Tag[]
  defaultListId: string
  defaultDueAt: string | null
}) {
  const [value, setValue] = useState('')
  const [selectedListId, setSelectedListId] = useState(defaultListId)
  const [selectedStartAt, setSelectedStartAt] = useState<string | null>(null)
  const [selectedDueAt, setSelectedDueAt] = useState<string | null>(defaultDueAt)
  const [selectedDeadlineAt, setSelectedDeadlineAt] = useState<string | null>(null)
  const [selectedPriority, setSelectedPriority] = useState<Priority>('normal')
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [showAdvanced, setShowAdvanced] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Voice input ──────────────────────────────────────────────────────────
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<InstanceType<typeof SpeechRecognition> | null>(null)
  const [voiceSupported] = useState(
    () => typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
  )

  const handleVoiceInput = () => {
    // Stop any in-progress session first (acts as a toggle)
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
      setIsListening(false)
      return
    }

    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SR) return

    const recognition = new SR()
    recognition.lang = 'zh-CN'
    recognition.continuous = false
    recognition.interimResults = false

    recognition.onstart = () => setIsListening(true)
    recognition.onend   = () => { setIsListening(false); recognitionRef.current = null }
    recognition.onerror = () => { setIsListening(false); recognitionRef.current = null }

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = e.results[0][0].transcript
      // Append to existing text if the field already has content, otherwise replace
      setValue(prev => prev ? `${prev}${transcript}` : transcript)
      // Refocus the input so the user can continue editing
      window.setTimeout(() => inputRef.current?.focus(), 50)
    }

    recognitionRef.current = recognition
    recognition.start()
  }

  // Abort recognition if the sheet is unmounted while listening
  useEffect(() => {
    return () => { recognitionRef.current?.stop() }
  }, [])
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.setTimeout(() => inputRef.current?.focus(), 100)
    return () => { document.body.style.overflow = prev }
  }, [])

  const toggleTag = (tagId: string) => {
    setSelectedTagIds(prev => prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId])
  }

  const handleSubmit = () => {
    if (!value.trim()) return
    onSubmit(value, selectedListId, selectedStartAt, selectedDueAt, selectedDeadlineAt, selectedPriority, selectedTagIds)
    setValue('')
  }

  const priorities: { value: Priority; label: string }[] = [
    { value: 'urgent', label: 'P1' },
    { value: 'high', label: 'P2' },
    { value: 'normal', label: 'P3' },
    { value: 'low', label: 'P4' },
  ]

  // 快捷日期选项（用于 dueAt）
  const today = getDateKey()
  const tomorrow = addDays(today, 1)
  const nextWeek = addDays(today, 7)
  const quickDates = [
    { label: '今天', value: `${today}T09:00:00` },
    { label: '明天', value: `${tomorrow}T09:00:00` },
    { label: '下周', value: `${nextWeek}T09:00:00` },
    { label: '无', value: null },
  ]

  return (
    <div className="task-sheet-layer" role="dialog" aria-modal="true" aria-label="快速创建">
      <button className="task-sheet-backdrop" onClick={onClose} aria-label="关闭" />
      <div className={`task-sheet panel ${styles.mobileQuickCreateSheet}`}>
        <div className="task-sheet__handle-area">
          <div className="task-sheet__handle" />
        </div>
        <div className={styles.mobileQuickCreateBody}>
          <p className={styles.mobileQuickCreateContext}>{contextLabel}</p>
          {/* Input row: text field + optional mic button */}
          <div className={styles.mobileQuickCreateInputRow}>
            <input
              ref={inputRef}
              className={styles.mobileQuickCreateInput}
              placeholder="输入任务标题…"
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && value.trim()) handleSubmit() }}
            />
            {voiceSupported && (
              <button
                type="button"
                className={`${styles.voiceInputBtn} ${isListening ? 'is-listening' : ''}`}
                onClick={handleVoiceInput}
                title={isListening ? '停止录音' : '语音输入'}
                aria-label={isListening ? '停止录音' : '语音输入'}
              >
                🎤
              </button>
            )}
          </div>

          {/* 快捷日期选择（计划完成时间） */}
          <div className={styles.mobileQuickCreateSection}>
            <p className={styles.mobileQuickCreateSectionLabel}>计划完成</p>
            <div className={styles.mobileQuickCreateDateChips}>
              {quickDates.map(opt => (
                <button
                  key={opt.label}
                  className={`${styles.mobileQuickCreateDateChip} ${selectedDueAt === opt.value ? 'is-active' : ''} ${opt.value === null && selectedDueAt === null ? 'is-active' : ''}`}
                  onClick={() => setSelectedDueAt(opt.value)}
                >{opt.label}</button>
              ))}
              {/* 自定义时间按钮 */}
              <label className={`${styles.mobileQuickCreateDateChip} ${styles.mobileQuickCreateDateCustom} ${selectedDueAt && !quickDates.some(o => o.value === selectedDueAt) ? 'is-active' : ''}`}>
                {selectedDueAt && !quickDates.some(o => o.value === selectedDueAt)
                  ? selectedDueAt.slice(0, 10)
                  : '自定义'}
                <input
                  type="datetime-local"
                  value={selectedDueAt ?? ''}
                  onChange={e => setSelectedDueAt(e.target.value || null)}
                  style={{ position: 'absolute', opacity: 0, inset: 0, width: '100%', height: '100%', fontSize: 16 }}
                />
              </label>
            </div>
          </div>

          {/* 优先级选择 */}
          <div className={styles.mobileQuickCreateRow}>
            <label>优先级</label>
            <div className={styles.mobileQuickCreatePriorityRow}>
              {priorities.map(p => (
                <button
                  key={p.value}
                  className={`${styles.mobileQuickCreatePriorityBtn} p-${p.value} ${selectedPriority === p.value ? 'is-active' : ''}`}
                  onClick={() => setSelectedPriority(p.value)}
                >{p.label}</button>
              ))}
            </div>
          </div>

          {/* 清单选择 */}
          <div className={styles.mobileQuickCreateRow}>
            <label>清单</label>
            <select value={selectedListId} onChange={e => setSelectedListId(e.target.value)}>
              {lists.map(list => (
                <option key={list.id} value={list.id}>{list.name}</option>
              ))}
            </select>
          </div>

          {/* 标签选择 */}
          {tags.length > 0 && (
            <div className={styles.mobileQuickCreateRow}>
              <label>标签</label>
              <div className={styles.mobileQuickCreateTags}>
                {tags.map(tag => (
                  <button
                    key={tag.id}
                    className={`${styles.mobileQuickCreateTagChip} ${selectedTagIds.includes(tag.id) ? 'is-active' : ''}`}
                    onClick={() => toggleTag(tag.id)}
                    style={selectedTagIds.includes(tag.id) ? { background: tag.color, borderColor: tag.color } : {}}
                  >#{tag.name}</button>
                ))}
              </div>
            </div>
          )}

          {/* 高级选项（开始时间 + DDL） */}
          <button
            className={styles.mobileQuickCreateAdvancedToggle}
            onClick={() => setShowAdvanced(v => !v)}
          >
            {showAdvanced ? '▾ 收起高级选项' : '▸ 开始时间 / 最终期限'}
          </button>
          {showAdvanced && (
            <div className={styles.mobileQuickCreateAdvanced}>
              <div className={`${styles.mobileQuickCreateRow} ${styles.mobileQuickCreateTimeRow}`}>
                <label>开始时间</label>
                <input
                  type="datetime-local"
                  value={selectedStartAt ?? ''}
                  onChange={e => setSelectedStartAt(e.target.value || null)}
                  className={styles.mobileQuickCreateTimeInput}
                />
              </div>
              <div className={`${styles.mobileQuickCreateRow} ${styles.mobileQuickCreateTimeRow}`}>
                <label>最终期限</label>
                <input
                  type="datetime-local"
                  value={selectedDeadlineAt ?? ''}
                  onChange={e => setSelectedDeadlineAt(e.target.value || null)}
                  className={styles.mobileQuickCreateTimeInput}
                />
              </div>
            </div>
          )}

          <button
            className={`primary-button ${styles.mobileQuickCreateSubmit}`}
            disabled={!value.trim()}
            onClick={handleSubmit}
          >
            创建
          </button>
        </div>
      </div>
    </div>
  )
}

export function MobileConfirmSheet({
  message,
  onConfirm,
  onCancel,
}: {
  message: string
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  return (
    <div className="task-sheet-layer" role="dialog" aria-modal="true" aria-label="确认">
      <button className="task-sheet-backdrop" onClick={onCancel} aria-label="取消" />
      <div className={`task-sheet panel ${styles.mobileConfirmSheet}`}>
        <div className="task-sheet__handle-area"><div className="task-sheet__handle" /></div>
        <div className={styles.mobileConfirmBody}>
          <p className={styles.mobileConfirmMessage}>{message}</p>
          <div className={styles.mobileConfirmActions}>
            <button className="ghost-button" onClick={onCancel}>取消</button>
            <button className="primary-button" onClick={onConfirm}>确认</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function MobilePromptSheet({
  message,
  value,
  onChange,
  onSubmit,
  onCancel,
}: {
  message: string
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.setTimeout(() => inputRef.current?.focus(), 100)
    return () => { document.body.style.overflow = prev }
  }, [])

  return (
    <div className="task-sheet-layer" role="dialog" aria-modal="true" aria-label="输入">
      <button className="task-sheet-backdrop" onClick={onCancel} aria-label="取消" />
      <div className={`task-sheet panel ${styles.mobilePromptSheet}`}>
        <div className="task-sheet__handle-area"><div className="task-sheet__handle" /></div>
        <div className={styles.mobilePromptBody}>
          <p className={styles.mobilePromptMessage}>{message}</p>
          <input
            ref={inputRef}
            className={styles.mobilePromptInput}
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onSubmit() }}
          />
          <div className={styles.mobilePromptActions}>
            <button className="ghost-button" onClick={onCancel}>取消</button>
            <button className="primary-button" onClick={onSubmit}>确定</button>
          </div>
        </div>
      </div>
    </div>
  )
}

type TagMutationResult = { ok: true; tagId: string } | { ok: false; message: string }

export function MobileTagManagerSheet({
  tags,
  onClose,
  onCreateTag,
  onUpdateTag,
  onDeleteTag,
}: {
  tags: Tag[]
  onClose: () => void
  onCreateTag: (name: string, color: string) => TagMutationResult
  onUpdateTag: (tagId: string, name: string, color: string) => TagMutationResult
  onDeleteTag: (tagId: string) => TagMutationResult
}) {
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState<string>(TAG_COLOR_PRESETS[0])
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState<string>('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const handleCreate = () => {
    const trimmed = newName.trim()
    if (!trimmed) return
    const result = onCreateTag(trimmed, newColor)
    if (!result.ok) { setError(result.message); return }
    setError(null)
    setNewName('')
    setNewColor(TAG_COLOR_PRESETS[(tags.length + 1) % TAG_COLOR_PRESETS.length])
    inputRef.current?.focus()
  }

  const startEdit = (tag: Tag) => {
    setEditingId(tag.id)
    setEditName(tag.name)
    setEditColor(tag.color)
  }

  const saveEdit = () => {
    if (!editingId) return
    const result = onUpdateTag(editingId, editName.trim() || editName, editColor)
    if (!result.ok) { setError(result.message); return }
    setError(null)
    setEditingId(null)
  }

  const handleDelete = (tagId: string) => {
    const result = onDeleteTag(tagId)
    if (!result.ok) { setError(result.message); return }
    setError(null)
    if (editingId === tagId) setEditingId(null)
  }

  return (
    <div className="task-sheet-layer" role="dialog" aria-modal="true" aria-label="标签管理">
      <button className="task-sheet-backdrop" onClick={onClose} aria-label="关闭" />
      <div className={`task-sheet panel ${styles.mobileTagManagerSheet}`}>
        <div className="task-sheet__handle-area">
          <div className="task-sheet__handle" />
        </div>

        {/* 标题栏 */}
        <div className={styles.mobileTagManagerHeader}>
          <h3>标签管理</h3>
          <span className={styles.mobileTagManagerCount}>{tags.length} 个标签</span>
          <button className={styles.mobileTagManagerClose} onClick={onClose} aria-label="关闭">✕</button>
        </div>

        {/* 新建标签 */}
        <div className={styles.mobileTagManagerCreate}>
          <div className={styles.mobileTagManagerCreateRow}>
            {/* 颜色圆点 — 点击弹出 color swatches */}
            <button
              className={styles.mobileTagManagerColorDot}
              style={{ background: newColor }}
              aria-label="选择颜色"
              onClick={() => {
                const next = TAG_COLOR_PRESETS[(TAG_COLOR_PRESETS.indexOf(newColor) + 1) % TAG_COLOR_PRESETS.length]
                setNewColor(next)
              }}
            />
            <input
              ref={inputRef}
              className={styles.mobileTagManagerCreateInput}
              placeholder="新标签名称…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
              style={{ fontSize: 16 }}
            />
            <button
              className={styles.mobileTagManagerCreateBtn}
              disabled={!newName.trim()}
              onClick={handleCreate}
            >添加</button>
          </div>
          {/* 颜色 swatches */}
          <div className={styles.mobileTagManagerSwatches}>
            {TAG_COLOR_PRESETS.map(c => (
              <button
                key={c}
                className={`${styles.mobileTagSwatch} ${c === newColor ? 'is-active' : ''}`}
                style={{ background: c }}
                aria-label={`颜色 ${c}`}
                onClick={() => setNewColor(c)}
              />
            ))}
          </div>
          {error && <p className={styles.mobileTagManagerError}>{error}</p>}
        </div>

        {/* 标签列表 */}
        <div className={styles.mobileTagManagerList}>
          {tags.length === 0 && (
            <p className={styles.mobileTagManagerEmpty}>还没有标签，快来创建第一个吧！</p>
          )}
          {tags.map(tag => {
            const locked = isSystemTagId(tag.id, Object.values(SPECIAL_TAG_IDS))
            const isEditing = editingId === tag.id
            return (
              <div key={tag.id} className={`${styles.mobileTagItem} ${isEditing ? 'is-editing' : ''}`}>
                {isEditing ? (
                  /* 编辑模式 */
                  <div className={styles.mobileTagItemEditRow}>
                    <button
                      className={styles.mobileTagManagerColorDot}
                      style={{ background: editColor }}
                      aria-label="循环选色"
                      onClick={() => {
                        const next = TAG_COLOR_PRESETS[(TAG_COLOR_PRESETS.indexOf(editColor) + 1) % TAG_COLOR_PRESETS.length]
                        setEditColor(next)
                      }}
                    />
                    <input
                      className={styles.mobileTagManagerCreateInput}
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit() }}
                      autoFocus
                      style={{ fontSize: 16 }}
                    />
                    <button className={styles.mobileTagItemSaveBtn} onClick={saveEdit}>保存</button>
                    <button className={styles.mobileTagItemCancelBtn} onClick={() => setEditingId(null)}>✕</button>
                  </div>
                ) : (
                  /* 查看模式 */
                  <div className={styles.mobileTagItemViewRow}>
                    <span className={styles.mobileTagItemDot} style={{ background: tag.color }} />
                    <span className={styles.mobileTagItemName}>#{tag.name}</span>
                    {locked && <span className={styles.mobileTagItemLockBadge}>系统</span>}
                    <div className={styles.mobileTagItemActions}>
                      {!locked && (
                        <>
                          <button className={styles.mobileTagItemEditBtn} onClick={() => startEdit(tag)} aria-label="编辑">
                            <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M11.8536 1.14645C11.6583 0.951184 11.3417 0.951184 11.1464 1.14645L3.71345 8.57942C3.62627 8.66661 3.56196 8.77468 3.52633 8.89317L2.52633 12.1432C2.44916 12.404 2.60595 12.6751 2.86676 12.7522C2.92218 12.7687 2.97847 12.7753 3.03395 12.772L6.33396 12.772C6.46657 12.772 6.59374 12.7193 6.68798 12.6251L14.1210 5.19213C14.3162 4.99687 14.3162 4.68029 14.1210 4.48503L11.8536 2.21762C11.8536 2.21762 11.8536 1.14645 11.8536 1.14645Z" fill="currentColor"/></svg>
                          </button>
                          <button className={styles.mobileTagItemDeleteBtn} onClick={() => handleDelete(tag.id)} aria-label="删除">
                            <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M5.5 1C5.22386 1 5 1.22386 5 1.5C5 1.77614 5.22386 2 5.5 2H9.5C9.77614 2 10 1.77614 10 1.5C10 1.22386 9.77614 1 9.5 1H5.5ZM3 3.5C3 3.22386 3.22386 3 3.5 3H11.5C11.7761 3 12 3.22386 12 3.5C12 3.77614 11.7761 4 11.5 4H3.5C3.22386 4 3 3.77614 3 3.5ZM3.5 5C3.22386 5 3 5.22386 3 5.5V12.5C3 12.7761 3.22386 13 3.5 13H11.5C11.7761 13 12 12.7761 12 12.5V5.5C12 5.22386 11.7761 5 11.5 5H3.5Z" fill="currentColor"/></svg>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
