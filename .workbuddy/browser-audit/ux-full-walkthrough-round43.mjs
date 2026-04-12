import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'node:fs'

const BASE = 'http://127.0.0.1:4519'
const OUT = '.workbuddy/browser-audit/results/2026-04-08-round43'
mkdirSync(OUT, { recursive: true })

const R = { steps: [], passed: true, errors: [], warnings: [] }
const step = (n, s, d = '') => {
  R.steps.push({ name: n, status: s, detail: d })
  if (s === 'FAIL') { R.passed = false; R.errors.push(`${n}: ${d}`) }
  if (s === 'WARN') R.warnings.push(`${n}: ${d}`)
  console.log(`[${s}] ${n}${d ? ': ' + d : ''}`)
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const pageErrors = []
page.on('pageerror', e => pageErrors.push(e.message))

// ========== 1. 页面加载 ==========
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 })
await page.waitForSelector('.app-shell', { timeout: 8000 })

// 关闭 onboarding 欢迎层
const welcomeDismiss = page.locator('.onboarding-layer button').filter({ hasText: /跳过|关闭|稍后/i }).first()
if (await welcomeDismiss.count() > 0) {
  await welcomeDismiss.click({ timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(500)
}

await page.screenshot({ path: `${OUT}/01-initial.png`, fullPage: false })
step('页面加载', 'PASS')

// ========== 2. 切换到列表视图 ==========
const listTab = page.locator('button').filter({ hasText: /^列表$/ }).first()
if (await listTab.count() > 0) {
  await listTab.click()
  await page.waitForTimeout(800)
}
await page.screenshot({ path: `${OUT}/02-list-view.png`, fullPage: false })

// 读取初始任务数
const initialTaskCards = await page.locator('.task-card').count()
step('列表视图初始任务数', 'INFO', `${initialTaskCards} 个任务卡片`)

// ========== 3. 新建任务 ==========
const quickInput = page.locator('input[placeholder*="例如"], input[placeholder*="快速创建"], input[placeholder*="创建"]').first()
const createBtn = page.locator('button').filter({ hasText: /立即创建/ }).first()
const taskTitle = `体验官测试-${Date.now()}`

if (await quickInput.count() > 0) {
  await quickInput.fill(taskTitle)
  await page.waitForTimeout(200)
  
  if (await createBtn.count() > 0) {
    await createBtn.click()
  } else {
    await page.keyboard.press('Enter')
  }
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/03-after-create.png`, fullPage: false })

  const bodyText = await page.textContent('body')
  if (bodyText.includes(taskTitle) || bodyText.includes('体验官测试')) {
    step('新建任务可见', 'PASS', taskTitle)
  } else {
    step('新建任务可见', 'FAIL', '新建后在页面中未找到任务标题')
  }

  const afterCreateCards = await page.locator('.task-card').count()
  step('新建后任务卡片数', 'INFO', `${afterCreateCards}（创建前 ${initialTaskCards}）`)
} else {
  step('新建任务', 'WARN', '未找到快速创建输入框')
}

// ========== 4. 等待几秒，检查任务是否还在 ==========
await page.waitForTimeout(3000)
await page.screenshot({ path: `${OUT}/04-after-wait.png`, fullPage: false })
const afterWaitCards = await page.locator('.task-card').count()
const bodyAfterWait = await page.textContent('body')
const taskStillVisible = bodyAfterWait.includes(taskTitle) || bodyAfterWait.includes('体验官测试')

if (afterWaitCards > 0 && taskStillVisible) {
  step('等待3秒后任务留存', 'PASS', `${afterWaitCards} 个卡片，任务标题仍在`)
} else if (afterWaitCards > 0) {
  step('等待3秒后任务留存', 'WARN', `${afterWaitCards} 个卡片但未找到测试任务标题`)
} else {
  step('等待3秒后任务留存', 'FAIL', `任务卡片数降到 ${afterWaitCards}，任务可能消失了`)
}

// ========== 5. 侧边栏计数检查 ==========
const sidebarAllCount = page.locator('.sidebar .nav-item, [class*="sidebar"] [class*="nav"]').filter({ hasText: /全部/ }).first()
let sidebarCountText = ''
if (await sidebarAllCount.count() > 0) {
  sidebarCountText = (await sidebarAllCount.textContent()) ?? ''
}
// 也试其他定位方式
if (!sidebarCountText) {
  const altSidebar = page.locator('aside').first()
  if (await altSidebar.count() > 0) {
    sidebarCountText = (await altSidebar.textContent()) ?? ''
  }
}
const countMatch = sidebarCountText.match(/全部\s*(\d+)/)
const sidebarCount = countMatch ? parseInt(countMatch[1], 10) : -1
step('侧边栏"全部"计数', sidebarCount > 0 ? 'PASS' : sidebarCount === 0 ? 'FAIL' : 'WARN',
  `显示 ${sidebarCount === -1 ? '未识别' : sidebarCount}`)

// ========== 6. 切换视图验证数据一致性 ==========
// 切到日历
const calendarTab = page.locator('button').filter({ hasText: /^日历$/ }).first()
if (await calendarTab.count() > 0) {
  await calendarTab.click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${OUT}/05-calendar.png`, fullPage: false })
  step('切换到日历视图', 'PASS')
}

// 切到看板
const kanbanTab = page.locator('button').filter({ hasText: /^看板$/ }).first()
if (await kanbanTab.count() > 0) {
  await kanbanTab.click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${OUT}/06-kanban.png`, fullPage: false })

  const kanbanCards = await page.locator('.kanban-card').count()
  step('看板视图任务卡片数', kanbanCards > 0 ? 'PASS' : 'WARN', `${kanbanCards} 个`)
}

// 切回列表
if (await listTab.count() > 0) {
  await listTab.click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${OUT}/07-back-to-list.png`, fullPage: false })

  const backCards = await page.locator('.task-card').count()
  const bodyBack = await page.textContent('body')
  const titleBack = bodyBack.includes(taskTitle) || bodyBack.includes('体验官测试')
  step('切换视图后回到列表', backCards > 0 ? 'PASS' : 'FAIL',
    `${backCards} 个卡片，测试任务 ${titleBack ? '仍在' : '消失了'}`)
}

// ========== 7. 再等待5秒（模拟用户停留） ==========
await page.waitForTimeout(5000)
await page.screenshot({ path: `${OUT}/08-after-long-wait.png`, fullPage: false })
const longWaitCards = await page.locator('.task-card').count()
const bodyLong = await page.textContent('body')
const longWaitOk = longWaitCards > 0 && (bodyLong.includes(taskTitle) || bodyLong.includes('体验官测试'))
step('长时间停留后任务留存（5秒）', longWaitOk ? 'PASS' : 'FAIL',
  `${longWaitCards} 个卡片`)

// ========== 8. 再次检查侧边栏计数 ==========
let finalSidebarText = ''
const finalSidebar = page.locator('aside').first()
if (await finalSidebar.count() > 0) {
  finalSidebarText = (await finalSidebar.textContent()) ?? ''
}
const finalCountMatch = finalSidebarText.match(/全部\s*(\d+)/)
const finalSidebarCount = finalCountMatch ? parseInt(finalCountMatch[1], 10) : -1
step('最终侧边栏"全部"计数', finalSidebarCount > 0 ? 'PASS' : finalSidebarCount === 0 ? 'FAIL' : 'WARN',
  `显示 ${finalSidebarCount === -1 ? '未识别' : finalSidebarCount}`)

// ========== 9. 提醒面板检查 ==========
const reminderPanel = page.locator('.reminder-center').first()
if (await reminderPanel.count() > 0) {
  const rpBox = await reminderPanel.boundingBox()
  step('提醒面板可见', rpBox && rpBox.width > 100 ? 'PASS' : 'WARN', `width=${rpBox?.width ?? 'null'}`)
}

// ========== 10. onboarding 不应可见 ==========
const onboardingEl = page.locator('.onboarding-checklist').first()
const obVisible = await onboardingEl.count() > 0 && await onboardingEl.isVisible().catch(() => false)
step('Onboarding 可见性', obVisible ? 'FAIL' : 'PASS',
  obVisible ? 'onboarding 不应出现但出现了' : 'dismissed 未复发')

// ========== 汇总 ==========
R.pageErrors = pageErrors.length
R.consoleErrors = pageErrors.slice(0, 5)
R.summary = {
  totalSteps: R.steps.length,
  passed: R.steps.filter(s => s.status === 'PASS').length,
  failed: R.steps.filter(s => s.status === 'FAIL').length,
  warnings: R.steps.filter(s => s.status === 'WARN').length,
}

await browser.close()
writeFileSync(`${OUT}/summary.json`, JSON.stringify(R, null, 2))
console.log('\n=== 体验官走查结论 ===')
console.log(`通过: ${R.summary.passed}  失败: ${R.summary.failed}  警告: ${R.summary.warnings}  页面错误: ${R.pageErrors}`)
console.log(R.passed ? '✅ 整体通过' : '❌ 存在失败项')
if (R.errors.length > 0) console.log('失败详情:', R.errors)
if (R.warnings.length > 0) console.log('警告详情:', R.warnings)
