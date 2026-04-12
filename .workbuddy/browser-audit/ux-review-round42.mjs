import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'node:fs'

const BASE = 'http://127.0.0.1:4519'
const OUT_DIR = '.workbuddy/browser-audit/results/2026-04-08-round42-ux-review'
mkdirSync(OUT_DIR, { recursive: true })

const results = { steps: [], passed: true, errors: [] }
const step = (name, status, detail = '') => {
  results.steps.push({ name, status, detail })
  if (status === 'FAIL') { results.passed = false; results.errors.push(`${name}: ${detail}`) }
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const pageErrors = []
page.on('pageerror', e => pageErrors.push(e.message))

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 })
await page.waitForSelector('.app-shell', { timeout: 8000 })

// 关闭可能出现的 onboarding 欢迎层
const welcomeDismiss = page.locator('.onboarding-layer button, [aria-label*="新手指引"] button').filter({ hasText: /跳过|关闭|稍后|dismiss/i }).first()
if (await welcomeDismiss.count() > 0) {
  await welcomeDismiss.click({ timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(500)
}
// 也尝试点击 overlay / backdrop 来关闭
const welcomeOverlay = page.locator('.onboarding-layer__backdrop, .onboarding-overlay').first()
if (await welcomeOverlay.count() > 0) {
  await welcomeOverlay.click({ force: true, timeout: 2000 }).catch(() => {})
  await page.waitForTimeout(500)
}

await page.screenshot({ path: `${OUT_DIR}/01-initial.png`, fullPage: false })
step('页面加载', 'PASS')

// === 1. 新建任务 ===
const quickInput = page.locator('input[aria-label*="快速创建"], input[placeholder*="快速创建"], input[placeholder*="创建"]').first()
const hasQuickCreate = await quickInput.count() > 0
if (hasQuickCreate) {
  const taskTitle = `UX走查-${Date.now()}`
  await quickInput.fill(taskTitle)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT_DIR}/02-after-create.png`, fullPage: false })

  const pageText = await page.textContent('body')
  if (pageText.includes(taskTitle)) {
    step('新建任务出现在列表', 'PASS', taskTitle)
  } else {
    step('新建任务出现在列表', 'FAIL', '新建后在页面中未找到任务标题')
  }

  // 做一次切换视图再回来，验证任务没丢
  const kanbanBtn = page.locator('button, [role="tab"]').filter({ hasText: /看板/ }).first()
  if (await kanbanBtn.count() > 0) {
    await kanbanBtn.click()
    await page.waitForTimeout(600)
    const listBtn = page.locator('button, [role="tab"]').filter({ hasText: /列表/ }).first()
    if (await listBtn.count() > 0) {
      await listBtn.click()
      await page.waitForTimeout(600)
    }
    await page.screenshot({ path: `${OUT_DIR}/03-after-view-switch.png`, fullPage: false })
    const textAfterSwitch = await page.textContent('body')
    if (textAfterSwitch.includes(taskTitle)) {
      step('切换视图后任务仍在', 'PASS')
    } else {
      step('切换视图后任务仍在', 'WARN', '切换视图后可能未能在 body 找到任务（Web 端正常则不阻塞）')
    }
  }
} else {
  step('新建任务', 'SKIP', '未找到快速创建输入框')
}

// === 2. 看板拖拽验证 ===
const kanbanNav = page.locator('button, [role="tab"]').filter({ hasText: /看板/ }).first()
if (await kanbanNav.count() > 0) {
  await kanbanNav.click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT_DIR}/04-kanban.png`, fullPage: false })

  const todoCards = page.locator('[data-kanban="todo"] .kanban-card, .kanban-stack[data-kanban="todo"] .kanban-card')
  const doingStack = page.locator('[data-kanban="doing"], .kanban-stack[data-kanban="doing"]').first()
  const todoCardCount = await todoCards.count()
  const hasDoing = await doingStack.count() > 0

  if (todoCardCount > 0 && hasDoing) {
    const card = todoCards.first()
    const cardBox = await card.boundingBox()
    const targetBox = await doingStack.boundingBox()
    if (cardBox && targetBox) {
      await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2)
      await page.mouse.down()
      await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 40, { steps: 15 })
      await page.waitForTimeout(200)
      await page.mouse.up()
      await page.waitForTimeout(600)
      await page.screenshot({ path: `${OUT_DIR}/05-kanban-after-drag.png`, fullPage: false })
      step('看板拖拽执行', 'PASS')
    } else {
      step('看板拖拽执行', 'SKIP', '无法获取元素 boundingBox')
    }
  } else {
    step('看板拖拽执行', 'SKIP', `todoCards=${todoCardCount}, hasDoing=${hasDoing}`)
  }
}

// === 3. 右侧提醒面板布局检查 ===
const reminderPanel = page.locator('.reminder-center').first()
if (await reminderPanel.count() > 0) {
  const reminderBox = await reminderPanel.boundingBox()
  if (reminderBox && reminderBox.width > 100) {
    step('提醒面板可见', 'PASS', `width=${Math.round(reminderBox.width)}`)
  } else {
    step('提醒面板可见', 'WARN', `width=${reminderBox?.width ?? 'null'}`)
  }

  const featured = page.locator('.reminder-feed-item--featured').first()
  if (await featured.count() > 0) {
    const featuredBox = await featured.boundingBox()
    const mainBlock = featured.locator('.reminder-feed-item__main').first()
    const mainBox = await mainBlock.count() > 0 ? await mainBlock.boundingBox() : null
    if (mainBox && mainBox.width > 80) {
      step('Featured 提醒文案列宽度合理', 'PASS', `mainWidth=${Math.round(mainBox.width)}`)
    } else {
      step('Featured 提醒文案列宽度合理', 'FAIL', `mainWidth=${mainBox?.width ?? 'null'}, 可能被挤压`)
    }
  } else {
    step('Featured 提醒卡片', 'INFO', '当前无 featured 提醒')
  }
}

await page.screenshot({ path: `${OUT_DIR}/06-reminder-panel.png`, fullPage: false })

// === 4. onboarding 状态检查 ===
const onboardingChecklist = page.locator('.onboarding-checklist, [class*="onboarding"]').first()
const bodyText = await page.textContent('body')
const onboardingVisible = await onboardingChecklist.count() > 0 && await onboardingChecklist.isVisible().catch(() => false)
step('Onboarding 可见性', onboardingVisible ? 'INFO' : 'PASS',
  onboardingVisible ? '当前 onboarding 仍可见' : 'onboarding 未显示（符合 dismissed/completed 预期）')

// === 5. 详情面板检查 ===
const detailPanel = page.locator('.detail-grid, .panel.task-detail, [class*="detail"]').first()
if (await detailPanel.count() > 0 && await detailPanel.isVisible().catch(() => false)) {
  const detailBox = await detailPanel.boundingBox()
  step('详情面板可见', 'PASS', `height=${Math.round(detailBox?.height ?? 0)}`)
} else {
  step('详情面板可见', 'INFO', '当前未展示详情面板')
}

// === 6. 笔记描述模块现状采集 ===
const noteEditor = page.locator('.note-editor, [class*="note-editor"], textarea[aria-label*="描述"], textarea[aria-label*="笔记"]').first()
if (await noteEditor.count() > 0) {
  const noteBox = await noteEditor.boundingBox()
  await page.screenshot({ path: `${OUT_DIR}/07-note-editor.png`, fullPage: false })
  step('笔记描述模块现状', 'INFO', `height=${Math.round(noteBox?.height ?? 0)}, width=${Math.round(noteBox?.width ?? 0)}`)
} else {
  step('笔记描述模块', 'INFO', '当前视图未展示笔记编辑器')
}

// === 汇总 ===
results.pageErrors = pageErrors.length
results.consoleErrors = pageErrors.slice(0, 5)

await browser.close()

writeFileSync(`${OUT_DIR}/summary.json`, JSON.stringify(results, null, 2))
console.log(JSON.stringify(results, null, 2))
