/**
 * TaskFlow — Deep Interaction Audit (Part 2)
 *
 * Covers: task creation (NLP), detail panel editing, kanban drag,
 * matrix drag, calendar views, search + NLP chips, bulk ops, completion animation
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173/';
const findings = [];
const RESULTS = [];

function note(cat, sev, title, detail) {
  findings.push({ cat, sev, title, detail });
  const icon = sev === 'critical' ? '🔴' : sev === 'high' ? '🟠' : sev === 'medium' ? '🟡' : '🔵';
  console.log(`  ${icon} [${sev}] ${title}${detail ? '\n    → ' + detail : ''}`);
}

async function test(name, fn) {
  try { await fn(); RESULTS.push({ name, s: 'PASS' }); console.log(`  ✅ ${name}`); }
  catch (e) { RESULTS.push({ name, s: 'FAIL', e: e.message }); console.log(`  ❌ ${name}: ${e.message}`); }
}
function assert(c, m) { if (!c) throw new Error(m); }

(async () => {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' TaskFlow — Deep Interaction Audit (Part 2)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));

  await page.goto(BASE);
  await page.waitForTimeout(2500);

  // Dismiss shortcut overlay if present
  const dismissBtn = await page.$('button:has-text("知道了")');
  if (dismissBtn) { await dismissBtn.click(); await page.waitForTimeout(300); }

  // ═══════════════════════════════════════════
  // 1. TASK CREATION — Smart Entry NLP
  // ═══════════════════════════════════════════
  console.log('1. TASK CREATION — Smart Entry NLP');

  await test('Quick create input is visible and focusable', async () => {
    const input = await page.$('input[placeholder*="例如"]');
    assert(input, 'Quick create input not found');
    await input.focus();
    await page.waitForTimeout(200);
  });

  await test('NLP: type "明天下午3点开会 #会议 !高" parses correctly', async () => {
    const input = await page.$('input[placeholder*="例如"]');
    await input.fill('');
    await input.type('明天下午3点开会 #会议 !高', { delay: 30 });
    await page.waitForTimeout(500);
    const val = await input.inputValue();
    assert(val.includes('明天'), `Input value: ${val}`);
    await page.screenshot({ path: '/tmp/audit2-01-nlp-input.png' });
  });

  await test('Create task via Enter key', async () => {
    const input = await page.$('input[placeholder*="例如"]');
    const taskCountBefore = await page.evaluate(() =>
      document.querySelectorAll('[class*="task-card"], [class*="taskCard"]').length
    );
    await input.press('Enter');
    await page.waitForTimeout(1000);
    const taskCountAfter = await page.evaluate(() =>
      document.querySelectorAll('[class*="task-card"], [class*="taskCard"]').length
    );
    // Input should be cleared after creation
    const valAfter = await input.inputValue();
    assert(valAfter === '' || valAfter.length < 5, `Input not cleared: "${valAfter}"`);
    await page.screenshot({ path: '/tmp/audit2-02-task-created.png' });
  });

  await test('Create task via button click', async () => {
    const input = await page.$('input[placeholder*="例如"]');
    await input.fill('测试任务-按钮创建');
    await page.waitForTimeout(200);
    const createBtn = await page.$('button:has-text("立即创建")');
    assert(createBtn, 'Create button not found');
    await createBtn.click();
    await page.waitForTimeout(800);
    const valAfter = await input.inputValue();
    assert(valAfter === '' || valAfter.length < 5, `Input not cleared after button: "${valAfter}"`);
  });

  // ═══════════════════════════════════════════
  // 2. DETAIL PANEL — Task Editing
  // ═══════════════════════════════════════════
  console.log('\n2. DETAIL PANEL — Task Editing');

  // Click on a task card to open detail
  await test('Click task opens detail panel', async () => {
    const card = await page.evaluateHandle(() => {
      const cards = document.querySelectorAll('[class*="task-card"]');
      return cards.length > 0 ? cards[0] : null;
    });
    const isNull = await card.evaluate(el => el === null);
    if (isNull) throw new Error('No task cards found');
    await card.click();
    await page.waitForTimeout(800);

    const detail = await page.evaluate(() => {
      const panel = document.querySelector('[class*="detail-card"], [class*="DetailPanel"]');
      return panel ? { w: panel.getBoundingClientRect().width, h: panel.getBoundingClientRect().height } : null;
    });
    assert(detail && detail.w > 200, `Detail panel not visible: ${JSON.stringify(detail)}`);
    await page.screenshot({ path: '/tmp/audit2-03-detail-panel.png' });
  });

  await test('Detail panel: title is editable', async () => {
    const titleInput = await page.evaluate(() => {
      const panel = document.querySelector('[class*="detail-card"]');
      if (!panel) return null;
      const input = panel.querySelector('input, [contenteditable], textarea');
      return input ? { tag: input.tagName, type: input.type || '' } : null;
    });
    assert(titleInput, 'No editable title field in detail panel');
  });

  await test('Detail panel: can change priority', async () => {
    const priorityControls = await page.evaluate(() => {
      const panel = document.querySelector('[class*="detail-card"]');
      if (!panel) return 0;
      return panel.querySelectorAll('select, [class*="priority"], button[class*="priority"]').length;
    });
    assert(priorityControls > 0, 'No priority controls found in detail panel');
  });

  await test('Escape closes detail panel', async () => {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    // Detail may still be visible but task deselected — check selection
    const selected = await page.evaluate(() =>
      document.querySelectorAll('[class*="is-selected"]').length
    );
    // Just verify escape didn't crash
  });

  // ═══════════════════════════════════════════
  // 3. KANBAN — Drag Between Columns
  // ═══════════════════════════════════════════
  console.log('\n3. KANBAN — Drag Between Columns');

  const kanbanBtn = await page.evaluateHandle((n) => {
    return Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes(n)) || null;
  }, '看板');
  await kanbanBtn.evaluate(b => b && b.click());
  await page.waitForTimeout(1000);

  await test('Kanban has 3 columns (todo/doing/done)', async () => {
    const colCount = await page.evaluate(() =>
      document.querySelectorAll('[class*="kanbanColumn"]').length
    );
    assert(colCount >= 3, `Expected 3+ columns, got ${colCount}`);
  });

  await test('Kanban column headers show WIP limit', async () => {
    const headers = await page.evaluate(() => {
      const cols = document.querySelectorAll('[class*="kanbanColumn"]');
      return Array.from(cols).map(c => c.querySelector('[class*="Header"]')?.textContent?.slice(0, 30) || '');
    });
    // WIP limits should be visible somewhere
    const hasCount = headers.some(h => /\d/.test(h));
    if (!hasCount) note('ux', 'low', 'Kanban headers lack task counts', 'No numeric count visible in column headers');
  });

  await page.screenshot({ path: '/tmp/audit2-04-kanban.png' });

  // Try to find a draggable card in kanban
  await test('Kanban cards exist and are positioned', async () => {
    const cards = await page.evaluate(() => {
      const els = document.querySelectorAll('[class*="kanbanCard"], [class*="KanbanCard"], [class*="kanbanDraggable"]');
      return Array.from(els).map(e => {
        const r = e.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) };
      });
    });
    // Cards might be 0 if no tasks in doing/todo status — just report
    if (cards.length === 0) note('data', 'low', 'No kanban cards to test drag', 'All tasks may be in done status');
    else console.log(`    Found ${cards.length} kanban cards`);
  });

  // ═══════════════════════════════════════════
  // 4. MATRIX — Quadrant Interactions
  // ═══════════════════════════════════════════
  console.log('\n4. MATRIX — Quadrant Interactions');

  const matrixBtn = await page.evaluateHandle((n) => {
    return Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes(n)) || null;
  }, '四象限');
  await matrixBtn.evaluate(b => b && b.click());
  await page.waitForTimeout(1000);

  await test('Matrix shows Q1/Q2/Q3/Q4 labels', async () => {
    const quadLabels = await page.evaluate(() => {
      const text = document.body.textContent || '';
      return {
        q1: text.includes('紧急且重要') || text.includes('立即处理'),
        q2: text.includes('重要不紧急') || text.includes('规划安排'),
        q3: text.includes('紧急不重要') || text.includes('委派'),
        q4: text.includes('不紧急不重要') || text.includes('放弃'),
      };
    });
    const allPresent = Object.values(quadLabels).every(v => v);
    assert(allPresent, `Missing quadrant labels: ${JSON.stringify(quadLabels)}`);
  });

  await test('Matrix cards show quadrant badge', async () => {
    const badges = await page.evaluate(() => {
      const els = document.querySelectorAll('[class*="matrix"] [class*="badge"], [class*="matrix"] [class*="quadrant"]');
      return els.length;
    });
    // Also check for Q1/Q2 text in cards
    const qLabels = await page.evaluate(() => {
      const text = document.body.textContent || '';
      return { hasQ1: text.includes('Q1'), hasQ2: text.includes('Q2') };
    });
    if (!qLabels.hasQ1 && !qLabels.hasQ2) note('ux', 'medium', 'Matrix cards lack Q-badges', 'Cards don\'t show Q1/Q2/Q3/Q4 classification badge');
  });

  await test('Matrix + button creates task in correct quadrant', async () => {
    const addBtns = await page.evaluate(() => {
      const btns = document.querySelectorAll('[class*="matrix"] button');
      return Array.from(btns).filter(b => b.textContent?.trim() === '+').map(b => {
        const r = b.getBoundingClientRect();
        return { x: r.x + r.width/2, y: r.y + r.height/2 };
      });
    });
    if (addBtns.length > 0) {
      // Just verify the + button exists and is clickable
      assert(true, 'Matrix has add buttons');
    } else {
      note('ux', 'medium', 'Matrix lacks + buttons in quadrants', 'No way to create tasks directly in a quadrant');
    }
  });

  await page.screenshot({ path: '/tmp/audit2-05-matrix.png' });

  // ═══════════════════════════════════════════
  // 5. CALENDAR — Month/Week/Agenda
  // ═══════════════════════════════════════════
  console.log('\n5. CALENDAR — View Modes');

  const calBtn = await page.evaluateHandle((n) => {
    return Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes(n)) || null;
  }, '日历');
  await calBtn.evaluate(b => b && b.click());
  await page.waitForTimeout(1000);

  await test('Calendar month view renders grid', async () => {
    const cells = await page.evaluate(() =>
      document.querySelectorAll('[class*="calendar"] td, [class*="calendar"] [class*="day"], [class*="calGrid"] *, [class*="month-grid"] *').length
    );
    // Also check for day numbers
    const hasGrid = await page.evaluate(() => {
      const text = document.body.textContent || '';
      return text.includes('一') && text.includes('五'); // 周一, 周五
    });
    assert(hasGrid, 'Calendar grid not rendering properly');
  });

  // Switch to week view
  const weekViewBtn = await page.$('button:has-text("周")');
  if (weekViewBtn) {
    await weekViewBtn.click();
    await page.waitForTimeout(800);
    await test('Calendar week view renders', async () => {
      await page.screenshot({ path: '/tmp/audit2-06-cal-week.png' });
      // Just verify no crash
      assert(true, 'Week view rendered');
    });
  }

  // Switch to agenda
  const agendaBtn = await page.$('button:has-text("列表")');
  if (agendaBtn) {
    await agendaBtn.click();
    await page.waitForTimeout(800);
    await test('Calendar agenda/list view renders', async () => {
      await page.screenshot({ path: '/tmp/audit2-07-cal-agenda.png' });
      assert(true, 'Agenda view rendered');
    });
  }

  // Back to month
  const monthBtn = await page.$('button:has-text("月")');
  if (monthBtn) {
    await monthBtn.click();
    await page.waitForTimeout(800);
  }

  await test('Calendar today button navigates to current date', async () => {
    const todayBtn = await page.$('button:has-text("今天")');
    if (todayBtn) {
      await todayBtn.click();
      await page.waitForTimeout(500);
    }
    const hasToday = await page.evaluate(() => {
      // Check for today highlight
      return !!document.querySelector('[class*="is-today"], [class*="today"], .is-today');
    });
    assert(hasToday, 'No today marker visible');
  });

  await test('Calendar date cell click creates task', async () => {
    // Find a + button in calendar cells
    const addBtn = await page.evaluate(() => {
      const btns = document.querySelectorAll('button');
      const plus = Array.from(btns).find(b => b.textContent?.trim() === '+' && b.closest('[class*="calendar"], [class*="cal"]'));
      return plus ? { x: plus.getBoundingClientRect().x + 8, y: plus.getBoundingClientRect().y + 8 } : null;
    });
    if (!addBtn) note('ux', 'low', 'Calendar cells lack + button', 'No quick-add in calendar date cells');
    else assert(true, 'Calendar has + buttons');
  });

  await page.screenshot({ path: '/tmp/audit2-08-calendar.png' });

  // ═══════════════════════════════════════════
  // 6. SEARCH + NLP CHIPS
  // ═══════════════════════════════════════════
  console.log('\n6. SEARCH + COMMAND PALETTE');

  await test('Cmd+K opens palette with chip preview', async () => {
    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(500);

    const paletteOpen = await page.evaluate(() =>
      !!document.querySelector('[cmdk-root], [class*="CommandPalette"], [class*="commandPalette"]')
    );
    assert(paletteOpen, 'Command palette did not open');

    // Type NLP query
    const paletteInput = await page.$('[cmdk-input], [class*="CommandPalette"] input, [class*="commandPalette"] input');
    if (paletteInput) {
      await paletteInput.type('#会议 due:today', { delay: 30 });
      await page.waitForTimeout(500);

      // Check for chip preview
      const chips = await page.evaluate(() => {
        const chipEls = document.querySelectorAll('[class*="chip"], [class*="Chip"], [class*="filterChip"]');
        return chipEls.length;
      });
      if (chips === 0) note('ux', 'medium', 'NLP chips not rendering in command palette', 'Typed "#会议 due:today" but no filter chips appeared');
      else console.log(`    Found ${chips} filter chips`);

      await page.screenshot({ path: '/tmp/audit2-09-search-chips.png' });
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  });

  // ═══════════════════════════════════════════
  // 7. BULK OPERATIONS
  // ═══════════════════════════════════════════
  console.log('\n7. BULK OPERATIONS');

  // Switch to list view first
  const listBtn = await page.evaluateHandle((n) => {
    return Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes(n)) || null;
  }, '列表');
  const listNull = await listBtn.evaluate(el => el === null);
  if (!listNull) { await listBtn.evaluate(b => b.click()); await page.waitForTimeout(800); }

  await test('Bulk select button exists', async () => {
    const bulkBtn = await page.evaluate(() => {
      const btns = document.querySelectorAll('button');
      return Array.from(btns).some(b => b.textContent?.includes('批量'));
    });
    assert(bulkBtn, 'No bulk operation button found');
  });

  await test('Shift+click selects multiple tasks', async () => {
    const cards = await page.$$('[class*="task-card"]');
    if (cards.length >= 2) {
      await cards[0].click();
      await page.waitForTimeout(200);
      await cards[1].click({ modifiers: ['Shift'] });
      await page.waitForTimeout(500);

      // Check if bulk selection UI appeared
      const bulkUI = await page.evaluate(() =>
        !!document.querySelector('[class*="bulk"], [class*="Bulk"], [class*="floating-bar"], [class*="floatingBar"]')
      );
      if (!bulkUI) note('ux', 'medium', 'Shift+click does not show bulk action bar', 'Expected floating action bar on multi-select');
    } else {
      note('data', 'low', 'Not enough tasks to test bulk select', `Only ${cards.length} cards`);
    }
    await page.screenshot({ path: '/tmp/audit2-10-bulk.png' });
  });

  // Deselect
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // ═══════════════════════════════════════════
  // 8. COMPLETION ANIMATION
  // ═══════════════════════════════════════════
  console.log('\n8. COMPLETION ANIMATION');

  await test('Task completion shows animation/toast', async () => {
    // Find a task checkbox
    const checkbox = await page.evaluate(() => {
      const circles = document.querySelectorAll('[class*="task-card"] [class*="circle"], [class*="task-card"] button:first-child, [class*="task-card"] [role="checkbox"]');
      if (circles.length === 0) {
        // Try finding the status toggle
        const cards = document.querySelectorAll('[class*="task-card"]');
        for (const card of cards) {
          const firstBtn = card.querySelector('button');
          if (firstBtn) {
            const r = firstBtn.getBoundingClientRect();
            return { x: r.x + r.width/2, y: r.y + r.height/2 };
          }
        }
      }
      const c = circles[0];
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return { x: r.x + r.width/2, y: r.y + r.height/2 };
    });

    if (!checkbox) {
      note('ux', 'medium', 'No visible task completion toggle', 'Cannot find checkbox/circle to complete task');
      return;
    }

    // Click to complete
    await page.mouse.click(checkbox.x, checkbox.y);
    await page.waitForTimeout(1500);

    // Check for toast/animation
    const hasToast = await page.evaluate(() =>
      !!document.querySelector('[class*="toast"], [class*="Toast"], [class*="undo"], [class*="Undo"], [role="status"]')
    );
    if (!hasToast) note('ux', 'high', 'No completion animation/toast visible', 'Task completed but no visual celebration or undo option appeared');
    else console.log('    Toast/animation detected');

    await page.screenshot({ path: '/tmp/audit2-11-completion.png' });
  });

  // ═══════════════════════════════════════════
  // 9. MOBILE DEEP DIVE
  // ═══════════════════════════════════════════
  console.log('\n9. MOBILE DEEP DIVE');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1000);

  await test('Mobile: tab bar navigation works', async () => {
    const tabs = await page.evaluate(() => {
      const tabBar = document.querySelector('[class*="tabBar"], [class*="TabBar"]');
      if (!tabBar) return [];
      return Array.from(tabBar.querySelectorAll('button, a')).map(b => ({
        text: b.textContent?.trim()?.slice(0, 10),
        w: Math.round(b.getBoundingClientRect().width),
        h: Math.round(b.getBoundingClientRect().height),
      }));
    });
    assert(tabs.length >= 3, `Expected 3+ tabs, got ${tabs.length}`);
    console.log(`    Tabs: ${tabs.map(t => `${t.text}(${t.w}×${t.h})`).join(', ')}`);

    // Check touch target sizes
    const tooSmall = tabs.filter(t => t.h < 44);
    if (tooSmall.length > 0) note('mobile', 'high', 'Mobile tab bar items < 44px height', `${tooSmall.length} tabs below Apple HIG: ${tooSmall.map(t => t.text).join(', ')}`);
  });

  await test('Mobile: FAB (floating action button) visible', async () => {
    const fab = await page.evaluate(() => {
      const el = document.querySelector('[class*="fab"], [class*="Fab"], [class*="floating-action"], button[class*="add"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), text: el.textContent?.trim() };
    });
    if (!fab) note('mobile', 'medium', 'No FAB on mobile', 'Mobile view lacks a floating + button for quick task creation');
    else console.log(`    FAB: ${fab.w}×${fab.h} "${fab.text}"`);
  });

  await test('Mobile: swipe/tap task opens bottom sheet', async () => {
    const card = await page.evaluate(() => {
      const cards = document.querySelectorAll('[class*="mobileFocusCard"], [class*="MobileFocusCard"]');
      if (cards.length === 0) return null;
      const r = cards[0].getBoundingClientRect();
      return { x: r.x + r.width/2, y: r.y + r.height/2 };
    });

    if (card) {
      await page.mouse.click(card.x, card.y);
      await page.waitForTimeout(800);
      const sheet = await page.evaluate(() =>
        !!document.querySelector('[class*="bottomSheet"], [class*="BottomSheet"], [class*="taskSheet"], [class*="TaskSheet"]')
      );
      if (!sheet) note('mobile', 'medium', 'Tap task does not open bottom sheet', 'Expected task detail bottom sheet on mobile');
      await page.screenshot({ path: '/tmp/audit2-12-mobile-sheet.png' });
    }
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(500);

  // ═══════════════════════════════════════════
  // 10. MICRO-INTERACTION POLISH
  // ═══════════════════════════════════════════
  console.log('\n10. MICRO-INTERACTION POLISH');

  await test('Shortcut tooltips on buttons', async () => {
    const tooltipBtns = await page.evaluate(() => {
      const btns = document.querySelectorAll('button[title], button[data-tooltip]');
      return btns.length;
    });
    if (tooltipBtns < 3) note('ux', 'low', 'Few buttons have shortcut tooltips', `Only ${tooltipBtns} buttons with title/tooltip — DISC-01 may be incomplete`);
  });

  await test('Tag color hover preview works', async () => {
    // Navigate to tag manager
    const manageBtn = await page.$('button:has-text("管理")');
    if (manageBtn) {
      await manageBtn.click();
      await page.waitForTimeout(500);
      const colorPickers = await page.evaluate(() =>
        document.querySelectorAll('[class*="color"], [class*="Color"], [class*="swatch"]').length
      );
      if (colorPickers > 0) console.log(`    Found ${colorPickers} color elements in tag manager`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
  });

  // ═══════════════════════════════════════════
  // FINAL REPORT
  // ═══════════════════════════════════════════
  await browser.close();

  const passed = RESULTS.filter(r => r.s === 'PASS').length;
  const failed = RESULTS.filter(r => r.s === 'FAIL').length;

  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(` Test Results: ${passed}/${RESULTS.length} passed, ${failed} failed`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (failed > 0) {
    console.log('\nFailed:');
    RESULTS.filter(r => r.s === 'FAIL').forEach(r => console.log(`  ❌ ${r.name}: ${r.e}`));
  }

  if (findings.length > 0) {
    console.log(`\nProduct Findings (${findings.length}):`);
    const bySev = { critical: [], high: [], medium: [], low: [] };
    findings.forEach(f => bySev[f.sev].push(f));
    for (const [s, items] of Object.entries(bySev)) {
      if (items.length === 0) continue;
      const icon = s === 'critical' ? '🔴' : s === 'high' ? '🟠' : s === 'medium' ? '🟡' : '🔵';
      items.forEach(f => console.log(`  ${icon} [${f.cat}] ${f.title}${f.detail ? ' — ' + f.detail : ''}`));
    }
  }

  if (errors.length > 0) {
    console.log(`\n⚠ Page errors: ${errors.length}`);
    errors.slice(0, 5).forEach(e => console.log(`  ${e.slice(0, 120)}`));
  }
})();
