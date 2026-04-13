import { useMemo } from 'react'
import type { ReactNode } from 'react'
import type { Task, Tag, Priority } from '../../types/domain'
import type { ProjectionSummaryMetric, ProjectionInsightMode, ProjectionRecoveryItem } from '../../types/workspace'
import { isTaskRiskOverdue, priorityMeta } from '@taskflow/core'
import { getDateKey, addDays } from '../../utils/dates'
import styles from './StatsView.module.css'

function ProjectionSummary({
  eyebrow,
  title,
  description,
  scopes,
  metrics,
  toolbar,
  auxiliaryAction,
}: {
  eyebrow: string
  title: string
  description: string
  scopes: string[]
  metrics: ProjectionSummaryMetric[]
  toolbar?: ReactNode
  auxiliaryAction?: { label: string; onClick: () => void }
}) {
  return (
    <section className={`${styles.projectionSummary} panel`}>
      <div className={styles.projectionSummaryHeader}>
        <div className={styles.projectionSummaryIntro}>
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h3>{title}</h3>
          {description && <p>{description}</p>}
        </div>
        {(toolbar || auxiliaryAction) && (
          <div className={styles.projectionSummaryToolbar}>
            {toolbar}
            {auxiliaryAction && (
              <button className="ghost-button small" onClick={auxiliaryAction.onClick}>
                {auxiliaryAction.label}
              </button>
            )}
          </div>
        )}
      </div>
      {scopes.length > 0 && (
        <div className={styles.projectionSummaryScopes}>
          {scopes.map((scope) => (
            <span key={scope} className={styles.projectionScopeChip}>
              {scope}
            </span>
          ))}
        </div>
      )}
      <div className={styles.projectionSummaryMetrics}>
        {metrics.map((metric) => {
          const content = (
            <>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              {metric.hint && <small>{metric.hint}</small>}
            </>
          )

          return metric.onClick ? (
            <button
              key={metric.label}
              type="button"
              className={`${styles.projectionMetric} ${metric.active ? 'is-active' : ''}`}
              onClick={metric.onClick}
              disabled={metric.disabled}
            >
              {content}
            </button>
          ) : (
            <article key={metric.label} className={`${styles.projectionMetric} is-static`}>
              {content}
            </article>
          )
        })}
      </div>
    </section>
  )
}

function ProjectionRecoveryPanel({
  mode,
  title,
  description,
  items,
  footerAction,
  onClose,
}: {
  mode: ProjectionInsightMode
  title: string
  description: string
  items: ProjectionRecoveryItem[]
  footerAction?: { label: string; onClick: () => void }
  onClose: () => void
}) {
  return (
    <section className={`${styles.projectionRecovery} projection-recovery--${mode}`}>
      <div className={styles.projectionRecoveryHeader}>
        <div>
          <p className="eyebrow">recovery path</p>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <button className="ghost-button small" onClick={onClose}>
          收起
        </button>
      </div>
      <div className={styles.projectionRecoveryList}>
        {items.length > 0 ? (
          items.map((item) => (
            <article key={item.id} className={styles.projectionRecoveryItem}>
              <div>
                <strong>{item.title}</strong>
                <p>{item.subtitle}</p>
              </div>
              <button className="ghost-button small" onClick={item.onAction}>
                {item.actionLabel}
              </button>
            </article>
          ))
        ) : (
          <div className={styles.projectionRecoveryEmpty}>当前没有更多可回收的任务。</div>
        )}
      </div>
      {footerAction && (
        <div className={styles.projectionRecoveryFooter}>
          <button className="ghost-button small" onClick={footerAction.onClick}>
            {footerAction.label}
          </button>
        </div>
      )}
    </section>
  )
}

export function StatsView({
  tasks,
  tags,
  stats,
  priorityDistribution,
  tagDistribution,
}: {
  tasks: Task[]
  tags: Tag[]
  stats?: { active: number; completed: number; overdue: number; scheduled: number } | null
  priorityDistribution?: Record<Priority, number> | null
  tagDistribution?: Array<{ tag: Tag; count: number }> | null
}) {
  const fallbackStats = useMemo(
    () => ({
      completed: tasks.filter((task) => task.completed).length,
      active: tasks.filter((task) => !task.completed).length,
      overdue: tasks.filter((task) => isTaskRiskOverdue(task)).length,
      scheduled: tasks.filter((task) => Boolean(task.startAt || task.dueAt)).length,
    }),
    [tasks],
  )

  const resolvedStats = stats ?? fallbackStats

  const resolvedPriorityDistribution = useMemo(
    () =>
      priorityDistribution ?? {
        urgent: tasks.filter((task) => task.priority === 'urgent').length,
        high: tasks.filter((task) => task.priority === 'high').length,
        normal: tasks.filter((task) => task.priority === 'normal').length,
        low: tasks.filter((task) => task.priority === 'low').length,
      },
    [priorityDistribution, tasks],
  )

  const resolvedTagDistribution = useMemo(
    () =>
      tagDistribution ??
      tags
        .map((tag) => ({ tag, count: tasks.filter((task) => task.tagIds.includes(tag.id)).length }))
        .filter((item) => item.count > 0),
    [tagDistribution, tags, tasks],
  )

  // ---- 过去 30 天每日完成数 ----
  const trendData = useMemo(() => {
    const today = getDateKey()
    const days: { dateKey: string; label: string; count: number }[] = []
    for (let i = 29; i >= 0; i--) {
      const dateKey = addDays(today, -i)
      const label = i === 0 ? '今' : i === 1 ? '昨' : dateKey.slice(5).replace('-', '/')
      days.push({ dateKey, label, count: 0 })
    }
    tasks.forEach((task) => {
      if (!task.completed || !task.updatedAt) return
      const dateKey = task.updatedAt.slice(0, 10)
      const slot = days.find((d) => d.dateKey === dateKey)
      if (slot) slot.count++
    })
    return days
  }, [tasks])

  const maxTrendCount = Math.max(...trendData.map((d) => d.count), 1)

  // ---- Streak（连续完成天数）----
  const streak = useMemo(() => {
    const today = getDateKey()
    const completedDays = new Set(
      tasks
        .filter((t) => t.completed && t.updatedAt)
        .map((t) => t.updatedAt.slice(0, 10)),
    )
    let current = 0
    let longest = 0
    let d = today
    // 从今天往前数
    while (completedDays.has(d)) {
      current++
      d = addDays(d, -1)
    }
    // 最长 streak
    const sorted = Array.from(completedDays).sort()
    let run = 0
    for (let i = 0; i < sorted.length; i++) {
      if (i === 0 || sorted[i] === addDays(sorted[i - 1], 1)) {
        run++
        if (run > longest) longest = run
      } else {
        run = 1
      }
    }
    return { current, longest }
  }, [tasks])

  // ---- 总专注时长 ----
  const totalFocusMinutes = useMemo(
    () => tasks.reduce((sum, t) => sum + (t.focusMinutes ?? 0), 0),
    [tasks],
  )
  const focusHours = Math.floor(totalFocusMinutes / 60)
  const focusMins = totalFocusMinutes % 60

  // ── Heatmap data ──────────────────────────────────────────────────────────
  const heatmapData = useMemo(() => {
    // Build a map of date → count of completed tasks
    // Tasks use `completed: boolean` + `updatedAt` (no dedicated completedAt field)
    const counts: Record<string, number> = {}
    tasks.forEach(t => {
      if (t.completed && t.updatedAt) {
        const day = t.updatedAt.slice(0, 10) // YYYY-MM-DD
        counts[day] = (counts[day] ?? 0) + 1
      }
    })

    // Build 52-week grid (364 days back + today's remaining week)
    const today = new Date()
    // Start from the most recent Sunday 52 weeks ago
    const startDate = new Date(today)
    startDate.setDate(today.getDate() - 364)
    // Rewind to Sunday
    startDate.setDate(startDate.getDate() - startDate.getDay())

    const weeks: Array<Array<{ date: string; count: number }>> = []
    const current = new Date(startDate)
    while (current <= today) {
      const week: Array<{ date: string; count: number }> = []
      for (let d = 0; d < 7; d++) {
        const dateStr = current.toISOString().slice(0, 10)
        week.push({ date: dateStr, count: counts[dateStr] ?? 0 })
        current.setDate(current.getDate() + 1)
      }
      weeks.push(week)
    }
    return { weeks, maxCount: Math.max(1, ...Object.values(counts)) }
  }, [tasks])

  const heatmapColor = (count: number, max: number) => {
    if (count === 0) return 'var(--border)'
    const intensity = Math.ceil((count / max) * 4)
    const colors = ['#9be9a8', '#40c463', '#30a14e', '#216e39']
    return colors[Math.min(intensity - 1, 3)]
  }

  return (
    <div className={styles.toolLayout}>
      {/* Completion Heatmap */}
      <section className={styles.chartCard}>
        <div className="panel-header">
          <div>
            <p className="eyebrow">activity</p>
            <h3>完成热力图（过去一年）</h3>
          </div>
        </div>
        <div className={styles.statsHeatmapWrapper}>
          <svg
            width={heatmapData.weeks.length * 13}
            height={7 * 13 + 20}
            className={styles.statsHeatmapSvg}
          >
            {heatmapData.weeks.map((week, wi) =>
              week.map((day, di) => (
                <rect
                  key={day.date}
                  x={wi * 13}
                  y={di * 13}
                  width={11}
                  height={11}
                  rx={2}
                  fill={heatmapColor(day.count, heatmapData.maxCount)}
                >
                  <title>{day.date}: {day.count} 个任务完成</title>
                </rect>
              ))
            )}
          </svg>
          <div className={styles.statsHeatmapLegend}>
            <span>少</span>
            {(['#9be9a8', '#40c463', '#30a14e', '#216e39'] as const).map(c => (
              <span key={c} style={{ display: 'inline-block', width: 11, height: 11, background: c, borderRadius: 2 }} />
            ))}
            <span>多</span>
          </div>
          {resolvedStats.completed === 0 && (
            <p className={styles.statsHeatmapEmptyHint}>完成更多任务，解锁你的专属热力图 🔥</p>
          )}
        </div>
      </section>

      {/* 核心指标 */}
      <div className={styles.statsGrid}>
        <article className={styles.statsCard}>
          <span>已完成任务</span>
          <strong>
            {resolvedStats.completed}
            <small style={{ fontSize: 13, fontWeight: 400, opacity: 0.5 }}> / {resolvedStats.completed + resolvedStats.active}</small>
          </strong>
        </article>
        <article className={styles.statsCard}>
          <span>活跃任务</span>
          <strong>
            {resolvedStats.active}
            <small style={{ fontSize: 13, fontWeight: 400, opacity: 0.5 }}> / {resolvedStats.completed + resolvedStats.active}</small>
          </strong>
        </article>
        <article className={styles.statsCard}>
          <span>已逾期</span>
          <strong style={{ color: resolvedStats.overdue > 0 ? '#ff6b7a' : undefined }}>{resolvedStats.overdue}</strong>
        </article>
        <article className={styles.statsCard}>
          <span>已排期</span>
          <strong>{resolvedStats.scheduled}</strong>
        </article>
        <article className={`${styles.statsCard} ${styles.statsCardHighlight}`}>
          <span>连续完成</span>
          <strong>{streak.current} <small style={{ fontSize: 13, fontWeight: 400 }}>天</small></strong>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>最长 {streak.longest} 天</p>
        </article>
        <article className={styles.statsCard}>
          <span>累计专注</span>
          <strong>{focusHours > 0 ? `${focusHours}h ` : ''}{focusMins}m</strong>
        </article>
      </div>

      {/* 30天完成趋势 */}
      <section className={styles.chartCard}>
        <div className="panel-header">
          <div>
            <p className="eyebrow">completion trend</p>
            <h3>最近 30 天完成趋势</h3>
          </div>
          <span style={{ fontSize: 12, opacity: 0.5 }}>
            共 {trendData.reduce((s, d) => s + d.count, 0)} 条
          </span>
        </div>
        <div className={styles.trendChart}>
          {trendData.map((day, idx) => {
            const heightPct = maxTrendCount > 0 ? (day.count / maxTrendCount) * 100 : 0
            const isToday = idx === trendData.length - 1
            return (
              <div key={day.dateKey} className={styles.trendBarCol} title={`${day.dateKey}：${day.count} 条`}>
                <div className={styles.trendBarWrap}>
                  <div
                    className={`${styles.trendBarFill} ${isToday ? 'is-today' : ''}`}
                    style={{ height: `${Math.max(heightPct, day.count > 0 ? 4 : 0)}%` }}
                  />
                </div>
                {(idx % 5 === 0 || isToday) && (
                  <span className={styles.trendBarLabel}>{day.label}</span>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* 优先级分布 */}
      <section className={styles.chartCard}>
        <div className="panel-header">
          <div>
            <p className="eyebrow">priority distribution</p>
            <h3>优先级分布</h3>
          </div>
        </div>
        <div className={styles.trendBars}>
          {(['urgent', 'high', 'normal', 'low'] as Priority[]).map((priority) => {
            const count = resolvedPriorityDistribution[priority] ?? 0
            return (
              <div key={priority} className={styles.trendRow}>
                <span>{priorityMeta[priority].label}</span>
                <div className={styles.progressBar}>
                  <span style={{ width: `${Math.min(100, count * 16)}%`, background: priorityMeta[priority].color }} />
                </div>
                <strong>{count}</strong>
              </div>
            )
          })}
        </div>
      </section>

      {/* 标签分布 */}
      {resolvedTagDistribution.length > 0 && (
        <section className={styles.chartCard}>
          <div className="panel-header">
            <div>
              <p className="eyebrow">tag distribution</p>
              <h3>标签分布</h3>
            </div>
          </div>
          <div className={styles.trendBars}>
            {resolvedTagDistribution.map(({ tag, count }) => (
              <div key={tag.id} className={styles.trendRow}>
                <span>#{tag.name}</span>
                <div className={styles.progressBar}>
                  <span style={{ width: `${Math.min(100, count * 18)}%`, background: tag.color }} />
                </div>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

export { ProjectionSummary, ProjectionRecoveryPanel }
