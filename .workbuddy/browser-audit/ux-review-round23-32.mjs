import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const ROOT = '/Users/turbo/WorkBuddy/20260330162606/.workbuddy/browser-audit'
const RESULTS_DIR = path.join(ROOT, 'results', '2026-04-07-round23-32-ux-review')
const SHOTS_DIR = path.join(RESULTS_DIR, 'screenshots')
const URL = 'http://127.0.0.1:4174/'
const STORAGE_KEY = 'ticktick-parity-demo-v2'

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

const shot = async (name) => {
  const filePath = path.join(SHOTS_DIR, name)
  await page.screenshot({ path: filePath, fullPage: true })
  return filePath
}

const textOf = async (locator) => (await locator.textContent())?.replace(/\s+/g, ' ').trim() ?? ''
const textsOf = async (locator) =>
  locator.evaluateAll((nodes) =>
    nodes
      .map((node) => node.textContent?.replace(/\s+/g, ' ').trim() ?? '')
      .filter(Boolean),
  )

const resetApp = async () => {
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.evaluate((key) => window.localStorage.removeItem(key), STORAGE_KEY)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(250)
}

const readProgress = async () => textOf(page.locator('.onboarding-checklist__header-actions span').first())
const readActiveStep = async () => textOf(page.locator('.onboarding-step.is-active strong').first())

try {
  const summary = {
    url: URL,
    reviewedAt: new Date().toISOString(),
    evidenceDir: RESULTS_DIR,
    screenshots: {},
    checks: {},
    consoleMessages,
    pageErrors,
  }

  await resetApp()
  summary.screenshots.welcome = await shot('01-welcome.png')
  summary.checks.welcome = {
    title: await textOf(page.locator('.onboarding-welcome h3')),
    primaryAction: await textOf(page.getByRole('button', { name: '跟着做 5 步' })),
    secondaryAction: await textOf(page.getByRole('button', { name: '先看示例工作区' })),
  }

  await page.getByRole('button', { name: '跟着做 5 步' }).click()
  await page.waitForTimeout(250)
  summary.screenshots.startGuide = await shot('02-start-guide.png')

  const quickInput = page.locator('.composer-bar input').first()
  const detailTitleInput = page.locator('.detail-card label:has-text("标题") input')

  const progressBeforeCreate = await readProgress()
  const activeStepBeforeCreate = await readActiveStep()
  await quickInput.fill('今天晚上 9 点体验官第一条任务')
  await page.getByRole('button', { name: '立即创建' }).click()
  await page.waitForTimeout(350)

  summary.checks.datedQuickCreateStepAdvance = {
    progressBeforeCreate,
    activeStepBeforeCreate,
    progressAfterDatedCreate: await readProgress(),
    activeStepAfterDatedCreate: await readActiveStep(),
    selectedTaskAfterDatedCreate: await detailTitleInput.inputValue(),
  }
  summary.screenshots.datedQuickCreate = await shot('03-dated-quick-create.png')

  const completeStep = page.locator('.onboarding-step').filter({ has: page.getByText('完成一条任务', { exact: true }) })
  await completeStep.getByRole('button').click()
  await page.waitForTimeout(250)

  const workspaceLabel = await textOf(page.locator('.topbar h2'))
  const selectedTaskOnCompleteStep = await detailTitleInput.inputValue()
  const visibleListTitles = await textsOf(page.locator('.task-list .task-card h3'))
  summary.checks.completeStepContext = {
    workspaceLabel,
    selectedTaskOnCompleteStep,
    visibleListTitlesOnCompleteStep: visibleListTitles,
    selectedTaskVisibleInCurrentList: visibleListTitles.includes(selectedTaskOnCompleteStep),
  }
  summary.screenshots.completeStepContext = await shot('04-complete-step-context.png')

  await resetApp()
  await page.getByRole('button', { name: '先看示例工作区' }).click()
  await page.waitForTimeout(250)

  summary.checks.browsePath = {
    checklistCollapsedByDefault: await page.locator('.onboarding-checklist').evaluate((node) => node.classList.contains('is-collapsed')),
    cueVisibleAfterBrowse: (await page.locator('.onboarding-cue').count()) > 0,
    checklistHeader: await textOf(page.locator('.onboarding-checklist h3').first()),
    progress: await readProgress(),
  }
  summary.screenshots.browsePath = await shot('05-browse-path.png')

  await fs.writeFile(path.join(RESULTS_DIR, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(summary, null, 2))
} finally {
  await browser.close()
}
