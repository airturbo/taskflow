import { useState } from 'react'
import type { Task, TodoList } from '../types/domain'

export function MobileProjectsView({
  folders,
  lists,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  tasks: _tasks,
  countsBySelection,
  onSelectList,
  onRenameList,
  onDeleteList,
  onChangeListColor,
  onCreateList,
  onCreateFolder,
  onMoveListToFolder,
  presetColors,
}: {
  folders: { id: string; name: string }[]
  lists: TodoList[]
  tasks: Task[]
  countsBySelection: Record<string, number>
  onSelectList: (listId: string) => void
  onRenameList: (listId: string) => void
  onDeleteList: (listId: string) => void
  onChangeListColor: (listId: string, color: string) => void
  onCreateList: (folderId: string | null) => void
  onCreateFolder: () => void
  onMoveListToFolder: (listId: string, folderId: string | null) => void
  presetColors: string[]
}) {
  const [actionMenuListId, setActionMenuListId] = useState<string | null>(null)
  const [showColorPicker, setShowColorPicker] = useState(false)

  // Group lists by folder
  const folderMap = new Map<string | null, TodoList[]>()
  for (const list of lists) {
    if (list.id === 'inbox') continue
    const folderId = list.folderId ?? null
    if (!folderMap.has(folderId)) folderMap.set(folderId, [])
    folderMap.get(folderId)!.push(list)
  }

  const actionMenuList = actionMenuListId ? lists.find(l => l.id === actionMenuListId) : null

  const renderListItem = (list: TodoList) => (
    <div key={list.id} className="mobile-projects-list-item" onClick={() => onSelectList(list.id)}>
      <span className="mobile-projects-dot" style={{ background: list.color }} />
      <span className="mobile-projects-list-name">{list.name}</span>
      <span className="mobile-projects-list-count">{countsBySelection[`list:${list.id}`] ?? 0}</span>
      {list.id !== 'inbox' && (
        <button
          className="mobile-projects-more-btn"
          onClick={(e) => { e.stopPropagation(); setActionMenuListId(list.id); setShowColorPicker(false) }}
          aria-label="更多操作"
        >⋯</button>
      )}
    </div>
  )

  return (
    <div className="mobile-projects-view">
      <div className="mobile-projects-header">
        <h2>项目 & 清单管理</h2>
      </div>

      {/* 新建按钮 */}
      <div className="mobile-projects-create-row">
        <button className="mobile-projects-create-btn" onClick={() => onCreateList(null)}>＋ 新建清单</button>
        <button className="mobile-projects-create-btn" onClick={onCreateFolder}>＋ 新建文件夹</button>
      </div>

      {folders.length === 0 && (folderMap.get(null) ?? []).length === 0 && (
        <div className="mobile-projects-empty">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect x="6" y="10" width="36" height="30" rx="4" stroke="currentColor" strokeWidth="2"/>
            <path d="M6 18h36" stroke="currentColor" strokeWidth="2"/>
            <path d="M16 10V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <path d="M32 10V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <path d="M16 28h16M16 34h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <p>还没有清单</p>
          <span>点击右上角 + 创建你的第一个清单</span>
        </div>
      )}

      {folders.map(folder => {
        const folderLists = folderMap.get(folder.id) ?? []
        return (
          <section key={folder.id} className="mobile-projects-folder">
            <header className="mobile-projects-folder__header">
              <span>📁</span> <span>{folder.name}</span>
              <button
                className="mobile-projects-more-btn"
                style={{ marginLeft: 'auto' }}
                onClick={() => onCreateList(folder.id)}
                aria-label="新建清单"
              >＋</button>
            </header>
            {folderLists.map(list => renderListItem(list))}
          </section>
        )
      })}

      {/* Top-level lists (no folder) */}
      {(folderMap.get(null) ?? []).map(list => renderListItem(list))}

      {/* Inbox at bottom */}
      <div className="mobile-projects-list-item mobile-projects-inbox" onClick={() => onSelectList('inbox')}>
        <span>📥</span>
        <span className="mobile-projects-list-name">收件箱</span>
        <span className="mobile-projects-list-count">{countsBySelection['list:inbox'] ?? countsBySelection['system:inbox'] ?? 0}</span>
      </div>

      {/* 操作菜单 */}
      {actionMenuListId && actionMenuList && (
        <>
          <div className="mobile-projects-action-menu-overlay" onClick={() => { setActionMenuListId(null); setShowColorPicker(false) }} />
          <div className="mobile-projects-action-menu">
            <h3>{actionMenuList.name}</h3>
            <button onClick={() => { onRenameList(actionMenuListId); setActionMenuListId(null) }}>
              ✎ 重命名
            </button>
            <button onClick={() => setShowColorPicker(!showColorPicker)}>
              🎨 改颜色
            </button>
            {showColorPicker && (
              <div className="mobile-color-picker">
                {presetColors.map(color => (
                  <button
                    key={color}
                    className={`mobile-color-swatch ${actionMenuList.color === color ? 'is-active' : ''}`}
                    style={{ background: color }}
                    onClick={() => { onChangeListColor(actionMenuListId, color); setShowColorPicker(false) }}
                  />
                ))}
              </div>
            )}
            {folders.length > 0 && (
              <button onClick={() => {
                const currentFolderId = actionMenuList.folderId ?? null
                // Cycle through folders + null (no folder)
                const folderOptions = [...folders.map(f => f.id), null]
                const currentIndex = folderOptions.indexOf(currentFolderId)
                const nextFolderId = folderOptions[(currentIndex + 1) % folderOptions.length]
                onMoveListToFolder(actionMenuListId, nextFolderId)
                setActionMenuListId(null)
              }}>
                📁 移到文件夹
              </button>
            )}
            <button className="danger" onClick={() => {
              if (window.confirm('确定要删除这个清单吗？此操作无法撤销。')) {
                onDeleteList(actionMenuListId)
                setActionMenuListId(null)
              }
            }}>
              ✕ 删除清单
            </button>
            <button onClick={() => { setActionMenuListId(null); setShowColorPicker(false) }}>
              取消
            </button>
          </div>
        </>
      )}
    </div>
  )
}
