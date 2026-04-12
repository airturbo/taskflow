/**
 * ExportPanel — 数据导出面板
 *
 * 通过侧边栏"导出数据"按钮呼出，提供 JSON / CSV / Markdown 三种导出格式。
 * 按 Esc 或点击背景关闭，行为与 ShortcutPanel 保持一致。
 */
import { useEffect, useState } from 'react'
import type { PersistedState } from '../types/domain'
import { exportAsJSON, exportAsCSV, exportAsMarkdown } from '../utils/export'

interface ExportPanelProps {
  state: PersistedState
  onClose: () => void
}

interface ExportFormat {
  id: 'json' | 'csv' | 'markdown'
  label: string
  extension: string
  icon: string
  description: string
}

const EXPORT_FORMATS: ExportFormat[] = [
  {
    id: 'json',
    label: 'JSON',
    extension: '.json',
    icon: '📦',
    description: '完整数据备份，可用于恢复工作区。保留所有字段与结构。',
  },
  {
    id: 'csv',
    label: 'CSV',
    extension: '.csv',
    icon: '📊',
    description: '表格格式，适合在 Excel、Numbers、Google Sheets 中查看与分析。',
  },
  {
    id: 'markdown',
    label: 'Markdown',
    extension: '.md',
    icon: '📝',
    description: '按清单分组的可读文档，适合归档或粘贴到笔记工具。',
  },
]

type ExportStatus = 'idle' | 'success' | 'error'

export function ExportPanel({ state, onClose }: ExportPanelProps) {
  const [status, setStatus] = useState<Record<string, ExportStatus>>({})

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const activeTasks = state.tasks.filter((t) => !t.deleted)
  const listCount = state.lists?.length ?? 0
  const tagCount = (state.tags ?? []).filter(
    (t) => !['system:all', 'system:today', 'system:upcoming', 'system:overdue'].includes(t.id),
  ).length

  function handleExport(format: ExportFormat) {
    try {
      if (format.id === 'json') exportAsJSON(state)
      else if (format.id === 'csv') exportAsCSV(state)
      else exportAsMarkdown(state)

      setStatus((prev) => ({ ...prev, [format.id]: 'success' }))
      // Reset the success indicator after 2.5 s
      setTimeout(() => {
        setStatus((prev) => ({ ...prev, [format.id]: 'idle' }))
      }, 2500)
    } catch (err) {
      console.error('[ExportPanel] export failed', err)
      setStatus((prev) => ({ ...prev, [format.id]: 'error' }))
      setTimeout(() => {
        setStatus((prev) => ({ ...prev, [format.id]: 'idle' }))
      }, 3000)
    }
  }

  return (
    <div
      className="shortcut-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="数据导出"
    >
      <div className="shortcut-panel export-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="shortcut-panel__header">
          <div>
            <p className="shortcut-panel__eyebrow">data export</p>
            <h3 className="shortcut-panel__title">导出数据</h3>
          </div>
          <button
            className="shortcut-panel__close-btn"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        {/* Workspace summary */}
        <div className="export-panel__summary">
          <div className="export-panel__summary-item">
            <span className="export-panel__summary-value">{activeTasks.length}</span>
            <span className="export-panel__summary-label">任务</span>
          </div>
          <div className="export-panel__summary-divider" />
          <div className="export-panel__summary-item">
            <span className="export-panel__summary-value">{listCount}</span>
            <span className="export-panel__summary-label">清单</span>
          </div>
          <div className="export-panel__summary-divider" />
          <div className="export-panel__summary-item">
            <span className="export-panel__summary-value">{tagCount}</span>
            <span className="export-panel__summary-label">标签</span>
          </div>
        </div>

        {/* Format cards */}
        <div className="export-panel__formats">
          {EXPORT_FORMATS.map((fmt) => {
            const s = status[fmt.id] ?? 'idle'
            return (
              <div key={fmt.id} className="export-panel__format-row">
                <div className="export-panel__format-info">
                  <span className="export-panel__format-icon">{fmt.icon}</span>
                  <div>
                    <p className="export-panel__format-label">
                      {fmt.label}
                      <span className="export-panel__format-ext">{fmt.extension}</span>
                    </p>
                    <p className="export-panel__format-desc">{fmt.description}</p>
                  </div>
                </div>
                <button
                  className={`ghost-button small export-panel__format-btn${s === 'success' ? ' export-panel__format-btn--success' : s === 'error' ? ' export-panel__format-btn--error' : ''}`}
                  onClick={() => handleExport(fmt)}
                  disabled={s !== 'idle'}
                  aria-label={`导出 ${fmt.label}`}
                >
                  {s === 'success' ? '✓ 已下载' : s === 'error' ? '导出失败' : '导出'}
                </button>
              </div>
            )
          })}
        </div>

        {/* Footer note */}
        <p className="shortcut-panel__footer">
          已删除的任务不会包含在导出中。JSON 格式可完整还原工作区。
        </p>
      </div>
    </div>
  )
}
