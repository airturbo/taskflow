/**
 * useSystemTheme — 系统主题检测与三档切换
 *
 * 三档说明：
 *   'system'   → 跟随系统 (prefers-color-scheme)
 *   'midnight' → 强制深色
 *   'paper'    → 强制浅色
 *
 * 使用：
 *   const { resolvedTheme, cycleTheme, themeIcon, themeLabel } = useSystemTheme(theme, setTheme)
 *
 * resolvedTheme 始终是 'midnight' | 'paper'，供 document.documentElement.dataset.theme 使用。
 */
import { useEffect, useState } from 'react'
import type { ThemeMode, ThemeResolved } from '../types/domain'

const getSystemTheme = (): ThemeResolved =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'midnight' : 'paper'

export const resolveTheme = (mode: ThemeMode): ThemeResolved => {
  if (mode === 'system') return getSystemTheme()
  return mode
}

export const THEME_CYCLE: ThemeMode[] = ['system', 'midnight', 'paper']

export const THEME_META: Record<ThemeMode, { icon: string; label: string }> = {
  system: { icon: '💻', label: '跟随系统' },
  midnight: { icon: '🌙', label: '深色' },
  paper: { icon: '☀️', label: '浅色' },
}

export const useSystemTheme = (
  theme: ThemeMode,
  setTheme: (mode: ThemeMode) => void,
) => {
  const [resolvedTheme, setResolvedTheme] = useState<ThemeResolved>(() => resolveTheme(theme))

  useEffect(() => {
    if (theme !== 'system') {
      setResolvedTheme(theme)
      return
    }

    // 初始值
    setResolvedTheme(getSystemTheme())

    // 监听系统变化
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      if (theme === 'system') {
        setResolvedTheme(e.matches ? 'midnight' : 'paper')
      }
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  const cycleTheme = () => {
    const idx = THEME_CYCLE.indexOf(theme)
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]
    setTheme(next)
  }

  return {
    resolvedTheme,
    cycleTheme,
    themeIcon: THEME_META[theme].icon,
    themeLabel: THEME_META[theme].label,
  }
}
