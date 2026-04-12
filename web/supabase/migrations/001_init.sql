-- ============================================================
-- TaskFlow Phase 1 初始化 Schema
-- 在 Supabase SQL Editor 中执行此文件
-- ============================================================

-- 扩展：UUID 生成
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. 用户档案表（关联 auth.users）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  display_name    TEXT,
  avatar_url      TEXT,
  subscription_tier TEXT NOT NULL DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'team')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 新用户注册时自动创建 profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'display_name',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 2. 工作区状态表（每用户每设备一条记录）
--    Phase 1 采用整体 JSON 存储，Phase 2 迁移到结构化表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.workspace_states (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id       TEXT NOT NULL,
  state_json      JSONB NOT NULL DEFAULT '{}',
  schema_version  INTEGER NOT NULL DEFAULT 1,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, device_id)
);

-- 更新时自动刷新 updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workspace_states_updated_at
  BEFORE UPDATE ON public.workspace_states
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- 3. 同步游标表（多端同步用，Phase 2 扩展）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sync_cursors (
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id       TEXT NOT NULL,
  last_synced_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, device_id)
);

-- ============================================================
-- 4. Row Level Security（RLS）— 每个用户只能读写自己的数据
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_cursors ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- workspace_states
CREATE POLICY "Users can read own workspace states"
  ON public.workspace_states FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own workspace states"
  ON public.workspace_states FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own workspace states"
  ON public.workspace_states FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own workspace states"
  ON public.workspace_states FOR DELETE USING (auth.uid() = user_id);

-- sync_cursors
CREATE POLICY "Users can read own sync cursors"
  ON public.sync_cursors FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can upsert own sync cursors"
  ON public.sync_cursors FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- 5. 索引
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_workspace_states_user_id ON public.workspace_states(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_states_updated_at ON public.workspace_states(updated_at DESC);
