import type { Reminder, Task } from './domain'
import { formatDateTime } from './dates'

const MINUTE = 60 * 1000
const DAY_MINUTES = 24 * 60

export type ReminderTone = 'default' | 'danger' | 'success'
export type ReminderSound = 'reminder'

export type ReminderEvent = {
  key: string
  title: string
  body: string
  tone: ReminderTone
  sound: ReminderSound
  taskId: string
  allowSnooze: boolean
}

export const formatTaskWindow = (startAt: string | null, dueAt: string | null) => {
  if (startAt && dueAt) return `${formatDateTime(startAt)} - ${formatDateTime(dueAt)}`
  if (startAt) return `开始于 ${formatDateTime(startAt)}`
  if (dueAt) return `截止于 ${formatDateTime(dueAt)}`
  return '未设置时间'
}

export const collectReminderEvents = (tasks: Task[], firedReminderKeys: string[], now = Date.now()) => {
  const nextKeys = new Set(firedReminderKeys)
  const events: ReminderEvent[] = []

  tasks
    .filter((task) => !task.deleted && !task.completed)
    .forEach((task) => {
      task.reminders.forEach((reminder) => {
        const triggerAt = getReminderTriggerAt(task, reminder)
        if (!triggerAt) return

        const reminderKey = `reminder:${task.id}:${reminder.id}:${triggerAt}`
        if (now < triggerAt || nextKeys.has(reminderKey)) return

        nextKeys.add(reminderKey)
        events.push({
          key: reminderKey,
          title: `提醒 · ${task.title}`,
          body: `${formatReminderEventLabel(task, reminder)} · ${formatReminderTaskContext(task)}`,
          tone: 'default',
          sound: 'reminder',
          taskId: task.id,
          allowSnooze: true,
        })
      })

      const riskAnchor = getTaskRiskAnchor(task)
      const riskAt = getDateTimeMs(riskAnchor?.value ?? null, riskAnchor?.kind === 'deadline' ? 'end' : 'start')
      if (!riskAt || !riskAnchor) return

      const dueKey = `due:${task.id}:${riskAt}`
      if (now < riskAt || nextKeys.has(dueKey)) return

      nextKeys.add(dueKey)
      events.push({
        key: dueKey,
        title: `${riskAnchor.kind === 'deadline' ? 'DDL 到期' : '计划时间到'} · ${task.title}`,
        body: `${riskAnchor.kind === 'deadline' ? '硬性 DDL 已到' : '计划时间已到'}：${formatDateTime(riskAnchor.value)}`,
        tone: 'danger',
        sound: 'reminder',
        taskId: task.id,
        allowSnooze: true,
      })
    })

  return {
    events,
    nextKeys: Array.from(nextKeys).slice(-300),
  }
}

export type ReminderAnchorKind = 'auto' | 'deadline' | 'planned' | 'start'

export type ReminderAnchor = {
  kind: Exclude<ReminderAnchorKind, 'auto'>
  value: string
}

type ParsedRelativeReminder = {
  anchor: ReminderAnchorKind
  minutes: number
}

export type ReminderDescription = {
  label: string
  anchorLabel: string
  triggerAt: string | null
  triggerAtLabel: string
  disabledReason?: string
}

const RELATIVE_REMINDER_PATTERN = /^(?:(auto|deadline|planned|start)\|)?(\d+)(m|h|d)$/i

const getTaskRiskAnchor = (task: Task): ReminderAnchor | null => {
  if (task.deadlineAt) return { kind: 'deadline', value: task.deadlineAt }
  if (task.dueAt) return { kind: 'planned', value: task.dueAt }
  return null
}

export const getReminderAnchor = (task: Task, reminder?: Reminder | null): ReminderAnchor | null => {
  const encodedAnchor = reminder?.kind === 'relative' ? parseRelativeReminder(reminder.value)?.anchor ?? 'auto' : 'auto'

  if (encodedAnchor === 'deadline') return task.deadlineAt ? { kind: 'deadline', value: task.deadlineAt } : null
  if (encodedAnchor === 'planned') return task.dueAt ? { kind: 'planned', value: task.dueAt } : null
  if (encodedAnchor === 'start') return task.startAt ? { kind: 'start', value: task.startAt } : null

  if (task.deadlineAt) return { kind: 'deadline', value: task.deadlineAt }
  if (task.dueAt) return { kind: 'planned', value: task.dueAt }
  if (task.startAt) return { kind: 'start', value: task.startAt }
  return null
}

const getReminderAnchorLabel = (anchor: ReminderAnchor | null) => {
  if (!anchor) return '未设置'
  if (anchor.kind === 'deadline') return 'DDL'
  if (anchor.kind === 'planned') return '计划完成'
  return '开始时间'
}

const formatReminderOffsetLabel = (minutes: number) => {
  if (minutes === 0) return '到点提醒'
  if (minutes < 60) return `提前 ${minutes} 分钟`
  if (minutes % DAY_MINUTES === 0) return `提前 ${minutes / DAY_MINUTES} 天`
  if (minutes % 60 === 0) return `提前 ${minutes / 60} 小时`
  return `提前 ${minutes} 分钟`
}

const formatReminderTaskContext = (task: Task) => {
  const parts: string[] = []
  if (task.deadlineAt) parts.push(`DDL ${formatDateTime(task.deadlineAt)}`)
  if (task.dueAt && task.dueAt !== task.deadlineAt) {
    parts.push(`计划 ${formatDateTime(task.dueAt)}`)
  } else if (!task.deadlineAt && task.dueAt) {
    parts.push(`计划 ${formatDateTime(task.dueAt)}`)
  }
  if (task.startAt) parts.push(`开始 ${formatDateTime(task.startAt)}`)
  return parts.join(' · ') || formatTaskWindow(task.startAt, task.dueAt)
}

export const formatReminderEventLabel = (task: Task, reminder: Reminder) => {
  if (reminder.kind !== 'relative') return reminder.label

  const parsed = parseRelativeReminder(reminder.value)
  if (!parsed) return reminder.label

  const anchor = getReminderAnchor(task, reminder)
  const anchorLabel = getReminderAnchorLabel(anchor)
  return `${reminder.label || formatReminderOffsetLabel(parsed.minutes)}（按 ${anchorLabel}）`
}

export const getReminderTriggerAt = (task: Task, reminder: Reminder) => {
  if (reminder.kind === 'absolute') return getDateTimeMs(reminder.value, 'start')

  const parsed = parseRelativeReminder(reminder.value)
  const anchor = getReminderAnchor(task, reminder)
  const anchorAt = getDateTimeMs(anchor?.value ?? null, anchor?.kind === 'deadline' ? 'end' : 'start')
  if (!parsed || !anchorAt) return null
  return anchorAt - parsed.minutes * MINUTE
}

export const describeReminder = (task: Task, reminder: Reminder): ReminderDescription => {
  if (reminder.kind === 'absolute') {
    return {
      label: reminder.label,
      anchorLabel: '固定时间',
      triggerAt: reminder.value,
      triggerAtLabel: formatDateTime(reminder.value),
    }
  }

  const parsed = parseRelativeReminder(reminder.value)
  const anchor = getReminderAnchor(task, reminder)
  const triggerAt = getReminderTriggerAt(task, reminder)

  if (!parsed) {
    return {
      label: reminder.label,
      anchorLabel: '相对提醒',
      triggerAt: null,
      triggerAtLabel: '当前配置不可解析',
      disabledReason: '提醒配置格式不正确',
    }
  }

  if (!anchor || !triggerAt) {
    return {
      label: reminder.label || formatReminderOffsetLabel(parsed.minutes),
      anchorLabel: `按 ${parsed.anchor === 'auto' ? '自动锚点' : parsed.anchor === 'deadline' ? 'DDL' : parsed.anchor === 'planned' ? '计划完成' : '开始时间'}`,
      triggerAt: null,
      triggerAtLabel: '需要先补对应时间',
      disabledReason: '请先给任务设置对应的开始 / 计划 / DDL 时间',
    }
  }

  const triggerAtValue = toLocalDateTimeValue(triggerAt)
  return {
    label: reminder.label || formatReminderOffsetLabel(parsed.minutes),
    anchorLabel: `按 ${getReminderAnchorLabel(anchor)}`,
    triggerAt: triggerAtValue,
    triggerAtLabel: formatDateTime(triggerAtValue),
  }
}

const parseRelativeReminder = (value: string): ParsedRelativeReminder | null => {
  const match = value.trim().match(RELATIVE_REMINDER_PATTERN)
  if (!match) return null

  const anchor = (match[1]?.toLowerCase() as ReminderAnchorKind | undefined) ?? 'auto'
  const amount = Number(match[2])
  const unit = match[3].toLowerCase()
  const minutes = unit === 'm' ? amount : unit === 'h' ? amount * 60 : amount * DAY_MINUTES
  return Number.isFinite(minutes) ? { anchor, minutes } : null
}

const getDateTimeMs = (value: string | null, boundary: 'start' | 'end' = 'start') => {
  if (!value) return null
  const normalized = value.includes('T') ? value : `${value}T${boundary === 'end' ? '23:59' : '09:00'}`
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date.getTime()
}

const toLocalDateTimeValue = (value: number) => {
  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}
