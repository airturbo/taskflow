/**
 * repeat-rule — 重复任务规则工具
 *
 * 规则格式（repeatRule 字段）：
 *   ''          → 不重复
 *   'daily'     → 每天
 *   'weekdays'  → 每个工作日（周一至周五）
 *   'weekly'    → 每周（同星期几）
 *   'monthly'   → 每月（同日期）
 *   'yearly'    → 每年（同月日）
 *   'custom:3d' → 每 3 天
 *   'custom:2w' → 每 2 周
 *   'custom:1m' → 每 1 个月
 *
 * 到期完成后，调用 nextDueDate 计算下一次到期时间。
 */

export type RepeatRule =
  | ''
  | 'daily'
  | 'weekdays'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | `custom:${number}${'d' | 'w' | 'm'}`

export const REPEAT_RULE_OPTIONS: { value: RepeatRule; label: string }[] = [
  { value: '', label: '不重复' },
  { value: 'daily', label: '每天' },
  { value: 'weekdays', label: '每个工作日' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'yearly', label: '每年' },
  { value: 'custom:2d', label: '每2天' },
  { value: 'custom:3d', label: '每3天' },
  { value: 'custom:2w', label: '每2周' },
  { value: 'custom:2d', label: '自定义间隔…' },
]

export const describeRepeatRule = (rule: string): string => {
  if (!rule) return ''
  switch (rule) {
    case 'daily': return '每天'
    case 'weekdays': return '每个工作日'
    case 'weekly': return '每周'
    case 'monthly': return '每月'
    case 'yearly': return '每年'
    default:
      if (rule.startsWith('custom:')) {
        const code = rule.slice(7)
        const num = parseInt(code)
        const unit = code.slice(String(num).length)
        const unitLabel = { d: '天', w: '周', m: '个月' }[unit] ?? unit
        return `每 ${num} ${unitLabel}`
      }
      return rule
  }
}

/**
 * 根据重复规则和当前到期时间，计算下一次到期时间
 * @param rule  重复规则
 * @param fromDate  当前到期时间（ISO string）
 * @returns 下一次到期时间（ISO string），无重复时返回 null
 */
export const nextDueDate = (rule: string, fromDate: string): string | null => {
  if (!rule || !fromDate) return null

  const base = new Date(fromDate)
  if (isNaN(base.getTime())) return null

  const next = new Date(base)

  switch (rule) {
    case 'daily':
      next.setDate(next.getDate() + 1)
      break
    case 'weekdays': {
      next.setDate(next.getDate() + 1)
      // 跳过周末
      while (next.getDay() === 0 || next.getDay() === 6) {
        next.setDate(next.getDate() + 1)
      }
      break
    }
    case 'weekly':
      next.setDate(next.getDate() + 7)
      break
    case 'monthly':
      next.setMonth(next.getMonth() + 1)
      break
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1)
      break
    default:
      if (rule.startsWith('custom:')) {
        const code = rule.slice(7)
        const num = parseInt(code)
        const unit = code.slice(String(num).length)
        if (unit === 'd') next.setDate(next.getDate() + num)
        else if (unit === 'w') next.setDate(next.getDate() + num * 7)
        else if (unit === 'm') next.setMonth(next.getMonth() + num)
        else return null
      } else {
        return null
      }
  }

  return next.toISOString()
}

/**
 * 任务完成时，如果有重复规则，生成下一个周期的任务副本
 * 返回 null 表示不需要生成（无重复或无到期时间）
 */
export const createNextRepeatTask = <T extends {
  id: string
  repeatRule: string
  dueAt: string | null
  deadlineAt?: string | null
  completed: boolean
  completedPomodoros: number
  focusMinutes: number
  subtasks: Array<{ completed: boolean }>
  activity: unknown[]
}>(task: T): Omit<T, 'id'> | null => {
  if (!task.repeatRule || !task.dueAt) return null

  const nextDue = nextDueDate(task.repeatRule, task.dueAt)
  if (!nextDue) return null

  // 计算 deadline 偏移量（如果存在）
  let nextDeadline: string | null = null
  if (task.deadlineAt && task.dueAt) {
    const offset = new Date(task.deadlineAt).getTime() - new Date(task.dueAt).getTime()
    nextDeadline = new Date(new Date(nextDue).getTime() + offset).toISOString()
  }

  return {
    ...task,
    dueAt: nextDue,
    deadlineAt: nextDeadline,
    completed: false,
    completedPomodoros: 0,
    focusMinutes: 0,
    // 子任务重置为未完成
    subtasks: task.subtasks.map(s => ({ ...s, completed: false })),
    activity: [],
  }
}
