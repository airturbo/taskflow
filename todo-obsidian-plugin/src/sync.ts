/**
 * TaskFlowSync — Obsidian plugin ↔ Supabase sync engine
 *
 * Strategy: last-write-wins on `updated_at`, matching the Web app's approach.
 * - pull(): fetch remote row; if remote updated_at > local lastSyncAt, overwrite local data
 * - push(): upsert the current in-memory workspace state to `workspace_states`
 * - syncNow(): pull then push (ensures we don't clobber newer remote writes)
 *
 * The `workspace_states` table schema (from web/src/utils/storage.ts):
 *   user_id       text  PK (with device_id)
 *   device_id     text  PK
 *   state_json    jsonb
 *   schema_version int
 *   updated_at    timestamptz
 *
 * Silent-skip contract: if settings are incomplete / user is not signed in, every
 * method returns immediately without throwing so callers need no guard logic.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Notice } from 'obsidian';
import type TodoWorkspacePlugin from './main';
import type { TodoPluginData } from './types';

// Matches web/src/utils/sync-shared.ts
const SCHEMA_VERSION = 1;

// Shape of one workspace_states row as returned by Supabase select
interface WorkspaceStateRow {
  user_id: string;
  device_id: string;
  state_json: unknown;
  schema_version: number;
  updated_at: string;
}

export class TaskFlowSync {
  private supabase: SupabaseClient | null = null;
  private userId: string | null = null;
  private deviceId: string | null = null;
  private plugin: TodoWorkspacePlugin;

  constructor(plugin: TodoWorkspacePlugin) {
    this.plugin = plugin;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  async init(): Promise<void> {
    const settings = this.plugin.getSettings();

    if (!this.isConfigured(settings)) return;

    try {
      this.supabase = createClient(settings.supabaseUrl.trim(), settings.supabaseAnonKey.trim(), {
        auth: {
          persistSession: false,       // Obsidian has no browser localStorage for auth tokens
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      });

      const { data, error } = await this.supabase.auth.signInWithPassword({
        email: settings.supabaseEmail.trim(),
        password: settings.supabasePassword,
      });

      if (error || !data.user) {
        console.warn('[TaskFlowSync] Sign-in failed:', error?.message);
        this.supabase = null;
        return;
      }

      this.userId = data.user.id;
      this.deviceId = await this.getOrCreateDeviceId();

      // Initial pull to hydrate local state from the cloud
      await this.pull();
    } catch (err) {
      console.warn('[TaskFlowSync] init error:', err);
      this.supabase = null;
    }
  }

  destroy(): void {
    if (this.supabase) {
      // Sign out fire-and-forget; don't await in onunload
      void this.supabase.auth.signOut();
      this.supabase = null;
    }
    this.userId = null;
    this.deviceId = null;
  }

  // ─── Core sync operations ────────────────────────────────────────────────────

  /**
   * Pull the most recent row from `workspace_states` across ALL devices for this user.
   * If the remote state is newer than our last sync timestamp, merge it into local data.
   * "Newer" = remote updated_at > settings.lastSyncAt (or we have never synced).
   */
  async pull(): Promise<void> {
    if (!this.ready()) return;

    try {
      const { data, error } = await (this.supabase!
        .from('workspace_states')
        .select('user_id, device_id, state_json, schema_version, updated_at')
        .eq('user_id', this.userId!)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single() as Promise<{ data: WorkspaceStateRow | null; error: { message: string } | null }>);

      if (error) {
        // PGRST116 = no rows found — not an error for us
        if ((error as unknown as { code?: string }).code === 'PGRST116') return;
        console.warn('[TaskFlowSync] pull error:', error.message);
        return;
      }

      if (!data) return;

      const remoteUpdatedAt = data.updated_at;
      const localLastSync = this.plugin.getSettings().lastSyncAt;

      // last-write-wins: only overwrite if remote is strictly newer
      if (localLastSync && remoteUpdatedAt <= localLastSync) return;

      const remoteState = data.state_json as Partial<TodoPluginData> | null;
      if (!remoteState) return;

      // Merge: remote fields win for tasks/lists/tags/folders/filters,
      // but preserve local settings (credentials must not be overwritten by remote)
      const currentData = this.plugin.getData();
      const merged: TodoPluginData = {
        tasks: Array.isArray(remoteState.tasks) ? remoteState.tasks : currentData.tasks,
        lists: Array.isArray(remoteState.lists) ? remoteState.lists : currentData.lists,
        tags: Array.isArray(remoteState.tags) ? remoteState.tags : currentData.tags,
        folders: Array.isArray(remoteState.folders) ? remoteState.folders : currentData.folders,
        filters: Array.isArray(remoteState.filters) ? remoteState.filters : currentData.filters,
        // Always keep local settings — never overwrite credentials from remote
        settings: {
          ...currentData.settings,
          lastSyncAt: remoteUpdatedAt,
        },
      };

      await this.plugin.replaceDataFromSync(merged);
    } catch (err) {
      console.warn('[TaskFlowSync] pull exception:', err);
    }
  }

  /**
   * Push the current in-memory workspace state to Supabase.
   * Uses upsert with conflict target (user_id, device_id) — each device has its own row.
   * The web app pulls the most recent row by updated_at, so all devices' rows are visible.
   */
  async push(): Promise<void> {
    if (!this.ready()) return;

    try {
      const data = this.plugin.getData();
      const now = new Date().toISOString();

      // Serialize only the workspace data (not settings — avoid storing credentials in cloud)
      const stateForCloud: Omit<TodoPluginData, 'settings'> = {
        tasks: data.tasks,
        lists: data.lists,
        tags: data.tags,
        folders: data.folders,
        filters: data.filters,
      };

      const payload = {
        user_id: this.userId!,
        device_id: this.deviceId!,
        state_json: stateForCloud,
        schema_version: SCHEMA_VERSION,
        updated_at: now,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (this.supabase!.from('workspace_states') as any).upsert(payload, {
        onConflict: 'user_id,device_id',
      });

      if (error) {
        console.warn('[TaskFlowSync] push error:', error.message);
        new Notice(`TaskFlow: 同步失败 - ${error.message}`);
        return;
      }

      // Persist the new lastSyncAt quietly — avoids triggering another push loop
      await this.plugin.updateSettingsQuiet({ lastSyncAt: now });
      // Note: success Notice is shown only by syncNow(), not on every background push
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[TaskFlowSync] push exception:', msg);
      new Notice(`TaskFlow: 同步失败 - ${msg}`);
    }
  }

  /**
   * Full bidirectional sync: pull first (apply any newer remote changes), then push local state.
   * This is what the "立即同步" button and the manual command call.
   */
  async syncNow(): Promise<void> {
    if (!this.ready()) {
      // Try to re-initialise in case settings were just saved
      await this.init();
      if (!this.ready()) {
        new Notice('TaskFlow: 同步未配置，请先填写 Supabase 设置');
        return;
      }
    }

    await this.pull();
    await this.push();
    new Notice('TaskFlow: 同步完成');
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private ready(): boolean {
    return this.supabase !== null && this.userId !== null && this.deviceId !== null;
  }

  private isConfigured(settings: ReturnType<TodoWorkspacePlugin['getSettings']>): boolean {
    return (
      settings.syncEnabled === true &&
      settings.supabaseUrl.trim().length > 0 &&
      settings.supabaseAnonKey.trim().length > 0 &&
      settings.supabaseEmail.trim().length > 0 &&
      settings.supabasePassword.length > 0
    );
  }

  /**
   * Returns a stable device identifier stored in settings.syncDeviceId.
   * Uses updateSettingsQuiet so it doesn't trigger a push loop.
   */
  private async getOrCreateDeviceId(): Promise<string> {
    const existing = this.plugin.getSettings().syncDeviceId;
    if (existing) return existing;

    const id = `obsidian-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await this.plugin.updateSettingsQuiet({ syncDeviceId: id });
    return id;
  }

  /** Debounced push — collapses rapid mutations into a single Supabase request (400 ms). */
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  schedulePush(): void {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      void this.push();
    }, 400);
  }
}
