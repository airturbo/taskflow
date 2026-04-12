/**
 * Supabase 数据库类型定义
 * 对应 supabase/migrations/001_init.sql 中的表结构
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          display_name: string | null
          avatar_url: string | null
          subscription_tier: 'free' | 'pro' | 'team'
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          display_name?: string | null
          avatar_url?: string | null
          subscription_tier?: 'free' | 'pro' | 'team'
          created_at?: string
          updated_at?: string
        }
        Update: {
          display_name?: string | null
          avatar_url?: string | null
          subscription_tier?: 'free' | 'pro' | 'team'
          updated_at?: string
        }
      }
      workspace_states: {
        Row: {
          id: string
          user_id: string
          device_id: string
          state_json: Json
          schema_version: number
          updated_at: string
        }
        Insert: {
          id?: string | undefined
          user_id: string
          device_id: string
          state_json: Json
          schema_version?: number | undefined
          updated_at?: string | undefined
        }
        Update: {
          id?: string | undefined
          user_id?: string | undefined
          device_id?: string | undefined
          state_json?: Json | undefined
          schema_version?: number | undefined
          updated_at?: string | undefined
        }
      }
      sync_cursors: {
        Row: {
          user_id: string
          device_id: string
          last_synced_at: string
        }
        Insert: {
          user_id: string
          device_id: string
          last_synced_at?: string
        }
        Update: {
          last_synced_at?: string
        }
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      subscription_tier: 'free' | 'pro' | 'team'
    }
  }
}
