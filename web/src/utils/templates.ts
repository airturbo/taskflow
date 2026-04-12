import type { Task, Priority } from '../types/domain'
import { makeId } from './workspace-helpers'

export interface TaskTemplate {
  id: string
  name: string
  createdAt: string
  title: string
  note?: string
  priority: Priority
  tagIds: string[]
  subtasks: { title: string }[]
  listId?: string
}

const STORAGE_KEY = 'taskflow_templates'

export function getTemplates(): TaskTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as TaskTemplate[]) : []
  } catch {
    return []
  }
}

export function saveTemplate(template: TaskTemplate): void {
  const templates = getTemplates()
  const idx = templates.findIndex((t) => t.id === template.id)
  if (idx >= 0) {
    templates[idx] = template
  } else {
    templates.unshift(template)
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
}

export function deleteTemplate(id: string): void {
  const updated = getTemplates().filter((t) => t.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
}

/**
 * 从现有任务创建模板。
 */
export function templateFromTask(task: Task, name: string): TaskTemplate {
  return {
    id: crypto.randomUUID(),
    name,
    createdAt: new Date().toISOString(),
    title: task.title,
    note: task.note ?? '',
    priority: task.priority,
    tagIds: [...task.tagIds],
    subtasks: task.subtasks.map((s) => ({ title: s.title })),
    listId: task.listId,
  }
}

/**
 * 从模板生成任务补丁。
 * 复制 title / note / priority / tagIds / subtasks，并清空所有日期字段。
 */
export function applyTemplate(template: TaskTemplate): Partial<Task> {
  return {
    title: template.title,
    note: template.note ?? '',
    priority: template.priority,
    tagIds: [...template.tagIds],
    subtasks: template.subtasks.map((s) => ({
      id: makeId('subtask'),
      title: s.title,
      completed: false,
    })),
    // 清空所有时间字段，避免模板把旧日期带入新任务
    startAt: null,
    dueAt: null,
    deadlineAt: null,
  }
}
