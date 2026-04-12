/**
 * AuthGate — 本地优先的认证入口
 *
 * 逻辑：
 *   1. 默认直接进入 App，本地模式始终可用
 *   2. 用户主动点击“登录”时再显示 AuthPage
 *   3. 登录成功后检查是否需要迁移旧本地数据
 */
import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../hooks/useAuth'
import { OPEN_AUTH_SCREEN_EVENT } from '../utils/auth-events'
import { isSupabaseEnabled } from '../utils/supabase'
import { setCurrentUserId, hasLegacyLocalData } from '../utils/storage'
import { AuthPage } from './AuthPage'
import { MigrationWizard } from './MigrationWizard'

type GateState = 'auth' | 'migration' | 'ready'

interface AuthGateProps {
  children: ReactNode
  /** 登录状态变化时回调（保留兼容口子） */
  onAuthChange?: (userId: string | null) => void
}

export const AuthGate = ({ children, onAuthChange }: AuthGateProps) => {
  const { user, loading } = useAuth()
  const [gateState, setGateState] = useState<GateState>('ready')
  const [authRequested, setAuthRequested] = useState(false)

  useEffect(() => {
    const handleOpenAuth = () => {
      if (!isSupabaseEnabled()) return
      setAuthRequested(true)
      setGateState('auth')
    }

    window.addEventListener(OPEN_AUTH_SCREEN_EVENT, handleOpenAuth)
    return () => window.removeEventListener(OPEN_AUTH_SCREEN_EVENT, handleOpenAuth)
  }, [])

  useEffect(() => {
    if (!isSupabaseEnabled()) {
      setCurrentUserId(null)
      setGateState('ready')
      onAuthChange?.(null)
      return
    }

    if (loading && !user) {
      setCurrentUserId(null)
      setGateState(authRequested ? 'auth' : 'ready')
      onAuthChange?.(null)
      return
    }

    if (!user) {
      setCurrentUserId(null)
      setGateState(authRequested ? 'auth' : 'ready')
      onAuthChange?.(null)
      return
    }

    setAuthRequested(false)
    setCurrentUserId(user.id)
    onAuthChange?.(user.id)

    if (hasLegacyLocalData()) {
      setGateState('migration')
    } else {
      setGateState('ready')
    }
  }, [user, loading, authRequested, onAuthChange])

  if (gateState === 'auth') {
    return (
      <>
        {children}
        <AuthPage
          onGuestMode={() => {
            setAuthRequested(false)
            setCurrentUserId(null)
            setGateState('ready')
            onAuthChange?.(null)
          }}
        />
      </>
    )
  }

  if (gateState === 'migration') {
    return (
      <>
        {children}
        <MigrationWizard onComplete={() => setGateState('ready')} />
      </>
    )
  }

  return <>{children}</>
}
