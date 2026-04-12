import { useState, useEffect } from 'react'
import { Command } from 'cmdk'
import type { Tag, Task, TodoList } from '../types/domain'
import './CommandPalette.css'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  tasks: Task[]
  lists: TodoList[]
  tags: Tag[]
  onSelectTask: (taskId: string) => void
  onSelectList: (listId: string) => void
}

const PRIORITY_COLOR: Record<string, string> = {
  urgent: '#ef4444',
  high: '#f59e0b',
  normal: '#6c63ff',
  low: '#94a3b8',
}

const STATUS_LABEL: Record<string, string> = {
  todo: '待办',
  doing: '进行中',
  done: '已完成',
}

export function CommandPalette({
  open,
  onClose,
  tasks,
  lists,
  tags,
  onSelectTask,
  onSelectList,
}: CommandPaletteProps) {
  const [search, setSearch] = useState('')

  // Clear search when palette closes
  useEffect(() => {
    if (!open) setSearch('')
  }, [open])

  // Close on Escape is handled by Command.Input onKeyDown below,
  // but also support it at the overlay level
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    // capture phase so we intercept before other listeners
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [open, onClose])

  const todayStr = new Date().toISOString().slice(0, 10)
  const q = search.trim().toLowerCase()

  // ── filter tasks ───────────────────────────────────────────────────────────
  const filteredTasks = tasks
    .filter((t) => {
      if (t.deleted) return false
      if (!q) return true

      if (q.startsWith('#')) {
        const tagName = q.slice(1)
        const matchedTagIds = tags
          .filter((tag) => tag.name.toLowerCase().includes(tagName))
          .map((tag) => tag.id)
        return matchedTagIds.some((id) => (t.tagIds ?? []).includes(id))
      }

      if (q.startsWith('@')) {
        const listName = q.slice(1)
        const matched = lists.find((l) => l.name.toLowerCase().includes(listName))
        return matched ? t.listId === matched.id : false
      }

      if (q.startsWith('!')) {
        return t.priority === q.slice(1)
      }

      if (q === 'due:today') {
        return t.dueAt?.startsWith(todayStr) ?? false
      }

      if (q.startsWith('status:')) {
        return t.status === q.slice(7)
      }

      return t.title.toLowerCase().includes(q)
    })
    .slice(0, 10)

  // ── filter lists ───────────────────────────────────────────────────────────
  const filteredLists = lists
    .filter((l) => {
      if (!q) return true
      return l.name.toLowerCase().includes(q)
    })
    .slice(0, 5)

  // ── filter tags ────────────────────────────────────────────────────────────
  const filteredTags = tags
    .filter((tag) => {
      if (!q) return true
      return tag.name.toLowerCase().includes(q)
    })
    .slice(0, 5)

  if (!open) return null

  return (
    <div
      className="command-palette-overlay"
      onClick={onClose}
      // prevent clicks from bubbling outside the portal
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="command-palette-panel"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <Command>
          <Command.Input
            className="command-palette-input"
            placeholder="搜索任务、清单、标签… (#标签 @清单 !urgent due:today status:doing)"
            value={search}
            onValueChange={setSearch}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                onClose()
              }
            }}
          />
          <Command.List className="command-palette-list">
            <Command.Empty className="command-palette-empty">
              没有找到匹配的结果
            </Command.Empty>

            {filteredTasks.length > 0 && (
              <Command.Group heading="任务" className="command-palette-section">
                {filteredTasks.map((task) => {
                  const list = lists.find((l) => l.id === task.listId)
                  return (
                    <Command.Item
                      key={task.id}
                      value={`task-${task.id}-${task.title}`}
                      className="command-palette-item"
                      onSelect={() => {
                        onSelectTask(task.id)
                        onClose()
                      }}
                    >
                      <span
                        className="cp-priority-dot"
                        style={{ background: PRIORITY_COLOR[task.priority ?? 'normal'] }}
                      />
                      <span className={`cp-task-title${task.completed ? ' is-completed' : ''}`}>
                        {task.title}
                      </span>
                      <span className="cp-task-meta">
                        {list && (
                          <span className="cp-list-badge" style={{ color: list.color }}>
                            {list.name}
                          </span>
                        )}
                        <span className="cp-status-badge">
                          {STATUS_LABEL[task.status] ?? task.status}
                        </span>
                      </span>
                    </Command.Item>
                  )
                })}
              </Command.Group>
            )}

            {filteredLists.length > 0 && (
              <Command.Group heading="清单" className="command-palette-section">
                {filteredLists.map((list) => {
                  const count = tasks.filter(
                    (t) => t.listId === list.id && !t.deleted && !t.completed,
                  ).length
                  return (
                    <Command.Item
                      key={list.id}
                      value={`list-${list.id}-${list.name}`}
                      className="command-palette-item"
                      onSelect={() => {
                        onSelectList(list.id)
                        onClose()
                      }}
                    >
                      <span className="cp-list-dot" style={{ background: list.color }} />
                      <span>{list.name}</span>
                      <span className="cp-count">{count} 个任务</span>
                    </Command.Item>
                  )
                })}
              </Command.Group>
            )}

            {filteredTags.length > 0 && (
              <Command.Group heading="标签" className="command-palette-section">
                {filteredTags.map((tag) => {
                  const count = tasks.filter(
                    (t) => (t.tagIds ?? []).includes(tag.id) && !t.deleted,
                  ).length
                  return (
                    <Command.Item
                      key={tag.id}
                      value={`tag-${tag.id}-${tag.name}`}
                      className="command-palette-item"
                      onSelect={() => setSearch(`#${tag.name}`)}
                    >
                      <span className="cp-tag-dot" style={{ background: tag.color }} />
                      <span>#{tag.name}</span>
                      <span className="cp-count">{count} 个任务</span>
                    </Command.Item>
                  )
                })}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  )
}
