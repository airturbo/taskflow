import { useCallback, useState } from 'react';
import type { Tag } from '../core/domain';

const TAG_COLOR_PALETTE = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f97316',
  '#14b8a6', '#eab308', '#64748b', '#22c55e',
  '#ef4444', '#06b6d4',
];

const SYSTEM_TAG_IDS = ['tag-urgent', 'tag-important'];

interface TagManagementDialogProps {
  tags: Tag[];
  tasks: { tagIds: string[] }[];
  onUpdateTag: (tagId: string, name: string, color: string) => Promise<void>;
  onDeleteTag: (tagId: string) => Promise<void>;
  onAddTag: (name: string, color: string) => Promise<void>;
  onClose: () => void;
}

export function TagManagementDialog({
  tags, tasks, onUpdateTag, onDeleteTag, onAddTag, onClose,
}: TagManagementDialogProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLOR_PALETTE[0]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const getTagUsageCount = useCallback((tagId: string) => {
    return tasks.filter(t => t.tagIds.includes(tagId)).length;
  }, [tasks]);

  const startEdit = useCallback((tag: Tag) => {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color);
    setConfirmDeleteId(null);
  }, []);

  const saveEdit = useCallback(() => {
    if (editingId && editName.trim()) {
      void onUpdateTag(editingId, editName.trim(), editColor);
    }
    setEditingId(null);
  }, [editingId, editName, editColor, onUpdateTag]);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  const handleDelete = useCallback((tagId: string) => {
    void onDeleteTag(tagId);
    setConfirmDeleteId(null);
  }, [onDeleteTag]);

  const handleCreate = useCallback(() => {
    const name = newTagName.trim();
    if (!name) return;
    void onAddTag(name, newTagColor);
    setNewTagName('');
    setNewTagColor(TAG_COLOR_PALETTE[(tags.length + 1) % TAG_COLOR_PALETTE.length]);
  }, [newTagName, newTagColor, onAddTag, tags.length]);

  return (
    <div className="tw-tag-mgmt-dialog" onClick={onClose}>
      <div className="tw-tag-picker-modal__overlay" />
      <div className="tw-tag-mgmt-dialog__content" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="tw-tag-picker-modal__header">
          <span className="tw-tag-picker-modal__title">标签管理</span>
          <button className="tw-btn-icon" onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div className="tw-tag-picker-modal__body">
          {tags.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
              暂无标签，在下方创建
            </div>
          ) : (
            tags.map(tag => {
              const isSystem = SYSTEM_TAG_IDS.includes(tag.id);
              const isEditing = editingId === tag.id;
              const isConfirmingDelete = confirmDeleteId === tag.id;
              const usageCount = getTagUsageCount(tag.id);

              if (isEditing) {
                return (
                  <div key={tag.id} className="tw-tag-mgmt-item tw-tag-mgmt-item--editing">
                    <input
                      className="tw-tag-picker-modal__input"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveEdit();
                        if (e.key === 'Escape') cancelEdit();
                      }}
                      autoFocus
                    />
                    <div className="tw-color-palette">
                      {TAG_COLOR_PALETTE.map(c => (
                        <button
                          key={c}
                          className={`tw-color-palette__swatch ${editColor === c ? 'is-active' : ''}`}
                          style={{ background: c }}
                          onClick={() => setEditColor(c)}
                        />
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      <button className="tw-btn-xs" onClick={saveEdit}>保存</button>
                      <button className="tw-btn-xs" onClick={cancelEdit}>取消</button>
                    </div>
                  </div>
                );
              }

              return (
                <div key={tag.id} className="tw-tag-mgmt-item">
                  <span className="tw-tag-mgmt-item__dot" style={{ background: tag.color }} />
                  <span className="tw-tag-mgmt-item__name">{tag.name}</span>
                  <span className="tw-tag-mgmt-item__count">{usageCount} 个任务</span>
                  {!isSystem && !isConfirmingDelete && (
                    <div className="tw-tag-mgmt-item__actions">
                      <button className="tw-btn-xs" onClick={() => startEdit(tag)} title="编辑">✎</button>
                      <button className="tw-btn-xs tw-btn-danger" onClick={() => setConfirmDeleteId(tag.id)} title="删除">✕</button>
                    </div>
                  )}
                  {isSystem && (
                    <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>系统</span>
                  )}
                  {isConfirmingDelete && (
                    <div className="tw-tag-mgmt-item__confirm">
                      <span style={{ fontSize: 11, color: '#ef4444' }}>
                        删除后 {usageCount} 个任务将移除此标签
                      </span>
                      <button className="tw-btn-xs tw-btn-danger" onClick={() => handleDelete(tag.id)}>确认</button>
                      <button className="tw-btn-xs" onClick={() => setConfirmDeleteId(null)}>取消</button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer: create new tag */}
        <div className="tw-tag-mgmt-dialog__footer">
          <input
            className="tw-tag-picker-modal__input"
            placeholder="新标签名称…"
            value={newTagName}
            onChange={e => setNewTagName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
          />
          <div className="tw-color-palette">
            {TAG_COLOR_PALETTE.map(c => (
              <button
                key={c}
                className={`tw-color-palette__swatch ${newTagColor === c ? 'is-active' : ''}`}
                style={{ background: c }}
                onClick={() => setNewTagColor(c)}
              />
            ))}
          </div>
          <button
            className="tw-btn-sm tw-btn-primary"
            onClick={handleCreate}
            disabled={!newTagName.trim()}
          >
            添加标签
          </button>
        </div>
      </div>
    </div>
  );
}
