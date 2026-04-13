/**
 * ShortcutGuideOverlay — first-use shortcut hint toast
 *
 * Renders a small bottom-center toast on first visit.
 * Dismissed by clicking anywhere on it, the X button, or after 12 s.
 * Guard: localStorage key `taskflow:shortcut-guide-seen`
 */
import { useEffect, useState } from 'react'
import styles from './ShortcutGuideOverlay.module.css'

const STORAGE_KEY = 'taskflow:shortcut-guide-seen'

const isMac =
  typeof navigator !== 'undefined' &&
  (navigator.platform.includes('Mac') || navigator.userAgent.includes('Mac'))
const mod = isMac ? '⌘' : 'Ctrl'

const HINTS = [
  { keys: [`${mod}+N`], desc: '新建任务' },
  { keys: [`${mod}+K`], desc: '全局搜索' },
  { keys: ['1–5'], desc: '切换视图' },
  { keys: ['?'], desc: '查看全部快捷键' },
]

export function ShortcutGuideOverlay() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setVisible(true)
      const timer = setTimeout(dismiss, 12000)
      return () => clearTimeout(timer)
    }
  }, [])

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className={styles.overlay} role="status" aria-live="polite">
      <div className={styles.toast}>
        <div className={styles.header}>
          <span className={styles.eyebrow}>keyboard shortcuts</span>
          <button className={styles.closeBtn} onClick={dismiss} aria-label="关闭提示">×</button>
        </div>
        <div className={styles.hints}>
          {HINTS.map((h) => (
            <div key={h.desc} className={styles.hintRow}>
              <div className={styles.keys}>
                {h.keys.map((k) => <kbd key={k} className={styles.kbd}>{k}</kbd>)}
              </div>
              <span className={styles.desc}>{h.desc}</span>
            </div>
          ))}
        </div>
        <button className={styles.dismissBtn} onClick={dismiss}>知道了</button>
      </div>
    </div>
  )
}
