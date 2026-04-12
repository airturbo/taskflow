import { useCallback, useMemo } from 'react';
import type { Task } from '../core/domain';

export type ProjectionFilter = 'workspace' | 'scheduled' | 'inWindow' | 'unscheduled' | 'outsideWindow' | null;

interface ProjectionSummaryProps {
  tasks: Task[];
  windowStart: string; // ISO date key "YYYY-MM-DD"
  windowEnd: string;   // ISO date key "YYYY-MM-DD"
  activeFilter: ProjectionFilter;
  onFilterChange: (filter: ProjectionFilter) => void;
}

export function ProjectionSummary({
  tasks,
  windowStart,
  windowEnd,
  activeFilter,
  onFilterChange,
}: ProjectionSummaryProps) {
  const metrics = useMemo(() => {
    const activeTasks = tasks.filter(t => !t.deleted && !t.completed);
    const workspace = activeTasks.length;

    const scheduled = activeTasks.filter(t => {
      const d = t.dueAt ?? t.startAt;
      return d !== null && d !== undefined;
    }).length;

    const unscheduled = workspace - scheduled;

    const inWindow = activeTasks.filter(t => {
      const d = t.dueAt ?? t.startAt;
      if (!d) return false;
      const dk = d.slice(0, 10);
      return dk >= windowStart && dk <= windowEnd;
    }).length;

    const outsideWindow = scheduled - inWindow;

    return { workspace, scheduled, inWindow, unscheduled, outsideWindow };
  }, [tasks, windowStart, windowEnd]);

  const handleClick = useCallback((key: ProjectionFilter) => {
    onFilterChange(activeFilter === key ? null : key);
  }, [activeFilter, onFilterChange]);

  const items: { key: ProjectionFilter; label: string; value: number }[] = [
    { key: 'workspace', label: '工作区', value: metrics.workspace },
    { key: 'scheduled', label: '已排期', value: metrics.scheduled },
    { key: 'inWindow', label: '窗口内', value: metrics.inWindow },
    { key: 'unscheduled', label: '未排期', value: metrics.unscheduled },
    { key: 'outsideWindow', label: '窗口外', value: metrics.outsideWindow },
  ];

  return (
    <div className="tw-projection">
      {items.map(item => (
        <button
          key={item.key}
          className={`tw-projection__stat ${activeFilter === item.key ? 'is-active' : ''}`}
          onClick={() => handleClick(item.key)}
          title={`点击筛选：${item.label}`}
        >
          <span className="tw-projection__value">{item.value}</span>
          <span className="tw-projection__label">{item.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Filter tasks based on projection filter mode */
export function applyProjectionFilter(
  tasks: Task[],
  filter: ProjectionFilter,
  windowStart: string,
  windowEnd: string,
): Task[] {
  if (!filter) return tasks;

  const activeTasks = tasks.filter(t => !t.deleted && !t.completed);

  switch (filter) {
    case 'workspace':
      return activeTasks;
    case 'scheduled':
      return activeTasks.filter(t => (t.dueAt ?? t.startAt) != null);
    case 'inWindow': {
      return activeTasks.filter(t => {
        const d = t.dueAt ?? t.startAt;
        if (!d) return false;
        const dk = d.slice(0, 10);
        return dk >= windowStart && dk <= windowEnd;
      });
    }
    case 'unscheduled':
      return activeTasks.filter(t => (t.dueAt ?? t.startAt) == null);
    case 'outsideWindow':
      return activeTasks.filter(t => {
        const d = t.dueAt ?? t.startAt;
        if (!d) return false;
        const dk = d.slice(0, 10);
        return dk < windowStart || dk > windowEnd;
      });
    default:
      return tasks;
  }
}
