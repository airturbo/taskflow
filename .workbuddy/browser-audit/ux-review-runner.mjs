import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const ROOT = '/Users/turbo/WorkBuddy/20260330162606/.workbuddy/browser-audit'
const RESULTS_DIR = path.join(ROOT, 'results')
const SHOTS_DIR = path.join(RESULTS_DIR, 'screenshots')
const URL = 'http://127.0.0.1:4173/'
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

const textOf = async (locator) => (await locator.textContent())?.trim() ?? ''
const textsOf = async (locator) =>
  locator.evaluateAll((nodes) =>
    nodes
      .map((node) => node.textContent?.replace(/\s+/g, ' ').trim() ?? '')
      .filter(Boolean),
  )
const parseTrailingCount = (value) => {
  const match = value.match(/(\d+)\s*$/)
  return match ? Number(match[1]) : null
}

const measureOverflow = async (locator) =>
  locator.evaluate((node) => ({
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
    clientHeight: node.clientHeight,
    scrollHeight: node.scrollHeight,
    hasHorizontalOverflow: node.scrollWidth - node.clientWidth > 1,
    hasVerticalOverflow: node.scrollHeight - node.clientHeight > 1,
  }))

const closeInlineCreate = async () => {
  const popover = page.locator('.inline-create-popover')
  if (!(await popover.count())) return
  await page.keyboard.press('Escape')
  await page.waitForTimeout(180)
}

try {
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.evaluate((key) => window.localStorage.removeItem(key), STORAGE_KEY)
  await page.reload({ waitUntil: 'networkidle' })

  const summary = {
    url: URL,
    workspace: await textOf(page.locator('.topbar h2')),
    screenshots: {},
    checks: {},
    consoleErrors: [],
    pageErrors,
  }

  summary.screenshots.home = await shot('01-home.png')

  const quickInput = page.getByPlaceholder('例如：明天下午 3 点产品评审')
  await quickInput.fill('今天晚上 9 点体验官走查')
  await page.getByRole('button', { name: '立即创建' }).click()
  await page.waitForTimeout(300)

  const detailCard = page.locator('.detail-card')
  await detailCard.waitFor()
  const titleInput = detailCard.locator('label:has-text("标题") input')
  const dueInput = detailCard.locator('label:has-text("截止时间") input')

  summary.checks.quickCreate = {
    titleAfterCreate: await titleInput.inputValue(),
    dueAtAfterCreate: await dueInput.inputValue(),
    detailVisible: await detailCard.isVisible(),
  }
  summary.screenshots.quickCreate = await shot('02-quick-create.png')

  await titleInput.fill('体验官走查回放')
  await detailCard.locator('label:has-text("笔记 / Markdown 占位") textarea').fill('验证真实用户全流程、视图切换与工具链路。')
  await detailCard.locator('.field').filter({ has: page.getByText('重复', { exact: true }) }).locator('select').selectOption({ label: '每天' })
  const estimatedPomodorosInput = detailCard.locator('label:has-text("预计番茄") input')
  if (await estimatedPomodorosInput.count()) {
    await estimatedPomodorosInput.fill('2')
  }
  await detailCard.getByRole('button', { name: '+30m' }).click()
  await detailCard.getByPlaceholder('添加子任务…').fill('补一版 UX 复审结论')
  await detailCard.getByRole('button', { name: '添加', exact: true }).nth(0).click()
  const longAttachmentName = 'ux-review-attachment-with-a-very-long-name-for-right-rail-overflow-validation-2026-04-03-final-notes.md'
  await detailCard.getByPlaceholder('输入文件名，例如 spec.pdf').fill(longAttachmentName)
  await detailCard.getByRole('button', { name: '添加', exact: true }).nth(1).click()
  await detailCard.getByPlaceholder('写一条评论…').fill('体验官已完成第一轮走查，需要补强反馈态，并确认右侧详情栏在长文本、长附件名和排期控件同时出现时也不能横向撑破布局。')
  await detailCard.getByRole('button', { name: '发送' }).click()
  await detailCard.getByRole('button', { name: /#产品/ }).click()
  await page.waitForTimeout(300)

  const detailOverflow = await measureOverflow(detailCard)
  const rightRailOverflow = await measureOverflow(page.locator('.right-rail'))
  const pageOverflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    hasHorizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth > 1,
  }))

  summary.checks.detailEdit = {
    titleAfterEdit: await titleInput.inputValue(),
    noteAfterEdit: await detailCard.locator('label:has-text("笔记 / Markdown 占位") textarea').inputValue(),
    repeatRule: await detailCard.locator('.field').filter({ has: page.getByText('重复', { exact: true }) }).locator('select').inputValue(),
    estimatedPomodoros: (await estimatedPomodorosInput.count()) ? await estimatedPomodorosInput.inputValue() : null,
    reminderCount: await detailCard.locator('.detail-section').filter({ has: page.getByText('提醒') }).locator('.stack-item').count(),
    subtaskCount: await detailCard.locator('.detail-section').filter({ has: page.getByText('子任务') }).locator('.subtask-item').count(),
    attachmentCount: await detailCard.locator('.detail-section').filter({ has: page.getByText('附件占位') }).locator('.stack-item').count(),
    commentCount: await detailCard.locator('.detail-section').filter({ has: page.getByText('评论') }).locator('.comment-item').count(),
    longAttachmentName,
    detailOverflow,
    rightRailOverflow,
    pageOverflow,
  }
  summary.screenshots.detail = await shot('03-detail-edit.png')

  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  summary.checks.persistence = {
    persistedTaskFound: await page.getByText('体验官走查回放').first().isVisible(),
    persistedSearchLabel: await textOf(page.locator('.topbar h2')),
  }
  summary.screenshots.persistence = await shot('04-persistence.png')

  await page.locator('.segmented-control').getByRole('button', { name: '列表' }).click()
  await page.waitForTimeout(200)

  const searchInput = page.getByRole('searchbox', { name: '搜索当前工作区' })
  await searchInput.fill('不会命中任何任务')
  await page.waitForTimeout(40)
  const searchMissImmediateCount = await page.locator('.task-list .task-card', { hasText: '体验官走查回放' }).count()
  await page.waitForTimeout(220)
  const searchMissSettledCount = await page.locator('.task-list .task-card', { hasText: '体验官走查回放' }).count()
  await searchInput.fill('体验官')
  await page.waitForTimeout(220)
  summary.checks.search = {
    searchValue: await searchInput.inputValue(),
    workspaceLabel: await textOf(page.locator('.topbar h2')),
    missStillVisibleBeforeDebounce: searchMissImmediateCount,
    missVisibleAfterDebounce: searchMissSettledCount,
    matchingTaskVisible: await page.getByText('体验官走查回放').first().isVisible(),
  }
  summary.screenshots.search = await shot('05-search.png')
  await searchInput.fill('')
  await page.waitForTimeout(220)
  await page.locator('.sidebar').getByRole('button', { name: /^全部/ }).first().click()
  await page.waitForTimeout(250)

  const allSelectionButtonText = await textOf(page.locator('.sidebar').getByRole('button', { name: /^全部/ }).first())
  const allSelectionCount = parseTrailingCount(allSelectionButtonText)
  const activeMetricText = await textOf(page.locator('.hero-grid .metric').first())
  const activeMetricCount = parseTrailingCount(activeMetricText)
  const listCount = await page.locator('.task-list .task-card').count()
  const listTitles = await textsOf(page.locator('.task-list .task-card h3'))

  const listCardCandidates = page.locator('.task-list .task-card:not(.is-selected)')
  const listCard = (await listCardCandidates.count()) ? listCardCandidates.first() : page.locator('.task-list .task-card').first()
  const listCardTitle = await textOf(listCard.locator('h3'))
  await listCard.focus()
  await page.waitForTimeout(120)
  summary.screenshots.listKeyboard = await shot('06-list-keyboard.png')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(180)
  summary.checks.listKeyboard = {
    focusedTitle: listCardTitle,
    selectedTitleAfterEnter: await titleInput.inputValue(),
  }

  const clickView = async (label, screenshotName) => {
    await page.locator('.segmented-control').getByRole('button', { name: label, exact: true }).click()
    await page.waitForTimeout(250)
    summary.screenshots[screenshotName] = await shot(`${Object.keys(summary.screenshots).length + 1}`.padStart(2, '0') + `-${screenshotName}.png`)
  }

  await clickView('日历', 'calendar')
  const inlineCreatePopover = page.locator('.inline-create-popover')
  await page.locator('.calendar-modes').getByRole('button', { name: '月' }).click()
  await page.waitForTimeout(200)
  const monthCell = page.locator('.calendar-cell').first()
  await monthCell.click({ position: { x: 16, y: 16 } })
  await page.waitForTimeout(120)
  const monthGridCreateBlocked = (await inlineCreatePopover.count()) === 0
  await page.locator('.calendar-create-chip').first().click()
  await page.waitForTimeout(150)
  const monthExplicitEntryOpened = (await inlineCreatePopover.count()) > 0
  if (monthExplicitEntryOpened) {
    summary.screenshots.calendarMonthExplicit = await shot('07-calendar-month-explicit.png')
  }
  await closeInlineCreate()

  await page.locator('.calendar-modes').getByRole('button', { name: '周' }).click()
  await page.waitForTimeout(200)
  const weekColumn = page.locator('.calendar-column').first()
  await weekColumn.click({ position: { x: 24, y: 24 } })
  await page.waitForTimeout(120)
  const weekColumnCreateBlocked = (await inlineCreatePopover.count()) === 0
  await page.locator('.calendar-create-chip--week').first().click()
  await page.waitForTimeout(150)
  const weekExplicitEntryOpened = (await inlineCreatePopover.count()) > 0
  await closeInlineCreate()
  const weekTaskCount = await page.locator('.calendar-column .day-task').count()
  const weekTaskTitles = await textsOf(page.locator('.calendar-column .day-task strong'))

  await page.locator('.calendar-modes').getByRole('button', { name: '列表' }).click()
  await page.waitForTimeout(200)
  await page.locator('.calendar-strip-button').first().click()
  await page.waitForTimeout(150)
  const agendaStripEntryOpened = (await inlineCreatePopover.count()) > 0
  await closeInlineCreate()

  const agendaCreateCard = page.locator('.agenda-create-card').first()
  const agendaEmptyEntryAvailable = (await agendaCreateCard.count()) > 0
  let agendaEmptyEntryOpened = false
  if (agendaEmptyEntryAvailable) {
    await agendaCreateCard.click()
    await page.waitForTimeout(150)
    agendaEmptyEntryOpened = (await inlineCreatePopover.count()) > 0
    await closeInlineCreate()
  }
  const agendaVisibleTaskCount = await page.locator('.agenda-item').count()
  const agendaTaskTitles = await textsOf(page.locator('.agenda-item strong'))

  summary.checks.calendar = {
    monthModeVisible: await page.locator('.calendar-modes').getByRole('button', { name: '月' }).isVisible(),
    agendaToggleVisible: await page.locator('.calendar-modes').getByRole('button', { name: '列表' }).isVisible(),
    monthGridCreateBlocked,
    monthExplicitEntryOpened,
    weekColumnCreateBlocked,
    weekExplicitEntryOpened,
    agendaStripEntryOpened,
    agendaEmptyEntryAvailable,
    agendaEmptyEntryOpened,
  }
  summary.screenshots.calendarBoundary = await shot('08-calendar-boundary.png')

  await clickView('看板', 'kanban')
  const kanbanVisibleCount = await page.locator('.kanban-card').count()
  const kanbanTitles = await textsOf(page.locator('.kanban-card h4'))
  const kanbanCardCandidates = page.locator('.kanban-card:not(.is-selected)')
  const kanbanCard = (await kanbanCardCandidates.count()) ? kanbanCardCandidates.first() : page.locator('.kanban-card').first()
  const kanbanCardTitle = await textOf(kanbanCard.locator('h4'))
  await kanbanCard.focus()
  await page.waitForTimeout(120)
  summary.screenshots.kanbanKeyboard = await shot('10-kanban-keyboard.png')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(180)
  summary.checks.kanban = {
    columnCount: await page.locator('.kanban-column').count(),
    cardsVisible: await page.locator('.kanban-card').count(),
    keyboardFocusedTitle: kanbanCardTitle,
    selectedTitleAfterEnter: await titleInput.inputValue(),
  }

  await clickView('时间线', 'timeline')
  summary.checks.timeline = {
    barCount: await page.locator('.timeline-bar').count(),
  }

  await clickView('四象限', 'matrix')
  const matrixVisibleCount = await page.locator('.matrix-card').count()
  const matrixTitles = await textsOf(page.locator('.matrix-card strong'))
  const matrixCardCandidates = page.locator('.matrix-card:not(.is-selected)')
  const matrixCard = (await matrixCardCandidates.count()) ? matrixCardCandidates.first() : page.locator('.matrix-card').first()
  const matrixCardTitle = await textOf(matrixCard.locator('strong').first())
  await matrixCard.focus()
  await page.waitForTimeout(120)
  summary.screenshots.matrixKeyboard = await shot('12-matrix-keyboard.png')
  await page.keyboard.press('Space')
  await page.waitForTimeout(180)
  summary.checks.matrix = {
    quadrantCount: await page.locator('.matrix-quadrant').count(),
    createdTaskVisible: await page.getByText('体验官走查回放').count(),
    keyboardFocusedTitle: matrixCardTitle,
    selectedTitleAfterSpace: await titleInput.inputValue(),
  }

  summary.checks.crossViewParity = {
    allSelectionCount,
    activeMetricCount,
    listCount,
    kanbanVisibleCount,
    matrixVisibleCount,
    weekTaskCount,
    agendaVisibleTaskCount,
    listTitles,
    kanbanTitles,
    matrixTitles,
    weekTaskTitles,
    agendaTaskTitles,
    allMatchesList: allSelectionCount === listCount,
    allMatchesActiveMetric: allSelectionCount === activeMetricCount,
    activeMetricMatchesList: activeMetricCount === listCount,
    listMatchesKanban: listCount === kanbanVisibleCount,
    listMatchesMatrix: listCount === matrixVisibleCount,
    weekMatchesAgenda: weekTaskCount === agendaVisibleTaskCount,
    listTitlesMatchKanban: JSON.stringify([...listTitles].sort()) === JSON.stringify([...kanbanTitles].sort()),
    listTitlesMatchMatrix: JSON.stringify([...listTitles].sort()) === JSON.stringify([...matrixTitles].sort()),
    weekTitlesMatchAgenda: JSON.stringify([...weekTaskTitles].sort()) === JSON.stringify([...agendaTaskTitles].sort()),
  }

  const focusEntry = page.getByRole('button', { name: /番茄|专注/ })
  if (await focusEntry.count()) {
    await focusEntry.first().click()
    await page.waitForTimeout(250)
    const timerBefore = await textOf(page.locator('.giant-timer'))
    await page.locator('.hero-focus').getByRole('button', { name: '开始' }).click()
    await page.waitForTimeout(1100)
    const timerRunning = await textOf(page.locator('.giant-timer'))
    await page.locator('.hero-focus').getByRole('button', { name: '暂停' }).click()
    await page.waitForTimeout(200)
    summary.checks.focus = {
      timerBefore,
      timerRunning,
      linkedTaskText: await textOf(page.locator('.hero-focus .muted')),
    }
    summary.screenshots.focus = await shot('10-focus.png')
  }

  const habitsEntry = page.getByRole('button', { name: /习惯/ })
  if (await habitsEntry.count()) {
    await habitsEntry.first().click()
    await page.waitForTimeout(250)
    const firstHabit = page.locator('.habit-card').first()
    if (await firstHabit.count()) {
      const progressItems = firstHabit.locator('p')
      const progressIndex = (await progressItems.count()) > 1 ? 1 : 0
      const habitProgressBefore = await textOf(progressItems.nth(progressIndex))
      const incrementButton = firstHabit.getByRole('button', { name: '+' })
      if (await incrementButton.count()) {
        await incrementButton.click()
        await page.waitForTimeout(200)
      }
      const habitProgressAfter = await textOf(progressItems.nth(progressIndex))
      summary.checks.habits = {
        firstHabitTitle: await textOf(firstHabit.locator('h3')),
        before: habitProgressBefore,
        after: habitProgressAfter,
      }
      summary.screenshots.habits = await shot('11-habits.png')
    }
  }

  const statsEntry = page.getByRole('button', { name: /统计/ })
  if (await statsEntry.count()) {
    await statsEntry.first().click()
    await page.waitForTimeout(250)
    summary.checks.stats = {
      cards: await page.locator('.stats-card').count(),
      overdueMetric: await textOf(page.locator('.stats-card').nth(2)),
      scheduledMetric: await textOf(page.locator('.stats-card').nth(3)),
    }
    summary.screenshots.stats = await shot('12-stats.png')
  }

  await page.getByRole('button', { name: '今日' }).click()
  await page.waitForTimeout(250)
  await page.locator('.segmented-control').getByRole('button', { name: '列表' }).click()
  await page.waitForTimeout(200)
  const todayTaskStillVisible = await page.locator('.task-list .task-card', { hasText: '体验官走查回放' }).count()

  await page.getByRole('button', { name: '已完成' }).click()
  await page.waitForTimeout(250)
  const completedTaskCard = page.locator('.task-list .task-card', { hasText: '体验官走查回放' }).first()
  const completedVisible = await completedTaskCard.count()
  summary.screenshots.completed = await shot('13-completed.png')

  let trashVisible = 0
  let restoredWorkspace = ''
  let restoredVisible = 0
  if (completedVisible > 0) {
    const deleteButton = completedTaskCard.getByRole('button', { name: '删除' })
    if (await deleteButton.count()) {
      await deleteButton.click()
      await page.waitForTimeout(250)
    }
    await page.getByRole('button', { name: '回收站' }).click()
    await page.waitForTimeout(250)
    const trashTaskCard = page.locator('.task-list .task-card', { hasText: '体验官走查回放' }).first()
    trashVisible = await trashTaskCard.count()
    summary.screenshots.trash = await shot('14-trash.png')

    if (trashVisible > 0) {
      const restoreButton = trashTaskCard.getByRole('button', { name: '恢复' })
      if (await restoreButton.count()) {
        await restoreButton.click()
        await page.waitForTimeout(250)
      }
    }
    restoredWorkspace = await textOf(page.locator('.topbar h2'))
    restoredVisible = await page.locator('.task-list .task-card', { hasText: '体验官走查回放' }).count()
  }

  await page.locator('.sidebar').getByRole('button', { name: /#产品/ }).click()
  await page.waitForTimeout(250)
  const tagWorkspace = await textOf(page.locator('.topbar h2'))
  const tagViewVisible = await page.getByText('体验官走查回放').count()
  summary.screenshots.tag = await shot('15-tag.png')

  await page.locator('.sidebar').getByRole('button', { name: /🗓 本周截止/ }).click()
  await page.waitForTimeout(250)
  const filterWorkspace = await textOf(page.locator('.topbar h2'))
  const filterViewVisible = await page.getByText('体验官走查回放').count()
  summary.screenshots.filter = await shot('16-filter.png')

  summary.checks.secondaryPaths = {
    todayTaskStillVisibleAfterComplete: todayTaskStillVisible,
    completedVisible,
    trashVisible,
    restoredWorkspace,
    restoredVisible,
    tagWorkspace,
    tagViewVisible,
    filterWorkspace,
    filterViewVisible,
  }

  summary.consoleErrors = consoleMessages.filter((item) => item.type === 'error' || item.type === 'warning')

  await fs.writeFile(path.join(RESULTS_DIR, 'ux-review-summary.json'), JSON.stringify(summary, null, 2), 'utf8')
  console.log(JSON.stringify(summary, null, 2))
} finally {
  await browser.close()
}
