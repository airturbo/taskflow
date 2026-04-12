import { useState, useEffect } from 'react'
import type { Tag } from '../types/domain'
import { TAG_COLOR_PRESETS, SPECIAL_TAG_IDS } from '@taskflow/core'
import { isSystemTagId } from '../utils/workspace-helpers'

type TagMutationResult =
  | { ok: true; tagId: string }
  | { ok: false; message: string }

export function TagPicker({
  title,
  tags,
  selectedTagIds,
  onToggleTag,
  onManageTags,
  manageLabel = '管理标签',
}: {
  title?: string
  tags: Tag[]
  selectedTagIds: string[]
  onToggleTag: (tagId: string) => void
  onManageTags: () => void
  manageLabel?: string
}) {
  return (
    <div className="tag-picker">
      {(title || tags.length > 0) && (
        <div className="tag-picker__header">
          <span>{title ?? '标签'}</span>
          <button className="ghost-button small" onClick={onManageTags}>
            {manageLabel}
          </button>
        </div>
      )}
      <div className="chip-wrap dense">
        {tags.length === 0 ? (
          <button className="ghost-button small" onClick={onManageTags}>
            创建第一个标签
          </button>
        ) : (
          tags.map((tag) => {
            const active = selectedTagIds.includes(tag.id)
            return (
              <button
                key={tag.id}
                className={`tag-chip ${isSystemTagId(tag.id, Object.values(SPECIAL_TAG_IDS)) ? 'tag-chip--primary' : ''} ${active ? 'is-active' : ''}`}
                style={{ borderColor: `${tag.color}55` }}
                onClick={() => onToggleTag(tag.id)}
              >
                <i style={{ background: tag.color }} />#{tag.name}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

export function TagManagementDialog({
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
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState<string>(TAG_COLOR_PRESETS[0])
  const [drafts, setDrafts] = useState<Record<string, { name: string; color: string }>>(() =>
    Object.fromEntries(tags.map((tag) => [tag.id, { name: tag.name, color: tag.color }])),
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDrafts(Object.fromEntries(tags.map((tag) => [tag.id, { name: tag.name, color: tag.color }])))
  }, [tags])

  const handleCreate = () => {
    const result = onCreateTag(newTagName, newTagColor)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setError(null)
    setNewTagName('')
    setNewTagColor(TAG_COLOR_PRESETS[(tags.length + 1) % TAG_COLOR_PRESETS.length])
  }

  const handleSave = (tagId: string) => {
    const draft = drafts[tagId]
    if (!draft) return
    const result = onUpdateTag(tagId, draft.name, draft.color)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setError(null)
  }

  const handleDelete = (tagId: string) => {
    const result = onDeleteTag(tagId)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setError(null)
  }

  return (
    <div className="tag-manager-layer" role="dialog" aria-modal="true" aria-label="标签管理">
      <button className="tag-manager-backdrop" aria-label="关闭标签管理" onClick={onClose} />
      <section className="tag-manager panel">
        <div className="panel-header tag-manager__header">
          <div>
            <p className="eyebrow">tag system</p>
            <h3>管理标签</h3>
            <p className="muted">可以新建、改名、改色；特殊标签"紧急 / 重要"仍保持锁定，用来驱动四象限。</p>
          </div>
          <button className="ghost-button small" onClick={onClose}>
            关闭
          </button>
        </div>

        <section className="tag-manager__section">
          <div className="tag-manager__section-title">
            <strong>新建标签</strong>
            <span>{tags.length} 个标签</span>
          </div>
          <div className="tag-manager__create-row">
            <input value={newTagName} onChange={(event) => setNewTagName(event.target.value)} placeholder="例如：设计 / 家庭 / 复盘" />
            <input type="color" value={newTagColor} onChange={(event) => setNewTagColor(event.target.value)} aria-label="选择标签颜色" />
            <button className="primary-button small" onClick={handleCreate}>
              新建
            </button>
          </div>
          <div className="tag-manager__preset-row">
            {TAG_COLOR_PRESETS.map((color) => (
              <button
                key={color}
                className={`tag-color-swatch ${newTagColor === color ? 'is-active' : ''}`}
                style={{ background: color }}
                aria-label={`选择颜色 ${color}`}
                onClick={() => setNewTagColor(color)}
              />
            ))}
          </div>
          {error && <p className="tag-manager__error">{error}</p>}
        </section>

        <section className="tag-manager__section tag-manager__list">
          {tags.map((tag) => {
            const draft = drafts[tag.id] ?? { name: tag.name, color: tag.color }
            const locked = isSystemTagId(tag.id, Object.values(SPECIAL_TAG_IDS))
            return (
              <article key={tag.id} className="tag-manager-item">
                <div className="tag-manager-item__identity">
                  <span className={`tag-chip ${locked ? 'tag-chip--primary' : ''} is-active`} style={{ borderColor: `${draft.color}55` }}>
                    <i style={{ background: draft.color }} />#{draft.name}
                  </span>
                  {locked && <span className="mini-tag">系统标签</span>}
                </div>
                <div className="tag-manager-item__editor">
                  <input
                    value={draft.name}
                    disabled={locked}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [tag.id]: { ...draft, name: event.target.value },
                      }))
                    }
                  />
                  <input
                    type="color"
                    value={draft.color}
                    disabled={locked}
                    aria-label={`修改 ${tag.name} 的颜色`}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [tag.id]: { ...draft, color: event.target.value },
                      }))
                    }
                  />
                  <div className="action-row">
                    {!locked && (
                      <>
                        <button className="ghost-button small" onClick={() => handleSave(tag.id)}>
                          保存
                        </button>
                        <button className="ghost-button small danger" onClick={() => handleDelete(tag.id)}>
                          删除
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </section>
      </section>
    </div>
  )
}
