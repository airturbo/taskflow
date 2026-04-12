import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const ROOT = '/Users/turbo/WorkBuddy/20260330162606/.workbuddy/browser-audit'
const RESULTS_DIR = path.join(ROOT, 'results', '2026-04-08-round33-37-ux-review')
const SHOTS_DIR = path.join(RESULTS_DIR, 'screenshots')
const URL = 'http://127.0.0.1:4173/'
const STORAGE_KEY = 'ticktick-parity-demo-v2'
const TASK_TITLE = 'DDL focused UX 回放任务'

await fs.mkdir(SHOTS_DIR, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1512, height: 982 } })
const page = await context.newPage()
const consoleMessages = []
const pageErrors = []

page.on('console', (msg) => {
  consoleMessages.push({ type: msg.type(), text: msg.text() })
})
page.on('pageerror', (error) => {
  pageErrors.push(String(error))
})

const wait = (ms) => page.waitForTimeout(ms)
const shot = async (name) => {
  const filePath = path.join(SHOTS_DIR, name)
  await page.screenshot({ path: filePath, fullPage: true })
  return filePath
}
const textOf = async (locator) => (await locator.textContent())?.replace(/\s+/g, ' ').trim() ?? ''

const formatDate = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const formatDateTimeLocal = (date) => {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${formatDate(date)}T${hours}:${minutes}`
}

const withTime = (dateKey, hours, minutes = 0) => `${dateKey}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`

const futureAnchorDate = (() => {
  const date = new Date()
  date.setDate(date.getDate() + 3)
  return formatDate(date)
})()

const reminderPhase = (() => {
  const now = new Date()
  const startAt = new Date(now.getTime() + 10 * 60 * 1000)
  const deadlineAt = new Date(now.getTime() + 20 * 60 * 1000)
  const dueAt = new Date(now.getTime() + 60 * 60 * 1000)
  return {
    startAt: formatDateTimeLocal(startAt),
    deadlineAt: formatDateTimeLocal(deadlineAt),
    dueAt: formatDateTimeLocal(dueAt),
  }
})()

const duePhase = (() => {
  const now = new Date()
  const deadlineAt = new Date(now.getTime() - 10 * 60 * 1000)
  const dueAt = new Date(now.getTime() + 60 * 60 * 1000)
  return {
    deadlineAt: formatDateTimeLocal(deadlineAt),
    dueAt: formatDateTimeLocal(dueAt),
  }
})()

const resetApp = async () => {
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.evaluate((key) => window.localStorage.removeItem(key), STORAGE_KEY)
  await page.reload({ waitUntil: 'networkidle' })
  await wait(250)
}

const ensureWorkspaceVisible = async () => {
  const browseButton = page.getByRole('button', { name: '先看示例工作区' })
  if (await browseButton.count()) {
    await browseButton.click()
    await wait(300)
  }
}

const switchView = async (label) => {
  await page.locator('.segmented-control').getByRole('button', { name: label, exact: true }).click()
  await wait(250)
}

const setCurrentDateInput = async (dateKey) => {
  const input = page.locator('.date-picker-input').first()
  await input.fill(dateKey)
  await wait(250)
}

const createFocusedTask = async () => {
  const composerInput = page.locator('.composer-bar input').first()
  await composerInput.fill(TASK_TITLE)
  await page.getByRole('button', { name: '立即创建' }).click()
  await wait(350)
}

const isolateFocusedTask = async () => {
  await page.evaluate(({ key, title }) => {
    const raw = window.localStorage.getItem(key)
    if (!raw) throw new Error('missing persisted state')
    const state = JSON.parse(raw)
    const task = state.tasks.find((item) => item.title === title)
    if (!task) throw new Error(`task not found: ${title}`)
    state.tasks = [task]
    state.firedReminderKeys = []
    state.currentView = 'list'
    state.activeSelection = `list:${task.listId}`
    state.selectedTagIds = []
    window.localStorage.setItem(key, JSON.stringify(state))
  }, { key: STORAGE_KEY, title: TASK_TITLE })
}

const patchTaskState = async (patch) => {
  await page.evaluate(
    ({ key, title, patch: nextPatch }) => {
      const raw = window.localStorage.getItem(key)
      if (!raw) throw new Error('missing persisted state')
      const state = JSON.parse(raw)
      const task = state.tasks.find((item) => item.title === title)
      if (!task) throw new Error(`task not found: ${title}`)
      Object.assign(task, nextPatch)
      state.firedReminderKeys = []
      window.localStorage.setItem(key, JSON.stringify(state))
    },
    { key: STORAGE_KEY, title: TASK_TITLE, patch },
  )
}

const selectTaskInList = async () => {
  await switchView('列表')
  const taskCard = page.locator('.task-list .task-card', { hasText: TASK_TITLE }).first()
  await taskCard.waitFor({ timeout: 5000 })
  await taskCard.click()
  await wait(200)
  return taskCard
}

try {
  const summary = {
    reviewedAt: new Date().toISOString(),
    url: URL,
    evidenceDir: RESULTS_DIR,
    screenshots: {},
    checks: {},
    issues: [],
    consoleMessages,
    pageErrors,
  }

  await resetApp()
  await ensureWorkspaceVisible()
  await createFocusedTask()
  await isolateFocusedTask()
  await page.reload({ waitUntil: 'networkidle' })
  await wait(500)
  await ensureWorkspaceVisible()
  await selectTaskInList()

  await patchTaskState({
    startAt: reminderPhase.startAt,
    dueAt: reminderPhase.dueAt,
    deadlineAt: reminderPhase.deadlineAt,
    reminders: [{ id: 'rem-ddl-relative', label: '提前 30 分钟', value: '30m', kind: 'relative' }],
  })
  await page.reload({ waitUntil: 'networkidle' })
  await wait(700)
  await ensureWorkspaceVisible()
  await selectTaskInList()

  const reminderFeatured = page.locator('.reminder-feed-item--featured')
  await reminderFeatured.waitFor({ timeout: 5000 })
  const reminderTitle = await textOf(reminderFeatured.locator('strong'))
  const reminderBody = await textOf(reminderFeatured.locator('p'))
  const detailWarningVisible = (await page.locator('.detail-schedule-warning').count()) > 0

  summary.checks.reminderCopy = {
    featuredTitle: reminderTitle,
    featuredBody: reminderBody,
    relativeReminderUsesDeadlineCopy: reminderBody.includes('按 DDL'),
    reminderBodyShowsDeadline: reminderBody.includes('DDL'),
    reminderBodyShowsPlanned: reminderBody.includes('计划'),
    detailWarningVisible,
  }
  summary.screenshots.reminderCopy = await shot('01-reminder-copy.png')

  await patchTaskState({
    startAt: withTime(futureAnchorDate, 9, 0),
    dueAt: withTime(futureAnchorDate, 16, 0),
    deadlineAt: withTime(futureAnchorDate, 13, 0),
    reminders: [],
  })
  await page.reload({ waitUntil: 'networkidle' })
  await wait(500)
  await ensureWorkspaceVisible()

  await switchView('日历')
  await setCurrentDateInput(futureAnchorDate)

  await page.locator('.calendar-modes').getByRole('button', { name: '月' }).click()
  await wait(200)
  const monthTask = page.locator('.calendar-chip', { hasText: TASK_TITLE }).first()
  await monthTask.waitFor({ timeout: 5000 })
  summary.checks.calendarMonth = {
    taskVisible: (await monthTask.count()) > 0,
    deadlineDotCount: await monthTask.locator('.task-deadline-dot').count(),
  }
  summary.screenshots.calendarMonth = await shot('02-calendar-month.png')

  await page.locator('.calendar-modes').getByRole('button', { name: '周' }).click()
  await wait(200)
  const weekTask = page.locator('.day-task', { hasText: TASK_TITLE }).first()
  await weekTask.waitFor({ timeout: 5000 })
  summary.checks.calendarWeek = {
    taskVisible: (await weekTask.count()) > 0,
    deadlineBadgeText: await textOf(weekTask.locator('.task-deadline-indicators').first()),
  }
  summary.screenshots.calendarWeek = await shot('03-calendar-week.png')

  await page.locator('.calendar-modes').getByRole('button', { name: '列表' }).click()
  await wait(200)
  const agendaTask = page.locator('.agenda-item', { hasText: TASK_TITLE }).first()
  await agendaTask.waitFor({ timeout: 5000 })
  summary.checks.calendarAgenda = {
    taskVisible: (await agendaTask.count()) > 0,
    deadlineBadgeText: await textOf(agendaTask.locator('.task-deadline-indicators').first()),
  }
  summary.screenshots.calendarAgenda = await shot('04-calendar-agenda.png')

  await switchView('时间线')
  await setCurrentDateInput(futureAnchorDate)
  await page.locator('.timeline-modes').getByRole('button', { name: '日' }).click()
  await wait(250)
  const timelineRow = page.locator('.timeline-row', { hasText: TASK_TITLE }).first()
  await timelineRow.waitFor({ timeout: 5000 })
  summary.checks.timeline = {
    rowVisible: (await timelineRow.count()) > 0,
    titleDeadlineBadgeText: await textOf(timelineRow.locator('.timeline-title__meta .task-deadline-indicators').first()),
    deadlineMarkerCount: await timelineRow.locator('.timeline-deadline-marker').count(),
  }
  summary.screenshots.timeline = await shot('05-timeline-ddl-marker.png')

  await patchTaskState({
    dueAt: duePhase.dueAt,
    deadlineAt: duePhase.deadlineAt,
    reminders: [],
  })
  await page.reload({ waitUntil: 'networkidle' })
  await wait(700)
  await ensureWorkspaceVisible()

  const dueFeatured = page.locator('.reminder-feed-item--featured')
  await dueFeatured.waitFor({ timeout: 5000 })
  const dueTitle = await textOf(dueFeatured.locator('strong'))
  const dueBody = await textOf(dueFeatured.locator('p'))
  summary.checks.deadlineDueTrigger = {
    featuredTitle: dueTitle,
    featuredBody: dueBody,
    deadlineTitlePreferred: dueTitle.includes('DDL 到期'),
    deadlineBodyPreferred: dueBody.includes('硬性 DDL 已到'),
  }
  summary.screenshots.deadlineDueTrigger = await shot('06-deadline-due-trigger.png')

  const issues = []
  if (!summary.checks.reminderCopy.relativeReminderUsesDeadlineCopy) issues.push('RELATIVE_REMINDER_COPY_NOT_DDL_FIRST')
  if (!summary.checks.reminderCopy.reminderBodyShowsDeadline) issues.push('REMINDER_BODY_MISSING_DEADLINE_CONTEXT')
  if (!summary.checks.reminderCopy.reminderBodyShowsPlanned) issues.push('REMINDER_BODY_MISSING_PLANNED_CONTEXT')
  if (!summary.checks.reminderCopy.detailWarningVisible) issues.push('DETAIL_WARNING_NOT_VISIBLE_FOR_PLANNED_AFTER_DDL')
  if ((summary.checks.calendarMonth.deadlineDotCount ?? 0) < 1) issues.push('CALENDAR_MONTH_DDL_DOT_MISSING')
  if (!summary.checks.calendarWeek.deadlineBadgeText?.includes('DDL')) issues.push('CALENDAR_WEEK_DDL_BADGE_MISSING')
  if (!summary.checks.calendarAgenda.deadlineBadgeText?.includes('DDL')) issues.push('CALENDAR_AGENDA_DDL_BADGE_MISSING')
  if ((summary.checks.timeline.deadlineMarkerCount ?? 0) < 1) issues.push('TIMELINE_DDL_MARKER_MISSING')
  if (!summary.checks.timeline.titleDeadlineBadgeText?.includes('DDL')) issues.push('TIMELINE_TITLE_DDL_BADGE_MISSING')
  if (!summary.checks.deadlineDueTrigger.deadlineTitlePreferred) issues.push('DEADLINE_DUE_TITLE_NOT_DDL_FIRST')
  if (!summary.checks.deadlineDueTrigger.deadlineBodyPreferred) issues.push('DEADLINE_DUE_BODY_NOT_DDL_FIRST')
  if (pageErrors.length > 0 || consoleMessages.some((item) => item.type === 'error')) issues.push('RUNTIME_ERRORS_PRESENT')

  summary.issues = issues
  summary.conclusion = issues.length === 0 ? 'passed' : 'issues_found'

  await fs.writeFile(path.join(RESULTS_DIR, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(summary, null, 2))
} finally {
  await browser.close()
}
