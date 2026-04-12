import type { ReactNode } from 'react'
import type { TodoList, TimeFieldMode } from '../types/domain'
import { handleCardKeyboardActivation } from '../utils/workspace-helpers'

const timeFieldModeLabel: Record<TimeFieldMode, string> = {
  planned: '计划',
  deadline: 'DDL',
}

export function FolderListItem({
  list, count, active, editing,
  onClick, onCtxMenu, onRename, onEditChange, onEditCommit, onEditCancel,
  onDelete, onColorCycle,
}: {
  list: TodoList
  count: number
  active: boolean
  editing: string | null
  onClick: () => void
  onCtxMenu: (e: React.MouseEvent) => void
  onRename: () => void
  onEditChange: (v: string) => void
  onEditCommit: () => void
  onEditCancel: () => void
  onDelete: () => void
  onColorCycle: () => void
}) {
  if (editing !== null) {
    return (
      <div className="folder-list-item folder-list-item--editing">
        <input
          autoFocus
          className="sidebar-inline-input"
          value={editing}
          onChange={e => onEditChange(e.target.value)}
          onBlur={onEditCommit}
          onKeyDown={e => {
            if (e.key === 'Enter') onEditCommit()
            if (e.key === 'Escape') onEditCancel()
          }}
        />
      </div>
    )
  }

  return (
    <div
      className={`folder-list-item ${active ? 'is-active' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => handleCardKeyboardActivation(e, onClick)}
      onContextMenu={onCtxMenu}
    >
      <span
        className="folder-dot folder-dot--clickable"
        style={{ background: list.color }}
        title="点击更改颜色"
        onClick={e => { e.stopPropagation(); onColorCycle() }}
      />
      <span className="folder-list-item__name">{list.name}</span>
      {count > 0 && <span className="folder-list-item__count">{count}</span>}
      <div className="folder-title__actions folder-list-item__actions">
        <button
          className="sidebar-action-btn"
          title="重命名"
          onClick={e => { e.stopPropagation(); onRename() }}
        >✎</button>
        <button
          className="sidebar-action-btn danger"
          title="删除清单"
          onClick={e => { e.stopPropagation(); onDelete() }}
        >✕</button>
      </div>
    </div>
  )
}

export function SidebarSection({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="sidebar-section">
      <div className="sidebar-section__header">
        <p className="sidebar-label">{title}</p>
        {actions}
      </div>
      <div className="sidebar-stack">{children}</div>
    </section>
  )
}

export function NavButton({
  label,
  count,
  active,
  onClick,
  icon,
  modeSwitcher,
}: {
  label: string
  count?: number
  active: boolean
  onClick: () => void
  icon?: string
  modeSwitcher?: {
    value: TimeFieldMode
    onChange: (mode: TimeFieldMode) => void
  }
}) {
  return (
    <div
      className={`nav-button ${active ? 'is-active' : ''} ${modeSwitcher ? 'has-mode-switcher' : ''}`}
      title={label}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => handleCardKeyboardActivation(e, onClick)}
    >
      {/* 列1：图标（固定宽度，所有项对齐）*/}
      <span className="nav-button__icon" aria-hidden>{icon ?? ''}</span>

      {/* 列2：标题（弹性，截断）*/}
      <span className="nav-button__label">{label}</span>

      {/* 列3：计划/DDL 模式标签（可选，仅 modeSwitcher 项有）*/}
      {modeSwitcher && (
        <div className="nav-button__mode-pills" onClick={e => e.stopPropagation()}>
          {(['planned', 'deadline'] as TimeFieldMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`mode-pill ${modeSwitcher.value === mode ? 'is-active' : ''}`}
              onClick={(e) => { e.stopPropagation(); modeSwitcher.onChange(mode) }}
            >
              {timeFieldModeLabel[mode]}
            </button>
          ))}
        </div>
      )}

      {/* 列4：计数（固定宽度，右对齐）*/}
      {typeof count === 'number' && (
        <strong className="nav-button__count">{count}</strong>
      )}
    </div>
  )
}
