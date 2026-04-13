/**
 * ExportPanel — 数据导出面板
 *
 * 通过侧边栏"导出数据"按钮呼出，提供 JSON / CSV / Markdown 三种导出格式。
 * 按 Esc 或点击背景关闭，行为与 ShortcutPanel 保持一致。
 */
import { useEffect, useState } from 'react'
import type { PersistedState } from '../types/domain'
import { exportAsJSON, exportAsCSV, exportAsMarkdown } from '../utils/export'
import styles from './ShortcutPanel.module.css'

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
      className={styles.shortcutOverlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="数据导出"
    >
      <div className={styles.shortcutPanel} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.shortcutPanelHeader}>
          <div>
            <p className={styles.shortcutPanelEyebrow}>data export</p>
            <h3 className={styles.shortcutPanelTitle}>导出数据</h3>
          </div>
          <button
            className={styles.shortcutPanelCloseBtn}
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        {/* Workspace summary */}
        <div className={styles.exportPanelSummary}>
          <div className={styles.exportPanelSummaryItem}>
            <span className={styles.exportPanelSummaryValue}>{activeTasks.length}</span>
            <span className={styles.exportPanelSummaryLabel}>任务</span>
          </div>
          <div className={styles.exportPanelSummaryDivider} />
          <div className={styles.exportPanelSummaryItem}>
            <span className={styles.exportPanelSummaryValue}>{listCount}</span>
            <span className={styles.exportPanelSummaryLabel}>清单</span>
          </div>
          <div className={styles.exportPanelSummaryDivider} />
          <div className={styles.exportPanelSummaryItem}>
            <span className={styles.exportPanelSummaryValue}>{tagCount}</span>
            <span className={styles.exportPanelSummaryLabel}>标签</span>
          </div>
        </div>

        {/* Format cards */}
        <div className={styles.exportPanelFormats}>
          {EXPORT_FORMATS.map((fmt) => {
            const s = status[fmt.id] ?? 'idle'
            return (
              <div key={fmt.id} className={styles.exportPanelFormatRow}>
                <div className={styles.exportPanelFormatInfo}>
                  <span className={styles.exportPanelFormatIcon}>{fmt.icon}</span>
                  <div>
                    <p className={styles.exportPanelFormatLabel}>
                      {fmt.label}
                      <span className={styles.exportPanelFormatExt}>{fmt.extension}</span>
                    </p>
                    <p className={styles.exportPanelFormatDesc}>{fmt.description}</p>
                  </div>
                </div>
                <button
                  className={`ghost-button small${s === 'success' ? ` ${styles.exportPanelFormatBtnSuccess}` : s === 'error' ? ` ${styles.exportPanelFormatBtnError}` : ''}`}
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
        <p className={styles.shortcutPanelFooter}>
          已删除的任务不会包含在导出中。JSON 格式可完整还原工作区。
        </p>
      </div>
    </div>
  )
}
