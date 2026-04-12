import { chromium } from 'playwright'

const URL = 'http://127.0.0.1:4518/'
const STORAGE_KEY = 'ticktick-parity-demo-v2'
const title = `明天下午3点 drag-smoke-${Date.now()}`

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
const page = await context.newPage()

const dragBetween = async (source, target) => {
  await source.scrollIntoViewIfNeeded()
  await target.scrollIntoViewIfNeeded()
  const sourceBox = await source.boundingBox()
  const targetBox = await target.boundingBox()
  if (!sourceBox || !targetBox) throw new Error('missing drag boxes')

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 12, sourceBox.y + sourceBox.height / 2 + 6, { steps: 4 })
  await page.waitForTimeout(80)
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + Math.min(targetBox.height / 2, 120), { steps: 14 })
  await page.waitForTimeout(120)
  const probeX = targetBox.x + targetBox.width / 2
  const probeY = targetBox.y + Math.min(targetBox.height / 2, 120)
  const midState = {
    previewCount: await page.locator('.drag-preview-card').count(),
    targetClass: await target.evaluate((node) => node.className),
    draggingCount: await page.locator('.is-dragging').count(),
    hitStack: await page.evaluate(({ x, y }) => document.elementsFromPoint(x, y).slice(0, 6).map((node) => ({
      tag: node.tagName,
      className: node.className,
      kanban: node.getAttribute('data-kanban-drop-zone'),
      calendar: node.getAttribute('data-calendar-drop-zone'),
      matrix: node.getAttribute('data-matrix-drop-zone'),
      text: (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
    })), { x: probeX, y: probeY }),
  }
  await page.mouse.up()
  await page.waitForTimeout(320)
  return midState
}

try {
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.evaluate((key) => window.localStorage.removeItem(key), STORAGE_KEY)
  await page.reload({ waitUntil: 'networkidle' })

  const welcomePrimary = page.getByRole('button', { name: '跟着做 5 步' })
  if (await welcomePrimary.count()) {
    await welcomePrimary.click()
    await page.waitForTimeout(200)
  }

  await page.getByPlaceholder('例如：明天下午 3 点产品评审').fill(title)
  await page.getByRole('button', { name: '立即创建' }).click()
  await page.waitForTimeout(300)

  const results = {}

  await page.locator('.segmented-control').getByRole('button', { name: '看板', exact: true }).click()
  await page.waitForTimeout(250)
  const kanbanMidState = await dragBetween(
    page.locator('.kanban-card', { hasText: title }).first(),
    page.locator('[data-kanban-drop-zone="doing"]').first(),
  )
  results.kanban = {
    midState: kanbanMidState,
    inDoing: await page.locator('[data-kanban-drop-zone="doing"] .kanban-card', { hasText: title }).count(),
    inTodo: await page.locator('[data-kanban-drop-zone="todo"] .kanban-card', { hasText: title }).count(),
  }

  await page.locator('.segmented-control').getByRole('button', { name: '四象限', exact: true }).click()
  await page.waitForTimeout(250)
  await dragBetween(
    page.locator('.matrix-card', { hasText: title }).first(),
    page.locator('[data-matrix-drop-zone="q1"]').first(),
  )
  results.matrix = {
    inQ1: await page.locator('[data-matrix-drop-zone="q1"] .matrix-card', { hasText: title }).count(),
    inQ4: await page.locator('[data-matrix-drop-zone="q4"] .matrix-card', { hasText: title }).count(),
  }

  await page.locator('.segmented-control').getByRole('button', { name: '日历', exact: true }).click()
  await page.waitForTimeout(250)
  await page.locator('.calendar-modes').getByRole('button', { name: '周', exact: true }).click()
  await page.waitForTimeout(250)
  const sourceIndex = await page.locator('.calendar-column').evaluateAll((nodes, taskTitle) =>
    nodes.findIndex((node) => node.textContent?.includes(taskTitle)),
    title,
  )
  const targetIndex = sourceIndex >= 0 ? (sourceIndex + 1) % 7 : -1
  if (sourceIndex < 0 || targetIndex < 0) throw new Error(`calendar task not found: ${sourceIndex}`)
  const calendarMidState = await dragBetween(page.locator('.calendar-column').nth(sourceIndex).locator('.day-task', { hasText: title }).first(), page.locator('.calendar-column').nth(targetIndex))
  results.calendar = {
    sourceIndex,
    targetIndex,
    midState: calendarMidState,
    inTarget: await page.locator('.calendar-column').nth(targetIndex).locator('.day-task', { hasText: title }).count(),
    inSource: await page.locator('.calendar-column').nth(sourceIndex).locator('.day-task', { hasText: title }).count(),
  }

  console.log(JSON.stringify(results, null, 2))
} finally {
  await browser.close()
}
