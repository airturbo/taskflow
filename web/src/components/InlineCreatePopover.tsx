import { useState, useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { InlineCreateDraft, InlineCreatePosition } from '../types/workspace'
import type { WorkspaceView, TodoList, Tag, Priority, TaskStatus } from '../types/domain'
import { statusMeta, priorityMeta } from '@taskflow/core'
import {
  clampInlineCreatePosition,
  getTopDockedInlineCreatePosition,
  normalizeInlineCreatePosition,
  persistInlineCreatePositionMemory,
  INLINE_CREATE_MAX_WIDTH,
  INLINE_CREATE_ESTIMATED_HEIGHT,
  INLINE_CREATE_TOP_DOCK_THRESHOLD,
  INLINE_CREATE_VIEWPORT_GUTTER,
} from '../utils/workspace-helpers'
import { NoteEditorField } from './TaskDetailPanel'
import { TagPicker } from './TagManagementDialog'
import styles from './InlineCreatePopover.module.css'

const viewMeta: { id: WorkspaceView; label: string }[] = [
  { id: 'calendar', label: '日历' },
  { id: 'list', label: '列表' },
  { id: 'kanban', label: '看板' },
  { id: 'timeline', label: '时间线' },
  { id: 'matrix', label: '四象限' },
]

export function InlineCreatePopover({
  draft,
  lists,
  tags,
  onClose,
  onSubmit,
  onChange,
  onToggleTag,
  onManageTags,
}: {
  draft: InlineCreateDraft
  lists: TodoList[]
  tags: Tag[]
  onClose: () => void
  onSubmit: () => void
  onChange: (patch: Partial<InlineCreateDraft>) => void
  onToggleTag: (tagId: string) => void
  onManageTags: () => void
}) {
  const viewLabel = viewMeta.find((item) => item.id === draft.view)?.label ?? '当前视图'
  const popoverRef = useRef<HTMLElement | null>(null)
  const dragStateRef = useRef<{ pointerId: number; offsetX: number; offsetY: number; width: number; height: number } | null>(null)
  const positionRef = useRef<InlineCreatePosition>(draft.position)
  const [position, setPosition] = useState(draft.position)
  const [isDragging, setIsDragging] = useState(false)

  const updatePositionState = (nextPosition: InlineCreatePosition) => {
    positionRef.current = nextPosition
    setPosition(nextPosition)
  }

  useEffect(() => {
    updatePositionState(draft.position)
  }, [draft.position.mode, draft.position.x, draft.position.y])

  useEffect(() => {
    const resolveFloatingPosition = (nextX: number, nextY: number, width?: number, height?: number) => ({
      ...clampInlineCreatePosition(nextX, nextY, width ?? INLINE_CREATE_MAX_WIDTH, height ?? INLINE_CREATE_ESTIMATED_HEIGHT),
      mode: 'floating' as const,
    })

    const snapToTop = (width?: number, height?: number) => {
      const nextPosition = getTopDockedInlineCreatePosition(width ?? INLINE_CREATE_MAX_WIDTH, height ?? INLINE_CREATE_ESTIMATED_HEIGHT)
      updatePositionState(nextPosition)
      persistInlineCreatePositionMemory(nextPosition)
    }

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current
      if (!dragState) return
      event.preventDefault()
      updatePositionState(resolveFloatingPosition(event.clientX - dragState.offsetX, event.clientY - dragState.offsetY, dragState.width, dragState.height))
    }

    const stopDragging = () => {
      dragStateRef.current = null
      setIsDragging(false)
    }

    const handlePointerUp = (event: PointerEvent) => {
      const dragState = dragStateRef.current
      if (!dragState || dragState.pointerId !== event.pointerId) return
      const currentPosition = positionRef.current
      stopDragging()
      if (currentPosition.y <= INLINE_CREATE_TOP_DOCK_THRESHOLD) {
        snapToTop(dragState.width, dragState.height)
        return
      }
      const normalized = resolveFloatingPosition(currentPosition.x, currentPosition.y, dragState.width, dragState.height)
      updatePositionState(normalized)
      persistInlineCreatePositionMemory(normalized)
    }

    const handleResize = () => {
      const rect = popoverRef.current?.getBoundingClientRect()
      const width = rect?.width ?? INLINE_CREATE_MAX_WIDTH
      const height = rect?.height ?? INLINE_CREATE_ESTIMATED_HEIGHT
      const currentPosition = positionRef.current
      const nextPosition = currentPosition.mode === 'top-docked'
        ? getTopDockedInlineCreatePosition(width, height)
        : resolveFloatingPosition(currentPosition.x, currentPosition.y, width, height)
      updatePositionState(nextPosition)
      persistInlineCreatePositionMemory(nextPosition)
    }

    handleResize()
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  const handleHeaderPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return
    const rect = popoverRef.current?.getBoundingClientRect()
    if (!rect) return
    dragStateRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    }
    setIsDragging(true)
  }

  const handleTopDock = () => {
    const rect = popoverRef.current?.getBoundingClientRect()
    const nextPosition = getTopDockedInlineCreatePosition(rect?.width ?? INLINE_CREATE_MAX_WIDTH, rect?.height ?? INLINE_CREATE_ESTIMATED_HEIGHT)
    updatePositionState(nextPosition)
    persistInlineCreatePositionMemory(nextPosition)
  }

  const handleRestoreFloating = () => {
    const rect = popoverRef.current?.getBoundingClientRect()
    const nextPosition = normalizeInlineCreatePosition(
      {
        x: window.innerWidth / 2 - (rect?.width ?? INLINE_CREATE_MAX_WIDTH) / 2,
        y: INLINE_CREATE_VIEWPORT_GUTTER + 92,
        mode: 'floating',
      },
      rect?.width ?? INLINE_CREATE_MAX_WIDTH,
      rect?.height ?? INLINE_CREATE_ESTIMATED_HEIGHT,
    )
    updatePositionState(nextPosition)
    persistInlineCreatePositionMemory(nextPosition)
  }

  return (
    <>
      <button className={styles.backdrop} aria-label="关闭创建小窗" onClick={onClose} />
      <section
        ref={popoverRef}
        className={`${styles.popover} panel${isDragging ? ' is-dragging' : ''}${position.mode === 'top-docked' ? ' is-top-docked' : ''}`}
        style={{ left: position.x, top: position.y }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.hero} onPointerDown={handleHeaderPointerDown}>
          <div>
            <p className="eyebrow">精致创建</p>
            <h3>新任务</h3>
            <p className={`muted ${styles.guidance}`}>{draft.guidance || viewLabel}</p>
            <div className={styles.mobilityRow}>
              <p className={styles.mobilityHint}>顶部可拖动；拖到顶部会自动吸附，并记住你上次停放的位置。</p>
              <button className="ghost-button tiny" type="button" onClick={position.mode === 'top-docked' ? handleRestoreFloating : handleTopDock}>
                {position.mode === 'top-docked' ? '恢复浮动' : '吸附顶部'}
              </button>
            </div>
          </div>
          <button className="ghost-button small" onClick={onClose} aria-label="关闭创建小窗">
            ×
          </button>
        </div>

        <div className={styles.body}>
          <label className={`field ${styles.titleFieldInput}`}>
            <span>任务标题</span>
            <input
              autoFocus
              value={draft.title}
              onChange={(event) => onChange({ title: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) onSubmit()
              }}
              placeholder="例如：把发布前最后一轮体验走查收口"
            />
          </label>

          <NoteEditorField
            label="描述"
            value={draft.note}
            onChange={(note) => onChange({ note })}
            placeholder="补一句背景、交付物或下一步，让这条任务从'一句话'变成真正可执行的工作。"
            minRows={4}
            maxRows={8}
          />

          <div className={styles.grid}>
            <label className="field">
              <span>清单</span>
              <select value={draft.listId} onChange={(event) => onChange({ listId: event.target.value })}>
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>优先级</span>
              <select value={draft.priority} onChange={(event) => onChange({ priority: event.target.value as Priority })}>
                {Object.entries(priorityMeta).map(([value, meta]) => (
                  <option key={value} value={value}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>状态</span>
              <select value={draft.status} onChange={(event) => onChange({ status: event.target.value as TaskStatus })}>
                {(['todo', 'doing', 'done'] as TaskStatus[]).map((item) => (
                  <option key={item} value={item}>
                    {statusMeta[item]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>日期</span>
              <input type="date" value={draft.dateKey} onChange={(event) => onChange({ dateKey: event.target.value })} />
            </label>
            <label className={`field ${styles.gridTime}`}>
              <span>时间</span>
              <input type="time" value={draft.time} onChange={(event) => onChange({ time: event.target.value })} />
            </label>
          </div>

          <TagPicker
            title="标签"
            tags={tags}
            selectedTagIds={draft.tagIds}
            onToggleTag={onToggleTag}
            onManageTags={onManageTags}
            manageLabel="新建 / 管理标签"
          />
        </div>

        <div className={styles.footer}>
          <p className="muted">创建后会直接选中这条任务，你可以继续补提醒、附件和更细的排期。</p>
          <div className={`action-row ${styles.actions}`}>
            <button className="ghost-button small" onClick={onClose}>
              取消
            </button>
            <button className="primary-button small" onClick={onSubmit}>
              创建任务
            </button>
          </div>
        </div>
      </section>
    </>
  )
}
