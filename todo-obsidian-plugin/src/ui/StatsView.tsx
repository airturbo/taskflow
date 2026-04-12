import { useMemo } from 'react';
import type { Task, Tag, Priority } from '../core/domain';
import { buildTaskStats } from '../core/selectors';
import { getDateKey, addDays } from '../core/dates';

interface StatsViewProps {
  tasks: Task[];
  tags: Tag[];
}

const PRIORITY_LABELS: Record<Priority, string> = {
  urgent: 'P1 紧急',
  high: 'P2 高',
  normal: 'P3 普通',
  low: 'P4 低',
};

const PRIORITY_COLORS: Record<Priority, string> = {
  urgent: '#ef4444',
  high: '#f97316',
  normal: '#6366f1',
  low: '#94a3b8',
};

const PRIORITY_ORDER: Priority[] = ['urgent', 'high', 'normal', 'low'];

export function StatsView({ tasks, tags }: StatsViewProps) {
  const stats = useMemo(() => buildTaskStats(tasks), [tasks]);

  // ─── Streak calculation ────────────────────────────────────────────
  const { currentStreak, longestStreak } = useMemo(() => {
    const completedDates = new Set<string>();
    for (const t of tasks) {
      if (!t.deleted && t.completed && t.updatedAt) {
        completedDates.add(t.updatedAt.slice(0, 10));
      }
    }

    let current = 0;
    let longest = 0;
    let streak = 0;
    const today = getDateKey();

    // Check from today backwards
    for (let i = 0; i < 365; i++) {
      const dk = addDays(today, -i);
      if (completedDates.has(dk)) {
        streak++;
        if (i === current + (current === streak ? 0 : -1)) {
          // still in current streak range
        }
      } else {
        if (i === 0) {
          // today has no completed task, current streak might start from yesterday
        } else {
          break;
        }
      }
    }

    // Recalculate properly
    current = 0;
    let dayOffset = 0;
    // Allow today to have no completions (check from today)
    if (completedDates.has(getDateKey())) {
      dayOffset = 0;
    } else {
      dayOffset = 1; // start checking from yesterday
    }

    for (let i = dayOffset; i < 365; i++) {
      const dk = addDays(today, -i);
      if (completedDates.has(dk)) {
        current++;
      } else {
        break;
      }
    }

    // Find longest streak
    const sortedDates = Array.from(completedDates).sort();
    longest = 0;
    streak = 0;
    let prevDate = '';
    for (const d of sortedDates) {
      if (prevDate && addDays(prevDate, 1) === d) {
        streak++;
      } else {
        streak = 1;
      }
      if (streak > longest) longest = streak;
      prevDate = d;
    }

    return { currentStreak: current, longestStreak: longest };
  }, [tasks]);

  // ─── 30-day trend ──────────────────────────────────────────────────
  const trendData = useMemo(() => {
    const today = getDateKey();
    const days: { dateKey: string; count: number }[] = [];

    for (let i = 29; i >= 0; i--) {
      const dk = addDays(today, -i);
      days.push({ dateKey: dk, count: 0 });
    }

    for (const t of tasks) {
      if (!t.deleted && t.completed && t.updatedAt) {
        const dk = t.updatedAt.slice(0, 10);
        const entry = days.find(d => d.dateKey === dk);
        if (entry) entry.count++;
      }
    }

    return days;
  }, [tasks]);

  const maxTrendCount = useMemo(() => Math.max(1, ...trendData.map(d => d.count)), [trendData]);

  // ─── Priority distribution ────────────────────────────────────────
  const priorityDist = useMemo(() => {
    const counts: Record<Priority, number> = { urgent: 0, high: 0, normal: 0, low: 0 };
    for (const t of tasks) {
      if (!t.deleted && !t.completed) {
        counts[t.priority]++;
      }
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return { counts, total: Math.max(1, total) };
  }, [tasks]);

  // ─── Tag distribution ─────────────────────────────────────────────
  const tagDist = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tasks) {
      if (t.deleted) continue;
      for (const tagId of t.tagIds) {
        counts[tagId] = (counts[tagId] || 0) + 1;
      }
    }

    const entries = tags
      .filter(tag => counts[tag.id] > 0)
      .map(tag => ({ tag, count: counts[tag.id] }))
      .sort((a, b) => b.count - a.count);

    const maxCount = entries.length > 0 ? Math.max(1, entries[0].count) : 1;
    return { entries, maxCount };
  }, [tasks, tags]);

  const todayKey = getDateKey();

  return (
    <div className="tw-stats">
      {/* 核心指标卡片 */}
      <div className="tw-stats__grid">
        <div className="tw-stats__card">
          <div className="tw-stats__card-value">{stats.completed}</div>
          <div className="tw-stats__card-label">已完成任务</div>
        </div>
        <div className="tw-stats__card">
          <div className="tw-stats__card-value">{stats.active}</div>
          <div className="tw-stats__card-label">活跃任务</div>
        </div>
        <div className="tw-stats__card">
          <div className="tw-stats__card-value tw-stat__value--danger">{stats.overdue}</div>
          <div className="tw-stats__card-label">已逾期</div>
        </div>
        <div className="tw-stats__card">
          <div className="tw-stats__card-value">{stats.scheduled}</div>
          <div className="tw-stats__card-label">已排期</div>
        </div>
        <div className="tw-stats__card tw-stats__card--highlight">
          <div className="tw-stats__card-value">{currentStreak} / {longestStreak}</div>
          <div className="tw-stats__card-label">连续完成天数（当前/最长）</div>
        </div>
      </div>

      {/* 30 天完成趋势图 */}
      <div className="tw-stats__section">
        <h3 className="tw-stats__section-title">30 天完成趋势</h3>
        <div className="tw-trend-chart">
          {trendData.map((d, i) => {
            const heightPct = maxTrendCount > 0 ? (d.count / maxTrendCount) * 100 : 0;
            const isToday = d.dateKey === todayKey;
            const showLabel = i % 5 === 0 || isToday;
            return (
              <div key={d.dateKey} className="tw-trend-chart__col">
                <div className="tw-trend-chart__bar-wrap">
                  <div
                    className={`tw-trend-bar ${isToday ? 'is-today' : ''}`}
                    style={{ height: `${Math.max(heightPct, 2)}%` }}
                    title={`${d.dateKey}: ${d.count} 项`}
                  />
                </div>
                {showLabel && (
                  <span className="tw-trend-chart__label">
                    {isToday ? '今' : `${d.dateKey.slice(5)}`}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 优先级分布 */}
      <div className="tw-stats__section">
        <h3 className="tw-stats__section-title">优先级分布</h3>
        {PRIORITY_ORDER.map(p => {
          const count = priorityDist.counts[p];
          const pct = (count / priorityDist.total) * 100;
          return (
            <div key={p} className="tw-distribution-row">
              <span className="tw-distribution-row__label">{PRIORITY_LABELS[p]}</span>
              <div className="tw-progress-bar">
                <div
                  className="tw-progress-bar__fill"
                  style={{ width: `${pct}%`, background: PRIORITY_COLORS[p] }}
                />
              </div>
              <span className="tw-distribution-row__count">{count}</span>
            </div>
          );
        })}
      </div>

      {/* 标签分布 */}
      {tagDist.entries.length > 0 && (
        <div className="tw-stats__section">
          <h3 className="tw-stats__section-title">标签分布</h3>
          {tagDist.entries.map(({ tag, count }) => {
            const pct = (count / tagDist.maxCount) * 100;
            return (
              <div key={tag.id} className="tw-distribution-row">
                <span className="tw-distribution-row__label">
                  <i className="tw-tag-chip__dot" style={{ background: tag.color }} />
                  {tag.name}
                </span>
                <div className="tw-progress-bar">
                  <div
                    className="tw-progress-bar__fill"
                    style={{ width: `${pct}%`, background: tag.color }}
                  />
                </div>
                <span className="tw-distribution-row__count">{count}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
