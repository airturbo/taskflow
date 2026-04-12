/**
 * useGlobalShortcuts — 全局快捷键系统
 *
 * 快捷键列表：
 *   Cmd/Ctrl + N    → 新建任务（聚焦快速创建输入框）
 *   Cmd/Ctrl + K    → 全局搜索（聚焦搜索框）
 *   Cmd/Ctrl + ,    → 设置（待实现）
 *   Esc             → 关闭详情 / 取消选中
 *   1-5             → 切换视图（日历/列表/看板/时间线/四象限）
 *   Cmd + Z         → 撤销（待实现）
 *
 * 焦点在 input/textarea/select 内时不触发（避免误操作）。
 */
import { useEffect } from 'react'

type ShortcutMeta = 'cmd' | 'ctrl' | 'cmdOrCtrl'

interface ShortcutAction {
  key: string
  meta?: ShortcutMeta
  shift?: boolean
  description: string
  action: () => void
}

const isMac = () => navigator.platform.includes('Mac') || navigator.userAgent.includes('Mac')

const matchesMeta = (e: KeyboardEvent, meta?: ShortcutMeta): boolean => {
  if (!meta) return true
  if (meta === 'cmd') return e.metaKey && !e.ctrlKey
  if (meta === 'ctrl') return e.ctrlKey && !e.metaKey
  if (meta === 'cmdOrCtrl') return isMac() ? e.metaKey : e.ctrlKey
  return false
}

const isEditableTarget = (e: KeyboardEvent): boolean => {
  const target = e.target as HTMLElement
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  )
}

export const useGlobalShortcuts = (shortcuts: ShortcutAction[]) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        if (e.key.toLowerCase() !== shortcut.key.toLowerCase()) continue
        if (shortcut.meta && !matchesMeta(e, shortcut.meta)) continue
        if (shortcut.shift !== undefined && e.shiftKey !== shortcut.shift) continue

        // 有 meta 键的快捷键不受焦点限制；纯字母快捷键只在非编辑区触发
        if (!shortcut.meta && isEditableTarget(e)) continue

        e.preventDefault()
        shortcut.action()
        break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [shortcuts])
}

/** 格式化快捷键为显示文本（如 ⌘N 或 Ctrl+N） */
export const formatShortcut = (key: string, meta?: ShortcutMeta, shift?: boolean): string => {
  const mac = isMac()
  const parts: string[] = []
  if (meta === 'cmd' || (meta === 'cmdOrCtrl' && mac)) parts.push('⌘')
  else if (meta === 'ctrl' || (meta === 'cmdOrCtrl' && !mac)) parts.push('Ctrl+')
  if (shift) parts.push(mac ? '⇧' : 'Shift+')
  parts.push(key.toUpperCase())
  return parts.join('')
}
