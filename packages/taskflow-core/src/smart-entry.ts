/**
 * smart-entry — 自然语言任务解析
 *
 * 支持的时间表达：
 *   今天 / 明天 / 后天
 *   下周（一~日）→ 下周一 = 下个周一
 *   下个月 / 下月 N 号 → 下月5号
 *   N 天后 / N 周后 / N 月后
 *   上午/下午/晚上 N 点 M 分
 *
 * 支持的属性识别：
 *   #标签名     → tagNames[]（调用方负责转 tagIds）
 *   !紧急/!高/!普通/!低  → priority
 *
 * 标题处理：
 *   - 去掉识别出的日期词和属性词，保留真正的任务标题
 *   - 保留原始完整输入作为 rawInput（供调用方决策）
 */

import { addDays, getDateKey } from './dates'
import type { Priority } from './domain'

export interface SmartEntryResult {
  title: string
  rawInput: string
  dueAt: string | null
  tagNames: string[]
  priority: Priority | null
}

// ---- 工具 ----

const buildDateTime = (dateKey: string, hour?: number, minute = 0): string => {
  if (hour == null) return dateKey
  return `${dateKey}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

const addMonthsLocal = (dateKey: string, n: number): string => {
  const d = new Date(`${dateKey}T12:00`)
  d.setMonth(d.getMonth() + n)
  return d.toISOString().slice(0, 10)
}

const nextWeekday = (baseKey: string, targetDay: number): string => {
  // targetDay: 0=日 1=一 2=二 ... 6=六
  const base = new Date(`${baseKey}T12:00`)
  const currentDay = base.getDay()
  let diff = targetDay - currentDay
  if (diff <= 0) diff += 7
  base.setDate(base.getDate() + diff)
  return base.toISOString().slice(0, 10)
}

const WEEKDAY_MAP: Record<string, number> = {
  '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 0, '日': 0, '天': 0,
}

const PRIORITY_MAP: Record<string, Priority> = {
  '紧急': 'urgent', 'p1': 'urgent', '1': 'urgent',
  '高': 'high', 'p2': 'high', '2': 'high',
  '普通': 'normal', '正常': 'normal', 'p3': 'normal', '3': 'normal',
  '低': 'low', 'p4': 'low', '4': 'low',
}

// ---- 主解析函数 ----

export const parseSmartEntry = (raw: string): SmartEntryResult => {
  const value = raw.trim()
  const today = getDateKey()
  let workingText = value
  let dateKey: string | null = null
  let hour: number | undefined
  let minute = 0
  const tagNames: string[] = []
  let priority: Priority | null = null

  // ---- 1. 提取标签（#xxx）----
  workingText = workingText.replace(/#([\u4e00-\u9fa5\w]+)/g, (_, name: string) => {
    tagNames.push(name)
    return ''
  })

  // ---- 2. 提取优先级（!xxx）----
  workingText = workingText.replace(/!(紧急|高|普通|正常|低|[pP][1-4]|[1-4])/g, (_, p: string) => {
    priority = PRIORITY_MAP[p.toLowerCase()] ?? PRIORITY_MAP[p] ?? null
    return ''
  })

  // ---- 3. 解析日期 ----

  // 3a. 相对天数：N 天后 / N 周后 / N 月后
  const relativeMatch = workingText.match(/(\d+)\s*(天|日|周|星期|个?月)后/)
  if (relativeMatch) {
    const n = parseInt(relativeMatch[1])
    const unit = relativeMatch[2]
    if (unit === '天' || unit === '日') dateKey = addDays(today, n)
    else if (unit === '周' || unit === '星期') dateKey = addDays(today, n * 7)
    else dateKey = addMonthsLocal(today, n) // 月
    workingText = workingText.replace(relativeMatch[0], '')
  }

  // 3b. 下周X
  if (!dateKey) {
    const nextWeekMatch = workingText.match(/下(?:个?周|个?星期)([一二三四五六七日天])/)
    if (nextWeekMatch) {
      const wd = WEEKDAY_MAP[nextWeekMatch[1]] ?? 1
      // 先找到下周一，再加偏移
      const nextMonday = nextWeekday(today, 1)
      const targetDate = new Date(`${nextMonday}T12:00`)
      // 如果目标星期一=1，直接用；其他按偏移
      const targetDay = wd === 0 ? 0 : wd
      const mondayDay = 1
      const offset = targetDay >= mondayDay ? targetDay - mondayDay : 7 - mondayDay + targetDay
      targetDate.setDate(targetDate.getDate() + offset)
      dateKey = targetDate.toISOString().slice(0, 10)
      workingText = workingText.replace(nextWeekMatch[0], '')
    }
  }

  // 3c. 下个月/下月 + 可选 N 号
  if (!dateKey) {
    const nextMonthMatch = workingText.match(/下(?:个)?月(?:(\d{1,2})(?:号|日))?/)
    if (nextMonthMatch) {
      const baseNextMonth = addMonthsLocal(today, 1)
      if (nextMonthMatch[1]) {
        const day = parseInt(nextMonthMatch[1])
        dateKey = `${baseNextMonth.slice(0, 7)}-${String(day).padStart(2, '0')}`
      } else {
        dateKey = baseNextMonth
      }
      workingText = workingText.replace(nextMonthMatch[0], '')
    }
  }

  // 3d. 今天 / 明天 / 后天
  if (!dateKey) {
    if (/今天|今日/.test(workingText)) { dateKey = today; workingText = workingText.replace(/今天|今日/, '') }
    else if (/明天|明日/.test(workingText)) { dateKey = addDays(today, 1); workingText = workingText.replace(/明天|明日/, '') }
    else if (/后天/.test(workingText)) { dateKey = addDays(today, 2); workingText = workingText.replace(/后天/, '') }
  }

  // 3e. 本周X（本周三 = 这周三）
  if (!dateKey) {
    const thisWeekMatch = workingText.match(/(?:本|这)(?:周|星期)([一二三四五六七日天])/)
    if (thisWeekMatch) {
      const wd = WEEKDAY_MAP[thisWeekMatch[1]] ?? 1
      // 如果目标天在今天之前或就是今天，用下周；否则用本周
      const candidate = nextWeekday(addDays(today, -1), wd === 0 ? 0 : wd)
      dateKey = candidate
      workingText = workingText.replace(thisWeekMatch[0], '')
    }
  }

  // ---- 4. 解析时间 ----
  const timePattern = /(上午|下午|晚上|早上|凌晨)?\s*(\d{1,2})\s*(?::|点)\s*(\d{0,2})?\s*(?:分)?/
  const hourMatch = workingText.match(timePattern)
  if (hourMatch) {
    hour = Number(hourMatch[2])
    minute = Number(hourMatch[3] ?? 0)
    const marker = hourMatch[1]
    if ((marker === '下午' || marker === '晚上') && hour < 12) hour += 12
    if (marker === '凌晨' && hour === 12) hour = 0
    workingText = workingText.replace(hourMatch[0], '')
  }

  // ---- 5. 清理标题 ----
  const title = workingText
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s，,、。·]+|[\s，,、。·]+$/g, '')
    .trim() || value.trim()

  return {
    title,
    rawInput: value,
    dueAt: dateKey ? buildDateTime(dateKey, hour, minute) : null,
    tagNames,
    priority,
  }
}
