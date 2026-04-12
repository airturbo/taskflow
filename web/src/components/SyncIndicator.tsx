/**
 * SyncIndicator — 顶栏同步状态指示器
 *
 * 极简设计：一个小圆点 + hover 显示详情。
 * 状态：
 *   idle    → 灰色（未登录或未接入云端）
 *   syncing → 蓝色脉冲动画
 *   synced  → 绿色（已同步，显示时间后淡出）
 *   offline → 橙色（离线）
 *   error   → 红色（同步出错）
 */
import { useEffect, useState } from 'react'
import type { SyncStatus } from '../hooks/useRealtimeSync'

interface SyncIndicatorProps {
  status: SyncStatus
  lastSyncedAt: Date | null
  onForceSync?: () => void
}

export const SyncIndicator = ({ status, lastSyncedAt, onForceSync }: SyncIndicatorProps) => {
  const [showTooltip, setShowTooltip] = useState(false)
  // synced 状态 3 秒后自动淡回 idle 视觉
  const [displayStatus, setDisplayStatus] = useState<SyncStatus>(status)

  useEffect(() => {
    setDisplayStatus(status)
    if (status === 'synced') {
      const t = setTimeout(() => setDisplayStatus('idle'), 3000)
      return () => clearTimeout(t)
    }
  }, [status])

  const dotColor = {
    idle: 'rgba(255,255,255,0.2)',
    syncing: '#60a5fa',
    synced: '#4ade80',
    offline: '#fb923c',
    error: '#f87171',
  }[displayStatus]

  const label = {
    idle: '本地模式 · 数据已保存在当前设备',
    syncing: '云同步中…',
    synced: lastSyncedAt ? `云端已检查 · ${formatRelativeTime(lastSyncedAt)}` : '云端已检查',
    offline: '离线模式 · 数据已保存本地，联网后自动同步',
    error: '云同步暂不可用 · 数据仍保存在本地，点击重试',
  }[displayStatus]

  return (
    <div
      style={styles.wrapper}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={status === 'error' ? onForceSync : undefined}
      title={label}
    >
      {/* 圆点 */}
      <div style={{
        ...styles.dot,
        background: dotColor,
        boxShadow: displayStatus === 'syncing'
          ? `0 0 0 3px ${dotColor}40`
          : displayStatus === 'offline'
          ? `0 0 0 2px ${dotColor}30`
          : 'none',
        animation: displayStatus === 'syncing' ? 'sync-pulse 1.2s ease-in-out infinite' : 'none',
        cursor: status === 'error' ? 'pointer' : 'default',
      }} />

      {/* Tooltip */}
      {showTooltip && (
        <div style={styles.tooltip}>
          <span style={styles.tooltipIcon}>
            {displayStatus === 'syncing' ? '↻' :
             displayStatus === 'synced' ? '✓' :
             displayStatus === 'offline' ? '⚡' :
             displayStatus === 'error' ? '⚠' : '○'}
          </span>
          {label}
          {status === 'error' && (
            <span style={{ color: '#60a5fa', marginLeft: 4 }}>点击重试</span>
          )}
        </div>
      )}
    </div>
  )
}

const formatRelativeTime = (date: Date): string => {
  const diff = Date.now() - date.getTime()
  if (diff < 5000) return '刚刚'
  if (diff < 60000) return `${Math.floor(diff / 1000)}秒前`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    padding: '4px 2px',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    transition: 'background 0.3s, box-shadow 0.3s',
    flexShrink: 0,
  },
  tooltip: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 6,
    background: 'var(--bg-elevated, #252530)',
    border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
    borderRadius: 8,
    padding: '6px 10px',
    fontSize: 12,
    color: 'var(--text-secondary, #aaa)',
    whiteSpace: 'nowrap',
    boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    gap: 5,
  },
  tooltipIcon: {
    fontSize: 11,
    opacity: 0.7,
  },
}
