const DAY = 24 * 60 * 60 * 1000

const parseDateKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export const getNowIso = () => new Date().toISOString()

export const getDateKey = (value = new Date()) => {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const addDays = (dateKey: string, amount: number) => {
  const date = parseDateKey(dateKey)
  date.setDate(date.getDate() + amount)
  return getDateKey(date)
}

export const diffDateKeys = (fromDateKey: string, toDateKey: string) => {
  const from = parseDateKey(fromDateKey).getTime()
  const to = parseDateKey(toDateKey).getTime()
  return Math.round((to - from) / DAY)
}

export const shiftDateTimeByDays = (value: string | null, days: number) => {
  if (!value) return null
  const [datePart, timePart] = value.split('T')
  const shiftedDate = addDays(datePart, days)
  return timePart ? `${shiftedDate}T${timePart}` : shiftedDate
}

export const addMonths = (dateKey: string, amount: number) => {
  const date = parseDateKey(dateKey)
  const originalDay = date.getDate()
  date.setDate(1)
  date.setMonth(date.getMonth() + amount)
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  date.setDate(Math.min(originalDay, lastDay))
  return getDateKey(date)
}

export const isToday = (value: string | null) => {
  if (!value) return false
  return value.slice(0, 10) === getDateKey()
}

export const isOverdue = (value: string | null) => {
  if (!value) return false
  const normalized = value.includes('T') ? value : `${value}T23:59`
  const target = new Date(normalized)
  if (Number.isNaN(target.getTime())) return false
  return target.getTime() < Date.now()
}

export const isWithinDays = (value: string | null, days: number) => {
  if (!value) return false
  const today = parseDateKey(getDateKey()).getTime()
  const target = parseDateKey(value.slice(0, 10)).getTime()
  const diff = Math.round((target - today) / DAY)
  return diff >= 0 && diff <= days
}

export const formatDateTime = (value: string | null) => {
  if (!value) return '未设置'
  const [datePart, timePart = ''] = value.split('T')
  const today = getDateKey()
  const tomorrow = addDays(today, 1)
  const prefix = datePart === today ? '今天' : datePart === tomorrow ? '明天' : datePart.replace(/-/g, '.')
  if (!timePart) return prefix
  return `${prefix} ${timePart.slice(0, 5)}`
}

/** web 端格式："06/15 周日" */
export const formatDayLabel = (dateKey: string) => {
  if (!dateKey.includes('-')) return dateKey
  const days = ['日', '一', '二', '三', '四', '五', '六']
  const date = parseDateKey(dateKey)
  return `${dateKey.slice(5).replace('-', '/')} 周${days[date.getDay()]}`
}

export const formatMonthLabel = (dateKey = getDateKey()) => {
  const date = parseDateKey(dateKey)
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`
}

export const formatWeekRange = (dateKey = getDateKey()) => {
  const start = startOfWeek(dateKey)
  const end = addDays(start, 6)
  return `${start.slice(5).replace('-', '/')} - ${end.slice(5).replace('-', '/')}`
}

export const startOfWeek = (dateKey = getDateKey()) => {
  const date = parseDateKey(dateKey)
  const day = date.getDay() || 7
  date.setDate(date.getDate() - day + 1)
  return getDateKey(date)
}

/** web 版 buildWeek（接受 dateKey 字符串） */
export function buildWeek(dateKey?: string): string[]
/** plugin 版 buildWeek（接受 weekOffset 数字） */
export function buildWeek(weekOffset: number): string[]
export function buildWeek(arg: number | string = getDateKey()): string[] {
  let base: string
  if (typeof arg === 'string') {
    base = startOfWeek(arg)
  } else {
    const todayKey = getDateKey()
    const monday = startOfWeek(todayKey)
    base = addDays(monday, arg * 7)
  }
  return Array.from({ length: 7 }, (_, index) => addDays(base, index))
}

export const buildMonthMatrix = (dateKey = getDateKey()) => {
  const monthStart = parseDateKey(dateKey)
  monthStart.setDate(1)
  const start = parseDateKey(startOfWeek(getDateKey(monthStart)))

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return getDateKey(date)
  })
}

export const percent = (value: number, total: number) => {
  if (!total) return 0
  return Math.round((value / total) * 100)
}

export const toMinutesLabel = (minutes: number) => {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

export const formatCountdown = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

// ─── Plugin-only helpers ─────────────────────────────────────────────

/** plugin 端格式："M月D日 周X" */
export function formatDayLabelChinese(dateKey: string): string {
  const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const date = parseDateKey(dateKey)
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${month}月${day}日 ${WEEKDAY_NAMES[date.getDay()]}`
}

/** plugin 端格式："YYYY年M月" */
export const getMonthLabel = (dateKey: string) => {
  const date = parseDateKey(dateKey)
  return `${date.getFullYear()}年${date.getMonth() + 1}月`
}

export const getWeekRangeLabel = (weekDays: string[]) => {
  if (weekDays.length === 0) return ''
  const start = parseDateKey(weekDays[0])
  const end = parseDateKey(weekDays[weekDays.length - 1])
  return `${start.getMonth() + 1}/${start.getDate()} - ${end.getMonth() + 1}/${end.getDate()}`
}
