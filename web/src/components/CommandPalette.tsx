import { useState, useEffect, useCallback } from 'react'
import { Command } from 'cmdk'
import type { Priority, Tag, Task, TaskStatus, TodoList } from '../types/domain'
import type { FilterDue } from '../hooks/useFilterState'
import styles from './CommandPalette.module.css'

// ─── NLP Parsing ──────────────────────────────────────────────────────────────

export interface ParsedCommandQuery {
  tags: string[]        // tag ids matched by name
  priority: Priority | null
  status: TaskStatus | null
  due: FilterDue
  listName: string | null  // for display only, not applied to FilterState
  keyword: string
}

const PRIORITY_ALIASES: Record<string, Priority> = {
  urgent: 'urgent',
  '紧急': 'urgent',
  p0: 'urgent',
  high: 'high',
  高: 'high',
  p1: 'high',
  normal: 'normal',
  普通: 'normal',
  p2: 'normal',
  low: 'low',
  低: 'low',
  p3: 'low',
}

const STATUS_ALIASES: Record<string, TaskStatus> = {
  todo: 'todo',
  待办: 'todo',
  doing: 'doing',
  进行中: 'doing',
  done: 'done',
  已完成: 'done',
}

const DUE_ALIASES: Record<string, FilterDue> = {
  overdue: 'overdue',
  已逾期: 'overdue',
  today: 'today',
  今天: 'today',
  week: 'week',
  本周: 'week',
}

export function parseCommandQuery(input: string, allTags: Tag[]): ParsedCommandQuery {
  const tokens = input.trim().split(/\s+/)
  const result: ParsedCommandQuery = {
    tags: [],
    priority: null,
    status: null,
    due: null,
    listName: null,
    keyword: '',
  }
  const keywordParts: string[] = []

  for (const token of tokens) {
    if (!token) continue

    // #tagname
    if (token.startsWith('#')) {
      const name = token.slice(1).toLowerCase()
      const matched = allTags.find(t => t.name.toLowerCase() === name || t.name.toLowerCase().includes(name))
      if (matched && !result.tags.includes(matched.id)) {
        result.tags.push(matched.id)
      } else {
        keywordParts.push(token)
      }
      continue
    }

    // !priority
    if (token.startsWith('!')) {
      const alias = token.slice(1).toLowerCase()
      const p = PRIORITY_ALIASES[alias]
      if (p) { result.priority = p; continue }
      keywordParts.push(token)
      continue
    }

    // status:xxx
    if (token.toLowerCase().startsWith('status:')) {
      const val = token.slice(7).toLowerCase()
      const s = STATUS_ALIASES[val]
      if (s) { result.status = s; continue }
      keywordParts.push(token)
      continue
    }

    // due:xxx
    if (token.toLowerCase().startsWith('due:')) {
      const val = token.slice(4).toLowerCase()
      const d = DUE_ALIASES[val]
      if (d !== undefined) { result.due = d; continue }
      keywordParts.push(token)
      continue
    }

    // @listname — display only
    if (token.startsWith('@')) {
      if (!result.listName) result.listName = token.slice(1)
      continue
    }

    keywordParts.push(token)
  }

  result.keyword = keywordParts.join(' ')
  return result
}

// ─── Apply Filter Payload ─────────────────────────────────────────────────────

export interface ApplyFilterPayload {
  tagIds: string[]
  priority: Priority | null
  status: TaskStatus | null
  due: FilterDue
  keyword: string
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  tasks: Task[]
  lists: TodoList[]
  tags: Tag[]
  onSelectTask: (taskId: string) => void
  onSelectList: (listId: string) => void
  onApplyFilter?: (payload: ApplyFilterPayload) => void
}

const PRIORITY_COLOR: Record<string, string> = {
  urgent: '#ef4444',
  high: '#f59e0b',
  normal: '#6c63ff',
  low: '#94a3b8',
}

const PRIORITY_LABEL: Record<string, string> = {
  urgent: '紧急',
  high: '高',
  normal: '普通',
  low: '低',
}

const STATUS_LABEL: Record<string, string> = {
  todo: '待办',
  doing: '进行中',
  done: '已完成',
}

const DUE_LABEL: Record<string, string> = {
  overdue: '已逾期',
  today: '今天',
  week: '本周',
}

export function CommandPalette({
  open,
  onClose,
  tasks,
  lists,
  tags,
  onSelectTask,
  onSelectList,
  onApplyFilter,
}: CommandPaletteProps) {
  const [search, setSearch] = useState('')

  // Clear search when palette closes
  useEffect(() => {
    if (!open) setSearch('')
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [open, onClose])

  const todayStr = new Date().toISOString().slice(0, 10)
  const q = search.trim().toLowerCase()

  // ── NLP parse ─────────────────────────────────────────────────────────────
  const parsed = parseCommandQuery(search, tags)
  const hasFilterChips =
    parsed.tags.length > 0 ||
    parsed.priority !== null ||
    parsed.status !== null ||
    parsed.due !== null ||
    parsed.listName !== null ||
    parsed.keyword !== ''

  const handleApply = useCallback(() => {
    if (onApplyFilter) {
      onApplyFilter({
        tagIds: parsed.tags,
        priority: parsed.priority,
        status: parsed.status,
        due: parsed.due,
        keyword: parsed.keyword,
      })
    }
    onClose()
  }, [onApplyFilter, onClose, parsed])

  // Cmd+Enter applies filters
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      e.stopPropagation()
      handleApply()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
  }, [handleApply, onClose])

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
      className={styles.commandPaletteOverlay}
      onClick={onClose}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className={styles.commandPalettePanel}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <Command>
          <Command.Input
            className={styles.commandPaletteInput}
            placeholder="搜索任务、清单、标签… (#标签 @清单 !urgent due:today status:doing)"
            value={search}
            onValueChange={setSearch}
            autoFocus
            onKeyDown={handleKeyDown}
          />

          {/* ── NLP chip preview row ──────────────────────────────────────── */}
          {hasFilterChips && (
            <div className={styles.nlpChipRow}>
              {parsed.tags.map(tagId => {
                const tag = tags.find(t => t.id === tagId)
                if (!tag) return null
                return (
                  <span key={tagId} className={`${styles.nlpChip} ${styles.nlpChipTag}`} style={{ '--chip-color': tag.color } as React.CSSProperties}>
                    <span className={styles.nlpChipDot} style={{ background: tag.color }} />
                    #{tag.name}
                  </span>
                )
              })}
              {parsed.priority && (
                <span className={`${styles.nlpChip} ${styles.nlpChipPriority}`} style={{ '--chip-color': PRIORITY_COLOR[parsed.priority] } as React.CSSProperties}>
                  <span className={styles.nlpChipIcon}>!</span>
                  {PRIORITY_LABEL[parsed.priority]}
                </span>
              )}
              {parsed.status && (
                <span className={`${styles.nlpChip} ${styles.nlpChipStatus}`}>
                  <span className={styles.nlpChipIcon}>◎</span>
                  {STATUS_LABEL[parsed.status]}
                </span>
              )}
              {parsed.due && (
                <span className={`${styles.nlpChip} ${parsed.due === 'overdue' ? styles.nlpChipDueOverdue : styles.nlpChipDue}`}>
                  <span className={styles.nlpChipIcon}>📅</span>
                  {DUE_LABEL[parsed.due]}
                </span>
              )}
              {parsed.listName && (
                <span className={`${styles.nlpChip} ${styles.nlpChipList}`}>
                  <span className={styles.nlpChipIcon}>@</span>
                  {parsed.listName}
                </span>
              )}
              {parsed.keyword && (
                <span className={`${styles.nlpChip} ${styles.nlpChipKeyword}`}>
                  <span className={styles.nlpChipIcon}>🔍</span>
                  {parsed.keyword}
                </span>
              )}
              {onApplyFilter && (
                <button className={styles.nlpApplyBtn} onClick={handleApply} type="button">
                  应用筛选
                  <span className={styles.nlpApplyShortcut}>⌘↵</span>
                </button>
              )}
            </div>
          )}

          <Command.List className={styles.commandPaletteList}>
            <Command.Empty className={styles.commandPaletteEmpty}>
              没有找到匹配的结果
            </Command.Empty>

            {filteredTasks.length > 0 && (
              <Command.Group heading="任务" className={styles.commandPaletteSection}>
                {filteredTasks.map((task) => {
                  const list = lists.find((l) => l.id === task.listId)
                  return (
                    <Command.Item
                      key={task.id}
                      value={`task-${task.id}-${task.title}`}
                      className={styles.commandPaletteItem}
                      onSelect={() => {
                        onSelectTask(task.id)
                        onClose()
                      }}
                    >
                      <span
                        className={styles.cpPriorityDot}
                        style={{ background: PRIORITY_COLOR[task.priority ?? 'normal'] }}
                      />
                      <span className={`${styles.cpTaskTitle}${task.completed ? ` ${styles.isCompleted}` : ''}`}>
                        {task.title}
                      </span>
                      <span className={styles.cpTaskMeta}>
                        {list && (
                          <span className={styles.cpListBadge} style={{ color: list.color }}>
                            {list.name}
                          </span>
                        )}
                        <span className={styles.cpStatusBadge}>
                          {STATUS_LABEL[task.status] ?? task.status}
                        </span>
                      </span>
                    </Command.Item>
                  )
                })}
              </Command.Group>
            )}

            {filteredLists.length > 0 && (
              <Command.Group heading="清单" className={styles.commandPaletteSection}>
                {filteredLists.map((list) => {
                  const count = tasks.filter(
                    (t) => t.listId === list.id && !t.deleted && !t.completed,
                  ).length
                  return (
                    <Command.Item
                      key={list.id}
                      value={`list-${list.id}-${list.name}`}
                      className={styles.commandPaletteItem}
                      onSelect={() => {
                        onSelectList(list.id)
                        onClose()
                      }}
                    >
                      <span className={styles.cpListDot} style={{ background: list.color }} />
                      <span>{list.name}</span>
                      <span className={styles.cpCount}>{count} 个任务</span>
                    </Command.Item>
                  )
                })}
              </Command.Group>
            )}

            {filteredTags.length > 0 && (
              <Command.Group heading="标签" className={styles.commandPaletteSection}>
                {filteredTags.map((tag) => {
                  const count = tasks.filter(
                    (t) => (t.tagIds ?? []).includes(tag.id) && !t.deleted,
                  ).length
                  return (
                    <Command.Item
                      key={tag.id}
                      value={`tag-${tag.id}-${tag.name}`}
                      className={styles.commandPaletteItem}
                      onSelect={() => setSearch(`#${tag.name}`)}
                    >
                      <span className={styles.cpTagDot} style={{ background: tag.color }} />
                      <span>#{tag.name}</span>
                      <span className={styles.cpCount}>{count} 个任务</span>
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
