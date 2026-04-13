import type { CalendarMode, Task, TodoList } from '../types/domain'
import type { AuthUser } from '../hooks/useAuth'
import type { MobileTab } from '../stores/mobileUiStore'
import { isSupabaseEnabled } from '../utils/supabase'
import { SyncIndicator } from './SyncIndicator'
import { requestAuthScreen } from '../utils/auth-events'

export interface AppTopBarProps {
  // Layout mode
  isNavigationDrawerMode: boolean
  isPhoneViewport: boolean
  isUtilityDrawerMode: boolean
  // Navigation
  workspaceLabel: string
  mobileTab: MobileTab
  // Calendar
  calendarMode: CalendarMode
  // Matrix
  mobileMatrixViewMode: 'matrix' | 'kanban' | 'timeline'
  // Scope menu state
  mobileFocusScope: string
  mobileFocusScopeListId: string | null
  mobileFocusScopeMenuOpen: boolean
  mobileFocusSortMode: string
  mobileCalendarModeMenuOpen: boolean
  mobileMatrixModeMenuOpen: boolean
  // Lists
  lists: TodoList[]
  // Sync
  syncStatus: string
  lastSyncedAt: Date | null
  user: AuthUser | null
  // Theme
  themeIcon: string
  themeLabel: string
  // Selected task (for utility drawer button label)
  selectedTask: Task | null
  // Actions
  onOpenNavDrawer: () => void
  onOpenUtilityDrawer: () => void
  onSetMobileFocusScope: (scope: 'all' | 'today' | 'week' | 'list') => void
  onSetMobileFocusScopeListId: (id: string | null) => void
  onSetMobileFocusScopeMenuOpen: (open: boolean | ((v: boolean) => boolean)) => void
  onSetMobileFocusSortMode: (mode: 'planned' | 'deadline') => void
  onSetCalendarMode: (mode: CalendarMode) => void
  onSetMobileCalendarModeMenuOpen: (open: boolean | ((v: boolean) => boolean)) => void
  onSetMobileMatrixViewMode: (mode: 'matrix' | 'kanban' | 'timeline') => void
  onSetMobileMatrixModeMenuOpen: (open: boolean | ((v: boolean) => boolean)) => void
  onCycleTheme: () => void
  onSignOut: () => void
  onForceSync: () => Promise<void>
}

export function AppTopBar(props: AppTopBarProps) {
  const {
    isNavigationDrawerMode, isPhoneViewport, isUtilityDrawerMode,
    workspaceLabel, mobileTab,
    calendarMode, mobileMatrixViewMode,
    mobileFocusScope, mobileFocusScopeListId, mobileFocusScopeMenuOpen,
    mobileFocusSortMode, mobileCalendarModeMenuOpen, mobileMatrixModeMenuOpen,
    lists, syncStatus, lastSyncedAt, user,
    themeIcon, themeLabel, selectedTask,
    onOpenNavDrawer, onOpenUtilityDrawer,
    onSetMobileFocusScope, onSetMobileFocusScopeListId, onSetMobileFocusScopeMenuOpen,
    onSetMobileFocusSortMode,
    onSetCalendarMode, onSetMobileCalendarModeMenuOpen,
    onSetMobileMatrixViewMode, onSetMobileMatrixModeMenuOpen,
    onCycleTheme, onSignOut, onForceSync,
  } = props

  return (
    <>
      {/* 移动端顶部标题栏 — 精致紧凑，对标 Things 3 */}
      {isNavigationDrawerMode && (
        <header className="mobile-topbar">
          <div className="mobile-topbar__left" style={{ position: 'relative' }}>
            {/* #10 — 手机端隐藏汉堡菜单 (CSS already hides it, also skip render) */}
            {!isPhoneViewport && (
              <button
                className="mobile-topbar__menu-btn"
                onClick={onOpenNavDrawer}
                aria-label="打开导航"
              >
                <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
                  <rect x="0" y="0" width="18" height="2" rx="1" fill="currentColor"/>
                  <rect x="0" y="6" width="14" height="2" rx="1" fill="currentColor"/>
                  <rect x="0" y="12" width="18" height="2" rx="1" fill="currentColor"/>
                </svg>
              </button>
            )}
            {isPhoneViewport && mobileTab === 'focus' ? (
              /* #4 — 焦点 Tab：scope 切换按钮 */
              <>
                <button className="mobile-topbar-scope-btn" onClick={() => onSetMobileFocusScopeMenuOpen(v => !v)}>
                  {mobileFocusScope === 'all' ? '全部' : mobileFocusScope === 'today' ? '今日' : mobileFocusScope === 'week' ? '未来 7 天' : lists.find(l => l.id === mobileFocusScopeListId)?.name ?? '清单'} <span className="mobile-topbar-scope-arrow">▾</span>
                </button>
                {(mobileFocusScope === 'today' || mobileFocusScope === 'week') && (
                  <button className="mobile-topbar-sort-pill" onClick={() => onSetMobileFocusSortMode(mobileFocusSortMode === 'planned' ? 'deadline' : 'planned')}>
                    {mobileFocusSortMode === 'planned' ? '按计划' : '按DDL'}
                  </button>
                )}
                {/* #8 — Scope 菜单 + 遮罩 */}
                {mobileFocusScopeMenuOpen && (
                  <>
                    <div className="mobile-scope-overlay" onClick={() => onSetMobileFocusScopeMenuOpen(false)} />
                    <div className="mobile-focus-scope-menu" style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100 }}>
                      <button className={mobileFocusScope === 'all' ? 'is-active' : ''} onClick={() => { onSetMobileFocusScope('all'); onSetMobileFocusScopeMenuOpen(false) }}>全部</button>
                      <button className={mobileFocusScope === 'today' ? 'is-active' : ''} onClick={() => { onSetMobileFocusScope('today'); onSetMobileFocusScopeMenuOpen(false) }}>今日</button>
                      <button className={mobileFocusScope === 'week' ? 'is-active' : ''} onClick={() => { onSetMobileFocusScope('week'); onSetMobileFocusScopeMenuOpen(false) }}>未来 7 天</button>
                      <div className="mobile-focus-scope-divider" />
                      {lists.filter(l => l.id !== 'inbox').map(list => (
                        <button key={list.id} className={mobileFocusScope === 'list' && mobileFocusScopeListId === list.id ? 'is-active' : ''} onClick={() => { onSetMobileFocusScope('list'); onSetMobileFocusScopeListId(list.id); onSetMobileFocusScopeMenuOpen(false) }}>
                          {list.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : isPhoneViewport && mobileTab === 'calendar' ? (
              /* #14 — 日历 Tab：视图切换下拉 */
              <>
                <button className="mobile-topbar-calendar-mode-btn" onClick={() => onSetMobileCalendarModeMenuOpen(v => !v)}>
                  {calendarMode === 'month' ? '📋 月历' : calendarMode === 'week' ? '📋 周历' : '📋 日历'} <span className="mobile-topbar-scope-arrow">▾</span>
                </button>
                {mobileCalendarModeMenuOpen && (
                  <>
                    <div className="mobile-scope-overlay" onClick={() => onSetMobileCalendarModeMenuOpen(false)} />
                    <div className="mobile-topbar-calendar-mode-menu" style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100 }}>
                      <button className={calendarMode === 'month' ? 'is-active' : ''} onClick={() => { onSetCalendarMode('month'); onSetMobileCalendarModeMenuOpen(false) }}>月历</button>
                      <button className={calendarMode === 'week' ? 'is-active' : ''} onClick={() => { onSetCalendarMode('week'); onSetMobileCalendarModeMenuOpen(false) }}>周历</button>
                      <button className={calendarMode === 'agenda' ? 'is-active' : ''} onClick={() => { onSetCalendarMode('agenda'); onSetMobileCalendarModeMenuOpen(false) }}>日历</button>
                    </div>
                  </>
                )}
              </>
            ) : isPhoneViewport && mobileTab === 'matrix' ? (
              /* #需求3 — 象限 Tab：视图切换下拉 */
              <>
                <button className="mobile-topbar-calendar-mode-btn" onClick={() => onSetMobileMatrixModeMenuOpen(v => !v)}>
                  {mobileMatrixViewMode === 'matrix' ? '📊 四象限' : mobileMatrixViewMode === 'kanban' ? '📊 看板' : '📊 时间线'} <span className="mobile-topbar-scope-arrow">▾</span>
                </button>
                {mobileMatrixModeMenuOpen && (
                  <>
                    <div className="mobile-scope-overlay" onClick={() => onSetMobileMatrixModeMenuOpen(false)} />
                    <div className="mobile-topbar-calendar-mode-menu" style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100 }}>
                      <button className={mobileMatrixViewMode === 'matrix' ? 'is-active' : ''} onClick={() => { onSetMobileMatrixViewMode('matrix'); onSetMobileMatrixModeMenuOpen(false) }}>四象限</button>
                      <button className={mobileMatrixViewMode === 'kanban' ? 'is-active' : ''} onClick={() => { onSetMobileMatrixViewMode('kanban'); onSetMobileMatrixModeMenuOpen(false) }}>看板</button>
                      <button className={mobileMatrixViewMode === 'timeline' ? 'is-active' : ''} onClick={() => { onSetMobileMatrixViewMode('timeline'); onSetMobileMatrixModeMenuOpen(false) }}>时间线</button>
                    </div>
                  </>
                )}
              </>
            ) : isPhoneViewport ? (
              <span className="mobile-topbar__title">
                {mobileTab === 'me' ? '我的' : ''}
              </span>
            ) : (
              <>
                <button
                  className="mobile-topbar__menu-btn"
                  onClick={onOpenNavDrawer}
                  aria-label="打开导航"
                  style={{ display: 'none' }}
                >≡</button>
                <span className="mobile-topbar__title">{workspaceLabel}</span>
              </>
            )}
            {/* 搜索功能已移除 */}
          </div>
          <div className="mobile-topbar__right">
            {/* 搜索图标已移除 */}
            {isSupabaseEnabled() && user && (
              <SyncIndicator status={syncStatus} lastSyncedAt={lastSyncedAt} onForceSync={onForceSync} />
            )}
            <button
              className="mobile-topbar__icon-btn"
              onClick={onCycleTheme}
              title={themeLabel}
              aria-label={themeLabel}
            >
              {themeIcon}
            </button>
            {isSupabaseEnabled() && (user ? (
              <button
                className="mobile-topbar__avatar"
                onClick={onSignOut}
                title={`${user.displayName ?? user.email} · 退出`}
              >
                {(user.displayName ?? user.email).slice(0, 1).toUpperCase()}
              </button>
            ) : (
              <button
                className="ghost-button small"
                onClick={requestAuthScreen}
                title="登录后开启云同步与跨设备恢复"
              >
                登录
              </button>
            ))}
          </div>
        </header>
      )}

      {/* 中宽屏顶栏（仅右侧工具，无导航按钮）*/}
      {isUtilityDrawerMode && !isNavigationDrawerMode && (
        <section className="topbar panel topbar--actions-only">
          <div className="topbar-actions">
            <button className="ghost-button small" onClick={onOpenUtilityDrawer}>
              {selectedTask ? '提醒 / 详情' : '提醒面板'}
            </button>
            {isSupabaseEnabled() && user && (
              <SyncIndicator status={syncStatus} lastSyncedAt={lastSyncedAt} onForceSync={onForceSync} />
            )}
            {isSupabaseEnabled() && (
              user ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #6c63ff, #4f46e5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0,
                  }}>
                    {(user.displayName ?? user.email).slice(0, 1).toUpperCase()}
                  </div>
                  <button className="ghost-button small" onClick={onSignOut} style={{ fontSize: 11, opacity: 0.6 }}>
                    退出
                  </button>
                </div>
              ) : (
                <button
                  className="ghost-button small"
                  onClick={requestAuthScreen}
                  style={{ fontSize: 11 }}
                  title="登录后开启云同步与跨设备恢复"
                >
                  登录
                </button>
              )
            )}
          </div>
        </section>
      )}
    </>
  )
}
