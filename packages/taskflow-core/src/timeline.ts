import type { Task, TimelineScale } from './domain'
import { isToday, formatDayLabel, formatWeekRange, buildWeek } from './dates'

const MINUTE = 60_000
export const TIMELINE_MIN_DURATION_MINUTES = 30
export const TIMELINE_STEP_MINUTES = 30

function getTimelineDateTimeMs(value: string | null, boundary: 'start' | 'end') {
  if (!value) return null
  const normalized = value.includes('T') ? value : `${value}T${boundary === 'start' ? '09:00' : '18:00'}`
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date.getTime()
}

function getDateTimeMs(value: string | null, boundary: 'start' | 'end' = 'start') {
  if (!value) return null
  const normalized = value.includes('T') ? value : `${value}T${boundary === 'end' ? '23:59' : '09:00'}`
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date.getTime()
}

export function getDateTimeValueFromMs(value: number) {
  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

export function addMinutesToDateTime(value: string, minutes: number) {
  const base = getDateTimeMs(value, 'start')
  if (!base) return value
  return getDateTimeValueFromMs(base + minutes * MINUTE)
}

export function buildTimelineDraftWindow(value: string | null) {
  if (!value) return { startAt: null, dueAt: null }
  if (value.includes('T')) {
    return { startAt: value, dueAt: addMinutesToDateTime(value, 60) }
  }
  return { startAt: `${value}T09:00`, dueAt: `${value}T10:00` }
}

export function getTaskTimelineRange(task: Task) {
  const explicitStart = getTimelineDateTimeMs(task.startAt, 'start')
  const explicitEnd = getTimelineDateTimeMs(task.dueAt, 'end')

  if (explicitStart != null && explicitEnd != null) {
    return explicitEnd > explicitStart
      ? { start: explicitStart, end: explicitEnd }
      : { start: explicitStart, end: explicitStart + 60 * MINUTE }
  }

  if (explicitStart != null) return { start: explicitStart, end: explicitStart + 60 * MINUTE }

  if (task.dueAt) {
    if (task.dueAt.includes('T')) {
      const dueAt = getTimelineDateTimeMs(task.dueAt, 'end')
      if (dueAt != null) return { start: dueAt - 60 * MINUTE, end: dueAt }
    }

    const dayStart = getTimelineDateTimeMs(task.dueAt, 'start')
    const dayEnd = getTimelineDateTimeMs(task.dueAt, 'end')
    if (dayStart != null && dayEnd != null) return { start: dayStart, end: dayEnd }
  }

  return null
}

export function clampTimelineRange(start: number, end: number, min: number, max: number) {
  let nextStart = start
  let nextEnd = end
  const minimumDuration = TIMELINE_MIN_DURATION_MINUTES * MINUTE

  if (nextEnd - nextStart < minimumDuration) {
    nextEnd = nextStart + minimumDuration
  }

  if (nextStart < min) {
    const duration = nextEnd - nextStart
    nextStart = min
    nextEnd = Math.min(max, min + duration)
  }

  if (nextEnd > max) {
    const duration = nextEnd - nextStart
    nextEnd = max
    nextStart = Math.max(min, max - duration)
  }

  if (nextEnd - nextStart < minimumDuration) {
    nextStart = Math.max(min, nextEnd - minimumDuration)
    nextEnd = Math.min(max, nextStart + minimumDuration)
  }

  return { start: nextStart, end: nextEnd }
}

export function snapTimelineMinutes(value: number, stepMinutes = TIMELINE_STEP_MINUTES) {
  return Math.round(value / stepMinutes) * stepMinutes
}

export function getTimelinePercent(value: number, min: number, max: number) {
  return ((value - min) / (max - min)) * 100
}

export function formatTimelineBarLabel(start: number, end: number) {
  const startValue = getDateTimeValueFromMs(start)
  const endValue = getDateTimeValueFromMs(end)
  if (startValue.slice(0, 10) === endValue.slice(0, 10)) {
    return `${startValue.slice(11, 16)} - ${endValue.slice(11, 16)}`
  }
  return `${startValue.slice(5, 10).replace('-', '/')} ${startValue.slice(11, 16)} → ${endValue.slice(5, 10).replace('-', '/')} ${endValue.slice(11, 16)}`
}

export function getTimelineWindowLabel(dateKey: string, scale: TimelineScale) {
  return scale === 'day' ? formatDayLabel(dateKey) : formatWeekRange(dateKey)
}

export function buildTimelineScaleMarks(dateKey: string, scale: TimelineScale) {
  if (scale === 'day') {
    return Array.from({ length: 12 }, (_, index) => ({
      key: `${dateKey}-${index}`,
      label: `${String(index * 2).padStart(2, '0')}:00`,
      isToday: isToday(dateKey),
    }))
  }

  return buildWeek(dateKey).map((value) => ({
    key: value,
    label: value.slice(5).replace('-', '/'),
    isToday: isToday(value),
  }))
}

export function buildTimelineCreateSlots(dateKey: string, scale: TimelineScale) {
  if (scale === 'day') {
    return ['09:00', '13:00', '18:00', '21:00'].map((time) => ({
      key: `${dateKey}-${time}`,
      dateKey,
      time,
      label: `${formatDayLabel(dateKey)} ${time}`,
      subLabel: time === '09:00' ? '开始排' : '快速排',
      isToday: isToday(dateKey),
    }))
  }

  return buildWeek(dateKey).map((value) => ({
    key: value,
    dateKey: value,
    time: '09:00',
    label: formatDayLabel(value),
    subLabel: '09:00 起',
    isToday: isToday(value),
  }))
}

export function isTaskVisibleInTimelineWindow(task: Task, windowStart: number, windowEnd: number) {
  const range = getTaskTimelineRange(task)
  return Boolean(range && range.start < windowEnd && range.end > windowStart)
}

export { getTimelineDateTimeMs }
