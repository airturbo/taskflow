/**
 * ObsidianCommandPalette — Cmd+K command palette for the Obsidian plugin.
 *
 * Intentionally avoids any web-only dependencies (no cmdk, no lucide-react).
 * Uses only React hooks and Obsidian CSS variables for styling.
 *
 * Supports filter shortcuts:
 *   #tag   — filter by tag name
 *   @list  — filter by list name
 *   !      — filter by priority (urgent/high/normal/low)
 *   status:doing / status:todo / status:done
 *   due:today
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Task, TodoList, Tag } from '../core/domain';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  tasks: Task[];
  lists: TodoList[];
  tags: Tag[];
  onSelectTask: (taskId: string) => void;
  onSelectList: (listId: string) => void;
}

const PRIORITY_COLOR: Record<string, string> = {
  urgent: '#ef4444',
  high: '#f59e0b',
  normal: '#6c63ff',
  low: '#94a3b8',
};

const STATUS_LABEL: Record<string, string> = {
  todo: '待办',
  doing: '进行中',
  done: '已完成',
};

type ResultItem =
  | { kind: 'task'; task: Task; list: TodoList | undefined }
  | { kind: 'list'; list: TodoList; count: number }
  | { kind: 'tag'; tag: Tag; count: number };

export function ObsidianCommandPalette({
  open,
  onClose,
  tasks,
  lists,
  tags,
  onSelectTask,
  onSelectList,
}: CommandPaletteProps) {
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset search when palette opens/closes
  useEffect(() => {
    if (open) {
      setSearch('');
      setActiveIndex(0);
      // Defer focus to ensure the DOM is visible
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Close on Escape (capture phase to beat Obsidian)
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [open, onClose]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const q = search.trim().toLowerCase();

  // ── Compute results ────────────────────────────────────────────────────────
  const results = useMemo<ResultItem[]>(() => {
    const out: ResultItem[] = [];

    // Tasks
    const filteredTasks = tasks
      .filter((t) => {
        if (t.deleted) return false;
        if (!q) return true;
        if (q.startsWith('#')) {
          const tagName = q.slice(1);
          const matchedTagIds = tags
            .filter((tag) => tag.name.toLowerCase().includes(tagName))
            .map((tag) => tag.id);
          return matchedTagIds.some((id) => (t.tagIds ?? []).includes(id));
        }
        if (q.startsWith('@')) {
          const listName = q.slice(1);
          const matched = lists.find((l) => l.name.toLowerCase().includes(listName));
          return matched ? t.listId === matched.id : false;
        }
        if (q.startsWith('!')) {
          const prio = q.slice(1);
          return t.priority === prio || t.priority?.startsWith(prio);
        }
        if (q === 'due:today') {
          return t.dueAt?.startsWith(todayStr) ?? false;
        }
        if (q.startsWith('status:')) {
          return t.status === q.slice(7);
        }
        return (
          t.title.toLowerCase().includes(q) ||
          (t.note ?? '').toLowerCase().includes(q)
        );
      })
      .slice(0, 8);

    for (const task of filteredTasks) {
      out.push({ kind: 'task', task, list: lists.find((l) => l.id === task.listId) });
    }

    // Lists
    if (!q || q.startsWith('@') || (!q.startsWith('#') && !q.startsWith('!'))) {
      const listQ = q.startsWith('@') ? q.slice(1) : q;
      const filteredLists = lists
        .filter((l) => !listQ || l.name.toLowerCase().includes(listQ))
        .slice(0, 5);
      for (const list of filteredLists) {
        const count = tasks.filter((t) => t.listId === list.id && !t.deleted && !t.completed).length;
        out.push({ kind: 'list', list, count });
      }
    }

    // Tags
    if (!q || q.startsWith('#')) {
      const tagQ = q.startsWith('#') ? q.slice(1) : q;
      const filteredTags = tags
        .filter((tag) => !tagQ || tag.name.toLowerCase().includes(tagQ))
        .slice(0, 5);
      for (const tag of filteredTags) {
        const count = tasks.filter((t) => (t.tagIds ?? []).includes(tag.id) && !t.deleted).length;
        out.push({ kind: 'tag', tag, count });
      }
    }

    return out;
  }, [tasks, lists, tags, q, todayStr]);

  // Scroll active item into view
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const item = container.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    item?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = results[activeIndex];
        if (!item) return;
        if (item.kind === 'task') {
          onSelectTask(item.task.id);
          onClose();
        } else if (item.kind === 'list') {
          onSelectList(item.list.id);
          onClose();
        } else if (item.kind === 'tag') {
          setSearch(`#${item.tag.name}`);
        }
      }
    },
    [results, activeIndex, onSelectTask, onSelectList, onClose],
  );

  const handleSelect = useCallback(
    (item: ResultItem) => {
      if (item.kind === 'task') {
        onSelectTask(item.task.id);
        onClose();
      } else if (item.kind === 'list') {
        onSelectList(item.list.id);
        onClose();
      } else if (item.kind === 'tag') {
        setSearch(`#${item.tag.name}`);
        setActiveIndex(0);
      }
    },
    [onSelectTask, onSelectList, onClose],
  );

  if (!open) return null;

  return (
    <div
      className="tw-cmd-overlay"
      onMouseDown={(e) => {
        // Close when clicking backdrop
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="tw-cmd-panel" onMouseDown={(e) => e.stopPropagation()}>
        {/* Search input */}
        <div className="tw-cmd-input-wrap">
          <span className="tw-cmd-icon">⌘</span>
          <input
            ref={inputRef}
            className="tw-cmd-input"
            placeholder="搜索任务、清单、标签…  (#标签  @清单  !urgent  due:today  status:doing)"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
          {search && (
            <button
              className="tw-cmd-clear"
              onMouseDown={(e) => {
                e.preventDefault();
                setSearch('');
                setActiveIndex(0);
                inputRef.current?.focus();
              }}
              tabIndex={-1}
            >
              ✕
            </button>
          )}
        </div>

        {/* Results */}
        <div ref={listRef} className="tw-cmd-list">
          {results.length === 0 ? (
            <div className="tw-cmd-empty">没有找到匹配结果</div>
          ) : (
            results.map((item, idx) => {
              const isActive = idx === activeIndex;
              if (item.kind === 'task') {
                const { task, list } = item;
                return (
                  <div
                    key={`task-${task.id}`}
                    data-index={idx}
                    className={`tw-cmd-item ${isActive ? 'is-active' : ''}`}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onMouseDown={(e) => { e.preventDefault(); handleSelect(item); }}
                  >
                    <span
                      className="tw-cmd-dot"
                      style={{ background: PRIORITY_COLOR[task.priority ?? 'normal'] }}
                    />
                    <span className={`tw-cmd-title ${task.completed ? 'tw-cmd-title--done' : ''}`}>
                      {task.title}
                    </span>
                    <span className="tw-cmd-meta">
                      {list && (
                        <span className="tw-cmd-list-badge" style={{ color: list.color }}>
                          {list.name}
                        </span>
                      )}
                      <span className="tw-cmd-status">
                        {STATUS_LABEL[task.status] ?? task.status}
                      </span>
                    </span>
                    <span className="tw-cmd-kind">任务</span>
                  </div>
                );
              }
              if (item.kind === 'list') {
                const { list, count } = item;
                return (
                  <div
                    key={`list-${list.id}`}
                    data-index={idx}
                    className={`tw-cmd-item ${isActive ? 'is-active' : ''}`}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onMouseDown={(e) => { e.preventDefault(); handleSelect(item); }}
                  >
                    <span
                      className="tw-cmd-dot"
                      style={{ background: list.color }}
                    />
                    <span className="tw-cmd-title">{list.name}</span>
                    <span className="tw-cmd-meta">
                      <span className="tw-cmd-count">{count} 待办</span>
                    </span>
                    <span className="tw-cmd-kind">清单</span>
                  </div>
                );
              }
              // tag
              const { tag, count } = item;
              return (
                <div
                  key={`tag-${tag.id}`}
                  data-index={idx}
                  className={`tw-cmd-item ${isActive ? 'is-active' : ''}`}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onMouseDown={(e) => { e.preventDefault(); handleSelect(item); }}
                >
                  <span
                    className="tw-cmd-dot"
                    style={{ background: tag.color }}
                  />
                  <span className="tw-cmd-title">#{tag.name}</span>
                  <span className="tw-cmd-meta">
                    <span className="tw-cmd-count">{count} 任务</span>
                  </span>
                  <span className="tw-cmd-kind">标签</span>
                </div>
              );
            })
          )}
        </div>

        {/* Footer hint */}
        <div className="tw-cmd-footer">
          <kbd>↑↓</kbd> 导航　<kbd>Enter</kbd> 确认　<kbd>Esc</kbd> 关闭
        </div>
      </div>
    </div>
  );
}
