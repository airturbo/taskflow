/**
 * Supabase 客户端初始化
 *
 * 环境变量通过 Vite 注入（.env.local 文件配置）：
 *   VITE_SUPABASE_URL=https://xxxx.supabase.co
 *   VITE_SUPABASE_ANON_KEY=eyJhbGc...
 *
 * 未配置时降级为 null，所有 API 调用回退到 localStorage-only 模式。
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/supabase'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export let supabase: SupabaseClient<Database> | null = null

if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  })
}

export const isSupabaseEnabled = (): boolean => supabase !== null
