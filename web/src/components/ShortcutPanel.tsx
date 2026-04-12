/**
 * ShortcutPanel — 快捷键参考面板
 *
 * 按 ? 键呼出，展示功能概览 + 所有可用快捷键，对标 Linear / Notion 体验。
 * 按 Esc 或点击背景关闭。
 */
import { useEffect } from 'react'

interface ShortcutGroup {
  title: string
  items: { keys: string[]; desc: string }[]
}

const isMac = () =>
  typeof navigator !== 'undefined' &&
  (navigator.platform.includes('Mac') || navigator.userAgent.includes('Mac'))

const mod = () => (isMac() ? '⌘' : 'Ctrl')

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: '创建与搜索',
    items: [
      { keys: [mod(), 'N'], desc: '新建任务（聚焦快速创建）' },
      { keys: [mod(), 'K'], desc: '全局搜索' },
    ],
  },
  {
    title: '视图切换',
    items: [
      { keys: ['1'], desc: '日历视图' },
      { keys: ['2'], desc: '列表视图' },
      { keys: ['3'], desc: '看板视图' },
      { keys: ['4'], desc: '时间线视图' },
      { keys: ['5'], desc: '四象限视图' },
    ],
  },
  {
    title: '导航与操作',
    items: [
      { keys: ['Esc'], desc: '取消选中 / 关闭弹层' },
      { keys: ['Enter'], desc: '激活选中卡片（键盘导航）' },
      { keys: ['?'], desc: '打开快捷键面板（本面板）' },
    ],
  },
  {
    title: '自然语言创建',
    items: [
      { keys: ['#标签名'], desc: '自动识别并关联标签' },
      { keys: ['!紧急 / !高 / !低'], desc: '设置任务优先级' },
      { keys: ['明天下午3点'], desc: '自动设置计划时间' },
      { keys: ['3天后 / 下周三'], desc: '相对日期识别' },
    ],
  },
]

const FEATURE_ITEMS = [
  { icon: '📋', label: '五种视图 — 列表、看板、四象限、日历、时间线' },
  { icon: '🔍', label: '智能搜索 — 支持标题、标签、状态筛选' },
  { icon: '📅', label: '多维排期 — 计划时间 / DDL 双维度管理' },
  { icon: '🏷️', label: '标签系统 — 颜色标签 + AND 交集筛选' },
  { icon: '📂', label: '文件夹 — 层级组织，清单分组' },
  { icon: '🔔', label: '提醒 — 相对/绝对时间，稍后提醒' },
  { icon: '📊', label: '统计 — 完成趋势、优先级分布' },
]

interface ShortcutPanelProps {
  onClose: () => void
}

export const ShortcutPanel = ({ onClose }: ShortcutPanelProps) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="shortcut-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="快捷键参考">
      <div className="shortcut-panel" onClick={(e) => e.stopPropagation()}>
        <div className="shortcut-panel__header">
          <div>
            <p className="shortcut-panel__eyebrow">keyboard shortcuts</p>
            <h3 className="shortcut-panel__title">快捷键</h3>
          </div>
          <button className="shortcut-panel__close-btn" onClick={onClose} aria-label="关闭">×</button>
        </div>

        <div className="shortcut-panel__features">
          <p className="shortcut-panel__features-title">TaskFlow 功能概览</p>
          <div className="shortcut-panel__features-divider" />
          {FEATURE_ITEMS.map((item) => (
            <div key={item.label} className="shortcut-panel__feature-item">
              <span className="shortcut-panel__feature-icon">{item.icon}</span>
              <span className="shortcut-panel__feature-label">{item.label}</span>
            </div>
          ))}
        </div>

        <div className="shortcut-panel__groups">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title} className="shortcut-panel__group">
              <p className="shortcut-panel__group-title">{group.title}</p>
              <div className="shortcut-panel__items">
                {group.items.map((item, i) => (
                  <div key={i} className="shortcut-panel__item">
                    <span className="shortcut-panel__desc">{item.desc}</span>
                    <div className="shortcut-panel__keys">
                      {item.keys.map((k, ki) => (
                        <kbd key={ki} className="shortcut-panel__kbd">{k}</kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className="shortcut-panel__footer">按 <kbd className="shortcut-panel__kbd shortcut-panel__kbd--small">?</kbd> 随时呼出此面板</p>
      </div>
    </div>
  )
}
