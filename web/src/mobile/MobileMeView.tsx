import type { ReactNode } from 'react'
import type { Task } from '../types/domain'
import { getDateKey, addDays } from '../utils/dates'

/** 本周7天完成迷你条形图 */
function WeeklyBar({ tasks }: { tasks: Task[] }) {
  const today = getDateKey()
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))
  const counts = days.map(d => tasks.filter(t => !t.deleted && t.completed && t.updatedAt?.slice(0, 10) === d).length)
  const max = Math.max(...counts, 1)
  const labels = ['一','二','三','四','五','六','日']
  const todayIdx = 6
  return (
    <div className="mobile-me-weekly-bar">
      {days.map((d, i) => (
        <div key={d} className="mobile-me-weekly-bar__col">
          <div className="mobile-me-weekly-bar__bar-wrap">
            <div
              className={`mobile-me-weekly-bar__bar ${i === todayIdx ? 'is-today' : ''}`}
              style={{ height: `${Math.round((counts[i] / max) * 100)}%` }}
            />
          </div>
          <span className="mobile-me-weekly-bar__label">{labels[(new Date(d).getDay() + 6) % 7]}</span>
          {counts[i] > 0 && <span className="mobile-me-weekly-bar__count">{counts[i]}</span>}
        </div>
      ))}
    </div>
  )
}

export function MobileMeView({
  tasks,
  user,
  syncStatus,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  lastSyncedAt: _lastSyncedAt,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  theme: _theme,
  themeLabel,
  themeIcon,
  onCycleTheme,
  onSignOut,
  onRequestAuth,
  onManualSync,
  onOpenTagManager,
  onGoToCompleted,
  onGoToTrash,
  onGoToProjects,
}: {
  tasks: Task[]
  user: { displayName?: string | null; email: string } | null
  syncStatus: string
  lastSyncedAt: Date | null
  theme: string
  themeLabel: string
  themeIcon: ReactNode
  onCycleTheme: () => void
  onSignOut: () => void
  onRequestAuth: () => void
  onManualSync: () => void
  onOpenTagManager: () => void
  onGoToCompleted: () => void
  onGoToTrash: () => void
  onGoToProjects: () => void
}) {
  const todayKey = getDateKey()
  const activeTasks = tasks.filter(t => !t.deleted && !t.completed)
  const completedTasks = tasks.filter(t => !t.deleted && t.completed)
  const todayCompleted = tasks.filter(t =>
    !t.deleted && t.completed && t.updatedAt?.slice(0, 10) === todayKey
  )
  const overdueTasks = activeTasks.filter(t => {
    const dueDate = t.dueAt?.slice(0, 10) ?? null
    const dlDate = (t.deadlineAt ?? null)?.slice(0, 10) ?? null
    return (dueDate && dueDate < todayKey) || (dlDate && dlDate < todayKey)
  })

  return (
    <div className="mobile-me-view">
      {/* 数据概览 */}
      <div className="mobile-me-stats">
        <div className="mobile-me-stat">
          <strong>{activeTasks.length}</strong>
          <span>活跃</span>
        </div>
        <div className="mobile-me-stat mobile-me-stat--highlight">
          <strong>{todayCompleted.length}</strong>
          <span>今日完成</span>
        </div>
        <div className="mobile-me-stat">
          <strong>{completedTasks.length}</strong>
          <span>已完成</span>
        </div>
        <div className="mobile-me-stat mobile-me-stat--overdue">
          <strong>{overdueTasks.length}</strong>
          <span>逾期</span>
        </div>
      </div>

      {/* 本周完成趋势 */}
      <div className="mobile-me-section">
        <p className="mobile-me-section-label">本周完成趋势</p>
        <div className="mobile-me-card mobile-me-card--chart">
          <WeeklyBar tasks={tasks} />
        </div>
      </div>

      {/* 数据管理 */}
      <div className="mobile-me-section">
        <p className="mobile-me-section-label">数据管理</p>
        <div className="mobile-me-card">
          <button className="mobile-me-row" onClick={onGoToProjects}>
            <span className="mobile-me-row__icon">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M2 7h14" stroke="currentColor" strokeWidth="1.5"/><path d="M6 3V2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M12 3V2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </span>
            <span className="mobile-me-row__label">项目 & 清单</span>
            <span className="mobile-me-row__arrow">›</span>
          </button>
          <div className="mobile-me-row-divider" />
          <button className="mobile-me-row" onClick={onOpenTagManager}>
            <span className="mobile-me-row__icon">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 9.5L8.5 4l1 1L14 9.5l-5 5-5-5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><circle cx="7" cy="8" r="1" fill="currentColor"/></svg>
            </span>
            <span className="mobile-me-row__label">标签管理</span>
            <span className="mobile-me-row__arrow">›</span>
          </button>
          <div className="mobile-me-row-divider" />
          <button className="mobile-me-row" onClick={onGoToCompleted}>
            <span className="mobile-me-row__icon">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5"/><path d="M6 9l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </span>
            <span className="mobile-me-row__label">已完成</span>
            <span className="mobile-me-row__value">{completedTasks.length}</span>
            <span className="mobile-me-row__arrow">›</span>
          </button>
          <div className="mobile-me-row-divider" />
          <button className="mobile-me-row" onClick={onGoToTrash}>
            <span className="mobile-me-row__icon">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3.5 5.5h11M7 5.5V4h4v1.5M6 5.5l.5 9h5l.5-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </span>
            <span className="mobile-me-row__label">回收站</span>
            <span className="mobile-me-row__arrow">›</span>
          </button>
        </div>
      </div>

      {/* 设置 */}
      <div className="mobile-me-section">
        <p className="mobile-me-section-label">设置</p>
        <div className="mobile-me-card">
          <button className="mobile-me-row" onClick={onCycleTheme}>
            <span className="mobile-me-row__icon">{themeIcon}</span>
            <span className="mobile-me-row__label">主题</span>
            <span className="mobile-me-row__value">{themeLabel}</span>
          </button>
          {user && (
            <>
              <div className="mobile-me-row-divider" />
              <button className="mobile-me-row" onClick={onManualSync}>
                <span className="mobile-me-row__icon">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 9a6 6 0 0 1 10.4-4M15 9a6 6 0 0 1-10.4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M13 5l.4 4H9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M5 13l-.4-4H8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </span>
                <span className="mobile-me-row__label">同步</span>
                <span className="mobile-me-row__value">
                  {syncStatus === 'synced' ? '已同步' : syncStatus === 'syncing' ? '同步中…' : '点击同步'}
                </span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* 账号 */}
      <div className="mobile-me-section">
        <p className="mobile-me-section-label">账号</p>
        <div className="mobile-me-card">
          {user ? (
            <>
              <div className="mobile-me-row mobile-me-row--account">
                <span className="mobile-me-row__avatar">{(user.displayName ?? user.email).slice(0, 1).toUpperCase()}</span>
                <div className="mobile-me-row__account-info">
                  {user.displayName && <span className="mobile-me-row__label">{user.displayName}</span>}
                  <span className="mobile-me-row__email">{user.email}</span>
                </div>
              </div>
              <div className="mobile-me-row-divider" />
              <button className="mobile-me-row mobile-me-row--danger" onClick={onSignOut}>
                <span className="mobile-me-row__label">退出登录</span>
              </button>
            </>
          ) : (
            <button className="mobile-me-row mobile-me-row--accent" onClick={onRequestAuth}>
              <span className="mobile-me-row__label">登录以启用云同步</span>
              <span className="mobile-me-row__arrow">›</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
