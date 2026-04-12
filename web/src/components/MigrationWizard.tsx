/**
 * MigrationWizard — 本地历史数据迁移向导
 *
 * 触发条件：用户登录后，检测到 localStorage 中有旧版数据。
 * 提供两个选项：
 *   1. 导入到云端（将本地数据同步到当前账户）
 *   2. 放弃本地数据（使用云端已有数据）
 */
import { useState } from 'react'
import { hasLegacyLocalData, readLegacyState, clearLegacyLocalData, saveState } from '../utils/storage'

interface MigrationWizardProps {
  onComplete: () => void
}

export const MigrationWizard = ({ onComplete }: MigrationWizardProps) => {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  if (!hasLegacyLocalData()) {
    // 没有旧数据，直接跳过
    onComplete()
    return null
  }

  const legacyState = readLegacyState()
  const taskCount = legacyState.tasks.filter(t => !t.deleted).length

  const handleImport = async () => {
    setLoading(true)
    await saveState(legacyState)
    clearLegacyLocalData()
    setDone(true)
    setLoading(false)
    setTimeout(onComplete, 1200)
  }

  const handleDiscard = () => {
    clearLegacyLocalData()
    onComplete()
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        {done ? (
          <div style={styles.doneArea}>
            <div style={styles.doneIcon}>✓</div>
            <p style={styles.doneText}>数据已导入云端</p>
          </div>
        ) : (
          <>
            <div style={styles.icon}>📦</div>
            <h2 style={styles.title}>发现本地数据</h2>
            <p style={styles.desc}>
              检测到您设备上保存了 <strong style={{ color: '#f0f0f5' }}>{taskCount} 条任务</strong>
              的本地数据。是否将其导入到当前账户？
            </p>
            <div style={styles.btnRow}>
              <button
                style={{ ...styles.primaryBtn, opacity: loading ? 0.6 : 1 }}
                onClick={handleImport}
                disabled={loading}
              >
                {loading ? '导入中…' : '导入到云端'}
              </button>
              <button style={styles.ghostBtn} onClick={handleDiscard} disabled={loading}>
                放弃本地数据
              </button>
            </div>
            <p style={styles.hint}>导入后本地缓存会被清除，数据统一保存在云端。</p>
          </>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.7)',
    zIndex: 9998,
    backdropFilter: 'blur(4px)',
  },
  card: {
    width: 360,
    padding: '32px 28px',
    background: 'var(--bg-secondary, #1a1a22)',
    borderRadius: 16,
    border: '1px solid var(--border-subtle, rgba(255,255,255,0.07))',
    textAlign: 'center',
    boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
  },
  icon: { fontSize: 36, marginBottom: 12 },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--text-primary, #f0f0f5)',
    margin: '0 0 10px',
  },
  desc: {
    fontSize: 14,
    color: 'var(--text-secondary, #aaa)',
    lineHeight: 1.6,
    margin: '0 0 20px',
  },
  btnRow: {
    display: 'flex',
    gap: 10,
    flexDirection: 'column',
  },
  primaryBtn: {
    padding: '11px 0',
    borderRadius: 8,
    border: 'none',
    background: 'linear-gradient(135deg, #6c63ff, #4f46e5)',
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  ghostBtn: {
    padding: '10px 0',
    borderRadius: 8,
    border: '1px solid var(--border-default, rgba(255,255,255,0.12))',
    background: 'transparent',
    color: 'var(--text-secondary, #aaa)',
    fontSize: 14,
    cursor: 'pointer',
  },
  hint: {
    fontSize: 11,
    color: 'var(--text-tertiary, #666)',
    margin: '12px 0 0',
  },
  doneArea: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    padding: '12px 0',
  },
  doneIcon: {
    width: 48,
    height: 48,
    borderRadius: '50%',
    background: 'rgba(74, 222, 128, 0.15)',
    color: '#4ade80',
    fontSize: 22,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: {
    color: '#4ade80',
    fontSize: 15,
    fontWeight: 600,
    margin: 0,
  },
}
