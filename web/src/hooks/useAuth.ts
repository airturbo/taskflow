/**
 * useAuth — 认证状态管理 hook
 *
 * 提供：
 * - user: 当前登录用户（null = 未登录）
 * - loading: 初始化中（避免闪屏）
 * - signIn / signUp / signOut / signInWithGoogle
 * - error: 上次操作的错误信息
 *
 * Supabase 未配置时，所有操作静默 no-op，user 始终为 null（访客模式）。
 */
import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, isSupabaseEnabled } from '../utils/supabase'

export interface AuthUser {
  id: string
  email: string
  displayName: string | null
  avatarUrl: string | null
  subscriptionTier: 'free' | 'pro' | 'team'
}

const mapUser = (user: User): AuthUser => ({
  id: user.id,
  email: user.email ?? '',
  displayName: user.user_metadata?.display_name as string | null ?? null,
  avatarUrl: user.user_metadata?.avatar_url as string | null ?? null,
  subscriptionTier: 'free',
})

export const useAuth = () => {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(isSupabaseEnabled())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isSupabaseEnabled() || !supabase) {
      setLoading(false)
      return
    }

    // 获取当前 session；失败时不要阻塞本地模式
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setUser(session?.user ? mapUser(session.user) : null)
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : '认证服务暂不可用'
        setError(message)
        setUser(null)
      })
      .finally(() => {
        setLoading(false)
      })

    // 监听 auth 状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? mapUser(session.user) : null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signUp = useCallback(async (email: string, password: string, displayName?: string) => {
    if (!supabase) return { error: 'Supabase 未配置' }
    setError(null)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName ?? email.split('@')[0] } },
    })
    if (error) setError(error.message)
    return { error: error?.message ?? null }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: 'Supabase 未配置' }
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    return { error: error?.message ?? null }
  }, [])

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) return { error: 'Supabase 未配置' }
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) setError(error.message)
    return { error: error?.message ?? null }
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    setUser(null)
  }, [])

  const resetPassword = useCallback(async (email: string) => {
    if (!supabase) return { error: 'Supabase 未配置' }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    return { error: error?.message ?? null }
  }, [])

  return { user, loading, error, signUp, signIn, signInWithGoogle, signOut, resetPassword }
}
