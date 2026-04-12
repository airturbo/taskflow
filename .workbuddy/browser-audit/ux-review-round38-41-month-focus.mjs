import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const ROOT = '/Users/turbo/WorkBuddy/20260330162606/.workbuddy/browser-audit'
const RESULTS_DIR = path.join(ROOT, 'results', '2026-04-08-round38-41-month-focus-review')
const SHOTS_DIR = path.join(RESULTS_DIR, 'screenshots')
const URL = 'http://127.0.0.1:4173/'
const STORAGE_KEY = 'ticktick-parity-demo-v2'
const URGENT_TITLE = '月历紧急优先级回放任务'
const NORMAL_TITLE = '月历普通优先级对照任务'

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

const formatDate = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const withTime = (dateKey, hours, minutes = 0) => `${dateKey}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`

const focusDate = (() => {
  const date = new Date()
  date.setDate(date.getDate() + 2)
  return formatDate(date)
})()

const secondaryDate = (() => {
  const date = new Date(`${focusDate}T12:00:00`)
  date.setDate(date.getDate() + 3)
  return formatDate(date)
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

const createSeedTask = async () => {
  const composerInput = page.locator('.composer-bar input').first()
  await composerInput.fill(URGENT_TITLE)
  await page.getByRole('button', { name: '立即创建' }).click()
  await wait(350)
}

const installFixtureState = async () => {
  await page.evaluate(
    ({ key, urgentTitle, normalTitle, focusDateKey, secondaryDateKey }) => {
      const raw = window.localStorage.getItem(key)
      if (!raw) throw new Error('missing persisted state')
      const state = JSON.parse(raw)
      const baseTask = state.tasks.find((item) => item.title === urgentTitle)
      if (!baseTask) throw new Error(`task not found: ${urgentTitle}`)

      const urgentTask = {
        ...baseTask,
        title: urgentTitle,
        priority: 'urgent',
        startAt: null,
        dueAt: `${focusDateKey}T09:00`,
        deadlineAt: `${focusDateKey}T12:00`,
        completed: false,
        deleted: false,
      }

      const normalTask = {
        ...baseTask,
        id: `${baseTask.id}-normal`,
        title: normalTitle,
        priority: 'normal',
        startAt: null,
        dueAt: `${focusDateKey}T15:00`,
        deadlineAt: null,
        completed: false,
        deleted: false,
      }

      const secondaryTask = {
        ...baseTask,
        id: `${baseTask.id}-secondary`,
        title: '月历次要日期任务',
        priority: 'high',
        startAt: null,
        dueAt: `${secondaryDateKey}T10:00`,
        deadlineAt: null,
        completed: false,
        deleted: false,
      }

      state.tasks = [urgentTask, normalTask, secondaryTask]
      state.theme = 'paper'
      state.currentView = 'calendar'
      state.calendarMode = 'month'
      state.calendarShowCompleted = false
      state.activeSelection = `list:${baseTask.listId}`
      state.selectedTagIds = []
      state.firedReminderKeys = []
      state.onboarding = {
        ...(state.onboarding ?? {}),
        version: 'v1',
        status: 'dismissed',
        currentStepId: null,
        completedStepIds: [],
        lastSeenAt: null,
        seedScenarioVersion: 'legacy',
      }
      window.localStorage.setItem(key, JSON.stringify(state))
    },
    { key: STORAGE_KEY, urgentTitle: URGENT_TITLE, normalTitle: NORMAL_TITLE, focusDateKey: focusDate, secondaryDateKey: secondaryDate },
  )
}

const readChipVisual = async (locator) =>
  locator.evaluate((element) => {
    const style = window.getComputedStyle(element)
    const before = window.getComputedStyle(element, '::before')
    return {
      color: style.color,
      background: style.backgroundColor,
      borderColor: style.borderColor,
      beforeColor: before.backgroundColor,
      beforeWidth: before.width,
      beforeOpacity: before.opacity,
    }
  })

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
  await createSeedTask()
  await installFixtureState()
  await page.reload({ waitUntil: 'networkidle' })
  await wait(600)
  await ensureWorkspaceVisible()

  const dateInput = page.locator('.date-picker-input').first()
  await dateInput.fill(focusDate)
  await wait(250)
  await page.locator('.calendar-modes').getByRole('button', { name: '月' }).click()
  await wait(200)

  const urgentChip = page.locator('.calendar-chip', { hasText: URGENT_TITLE }).first()
  const normalChip = page.locator('.calendar-chip', { hasText: NORMAL_TITLE }).first()
  await urgentChip.waitFor({ timeout: 5000 })
  await normalChip.waitFor({ timeout: 5000 })

  const urgentBase = await readChipVisual(urgentChip)
  const normalBase = await readChipVisual(normalChip)
  await urgentChip.hover()
  await wait(120)
  const urgentHover = await readChipVisual(urgentChip)

  const focusedCell = page.locator(`[data-calendar-drop-zone="${focusDate}"]`).first()
  const secondaryCell = page.locator(`[data-calendar-drop-zone="${secondaryDate}"]`).first()
  const initialFocusedState = await focusedCell.evaluate((element) => ({
    focused: element.classList.contains('is-focused'),
    muted: element.classList.contains('is-muted'),
  }))

  summary.screenshots.monthInitial = await shot('01-month-initial.png')

  await secondaryCell.click({ position: { x: 20, y: 24 } })
  await wait(180)

  const afterFocusShift = await page.evaluate(
    ({ focusDateKey, secondaryDateKey }) => {
      const focusCell = document.querySelector(`[data-calendar-drop-zone="${focusDateKey}"]`)
      const secondary = document.querySelector(`[data-calendar-drop-zone="${secondaryDateKey}"]`)
      return {
        originalFocused: focusCell?.classList.contains('is-focused') ?? false,
        originalMuted: focusCell?.classList.contains('is-muted') ?? false,
        nextFocused: secondary?.classList.contains('is-focused') ?? false,
        nextMuted: secondary?.classList.contains('is-muted') ?? false,
      }
    },
    { focusDateKey: focusDate, secondaryDateKey: secondaryDate },
  )

  summary.screenshots.monthFocusShift = await shot('02-month-focus-shift.png')

  summary.checks.priorityAccent = {
    urgentBase,
    normalBase,
    urgentHover,
    urgentUsesDistinctAccent: urgentBase.beforeColor !== normalBase.beforeColor,
    urgentBarWidth: urgentBase.beforeWidth,
    hoverKeepsTextToneStable: urgentBase.color === urgentHover.color,
  }

  summary.checks.focusHierarchy = {
    focusDate,
    secondaryDate,
    initialFocusedState,
    afterFocusShift,
    originalDateMutedAfterShift: afterFocusShift.originalMuted,
    secondaryDateFocusedAfterClick: afterFocusShift.nextFocused,
  }

  if (!summary.checks.priorityAccent.urgentUsesDistinctAccent) {
    summary.issues.push('月历紧急任务与普通任务的左侧优先级细条颜色仍未拉开。')
  }
  if (summary.checks.priorityAccent.urgentBarWidth !== '2px') {
    summary.issues.push(`月历优先级细条宽度异常，当前为 ${summary.checks.priorityAccent.urgentBarWidth}。`)
  }
  if (!summary.checks.focusHierarchy.secondaryDateFocusedAfterClick) {
    summary.issues.push('点击其他日期后，新的选中日没有进入聚焦态。')
  }
  if (!summary.checks.focusHierarchy.originalDateMutedAfterShift) {
    summary.issues.push('切换选中日后，原日期没有进入退后层级。')
  }
  if (pageErrors.length > 0) {
    summary.issues.push(`页面运行时错误 ${pageErrors.length} 条。`)
  }

  summary.pass = summary.issues.length === 0
  await fs.writeFile(path.join(RESULTS_DIR, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
} catch (error) {
  const failure = {
    reviewedAt: new Date().toISOString(),
    url: URL,
    error: String(error),
    consoleMessages,
    pageErrors,
  }
  await fs.writeFile(path.join(RESULTS_DIR, 'summary.json'), `${JSON.stringify(failure, null, 2)}\n`, 'utf8')
  throw error
} finally {
  await context.close()
  await browser.close()
}
