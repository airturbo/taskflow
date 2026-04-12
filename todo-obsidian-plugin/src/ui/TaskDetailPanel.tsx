import { useCallback, useEffect, useRef, useState } from 'react';
import type { App } from 'obsidian';
import { MarkdownRenderer } from 'obsidian';
import type { Task, TodoList, Tag, Priority } from '../core/domain';
import { formatDateTime } from '../core/dates';
import { REPEAT_RULE_OPTIONS } from '../core/repeat-rule';
import { describeReminder } from '../core/reminder-engine';
import { TagPickerModal } from './TagPickerModal';

interface TaskDetailPanelProps {
  task: Task;
  lists: TodoList[];
  tags: Tag[];
  vaultTags: string[];
  app: App;
  onClose: () => void;
  onUpdateTask: (taskId: string, patch: Partial<Task>) => Promise<void>;
  onToggleTask: (taskId: string) => Promise<void>;
  onSoftDeleteTask: (taskId: string) => Promise<void>;
  onRestoreTask: (taskId: string) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onDuplicateTask: (taskId: string) => Promise<void>;
  onAddSubtask: (taskId: string, title: string) => Promise<void>;
  onToggleSubtask: (taskId: string, subtaskId: string) => Promise<void>;
  onAddComment: (taskId: string, content: string) => Promise<void>;
  onAddReminder: (taskId: string, label: string, value: string, kind: 'relative' | 'absolute') => Promise<void>;
  onRemoveReminder: (taskId: string, reminderId: string) => Promise<void>;
  onAddTag: (name: string, color: string) => Promise<void>;
}

const PRIORITIES: Priority[] = ['urgent', 'high', 'normal', 'low'];
const PRIORITY_LABELS: Record<Priority, string> = { urgent: 'P1 紧急', high: 'P2 高', normal: 'P3 普通', low: 'P4 低' };
const STATUS_LABELS: Record<string, string> = { todo: '○ 待办', doing: '◔ 进行中', done: '✓ 已完成' };

// ─── Reminder helpers ────────────────────────────────────────────────

type AnchorKey = 'deadline' | 'planned' | 'start';

function formatReminderAnchorLabel(anchor: AnchorKey): string {
  if (anchor === 'deadline') return 'DDL';
  if (anchor === 'planned') return '计划完成';
  return '开始时间';
}

function formatReminderOffsetLabel(amount: number, unit: string): string {
  if (amount === 0) return '到点提醒';
  const unitLabel = unit === 'm' ? '分钟' : unit === 'h' ? '小时' : '天';
  return `提前 ${amount} ${unitLabel}`;
}

function buildRelativeReminderValue(anchor: AnchorKey, amount: number, unit: string): string {
  return `${anchor}|${amount}${unit}`;
}

const ANCHOR_OPTIONS: AnchorKey[] = ['deadline', 'planned', 'start'];

const PRESET_OFFSETS: { amount: number; unit: string; label: string }[] = [
  { amount: 0, unit: 'm', label: '到点' },
  { amount: 15, unit: 'm', label: '15分钟' },
  { amount: 30, unit: 'm', label: '30分钟' },
  { amount: 1, unit: 'h', label: '1小时' },
  { amount: 2, unit: 'h', label: '2小时' },
  { amount: 1, unit: 'd', label: '1天' },
];

const DEFAULT_PALETTE = ['#6366f1', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6', '#eab308', '#64748b', '#22c55e'];

// ─── Markdown preview component ─────────────────────────────────────

function MarkdownPreview({ content, app }: { content: string; app: App }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.empty();
    if (content.trim()) {
      void MarkdownRenderer.render(app, content, el, '', null as never);
    } else {
      el.setText('点击添加备注…');
      el.addClass('tw-muted');
    }
  }, [content, app]);

  return <div ref={containerRef} className="tw-detail__note-preview" />;
}

// ─── Main component ─────────────────────────────────────────────────

export function TaskDetailPanel({
  task, lists, tags, vaultTags, app, onClose,
  onUpdateTask, onToggleTask,
  onSoftDeleteTask, onRestoreTask, onDeleteTask,
  onDuplicateTask, onAddSubtask, onToggleSubtask, onAddComment,
  onAddReminder, onRemoveReminder, onAddTag,
}: TaskDetailPanelProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const [noteDraft, setNoteDraft] = useState(task.note);
  const [editingNote, setEditingNote] = useState(false);
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const [commentDraft, setCommentDraft] = useState('');
  const [tagPickerOpen, setTagPickerOpen] = useState(false);

  // Reminder composer state
  const [reminderMode, setReminderMode] = useState<'relative' | 'absolute'>('relative');
  const [reminderAnchor, setReminderAnchor] = useState<AnchorKey>('deadline');
  const [customAmount, setCustomAmount] = useState('');
  const [customUnit, setCustomUnit] = useState('m');
  const [absoluteValue, setAbsoluteValue] = useState('');

  // Sync state when task changes
  useEffect(() => { setTitleDraft(task.title); }, [task.title]);
  useEffect(() => { setNoteDraft(task.note); }, [task.note]);

  const saveTitle = useCallback(() => {
    const t = titleDraft.trim();
    if (t && t !== task.title) {
      void onUpdateTask(task.id, { title: t });
    }
    setEditingTitle(false);
  }, [titleDraft, task.id, task.title, onUpdateTask]);

  const saveNote = useCallback(() => {
    if (noteDraft !== task.note) {
      void onUpdateTask(task.id, { note: noteDraft });
    }
    setEditingNote(false);
  }, [noteDraft, task.id, task.note, onUpdateTask]);

  const handleAddSubtask = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!subtaskDraft.trim()) return;
    void onAddSubtask(task.id, subtaskDraft);
    setSubtaskDraft('');
  }, [subtaskDraft, task.id, onAddSubtask]);

  const handleAddComment = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!commentDraft.trim()) return;
    void onAddComment(task.id, commentDraft);
    setCommentDraft('');
  }, [commentDraft, task.id, onAddComment]);

  const handlePresetReminder = useCallback((amount: number, unit: string) => {
    const value = buildRelativeReminderValue(reminderAnchor, amount, unit);
    const label = formatReminderOffsetLabel(amount, unit);
    void onAddReminder(task.id, label, value, 'relative');
  }, [reminderAnchor, task.id, onAddReminder]);

  const handleCustomReminder = useCallback(() => {
    const amt = parseInt(customAmount);
    if (!amt || amt <= 0) return;
    const value = buildRelativeReminderValue(reminderAnchor, amt, customUnit);
    const label = formatReminderOffsetLabel(amt, customUnit);
    void onAddReminder(task.id, label, value, 'relative');
    setCustomAmount('');
  }, [customAmount, customUnit, reminderAnchor, task.id, onAddReminder]);

  const handleAbsoluteReminder = useCallback(() => {
    if (!absoluteValue) return;
    const label = `固定提醒 ${formatDateTime(absoluteValue)}`;
    void onAddReminder(task.id, label, absoluteValue, 'absolute');
    setAbsoluteValue('');
  }, [absoluteValue, task.id, onAddReminder]);

  return (
    <aside className="tw-detail">
      <div className="tw-detail__header">
        <h3
          className="tw-detail__heading tw-detail__heading--clickable"
          onClick={() => { setTitleDraft(task.title); setEditingTitle(true); }}
          title="点击编辑标题"
        >
          {task.title}
        </h3>
        <select
          className="tw-detail__status-badge"
          value={task.status}
          onChange={e => void onUpdateTask(task.id, {
            status: e.target.value as Task['status'],
            completed: e.target.value === 'done',
          })}
        >
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button className="tw-btn-icon" onClick={onClose}>✕</button>
      </div>

      <div className="tw-detail__body">
        {/* 标题 */}
        <section className="tw-detail__section">
          {editingTitle ? (
            <input
              className="tw-detail__title-input"
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={e => { if (e.key === 'Enter') saveTitle(); }}
              autoFocus
            />
          ) : (
            <h2 className="tw-detail__title" onClick={() => { setTitleDraft(task.title); setEditingTitle(true); }}>
              {task.title}
            </h2>
          )}
        </section>

        {/* 状态 / 优先级 / 列表 */}
        <section className="tw-detail__section tw-detail__meta-grid">
          <div className="tw-detail__field">
            <label>状态</label>
            <select
              value={task.status}
              onChange={e => void onUpdateTask(task.id, {
                status: e.target.value as Task['status'],
                completed: e.target.value === 'done',
              })}
            >
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div className="tw-detail__field">
            <label>优先级</label>
            <select
              value={task.priority}
              onChange={e => void onUpdateTask(task.id, { priority: e.target.value as Priority })}
            >
              {PRIORITIES.map(p => (
                <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
              ))}
            </select>
          </div>

          <div className="tw-detail__field">
            <label>列表</label>
            <select
              value={task.listId}
              onChange={e => void onUpdateTask(task.id, { listId: e.target.value })}
            >
              {lists.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
        </section>

        {/* 标签 */}
        <section className="tw-detail__section">
          <label className="tw-detail__label">标签</label>
          <div className="tw-detail__tags">
            {tags.filter(t => task.tagIds.includes(t.id)).map(tag => (
              <span key={tag.id} className="tw-tag-chip--toned" style={{
                borderColor: `${tag.color}22`,
                background: `${tag.color}12`,
              }}>
                <i className="tw-tag-chip__dot" style={{ background: tag.color }} />
                {tag.name}
              </span>
            ))}
            <button className="tw-btn-xs" onClick={() => setTagPickerOpen(true)}>编辑标签</button>
          </div>
          {tagPickerOpen && (
            <TagPickerModal
              tags={tags}
              vaultTags={vaultTags}
              activeTagIds={task.tagIds}
              onToggleTag={(tagId, active) => {
                const next = active
                  ? [...task.tagIds, tagId]
                  : task.tagIds.filter(id => id !== tagId);
                void onUpdateTask(task.id, { tagIds: next });
              }}
              onImportVaultTag={(name) => {
                const colorIndex = tags.length % DEFAULT_PALETTE.length;
                void onAddTag(name, DEFAULT_PALETTE[colorIndex]);
              }}
              onCreateTag={(name, color) => void onAddTag(name, color)}
              onClose={() => setTagPickerOpen(false)}
            />
          )}
        </section>

        {/* 时间 */}
        <section className="tw-detail__section tw-detail__meta-grid">
          <div className="tw-detail__field">
            <label>开始时间</label>
            <input
              type="datetime-local"
              value={task.startAt?.slice(0, 16) ?? ''}
              onChange={e => void onUpdateTask(task.id, { startAt: e.target.value || null })}
            />
          </div>
          <div className="tw-detail__field">
            <label>计划完成</label>
            <input
              type="datetime-local"
              value={task.dueAt?.slice(0, 16) ?? ''}
              onChange={e => void onUpdateTask(task.id, { dueAt: e.target.value || null })}
            />
          </div>
          <div className="tw-detail__field">
            <label>截止时间</label>
            <input
              type="datetime-local"
              value={task.deadlineAt?.slice(0, 16) ?? ''}
              onChange={e => void onUpdateTask(task.id, { deadlineAt: e.target.value || null })}
            />
          </div>
        </section>

        {/* 重复规则（可编辑） */}
        <section className="tw-detail__section">
          <label className="tw-detail__label">重复</label>
          <select
            value={task.repeatRule || ''}
            onChange={e => void onUpdateTask(task.id, { repeatRule: e.target.value })}
            style={{ width: '100%', padding: '5px 6px', borderRadius: 8, border: '1px solid var(--background-modifier-border)', background: 'var(--background-secondary)', color: 'var(--text-normal)', fontSize: 12 }}
          >
            {REPEAT_RULE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </section>

        {/* 备注（Markdown 预览/编辑 — 自动伸缩 Task #6） */}
        <section className="tw-detail__section">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <label className="tw-detail__label" style={{ marginBottom: 0 }}>备注</label>
            {editingNote && <span className="tw-note-editor__counter">{noteDraft.length} 字</span>}
          </div>
          {editingNote ? (
            <AutoExpandTextarea
              className="tw-detail__textarea"
              value={noteDraft}
              onChange={e => setNoteDraft(e.target.value)}
              onBlur={saveNote}
              placeholder="支持 Markdown 语法、[[内部链接]]、#标签…"
              minRows={4}
              maxRows={12}
              autoFocus
            />
          ) : (
            <div onClick={() => { setNoteDraft(task.note); setEditingNote(true); }} style={{ cursor: 'pointer' }}>
              <MarkdownPreview content={task.note} app={app} />
            </div>
          )}
        </section>

        {/* 子任务 */}
        <section className="tw-detail__section">
          <label className="tw-detail__label">
            子任务 ({task.subtasks.filter(s => s.completed).length}/{task.subtasks.length})
          </label>
          <div className="tw-subtask-list">
            {task.subtasks.map(sub => (
              <label key={sub.id} className="tw-subtask-item">
                <input
                  type="checkbox"
                  checked={sub.completed}
                  onChange={() => void onToggleSubtask(task.id, sub.id)}
                />
                <span className={sub.completed ? 'tw-line-through' : ''}>{sub.title}</span>
              </label>
            ))}
          </div>
          <form className="tw-inline-form" onSubmit={handleAddSubtask}>
            <input
              placeholder="添加子任务…"
              value={subtaskDraft}
              onChange={e => setSubtaskDraft(e.target.value)}
            />
            <button type="submit" className="tw-btn-sm" disabled={!subtaskDraft.trim()}>添加</button>
          </form>
        </section>

        {/* 评论 */}
        <section className="tw-detail__section">
          <label className="tw-detail__label">评论 ({task.comments.length})</label>
          <div className="tw-comment-list">
            {task.comments.map(c => (
              <div key={c.id} className="tw-comment-item">
                <div className="tw-comment-item__header">
                  <strong>{c.author}</strong>
                  <span className="tw-muted">{formatDateTime(c.createdAt)}</span>
                </div>
                <p>{c.content}</p>
              </div>
            ))}
          </div>
          <form className="tw-inline-form tw-inline-form--comment" onSubmit={handleAddComment}>
            <textarea
              className="tw-detail__textarea"
              placeholder="写评论…"
              value={commentDraft}
              onChange={e => setCommentDraft(e.target.value)}
              rows={2}
            />
            <button type="submit" className="tw-btn-sm" disabled={!commentDraft.trim()}>发送</button>
          </form>
        </section>

        {/* 提醒编辑器 */}
        <section className="tw-detail__section">
          <label className="tw-detail__label">提醒</label>

          {/* 已有提醒列表 */}
          {task.reminders.length > 0 && (
            <div className="tw-reminder-list">
              {task.reminders.map(r => {
                const desc = describeReminder(task, r);
                return (
                  <div key={r.id} className="tw-reminder-rule-card">
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, fontSize: 12 }}>{desc.label}</div>
                      <div className="tw-muted" style={{ fontSize: 11 }}>
                        {desc.anchorLabel} · {desc.triggerAtLabel}
                      </div>
                    </div>
                    <button
                      className="tw-btn-xs tw-btn-danger"
                      onClick={() => void onRemoveReminder(task.id, r.id)}
                    >
                      删除
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* 新建提醒 */}
          <div className="tw-reminder-composer">
            <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
              <button
                className={`tw-btn-xs ${reminderMode === 'relative' ? 'is-active' : ''}`}
                onClick={() => setReminderMode('relative')}
              >相对提醒</button>
              <button
                className={`tw-btn-xs ${reminderMode === 'absolute' ? 'is-active' : ''}`}
                onClick={() => setReminderMode('absolute')}
              >固定提醒</button>
            </div>

            {reminderMode === 'relative' ? (
              <>
                {/* 锚点选择 */}
                <div className="tw-reminder-anchor-grid">
                  {ANCHOR_OPTIONS.map(a => (
                    <button
                      key={a}
                      className={`tw-btn-xs ${reminderAnchor === a ? 'is-active' : ''}`}
                      onClick={() => setReminderAnchor(a)}
                    >
                      {formatReminderAnchorLabel(a)}
                    </button>
                  ))}
                </div>

                {/* 预设按钮 */}
                <div className="tw-reminder-preset-row">
                  {PRESET_OFFSETS.map(p => (
                    <button
                      key={`${p.amount}${p.unit}`}
                      className="tw-btn-xs"
                      onClick={() => handlePresetReminder(p.amount, p.unit)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {/* 自定义 */}
                <div className="tw-inline-form" style={{ marginTop: 4 }}>
                  <input
                    type="number"
                    min="1"
                    placeholder="数字"
                    value={customAmount}
                    onChange={e => setCustomAmount(e.target.value)}
                    style={{ width: 60 }}
                  />
                  <select value={customUnit} onChange={e => setCustomUnit(e.target.value)} style={{ width: 70 }}>
                    <option value="m">分钟</option>
                    <option value="h">小时</option>
                    <option value="d">天</option>
                  </select>
                  <button className="tw-btn-xs" onClick={handleCustomReminder} disabled={!customAmount}>添加</button>
                </div>
              </>
            ) : (
              <div className="tw-inline-form">
                <input
                  type="datetime-local"
                  value={absoluteValue}
                  onChange={e => setAbsoluteValue(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button className="tw-btn-xs" onClick={handleAbsoluteReminder} disabled={!absoluteValue}>添加</button>
              </div>
            )}
          </div>
        </section>

        {/* 附件 */}
        {task.attachments.length > 0 && (
          <section className="tw-detail__section">
            <label className="tw-detail__label">附件</label>
            {task.attachments.map(a => (
              <div key={a.id} className="tw-muted">📎 {a.name}</div>
            ))}
          </section>
        )}

        {/* 活动日志 */}
        {task.activity.length > 0 && (
          <section className="tw-detail__section">
            <label className="tw-detail__label">活动</label>
            <div className="tw-activity-list">
              {[...task.activity].reverse().slice(0, 10).map(a => (
                <div key={a.id} className="tw-activity-item">
                  <span>{a.content}</span>
                  <span className="tw-muted">{formatDateTime(a.createdAt)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* 底部操作栏 */}
      <div className="tw-detail__footer">
        <button className="tw-btn-sm tw-btn-primary" onClick={() => void onToggleTask(task.id)}>
          {task.completed ? '恢复' : '完成'}
        </button>
        <button className="tw-btn-sm" onClick={() => void onDuplicateTask(task.id)}>复制</button>
        {task.deleted ? (
          <>
            <button className="tw-btn-sm" onClick={() => void onRestoreTask(task.id)}>恢复</button>
            <button className="tw-btn-sm tw-btn-danger" onClick={() => void onDeleteTask(task.id)}>永久删除</button>
          </>
        ) : (
          <button className="tw-btn-sm tw-btn-danger" onClick={() => void onSoftDeleteTask(task.id)}>删除</button>
        )}
      </div>
    </aside>
  );
}

/* ─── Auto-expanding textarea (Task #6) ─── */

interface AutoExpandTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  minRows?: number;
  maxRows?: number;
}

function AutoExpandTextarea({ minRows = 4, maxRows = 12, value, style, ...rest }: AutoExpandTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
    const minH = lineHeight * minRows + 18; // padding
    const maxH = lineHeight * maxRows + 18;
    const scrollH = el.scrollHeight;
    el.style.height = `${Math.min(Math.max(scrollH, minH), maxH)}px`;
  }, [value, minRows, maxRows]);

  return <textarea ref={ref} value={value} style={{ ...style, overflow: 'auto', resize: 'none' }} {...rest} />;
}
