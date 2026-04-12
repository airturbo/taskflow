import { useMemo } from 'react';
import type { Task, Tag, Priority } from '../core/domain';
import { buildWeek, formatDayLabel, getDateKey } from '../core/dates';

interface AgendaViewProps {
  tasks: Task[];
  tags: Tag[];
  selectedTaskId: string | null;
  weekOffset: number;
  onSelectTask: (taskId: string) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onThisWeek: () => void;
}

const PRIORITY_LABELS: Record<Priority, string> = { urgent: '紧急', high: '高', normal: '普通', low: '低' };
const PRIORITY_COLORS: Record<Priority, string> = { urgent: '#ef4444', high: '#f97316', normal: '#6366f1', low: '#94a3b8' };

export function AgendaView({
  tasks, tags, selectedTaskId, weekOffset,
  onSelectTask, onPrevWeek, onNextWeek, onThisWeek,
}: AgendaViewProps) {
  const todayKey = getDateKey();

  const weekDays = useMemo(() => buildWeek(weekOffset), [weekOffset]);

  const tasksByDay = useMemo(() => {
    const activeTasks = tasks.filter(t => !t.deleted && !t.completed);
    const map: Record<string, Task[]> = {};
    for (const dayKey of weekDays) {
      map[dayKey] = [];
    }
    for (const task of activeTasks) {
      const dateValue = task.dueAt ?? task.startAt;
      if (!dateValue) continue;
      const key = dateValue.slice(0, 10);
      if (map[key]) {
        map[key].push(task);
      }
    }
    return map;
  }, [tasks, weekDays]);

  return (
    <div className="tw-agenda">
      <div className="tw-agenda__nav">
        <button className="tw-btn-sm" onClick={onPrevWeek}>← 上一周</button>
        <button className="tw-btn-sm" onClick={onThisWeek} disabled={weekOffset === 0}>本周</button>
        <button className="tw-btn-sm" onClick={onNextWeek}>下一周 →</button>
      </div>
      <div className="tw-agenda__days">
        {weekDays.map(dayKey => {
          const isToday = dayKey === todayKey;
          const dayTasks = tasksByDay[dayKey] ?? [];
          return (
            <div key={dayKey} className={`tw-agenda__day ${isToday ? 'is-today' : ''}`}>
              <div className="tw-agenda__day-header">
                <span className="tw-agenda__day-label">{formatDayLabel(dayKey)}</span>
                {isToday && <span className="tw-agenda__today-badge">今天</span>}
                <span className="tw-agenda__day-count">{dayTasks.length}</span>
              </div>
              <div className="tw-agenda__day-body">
                {dayTasks.length === 0 ? (
                  <div className="tw-agenda__empty">暂无安排</div>
                ) : (
                  dayTasks.map(task => {
                    const taskTags = tags.filter(t => task.tagIds.includes(t.id));
                    return (
                      <div
                        key={task.id}
                        className={`tw-agenda__card ${selectedTaskId === task.id ? 'is-selected' : ''}`}
                        onClick={() => onSelectTask(task.id)}
                      >
                        <div className="tw-agenda__card-title">{task.title}</div>
                        <div className="tw-agenda__card-meta">
                          <span
                            className="tw-priority-badge"
                            style={{ color: PRIORITY_COLORS[task.priority], borderColor: PRIORITY_COLORS[task.priority] }}
                          >
                            {PRIORITY_LABELS[task.priority]}
                          </span>
                          {task.dueAt && (
                            <span className="tw-agenda__card-due">
                              {task.dueAt.includes('T') ? task.dueAt.slice(11, 16) : ''}
                            </span>
                          )}
                          {taskTags.map(tag => (
                            <span key={tag.id} className="tw-tag-chip" style={{ background: tag.color }}>
                              {tag.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
