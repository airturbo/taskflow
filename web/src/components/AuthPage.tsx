/**
 * AuthPage — 登录 / 注册页
 *
 * 风格对标 Todoist/Things：极简、无多余装饰、聚焦输入框。
 * 支持：邮箱登录、邮箱注册、Google OAuth（Supabase 配置后生效）、忘记密码。
 */
import { useState, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import { isSupabaseEnabled } from '../utils/supabase'

type Tab = 'signin' | 'signup'

interface AuthPageProps {
  /** 访客模式：不强制登录，直接进入 App（Supabase 未配置时使用） */
  onGuestMode: () => void
}

export const AuthPage = ({ onGuestMode }: AuthPageProps) => {
  const { signIn, signUp, signInWithGoogle, resetPassword, error: authError } = useAuth()
  const [tab, setTab] = useState<Tab>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    if (tab === 'signin') {
      const { error } = await signIn(email, password)
      if (error) setMessage({ type: 'error', text: translateError(error) })
    } else {
      const { error } = await signUp(email, password, displayName)
      if (error) {
        setMessage({ type: 'error', text: translateError(error) })
      } else {
        setMessage({ type: 'success', text: '注册成功！请检查邮箱完成验证后登录。' })
      }
    }
    setLoading(false)
  }

  const handleForgotPassword = async () => {
    if (!email) {
      setMessage({ type: 'error', text: '请先输入邮箱地址' })
      return
    }
    setLoading(true)
    const { error } = await resetPassword(email)
    setLoading(false)
    if (error) {
      setMessage({ type: 'error', text: translateError(error) })
    } else {
      setMessage({ type: 'success', text: '重置链接已发送，请检查邮箱。' })
    }
  }

  const handleGoogle = async () => {
    setLoading(true)
    await signInWithGoogle()
    setLoading(false)
  }

  const err = message?.type === 'error' ? message.text : (authError ? translateError(authError) : null)
  const success = message?.type === 'success' ? message.text : null

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        {/* Logo区域 */}
        <div style={styles.logoArea}>
          <div style={styles.logoIcon}>✓</div>
          <h1 style={styles.appName}>TaskFlow</h1>
          <p style={styles.tagline}>专注完成每件重要的事</p>
        </div>

        {/* Tab 切换 */}
        <div style={styles.tabRow}>
          <button
            style={{ ...styles.tab, ...(tab === 'signin' ? styles.tabActive : {}) }}
            onClick={() => { setTab('signin'); setMessage(null) }}
          >
            登录
          </button>
          <button
            style={{ ...styles.tab, ...(tab === 'signup' ? styles.tabActive : {}) }}
            onClick={() => { setTab('signup'); setMessage(null) }}
          >
            注册
          </button>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} style={styles.form}>
          {tab === 'signup' && (
            <input
              style={styles.input}
              type="text"
              placeholder="昵称（可选）"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              autoComplete="name"
            />
          )}
          <input
            style={styles.input}
            type="email"
            placeholder="邮箱地址"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
            autoFocus
          />
          <input
            style={styles.input}
            type="password"
            placeholder="密码（至少 8 位）"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
          />

          {err && <p style={styles.errorMsg}>{err}</p>}
          {success && <p style={styles.successMsg}>{success}</p>}

          <button style={{ ...styles.primaryBtn, opacity: loading ? 0.6 : 1 }} type="submit" disabled={loading}>
            {loading ? '处理中…' : tab === 'signin' ? '登录' : '创建账户'}
          </button>
        </form>

        {/* 忘记密码 */}
        {tab === 'signin' && (
          <button style={styles.linkBtn} onClick={handleForgotPassword} disabled={loading}>
            忘记密码？
          </button>
        )}

        {/* Google OAuth */}
        {isSupabaseEnabled() && (
          <>
            <div style={styles.divider}><span style={styles.dividerText}>或</span></div>
            <button style={styles.googleBtn} onClick={handleGoogle} disabled={loading}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ marginRight: 8 }}>
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
              使用 Google 账户继续
            </button>
          </>
        )}

        {/* 本地优先模式 */}
        <div style={styles.guestArea}>
          <button style={styles.linkBtn} onClick={onGuestMode}>
            暂不登录，先本地使用 →
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- 错误信息本地化 ----
const translateError = (msg: string): string => {
  if (msg.includes('Invalid login credentials')) return '邮箱或密码错误'
  if (msg.includes('Email not confirmed')) return '邮箱未验证，请检查邮件并点击确认链接'
  if (msg.includes('User already registered')) return '该邮箱已注册，请直接登录'
  if (msg.includes('Password should be')) return '密码至少需要 8 位'
  if (msg.includes('Unable to validate')) return '链接已失效，请重新申请'
  if (msg.includes('rate limit')) return '操作太频繁，请稍后再试'
  if (msg.includes('network')) return '网络错误，请检查连接'
  return msg
}

// ---- 样式 ----
const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-primary, #0f0f13)',
    zIndex: 9999,
  },
  card: {
    width: 360,
    padding: '36px 32px',
    background: 'var(--bg-secondary, #1a1a22)',
    borderRadius: 16,
    border: '1px solid var(--border-subtle, rgba(255,255,255,0.07))',
    boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  logoArea: {
    textAlign: 'center',
    marginBottom: 28,
  },
  logoIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    background: 'linear-gradient(135deg, #6c63ff, #4f46e5)',
    color: '#fff',
    fontSize: 22,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 12px',
  },
  appName: {
    fontSize: 22,
    fontWeight: 700,
    color: 'var(--text-primary, #f0f0f5)',
    margin: 0,
    letterSpacing: '-0.3px',
  },
  tagline: {
    fontSize: 13,
    color: 'var(--text-tertiary, #666)',
    margin: '4px 0 0',
  },
  tabRow: {
    display: 'flex',
    borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    padding: '8px 0',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    color: 'var(--text-tertiary, #888)',
    borderBottom: '2px solid transparent',
    marginBottom: -1,
    transition: 'color 0.15s, border-color 0.15s',
  },
  tabActive: {
    color: 'var(--text-primary, #f0f0f5)',
    borderBottom: '2px solid #6c63ff',
    fontWeight: 600,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  input: {
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid var(--border-default, rgba(255,255,255,0.12))',
    background: 'var(--bg-input, rgba(255,255,255,0.05))',
    color: 'var(--text-primary, #f0f0f5)',
    fontSize: 14,
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  errorMsg: {
    color: '#ff6b7a',
    fontSize: 12,
    margin: 0,
  },
  successMsg: {
    color: '#4ade80',
    fontSize: 12,
    margin: 0,
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
    marginTop: 4,
    transition: 'opacity 0.15s',
  },
  linkBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-tertiary, #888)',
    fontSize: 12,
    cursor: 'pointer',
    padding: '8px 0',
    display: 'block',
    width: '100%',
    textAlign: 'center',
  },
  divider: {
    position: 'relative',
    textAlign: 'center',
    margin: '12px 0',
    borderTop: '1px solid var(--border-subtle, rgba(255,255,255,0.07))',
  },
  dividerText: {
    position: 'relative',
    top: -9,
    background: 'var(--bg-secondary, #1a1a22)',
    padding: '0 10px',
    fontSize: 12,
    color: 'var(--text-tertiary, #666)',
  },
  googleBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '10px 0',
    borderRadius: 8,
    border: '1px solid var(--border-default, rgba(255,255,255,0.12))',
    background: 'transparent',
    color: 'var(--text-primary, #f0f0f5)',
    fontSize: 14,
    cursor: 'pointer',
    transition: 'background 0.15s',
    width: '100%',
  },
  guestArea: {
    marginTop: 4,
    textAlign: 'center',
  },
}
