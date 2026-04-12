import type { Priority, Tag, TaskStatus } from './domain'

export const priorityMeta: Record<Priority, { label: string; short: string; color: string }> = {
  urgent: { label: '紧急', short: 'P1', color: '#ff6b7a' },
  high: { label: '高', short: 'P2', color: '#ffb454' },
  normal: { label: '普通', short: 'P3', color: '#7c9cff' },
  low: { label: '低', short: 'P4', color: '#93c5fd' },
}

export const statusMeta: Record<TaskStatus, string> = {
  todo: '待办',
  doing: '进行中',
  done: '已完成',
}

export const statusUiMeta: Record<TaskStatus, { icon: string; label: string }> = {
  todo: { icon: '○', label: '待办' },
  doing: { icon: '◔', label: '进行中' },
  done: { icon: '✓', label: '已完成' },
}

export const TAG_COLOR_PRESETS = ['#7c9cff', '#54d2a0', '#ffb454', '#a78bfa', '#93c5fd', '#ff6b7a', '#34d399', '#f472b6'] as const

export const SPECIAL_TAG_IDS = {
  urgent: 'tag-urgent',
  important: 'tag-important',
} as const

export const SPECIAL_TAG_META: Record<keyof typeof SPECIAL_TAG_IDS, Tag> = {
  urgent: { id: SPECIAL_TAG_IDS.urgent, name: '紧急', color: '#ff6b7a' },
  important: { id: SPECIAL_TAG_IDS.important, name: '重要', color: '#ffb454' },
}

export type MatrixQuadrantKey = 'q1' | 'q2' | 'q3' | 'q4'
