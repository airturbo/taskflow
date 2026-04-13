import type { ReactNode } from 'react'
import type { Task } from '../types/domain'
import { getDateKey, addDays } from '../utils/dates'
import styles from './MobileMeView.module.css'

/** 本周7天完成迷你条形图 */
function WeeklyBar({ tasks }: { tasks: Task[] }) {
  const today = getDateKey()
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))
  const counts = days.map(d => tasks.filter(t => !t.deleted && t.completed && t.updatedAt?.slice(0, 10) === d).length)
  const max = Math.max(...counts, 1)
  const labels = ['一','二','三','四','五','六','日']
  const todayIdx = 6
  return (
    <div className={styles.mobileMeWeeklyBar}>
      {days.map((d, i) => (
        <div key={d} className={styles.mobileMeWeeklyBarCol}>
          <div className={styles.mobileMeWeeklyBarWrap}>
            <div
              className={`${styles.mobileMeWeeklyBarBar} ${i === todayIdx ? 'is-today' : ''}`}
              style={{ height: `${Math.round((counts[i] / max) * 100)}%` }}
            />
          </div>
          <span className={styles.mobileMeWeeklyBarLabel}>{labels[(new Date(d).getDay() + 6) % 7]}</span>
          {counts[i] > 0 && <span className={styles.mobileMeWeeklyBarCount}>{counts[i]}</span>}
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
    <div className={styles.mobileMeView}>
      {/* 数据概览 */}
      <div className={styles.mobileMeStats}>
        <div className={styles.mobileMeStat}>
          <strong>{activeTasks.length}</strong>
          <span>活跃</span>
        </div>
        <div className={`${styles.mobileMeStat} ${styles.mobileMeStatHighlight}`}>
          <strong>{todayCompleted.length}</strong>
          <span>今日完成</span>
        </div>
        <div className={styles.mobileMeStat}>
          <strong>{completedTasks.length}</strong>
          <span>已完成</span>
        </div>
        <div className={`${styles.mobileMeStat} ${styles.mobileMeStatOverdue}`}>
          <strong>{overdueTasks.length}</strong>
          <span>逾期</span>
        </div>
      </div>

      {/* 本周完成趋势 */}
      <div className={styles.mobileMeSection}>
        <p className={styles.mobileMeSectionLabel}>本周完成趋势</p>
        <div className={`${styles.mobileMeCard} ${styles.mobileMeCardChart}`}>
          <WeeklyBar tasks={tasks} />
        </div>
      </div>

      {/* 数据管理 */}
      <div className={styles.mobileMeSection}>
        <p className={styles.mobileMeSectionLabel}>数据管理</p>
        <div className={styles.mobileMeCard}>
          <button className={styles.mobileMeRow} onClick={onGoToProjects}>
            <span className={styles.mobileMeRowIcon}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M2 7h14" stroke="currentColor" strokeWidth="1.5"/><path d="M6 3V2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M12 3V2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </span>
            <span className={styles.mobileMeRowLabel}>项目 & 清单</span>
            <span className={styles.mobileMeRowArrow}>›</span>
          </button>
          <div className={styles.mobileMeRowDivider} />
          <button className={styles.mobileMeRow} onClick={onOpenTagManager}>
            <span className={styles.mobileMeRowIcon}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 9.5L8.5 4l1 1L14 9.5l-5 5-5-5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><circle cx="7" cy="8" r="1" fill="currentColor"/></svg>
            </span>
            <span className={styles.mobileMeRowLabel}>标签管理</span>
            <span className={styles.mobileMeRowArrow}>›</span>
          </button>
          <div className={styles.mobileMeRowDivider} />
          <button className={styles.mobileMeRow} onClick={onGoToCompleted}>
            <span className={styles.mobileMeRowIcon}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5"/><path d="M6 9l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </span>
            <span className={styles.mobileMeRowLabel}>已完成</span>
            <span className={styles.mobileMeRowValue}>{completedTasks.length}</span>
            <span className={styles.mobileMeRowArrow}>›</span>
          </button>
          <div className={styles.mobileMeRowDivider} />
          <button className={styles.mobileMeRow} onClick={onGoToTrash}>
            <span className={styles.mobileMeRowIcon}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3.5 5.5h11M7 5.5V4h4v1.5M6 5.5l.5 9h5l.5-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </span>
            <span className={styles.mobileMeRowLabel}>回收站</span>
            <span className={styles.mobileMeRowArrow}>›</span>
          </button>
        </div>
      </div>

      {/* 设置 */}
      <div className={styles.mobileMeSection}>
        <p className={styles.mobileMeSectionLabel}>设置</p>
        <div className={styles.mobileMeCard}>
          <button className={styles.mobileMeRow} onClick={onCycleTheme}>
            <span className={styles.mobileMeRowIcon}>{themeIcon}</span>
            <span className={styles.mobileMeRowLabel}>主题</span>
            <span className={styles.mobileMeRowValue}>{themeLabel}</span>
          </button>
          {user && (
            <>
              <div className={styles.mobileMeRowDivider} />
              <button className={styles.mobileMeRow} onClick={onManualSync}>
                <span className={styles.mobileMeRowIcon}>
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 9a6 6 0 0 1 10.4-4M15 9a6 6 0 0 1-10.4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M13 5l.4 4H9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M5 13l-.4-4H8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </span>
                <span className={styles.mobileMeRowLabel}>同步</span>
                <span className={styles.mobileMeRowValue}>
                  {syncStatus === 'synced' ? '已同步' : syncStatus === 'syncing' ? '同步中…' : '点击同步'}
                </span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* 账号 */}
      <div className={styles.mobileMeSection}>
        <p className={styles.mobileMeSectionLabel}>账号</p>
        <div className={styles.mobileMeCard}>
          {user ? (
            <>
              <div className={`${styles.mobileMeRow} ${styles.mobileMeRowAccount}`}>
                <span className={styles.mobileMeRowAvatar}>{(user.displayName ?? user.email).slice(0, 1).toUpperCase()}</span>
                <div className={styles.mobileMeRowAccountInfo}>
                  {user.displayName && <span className={styles.mobileMeRowLabel}>{user.displayName}</span>}
                  <span className={styles.mobileMeRowEmail}>{user.email}</span>
                </div>
              </div>
              <div className={styles.mobileMeRowDivider} />
              <button className={`${styles.mobileMeRow} ${styles.mobileMeRowDanger}`} onClick={onSignOut}>
                <span className={styles.mobileMeRowLabel}>退出登录</span>
              </button>
            </>
          ) : (
            <button className={`${styles.mobileMeRow} ${styles.mobileMeRowAccent}`} onClick={onRequestAuth}>
              <span className={styles.mobileMeRowLabel}>登录以启用云同步</span>
              <span className={styles.mobileMeRowArrow}>›</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
