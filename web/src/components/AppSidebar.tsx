import { useEffect, useState } from 'react'
import type { Folder, SavedFilter, Tag, TodoList, TimeFieldMode } from '../types/domain'
import { FolderListItem, SidebarSection, NavButton } from './WorkspaceSidebar'
import { handleCardKeyboardActivation } from '../utils/workspace-helpers'
import styles from './AppSidebar.module.css'

const PRESET_COLORS = [
  '#6c63ff', '#4f46e5', '#0ea5e9', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#8b5cf6', '#06b6d4', '#84cc16',
]

type EditingTarget = { type: 'folder' | 'list'; id: string; value: string } | null
type CtxMenu = { type: 'folder' | 'list'; id: string; x: number; y: number } | null

export interface AppSidebarProps {
  // Data
  folders: Folder[]
  lists: TodoList[]
  tags: Tag[]
  filters: SavedFilter[]
  countsBySelection: Record<string, number>
  // Derived tag data
  primaryTags: Tag[]
  secondaryTags: Tag[]
  selectedTagObjects: Tag[]
  // Selection
  activeSelection: string
  selectedTagIds: string[]
  selectionTimeModes: Record<string, TimeFieldMode> | undefined
  // Theme
  themeIcon: string
  themeLabel: string
  onCycleTheme: () => void
  // Push
  pushSupported: boolean
  pushSubscribed: boolean
  onSubscribePush: () => void
  onUnsubscribePush: () => void
  // Actions
  onSetActiveSelection: (sel: string) => void
  onUpdateSelectionTimeMode: (key: 'today' | 'upcoming', mode: TimeFieldMode) => void
  onToggleSelectedTag: (tagId: string) => void
  onClearSelectedTags: () => void
  onOpenTagManager: () => void
  onOpenExportPanel: () => void
  onOpenShortcutPanel: () => void
  // Folder/List CRUD
  onCreateFolder: (name: string) => void
  onCreateList: (name: string, folderId: string | null) => void
  onRenameFolder: (folderId: string, name: string) => void
  onRenameList: (listId: string, name: string) => void
  onUpdateFolderColor: (folderId: string, color: string) => void
  onUpdateListColor: (listId: string, color: string) => void
  onUpdateListFolder: (listId: string, folderId: string | null) => void
  onDeleteFolder: (folderId: string) => void
  onDeleteList: (listId: string) => void
  // Mobile dialogs
  mobileConfirm: (msg: string) => Promise<boolean>
  mobilePrompt: (msg: string, defaultValue?: string) => Promise<string | null>
}

export function AppSidebar(props: AppSidebarProps) {
  const {
    folders, lists, tags, filters, countsBySelection,
    primaryTags, secondaryTags, selectedTagObjects,
    activeSelection, selectedTagIds, selectionTimeModes,
    themeIcon, themeLabel, onCycleTheme,
    pushSupported, pushSubscribed, onSubscribePush, onUnsubscribePush,
    onSetActiveSelection, onUpdateSelectionTimeMode,
    onToggleSelectedTag, onClearSelectedTags,
    onOpenTagManager, onOpenExportPanel, onOpenShortcutPanel,
    onCreateFolder, onCreateList,
    onRenameFolder, onRenameList,
    onUpdateFolderColor, onUpdateListColor, onUpdateListFolder,
    onDeleteFolder, onDeleteList,
    mobileConfirm, mobilePrompt,
  } = props

  // ---- Sidebar-local editing state ----
  const [editingTarget, setEditingTarget] = useState<EditingTarget>(null)
  const [ctxMenu, setCtxMenu] = useState<CtxMenu>(null)

  const startEdit = (type: 'folder' | 'list', id: string, currentName: string) => {
    setCtxMenu(null)
    setEditingTarget({ type, id, value: currentName })
  }

  const commitEdit = () => {
    if (!editingTarget) return
    if (editingTarget.type === 'folder') onRenameFolder(editingTarget.id, editingTarget.value)
    else onRenameList(editingTarget.id, editingTarget.value)
    setEditingTarget(null)
  }

  const openCtxMenu = (e: React.MouseEvent, type: 'folder' | 'list', id: string) => {
    e.stopPropagation()
    e.preventDefault()
    setCtxMenu({ type, id, x: e.clientX, y: e.clientY })
  }

  // 点击空白处关闭上下文菜单
  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [ctxMenu])

  return (
    <>
      <div className={styles.brandBlock}>
        <h1>TaskFlow</h1>
        <button
          className="ghost-button small"
          onClick={onCycleTheme}
          title={`当前：${themeLabel}，点击切换`}
        >
          {themeIcon}
        </button>
      </div>

      <SidebarSection title="系统视图">
        <NavButton icon="◎" label="全部" count={countsBySelection['system:all']} active={activeSelection === 'system:all'} onClick={() => onSetActiveSelection('system:all')} />
        <NavButton
          icon="☀"
          label="今日"
          count={countsBySelection['system:today']}
          active={activeSelection === 'system:today'}
          onClick={() => onSetActiveSelection('system:today')}
          modeSwitcher={{
            value: selectionTimeModes?.today ?? 'planned',
            onChange: (mode) => {
              onSetActiveSelection('system:today')
              onUpdateSelectionTimeMode('today', mode)
            },
          }}
        />
        <NavButton
          icon="↗"
          label="未来 7 天"
          count={countsBySelection['system:upcoming']}
          active={activeSelection === 'system:upcoming'}
          onClick={() => onSetActiveSelection('system:upcoming')}
          modeSwitcher={{
            value: selectionTimeModes?.upcoming ?? 'planned',
            onChange: (mode) => {
              onSetActiveSelection('system:upcoming')
              onUpdateSelectionTimeMode('upcoming', mode)
            },
          }}
        />
        <NavButton icon="📥" label="收件箱" count={countsBySelection['system:inbox']} active={activeSelection === 'system:inbox'} onClick={() => onSetActiveSelection('system:inbox')} />
        <NavButton icon="✓" label="已完成" count={countsBySelection['system:completed']} active={activeSelection === 'system:completed'} onClick={() => onSetActiveSelection('system:completed')} />
        <NavButton icon="🗑" label="回收站" count={countsBySelection['system:trash']} active={activeSelection === 'system:trash'} onClick={() => onSetActiveSelection('system:trash')} />
      </SidebarSection>

      <SidebarSection
        title="文件夹与清单"
        actions={
          <div style={{ display: 'flex', gap: 2 }}>
            <button
              className="ghost-button small"
              title="新建文件夹"
              onClick={async () => {
                const name = await mobilePrompt('文件夹名称')
                if (name) onCreateFolder(name)
              }}
            >＋文件夹</button>
            <button
              className="ghost-button small"
              title="新建清单"
              onClick={async () => {
                const name = await mobilePrompt('清单名称')
                if (name) onCreateList(name, null)
              }}
            >＋清单</button>
          </div>
        }
      >
        {/* 文件夹及其子清单 */}
        {folders.map((folder) => (
          <div key={folder.id} className="folder-block">
            {editingTarget?.type === 'folder' && editingTarget.id === folder.id ? (
              <div className="folder-title folder-title--editing">
                <input
                  autoFocus
                  className="sidebar-inline-input"
                  value={editingTarget.value}
                  onChange={e => setEditingTarget({ ...editingTarget, value: e.target.value })}
                  onBlur={commitEdit}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitEdit()
                    if (e.key === 'Escape') setEditingTarget(null)
                  }}
                />
              </div>
            ) : (
              <div
                className="folder-title folder-title--interactive"
                onContextMenu={e => openCtxMenu(e, 'folder', folder.id)}
              >
                <span
                  className="folder-dot folder-dot--clickable"
                  style={{ background: folder.color }}
                  title="点击更改颜色"
                  onClick={e => {
                    e.stopPropagation()
                    const next = PRESET_COLORS[(PRESET_COLORS.indexOf(folder.color) + 1) % PRESET_COLORS.length]
                    onUpdateFolderColor(folder.id, next)
                  }}
                />
                <span className="folder-title__name">{folder.name}</span>
                <div className="folder-title__actions">
                  <button
                    className="sidebar-action-btn"
                    title="新建清单到此文件夹"
                    onClick={async (e) => {
                      e.stopPropagation()
                      const name = await mobilePrompt('清单名称')
                      if (name) onCreateList(name, folder.id)
                    }}
                  >＋</button>
                  <button
                    className="sidebar-action-btn"
                    title="重命名文件夹"
                    onClick={e => { e.stopPropagation(); startEdit('folder', folder.id, folder.name) }}
                  >✎</button>
                  <button
                    className="sidebar-action-btn danger"
                    title="删除文件夹（清单移到顶层）"
                    onClick={async (e) => {
                      e.stopPropagation()
                      if (await mobileConfirm(`删除文件夹「${folder.name}」？其中的清单会保留在顶层。`)) {
                        onDeleteFolder(folder.id)
                      }
                    }}
                  >✕</button>
                </div>
              </div>
            )}
            <div className="folder-children">
              {lists
                .filter((list) => list.folderId === folder.id)
                .map((list) => (
                  <FolderListItem
                    key={list.id}
                    list={list}
                    count={countsBySelection[`list:${list.id}`] ?? 0}
                    active={activeSelection === `list:${list.id}`}
                    editing={editingTarget?.type === 'list' && editingTarget.id === list.id ? editingTarget.value : null}
                    onClick={() => onSetActiveSelection(`list:${list.id}`)}
                    onCtxMenu={e => openCtxMenu(e, 'list', list.id)}
                    onRename={() => startEdit('list', list.id, list.name)}
                    onEditChange={v => setEditingTarget(prev => prev ? { ...prev, value: v } : null)}
                    onEditCommit={commitEdit}
                    onEditCancel={() => setEditingTarget(null)}
                    onDelete={async () => {
                      if (await mobileConfirm(`删除清单「${list.name}」？其中的任务会移到收件箱。`)) {
                        onDeleteList(list.id)
                      }
                    }}
                    onColorCycle={() => {
                      const next = PRESET_COLORS[(PRESET_COLORS.indexOf(list.color) + 1) % PRESET_COLORS.length]
                      onUpdateListColor(list.id, next)
                    }}
                  />
                ))}
            </div>
          </div>
        ))}

        {/* 顶层清单（无文件夹）*/}
        {lists
          .filter(l => l.folderId === null && l.kind !== 'system')
          .map(list => (
            <FolderListItem
              key={list.id}
              list={list}
              count={countsBySelection[`list:${list.id}`] ?? 0}
              active={activeSelection === `list:${list.id}`}
              editing={editingTarget?.type === 'list' && editingTarget.id === list.id ? editingTarget.value : null}
              onClick={() => onSetActiveSelection(`list:${list.id}`)}
              onCtxMenu={e => openCtxMenu(e, 'list', list.id)}
              onRename={() => startEdit('list', list.id, list.name)}
              onEditChange={v => setEditingTarget(prev => prev ? { ...prev, value: v } : null)}
              onEditCommit={commitEdit}
              onEditCancel={() => setEditingTarget(null)}
              onDelete={async () => {
                if (await mobileConfirm(`删除清单「${list.name}」？其中的任务会移到收件箱。`)) {
                  onDeleteList(list.id)
                }
              }}
              onColorCycle={() => {
                const next = PRESET_COLORS[(PRESET_COLORS.indexOf(list.color) + 1) % PRESET_COLORS.length]
                onUpdateListColor(list.id, next)
              }}
            />
          ))
        }

        {/* 收件箱（固定，不可编辑，专属图标区分）*/}
        <div
          className={`folder-list-item inbox-item ${activeSelection === 'list:inbox' ? 'is-active' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => onSetActiveSelection('list:inbox')}
          onKeyDown={e => handleCardKeyboardActivation(e, () => onSetActiveSelection('list:inbox'))}
        >
          <span className="folder-list-item__inbox-icon">📥</span>
          <span className="folder-list-item__name">收件箱</span>
          {(countsBySelection['list:inbox'] ?? 0) > 0 && (
            <span className="folder-list-item__count">{countsBySelection['list:inbox']}</span>
          )}
        </div>

        {/* 右键上下文菜单 */}
        {ctxMenu && (
          <div
            className={styles.ctxMenu}
            style={{ position: 'fixed', top: ctxMenu.y, left: ctxMenu.x, zIndex: 9999 }}
            onClick={e => e.stopPropagation()}
          >
            {ctxMenu.type === 'folder' ? (
              <>
                <button onClick={async () => { const name = await mobilePrompt('清单名称'); if (name) onCreateList(name, ctxMenu.id); setCtxMenu(null) }}>＋ 新建清单到此文件夹</button>
                <button onClick={() => startEdit('folder', ctxMenu.id, folders.find(f => f.id === ctxMenu.id)?.name ?? '')}>✎ 重命名</button>
                <div className={styles.ctxMenuDivider} />
                <button className="danger" onClick={async () => {
                  const f = folders.find(x => x.id === ctxMenu.id)
                  if (f && await mobileConfirm(`删除文件夹「${f.name}」？清单会保留。`)) onDeleteFolder(ctxMenu.id)
                  setCtxMenu(null)
                }}>✕ 删除文件夹</button>
              </>
            ) : (
              <>
                <button onClick={() => startEdit('list', ctxMenu.id, lists.find(l => l.id === ctxMenu.id)?.name ?? '')}>✎ 重命名</button>
                <button onClick={async () => {
                  const list = lists.find(l => l.id === ctxMenu.id)
                  if (!list) return
                  const folderOpts = folders.map(f => f.name).join(' / ')
                  const target = await mobilePrompt(`移动到文件夹（留空=顶层）\n可选：${folderOpts}`)
                  if (target === null) return
                  const folder = folders.find(f => f.name === target.trim())
                  onUpdateListFolder(ctxMenu.id, folder?.id ?? null)
                  setCtxMenu(null)
                }}>→ 移动到文件夹</button>
                <div className={styles.ctxMenuDivider} />
                <button className="danger" onClick={async () => {
                  const l = lists.find(x => x.id === ctxMenu.id)
                  if (l && await mobileConfirm(`删除清单「${l.name}」？任务移到收件箱。`)) onDeleteList(ctxMenu.id)
                  setCtxMenu(null)
                }}>✕ 删除清单</button>
              </>
            )}
          </div>
        )}
      </SidebarSection>

      <SidebarSection
        title="标签筛选"
        actions={
          <button className="ghost-button small" onClick={onOpenTagManager}>
            管理
          </button>
        }
      >
        {selectedTagObjects.length > 0 && (
          <div className="sidebar-filter-summary">
            <span>{selectedTagObjects.length === 1 ? `命中 #${selectedTagObjects[0].name}` : `需同时命中 ${selectedTagObjects.length} 个标签`}</span>
            <button className="ghost-button small" onClick={onClearSelectedTags}>
              清空
            </button>
          </div>
        )}
        <div className="chip-wrap dense">
          {primaryTags.map((tag) => (
            <button
              key={tag.id}
              className={`tag-chip tag-chip--primary ${selectedTagIds.includes(tag.id) ? 'is-active' : ''}`}
              style={{ borderColor: `${tag.color}55` }}
              onClick={() => onToggleSelectedTag(tag.id)}
            >
              <i style={{ background: tag.color }} />#{tag.name}
            </button>
          ))}
        </div>
        <div className="chip-wrap dense">
          {secondaryTags.map((tag) => (
            <button
              key={tag.id}
              className={`tag-chip ${selectedTagIds.includes(tag.id) ? 'is-active' : ''}`}
              style={{ borderColor: `${tag.color}55` }}
              onClick={() => onToggleSelectedTag(tag.id)}
            >
              <i style={{ background: tag.color }} />#{tag.name}
            </button>
          ))}
        </div>
      </SidebarSection>

      <SidebarSection title="智能清单">
        {filters.map((filter) => (
          <NavButton
            key={filter.id}
            icon={filter.icon}
            label={filter.name}
            count={countsBySelection[`filter:${filter.id}`] ?? 0}
            active={activeSelection === `filter:${filter.id}`}
            onClick={() => onSetActiveSelection(`filter:${filter.id}`)}
          />
        ))}
      </SidebarSection>

      <SidebarSection title="洞察">
        <NavButton icon="📊" label="统计" active={activeSelection === 'tool:stats'} onClick={() => onSetActiveSelection('tool:stats')} />
      </SidebarSection>

      <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button
          className="ghost-button small"
          style={{ width: '100%', opacity: 0.45, fontSize: 11 }}
          onClick={onOpenExportPanel}
          title="导出任务数据（JSON / CSV / Markdown）"
        >
          💾 导出数据
        </button>
        <button
          className="ghost-button small"
          style={{ width: '100%', opacity: 0.45, fontSize: 11 }}
          onClick={onOpenShortcutPanel}
          title="查看所有快捷键 (?)"
        >
          ⌨️ 快捷键参考
        </button>
        {pushSupported && (
          <button
            className="ghost-button small"
            style={{ width: '100%', opacity: 0.45, fontSize: 11 }}
            onClick={pushSubscribed ? onUnsubscribePush : onSubscribePush}
            title={pushSubscribed ? '关闭推送通知' : '开启推送通知'}
          >
            {pushSubscribed ? '🔕 关闭通知' : '🔔 开启通知'}
          </button>
        )}
      </div>
    </>
  )
}
