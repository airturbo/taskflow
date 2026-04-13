import type { MobileTab } from '../stores/mobileUiStore'
import { useMobileUiStore } from '../stores/mobileUiStore'
import styles from './MobileTabBar.module.css'

export interface MobileTabBarProps {
  mobileTab: MobileTab
  onChangeTab: (tab: MobileTab) => void
  onOpenQuickCreate: () => void
}

export function MobileTabBar({ mobileTab, onChangeTab, onOpenQuickCreate }: MobileTabBarProps) {
  const { setMobileTabFading } = useMobileUiStore()

  return (
    <>
      <nav className={styles.tabBar} aria-label="主导航">
        {([
          { id: 'focus' as MobileTab, icon: '◎', label: '焦点' },
          { id: 'calendar' as MobileTab, icon: '📅', label: '日历' },
          { id: 'matrix' as MobileTab, icon: '⊞', label: '象限' },
          { id: 'me' as MobileTab, icon: '👤', label: '我的' },
        ]).map(tab => (
          <button
            key={tab.id}
            className={`${styles.tabItem} ${mobileTab === tab.id ? 'is-active' : ''}`}
            onClick={() => {
              if (mobileTab !== tab.id) {
                // #19 — Tab 切换淡入淡出
                setMobileTabFading(true)
                setTimeout(() => {
                  onChangeTab(tab.id)
                  setMobileTabFading(false)
                }, 150)
              }
            }}
          >
            <span className={styles.tabItemIcon}>{tab.icon}</span>
            <span className={styles.tabItemLabel}>{tab.label}</span>
          </button>
        ))}
      </nav>
      {/* FAB — 快速创建 */}
      <button
        className={styles.fab}
        onClick={onOpenQuickCreate}
        aria-label="快速创建任务"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
        </svg>
      </button>
    </>
  )
}
