import { useCallback, useEffect, useRef, useState } from 'react';
import type { Priority, TaskStatus, Tag } from '../core/domain';
import type { CreateTaskPayload } from '../types';

interface InlineCreatePopoverProps {
  tags: Tag[];
  listOptions: { id: string; name: string }[];
  defaultListId?: string;
  defaultStatus?: TaskStatus;
  defaultPriority?: Priority;
  defaultDueAt?: string;
  onCreateTask: (payload: CreateTaskPayload) => Promise<void>;
  onClose: () => void;
}

const PRIORITY_LABELS: Record<Priority, string> = { urgent: 'P1 紧急', high: 'P2 高', normal: 'P3 普通', low: 'P4 低' };
const STATUS_LABELS: Record<TaskStatus, string> = { todo: '待办', doing: '进行中', done: '已完成' };

const POS_STORAGE_KEY = 'tw-inline-create-pos';
const GUIDANCE_DISMISSED_KEY = 'tw-inline-create-guidance-dismissed';

function loadSavedPos(): { x: number; y: number } {
  try {
    const raw = localStorage.getItem(POS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.x === 'number' && typeof parsed.y === 'number') return parsed;
    }
  } catch { /* noop */ }
  return { x: 0, y: 0 };
}

function savePos(pos: { x: number; y: number }) {
  try {
    localStorage.setItem(POS_STORAGE_KEY, JSON.stringify(pos));
  } catch { /* noop */ }
}

function isGuidanceDismissed(): boolean {
  try {
    return localStorage.getItem(GUIDANCE_DISMISSED_KEY) === '1';
  } catch { return false; }
}

export function InlineCreatePopover({
  tags,
  listOptions,
  defaultListId = 'inbox',
  defaultStatus = 'todo',
  defaultPriority = 'normal',
  defaultDueAt,
  onCreateTask,
  onClose,
}: InlineCreatePopoverProps) {
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [noteExpanded, setNoteExpanded] = useState(false);
  const [listId, setListId] = useState(defaultListId);
  const [priority, setPriority] = useState<Priority>(defaultPriority);
  const [status, setStatus] = useState<TaskStatus>(defaultStatus);
  const [dueDate, setDueDate] = useState(defaultDueAt?.slice(0, 10) ?? '');
  const [dueTime, setDueTime] = useState(defaultDueAt?.slice(11, 16) ?? '');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showGuidance, setShowGuidance] = useState(!isGuidanceDismissed());

  // Drag position with memory
  const [pos, setPos] = useState(loadSavedPos);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const handleHeaderPointerDown = useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
  }, [pos]);

  const handleHeaderPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPos({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy });
  }, []);

  const handleHeaderPointerUp = useCallback((e: React.PointerEvent) => {
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
    if (dragRef.current) {
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      const finalPos = { x: dragRef.current.origX + dx, y: dragRef.current.origY + dy };
      savePos(finalPos);
    }
    dragRef.current = null;
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const dueAt = dueDate ? (dueTime ? `${dueDate}T${dueTime}` : dueDate) : undefined;
      await onCreateTask({
        title: trimmed,
        note: note.trim() || undefined,
        listId,
        priority,
        status,
        dueAt: dueAt ?? null,
        tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  }, [title, note, listId, priority, status, dueDate, dueTime, selectedTagIds, onCreateTask, onClose]);

  const toggleTag = useCallback((tagId: string) => {
    setSelectedTagIds(prev => prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  }, [onClose]);

  const dismissGuidance = useCallback(() => {
    setShowGuidance(false);
    try { localStorage.setItem(GUIDANCE_DISMISSED_KEY, '1'); } catch { /* noop */ }
  }, []);

  // Auto-dismiss guidance after 8s
  useEffect(() => {
    if (!showGuidance) return;
    const t = setTimeout(dismissGuidance, 8000);
    return () => clearTimeout(t);
  }, [showGuidance, dismissGuidance]);

  return (
    <>
      <div className="tw-inline-create-backdrop" onClick={onClose} />
      <div
        className="tw-inline-create-popover"
        style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
        onKeyDown={handleKeyDown}
      >
        {/* Draggable header */}
        <div
          className="tw-inline-create-popover__hero"
          onPointerDown={handleHeaderPointerDown}
          onPointerMove={handleHeaderPointerMove}
          onPointerUp={handleHeaderPointerUp}
        >
          <span>新建任务</span>
          <button className="tw-btn-icon" onClick={onClose}>✕</button>
        </div>

        {/* Guidance */}
        {showGuidance && (
          <div className="tw-inline-create-popover__guidance" onClick={dismissGuidance}>
            输入标题，按 Tab 跳到备注，回车创建
          </div>
        )}

        {/* Form */}
        <div className="tw-inline-create-popover__body">
          <input
            className="tw-composer__input"
            placeholder="任务标题"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSubmit();
              }
              if (e.key === 'Tab' && !e.shiftKey) {
                e.preventDefault();
                setNoteExpanded(true);
                setTimeout(() => noteRef.current?.focus(), 50);
              }
            }}
            autoFocus
          />

          {/* Collapsible note */}
          {!noteExpanded ? (
            <button
              className="tw-btn-xs"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => {
                setNoteExpanded(true);
                setTimeout(() => noteRef.current?.focus(), 50);
              }}
            >
              + 添加备注
            </button>
          ) : (
            <textarea
              ref={noteRef}
              className="tw-inline-create-popover__note"
              placeholder="备注（可选）"
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={3}
            />
          )}

          <div className="tw-inline-create-popover__fields">
            <div className="tw-detail__field">
              <label>清单</label>
              <select value={listId} onChange={e => setListId(e.target.value)}>
                {listOptions.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="tw-detail__field">
              <label>优先级</label>
              <select value={priority} onChange={e => setPriority(e.target.value as Priority)}>
                {(['urgent', 'high', 'normal', 'low'] as const).map(p => (
                  <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                ))}
              </select>
            </div>
            <div className="tw-detail__field">
              <label>状态</label>
              <select value={status} onChange={e => setStatus(e.target.value as TaskStatus)}>
                {(['todo', 'doing', 'done'] as const).map(s => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div className="tw-detail__field">
              <label>日期</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div className="tw-detail__field">
              <label>时间</label>
              <input type="time" value={dueTime} onChange={e => setDueTime(e.target.value)} />
            </div>
          </div>

          {tags.length > 0 && (
            <div className="tw-inline-create-popover__tags">
              <label className="tw-detail__label">标签</label>
              <div className="tw-detail__tags">
                {tags.map(tag => (
                  <button
                    key={tag.id}
                    className={`tw-tag-toggle ${selectedTagIds.includes(tag.id) ? 'is-active' : ''}`}
                    style={{
                      borderColor: tag.color,
                      background: selectedTagIds.includes(tag.id) ? tag.color : undefined,
                      color: selectedTagIds.includes(tag.id) ? '#fff' : undefined,
                    }}
                    onClick={() => toggleTag(tag.id)}
                  >{tag.name}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="tw-inline-create-popover__footer">
          <button className="tw-btn-sm" onClick={onClose}>取消</button>
          <button
            className="tw-btn-sm tw-btn-primary"
            disabled={submitting || !title.trim()}
            onClick={() => void handleSubmit()}
          >创建任务</button>
        </div>
      </div>
    </>
  );
}
