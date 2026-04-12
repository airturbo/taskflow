import { useCallback, useState } from 'react';
import type { Tag } from '../core/domain';

const DEFAULT_PALETTE = ['#6366f1', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6', '#eab308', '#64748b', '#22c55e'];

interface TagPickerModalProps {
  tags: Tag[];
  vaultTags: string[];
  activeTagIds: string[];
  onToggleTag: (tagId: string, active: boolean) => void;
  onImportVaultTag: (name: string) => void;
  onCreateTag: (name: string, color: string) => void;
  onClose: () => void;
}

export function TagPickerModal({
  tags, vaultTags, activeTagIds, onToggleTag, onImportVaultTag, onCreateTag, onClose,
}: TagPickerModalProps) {
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(DEFAULT_PALETTE[0]);

  const pluginTagNames = new Set(tags.map(t => t.name));
  const unlinkedVaultTags = vaultTags.filter(vt => !pluginTagNames.has(vt));

  const handleCreate = useCallback(() => {
    const name = newTagName.trim();
    if (!name) return;
    onCreateTag(name, newTagColor);
    setNewTagName('');
    setNewTagColor(DEFAULT_PALETTE[(tags.length + 1) % DEFAULT_PALETTE.length]);
  }, [newTagName, newTagColor, onCreateTag, tags.length]);

  return (
    <div className="tw-tag-picker-modal" onClick={onClose}>
      <div className="tw-tag-picker-modal__overlay" />
      <div className="tw-tag-picker-modal__content" onClick={e => e.stopPropagation()}>
        <div className="tw-tag-picker-modal__header">
          <span className="tw-tag-picker-modal__title">编辑标签</span>
          <button className="tw-btn-icon" onClick={onClose}>✕</button>
        </div>

        <div className="tw-tag-picker-modal__body">
          {/* 已有标签 */}
          {tags.length > 0 && (
            <div className="tw-tag-picker-modal__section">
              <div className="tw-tag-picker-modal__section-label">已有标签</div>
              {tags.map(tag => {
                const active = activeTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    className={`tw-tag-picker-modal__item ${active ? 'is-active' : ''}`}
                    onClick={() => onToggleTag(tag.id, !active)}
                  >
                    <span className="tw-tag-picker-modal__item-dot" style={{ background: tag.color }} />
                    <span className="tw-tag-picker-modal__item-name">{tag.name}</span>
                    {active && <span className="tw-tag-picker-modal__item-check">✓</span>}
                  </button>
                );
              })}
            </div>
          )}

          {/* Vault 标签 */}
          {unlinkedVaultTags.length > 0 && (
            <div className="tw-tag-picker-modal__section">
              <div className="tw-tag-picker-modal__section-label">Vault 标签</div>
              {unlinkedVaultTags.map(vt => (
                <button
                  key={vt}
                  className="tw-tag-picker-modal__item tw-tag-picker-modal__item--vault"
                  onClick={() => onImportVaultTag(vt)}
                >
                  <span className="tw-tag-picker-modal__item-dot tw-tag-picker-modal__item-dot--vault" />
                  <span className="tw-tag-picker-modal__item-name">{vt}</span>
                  <span className="tw-tag-picker-modal__item-action">导入</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 新建标签 */}
        <div className="tw-tag-picker-modal__footer">
          <input
            className="tw-tag-picker-modal__input"
            placeholder="新标签名称…"
            value={newTagName}
            onChange={e => setNewTagName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
          />
          <input
            type="color"
            className="tw-tag-picker-modal__color"
            value={newTagColor}
            onChange={e => setNewTagColor(e.target.value)}
          />
          <button className="tw-btn-sm tw-btn-primary" onClick={handleCreate} disabled={!newTagName.trim()}>
            添加
          </button>
        </div>
      </div>
    </div>
  );
}
