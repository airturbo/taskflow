/**
 * Persistence Logger — 桌面端数据持久化日志系统
 *
 * 在 console 和内存环形缓冲区同时记录所有持久化事件，
 * 方便在 App 端排查任务丢失、数据回滚等问题。
 *
 * 使用方式：
 *   import { plog } from './persistence-logger'
 *   plog.taskUpsert(task.id, task.title, 'commitTask')
 *   plog.dump() // 获取最近 200 条日志
 *   window.__PLOG_DUMP?.() // 从 DevTools 控制台获取
 */

export type PLogLevel = 'info' | 'warn' | 'error'

export type PLogEntry = {
  ts: string
  level: PLogLevel
  tag: string
  message: string
  data?: Record<string, unknown>
}

const MAX_ENTRIES = 200

class PersistenceLogger {
  private entries: PLogEntry[] = []

  private push(level: PLogLevel, tag: string, message: string, data?: Record<string, unknown>) {
    const entry: PLogEntry = {
      ts: new Date().toISOString(),
      level,
      tag,
      message,
      data,
    }
    this.entries.push(entry)
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(-MAX_ENTRIES)
    }

    const prefix = `[PLOG][${tag}]`
    if (level === 'error') {
      console.error(prefix, message, data ?? '')
    } else if (level === 'warn') {
      console.warn(prefix, message, data ?? '')
    } else {
      console.log(prefix, message, data ?? '')
    }
  }

  // ---- 任务写入 ----
  taskUpsert(taskId: string, title: string, source: string) {
    this.push('info', 'task-upsert', `${source}: ${title}`, { taskId, source })
  }

  taskUpsertBatch(count: number, source: string) {
    this.push('info', 'task-upsert-batch', `${source}: ${count} tasks`, { count, source })
  }

  // ---- 任务读取 ----
  taskQuery(queryLabel: string, resultCount: number) {
    this.push('info', 'task-query', `${queryLabel}: ${resultCount} results`, { queryLabel, resultCount })
  }

  taskDetailLoad(taskId: string, found: boolean) {
    this.push('info', 'task-detail-load', `${taskId}: ${found ? 'found' : 'not found'}`, { taskId, found })
  }

  // ---- 状态同步 ----
  syncStart(view: string, deps: string) {
    this.push('info', 'sync-start', `view=${view}`, { view, deps })
  }

  syncComplete(view: string, counts: Record<string, number>) {
    this.push('info', 'sync-complete', `view=${view}`, { view, ...counts })
  }

  // ---- 缓存合并 ----
  cacheOverlay(pendingCount: number) {
    this.push('info', 'cache-overlay', `pending overlay: ${pendingCount} tasks`, { pendingCount })
  }

  cacheMerge(incomingCount: number, changedCount: number) {
    this.push('info', 'cache-merge', `incoming=${incomingCount}, changed=${changedCount}`, { incomingCount, changedCount })
  }

  // ---- 持久化队列 ----
  persistStart(operation: string) {
    this.push('info', 'persist-start', operation)
  }

  persistComplete(operation: string) {
    this.push('info', 'persist-done', operation)
  }

  persistError(operation: string, error: unknown) {
    this.push('error', 'persist-error', `${operation}: ${error instanceof Error ? error.message : String(error)}`, { operation })
  }

  // ---- 全量写回警告 ----
  dangerousFullSync(taskCount: number, source: string) {
    this.push('warn', 'FULL-SYNC', `⚠️ saveDesktopRepositoryState called with ${taskCount} tasks from ${source}`, { taskCount, source })
  }

  // ---- workspace state ----
  workspaceShellSave(source: string) {
    this.push('info', 'ws-shell-save', source)
  }

  // ---- onboarding ----
  onboardingStateChange(from: string, to: string, trigger: string) {
    this.push('info', 'onboarding', `${from} → ${to} (${trigger})`, { from, to, trigger })
  }

  // ---- 通用 ----
  info(tag: string, message: string, data?: Record<string, unknown>) {
    this.push('info', tag, message, data)
  }

  warn(tag: string, message: string, data?: Record<string, unknown>) {
    this.push('warn', tag, message, data)
  }

  error(tag: string, message: string, data?: Record<string, unknown>) {
    this.push('error', tag, message, data)
  }

  // ---- 导出 ----
  dump(): PLogEntry[] {
    return [...this.entries]
  }

  dumpText(): string {
    return this.entries
      .map((e) => `${e.ts} [${e.level.toUpperCase()}][${e.tag}] ${e.message}${e.data ? ' ' + JSON.stringify(e.data) : ''}`)
      .join('\n')
  }

  clear() {
    this.entries = []
  }
}

export const plog = new PersistenceLogger()

// 挂到 window 上方便从 DevTools 直接 dump
if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__PLOG_DUMP = () => {
    const text = plog.dumpText()
    console.log(text)
    return plog.dump()
  }
  ;(window as unknown as Record<string, unknown>).__PLOG_CLEAR = () => plog.clear()
}
