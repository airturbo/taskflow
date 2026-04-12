/**
 * export.ts — TaskFlow 数据导出工具
 *
 * 支持三种格式：
 *   - JSON  适合备份与程序化恢复
 *   - CSV   适合在 Excel / Numbers / Google Sheets 中分析
 *   - Markdown  适合归档与可读性
 *
 * 所有格式均排除逻辑删除（deleted: true）的任务。
 * CSV 添加 UTF-8 BOM，确保 Excel 正确识别中文。
 */

import type { PersistedState } from '../types/domain'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function getDateStr(): string {
  return new Date().toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// JSON export
// ---------------------------------------------------------------------------

/**
 * 导出完整工作区快照（不含已删除任务）为 JSON 文件。
 * 格式可被 TaskFlow 直接读取，适合全量备份与恢复。
 */
export function exportAsJSON(state: PersistedState): { success: boolean; error?: string } {
  try {
    const payload: PersistedState = {
      ...state,
      tasks: state.tasks.filter((t) => !t.deleted),
    }
    downloadFile(
      JSON.stringify(payload, null, 2),
      `taskflow-export-${getDateStr()}.json`,
      'application/json',
    )
    return { success: true }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error('[TaskFlow] exportAsJSON failed:', error)
    return { success: false, error }
  }
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

const PRIORITY_LABEL: Record<string, string> = {
  urgent: '紧急',
  high: '高',
  normal: '普通',
  low: '低',
}

const STATUS_LABEL: Record<string, string> = {
  todo: '待办',
  doing: '进行中',
  done: '已完成',
}

function csvEscape(val: string | null | undefined): string {
  if (val == null || val === '') return ''
  const s = String(val)
  // Wrap in double-quotes if the value contains commas, quotes, or newlines
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/**
 * 导出所有任务为 CSV 文件（UTF-8 with BOM）。
 * 列：ID、标题、状态、优先级、清单、文件夹、标签、计划完成、最终期限、
 *     开始时间、已完成、备注、创建时间、更新时间
 */
export function exportAsCSV(state: PersistedState): { success: boolean; error?: string } {
  try {
    const lists = state.lists ?? []
    const folders = state.folders ?? []
    const tags = state.tags ?? []

    const headers = [
      'ID', '标题', '状态', '优先级',
      '清单', '文件夹', '标签',
      '计划完成', '最终期限', '开始时间',
      '已完成', '备注', '创建时间', '更新时间',
    ]

    const rows = state.tasks
      .filter((t) => !t.deleted)
      .map((t) => {
        const list = lists.find((l) => l.id === t.listId)
        const folder = list?.folderId ? folders.find((f) => f.id === list.folderId) : null
        const taskTags = (t.tagIds ?? [])
          .map((id) => tags.find((tag) => tag.id === id)?.name ?? id)
          .join(';')

        return [
          t.id,
          t.title,
          STATUS_LABEL[t.status] ?? t.status,
          PRIORITY_LABEL[t.priority] ?? t.priority,
          list?.name ?? '',
          folder?.name ?? '',
          taskTags,
          t.dueAt ?? '',
          t.deadlineAt ?? '',
          t.startAt ?? '',
          t.completed ? '是' : '否',
          t.note ?? '',
          t.createdAt ?? '',
          t.updatedAt ?? '',
        ]
          .map((v) => csvEscape(String(v ?? '')))
          .join(',')
      })

    // UTF-8 BOM (\uFEFF) ensures Excel opens the file correctly without re-encoding
    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n')
    downloadFile(csv, `taskflow-export-${getDateStr()}.csv`, 'text/csv;charset=utf-8')
    return { success: true }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error('[TaskFlow] exportAsCSV failed:', error)
    return { success: false, error }
  }
}

// ---------------------------------------------------------------------------
// Markdown export
// ---------------------------------------------------------------------------

const PRIORITY_SYMBOL: Record<string, string> = {
  urgent: '🔴',
  high: '🟠',
  normal: '🟡',
  low: '🔵',
}

/**
 * 导出所有任务为 Markdown 文件，按清单分组，适合归档与阅读。
 */
export function exportAsMarkdown(state: PersistedState): { success: boolean; error?: string } {
  try {
    const lists = state.lists ?? []
    const tags = state.tags ?? []
    const activeTasks = state.tasks.filter((t) => !t.deleted)

    const lines: string[] = [
      '# TaskFlow 任务导出',
      '',
      `> 导出时间：${new Date().toLocaleString('zh-CN')}`,
      `> 任务总数：${activeTasks.length}`,
      '',
    ]

    // Tasks grouped by list
    for (const list of lists) {
      const listTasks = activeTasks.filter((t) => t.listId === list.id)
      if (listTasks.length === 0) continue

      lines.push(`## ${list.name}`, '')

      for (const t of listTasks) {
        const check = t.completed ? '[x]' : '[ ]'
        const priority = t.priority && t.priority !== 'normal' ? ` ${PRIORITY_SYMBOL[t.priority] ?? ''}` : ''
        const due = t.dueAt ? ` · 计划：${t.dueAt.slice(0, 10)}` : ''
        const deadline = t.deadlineAt ? ` · DDL：${t.deadlineAt.slice(0, 10)}` : ''
        const taskTags = (t.tagIds ?? [])
          .map((id) => {
            const tag = tags.find((tag) => tag.id === id)
            return tag ? `#${tag.name}` : null
          })
          .filter(Boolean)
          .join(' ')
        const tagStr = taskTags ? ` ${taskTags}` : ''

        lines.push(`- ${check}${priority} ${t.title}${tagStr}${due}${deadline}`)

        if (t.note) {
          for (const noteLine of t.note.split('\n')) {
            lines.push(`  > ${noteLine}`)
          }
        }

        if (t.subtasks?.length) {
          for (const st of t.subtasks) {
            lines.push(`  - ${st.completed ? '[x]' : '[ ]'} ${st.title}`)
          }
        }
      }

      lines.push('')
    }

    // Tasks not belonging to any known list
    const knownListIds = new Set(lists.map((l) => l.id))
    const orphanTasks = activeTasks.filter((t) => !t.listId || !knownListIds.has(t.listId))
    if (orphanTasks.length > 0) {
      lines.push('## 未分类', '')
      for (const t of orphanTasks) {
        const check = t.completed ? '[x]' : '[ ]'
        const priority = t.priority && t.priority !== 'normal' ? ` ${PRIORITY_SYMBOL[t.priority] ?? ''}` : ''
        lines.push(`- ${check}${priority} ${t.title}`)
      }
      lines.push('')
    }

    downloadFile(lines.join('\n'), `taskflow-export-${getDateStr()}.md`, 'text/markdown')
    return { success: true }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error('[TaskFlow] exportAsMarkdown failed:', error)
    return { success: false, error }
  }
}
