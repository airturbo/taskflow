/**
 * TaskFlow — Jobs-level Product Audit
 *
 * Simulate a demanding user experiencing every view, interaction,
 * and micro-detail. Capture screenshots, measure timings, note
 * visual issues, interaction friction, and delight gaps.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173/';
const findings = [];

function note(category, severity, title, detail) {
  findings.push({ category, severity, title, detail });
  const icon = severity === 'critical' ? '🔴' : severity === 'high' ? '🟠' : severity === 'medium' ? '🟡' : '🔵';
  console.log(`  ${icon} [${severity.toUpperCase()}] ${title}`);
  if (detail) console.log(`    → ${detail}`);
}

async function screenshot(page, name) {
  await page.screenshot({ path: `/tmp/audit-${name}.png`, fullPage: false });
}

(async () => {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' TaskFlow — Product Audit (Jobs Mode)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));

  // ═══════════════════════════════════════════
  // 1. FIRST IMPRESSION — Landing & Load
  // ═══════════════════════════════════════════
  console.log('1. FIRST IMPRESSION');
  const loadStart = Date.now();
  await page.goto(BASE);
  await page.waitForTimeout(2000);
  const loadTime = Date.now() - loadStart;
  console.log(`  Load time: ${loadTime}ms`);
  if (loadTime > 3000) note('performance', 'high', 'Slow initial load', `${loadTime}ms — should be under 2s`);

  await screenshot(page, '01-first-impression');

  // Check visual hierarchy
  const firstImpression = await page.evaluate(() => {
    const body = document.body;
    const cs = getComputedStyle(body);
    const sidebar = document.querySelector('[class*="sidebar"], [class*="Sidebar"]');
    const sidebarW = sidebar ? sidebar.getBoundingClientRect().width : 0;
    const main = document.querySelector('[class*="main-stage"], [class*="mainStage"]');
    const mainW = main ? main.getBoundingClientRect().width : 0;

    // Check for visual noise — count distinct visible elements in viewport
    const allVisible = document.querySelectorAll('button, a, span, div, strong, small');
    let visibleCount = 0;
    for (const el of allVisible) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.top < window.innerHeight && r.bottom > 0) visibleCount++;
    }

    // Check text contrast
    const textEls = document.querySelectorAll('strong, span, p, h1, h2, h3, small, button');
    let lowContrast = 0;
    for (const el of textEls) {
      const s = getComputedStyle(el);
      const color = s.color;
      if (color.includes('rgb')) {
        const match = color.match(/\d+/g);
        if (match) {
          const [r, g, b] = match.map(Number);
          const luminance = (0.299 * r + 0.587 * g + 0.114 * b);
          if (luminance > 40 && luminance < 90) lowContrast++; // dim text on dark bg
        }
      }
    }

    // Check font sizes
    const fontSizes = new Set();
    for (const el of textEls) {
      fontSizes.add(getComputedStyle(el).fontSize);
    }

    // Check for overlapping/clipped elements
    const buttons = document.querySelectorAll('button');
    let truncated = 0;
    for (const btn of buttons) {
      if (btn.scrollWidth > btn.clientWidth + 2) truncated++;
    }

    return {
      sidebarW: Math.round(sidebarW),
      mainW: Math.round(mainW),
      visibleElements: visibleCount,
      lowContrastTexts: lowContrast,
      fontSizeVariants: fontSizes.size,
      fontSizes: [...fontSizes].sort(),
      truncatedButtons: truncated,
      windowW: window.innerWidth,
      windowH: window.innerHeight,
    };
  });

  console.log(`  Sidebar: ${firstImpression.sidebarW}px, Main: ${firstImpression.mainW}px`);
  console.log(`  Visible elements: ${firstImpression.visibleElements}`);
  console.log(`  Font size variants: ${firstImpression.fontSizeVariants} (${firstImpression.fontSizes.join(', ')})`);

  if (firstImpression.fontSizeVariants > 8)
    note('visual', 'medium', 'Too many font size variants', `${firstImpression.fontSizeVariants} sizes — Things 3 uses 4-5 max`);
  if (firstImpression.truncatedButtons > 0)
    note('visual', 'high', 'Truncated button text', `${firstImpression.truncatedButtons} buttons have clipped text`);
  if (firstImpression.lowContrastTexts > 20)
    note('visual', 'medium', 'Many low-contrast text elements', `${firstImpression.lowContrastTexts} texts may be hard to read`);

  // ═══════════════════════════════════════════
  // 2. SIDEBAR — Navigation Architecture
  // ═══════════════════════════════════════════
  console.log('\n2. SIDEBAR NAVIGATION');

  const sidebarInfo = await page.evaluate(() => {
    const navBtns = document.querySelectorAll('.nav-button');
    const items = [];
    for (const btn of navBtns) {
      const r = btn.getBoundingClientRect();
      items.push({
        text: btn.textContent?.trim()?.slice(0, 30),
        h: Math.round(r.height),
        hasIcon: /[◎☀↗📥✓🗑🔥🗓📊]/.test(btn.textContent || ''),
      });
    }

    // Check spacing consistency
    const gaps = [];
    for (let i = 1; i < navBtns.length; i++) {
      const prev = navBtns[i-1].getBoundingClientRect();
      const curr = navBtns[i].getBoundingClientRect();
      gaps.push(Math.round(curr.top - prev.bottom));
    }

    return { items, gaps, uniqueGaps: [...new Set(gaps)] };
  });

  console.log(`  Nav items: ${sidebarInfo.items.length}`);
  console.log(`  Spacing gaps: ${sidebarInfo.uniqueGaps.join(', ')}px`);

  if (sidebarInfo.uniqueGaps.length > 3)
    note('visual', 'medium', 'Inconsistent nav spacing', `${sidebarInfo.uniqueGaps.length} different gap sizes — should be 1-2`);

  if (sidebarInfo.items.length > 10)
    note('ux', 'medium', 'Sidebar information density', `${sidebarInfo.items.length} nav items visible — consider grouping/collapsing`);

  await screenshot(page, '02-sidebar');

  // ═══════════════════════════════════════════
  // 3. EACH VIEW — Visual Quality Check
  // ═══════════════════════════════════════════
  console.log('\n3. VIEW-BY-VIEW AUDIT');

  const viewChecks = [
    { name: '日历', slug: 'calendar' },
    { name: '看板', slug: 'kanban' },
    { name: '时间线', slug: 'timeline' },
    { name: '四象限', slug: 'matrix' },
    { name: '统计', slug: 'stats' },
  ];

  for (const view of viewChecks) {
    console.log(`\n  ── ${view.name} ──`);
    const btn = await page.evaluateHandle((name) => {
      const all = document.querySelectorAll('button, [role="button"]');
      return Array.from(all).find(b => b.textContent?.includes(name)) || null;
    }, view.name);
    const isNull = await btn.evaluate(el => el === null);
    if (isNull) { console.log('    ⚠ View button not found'); continue; }

    await btn.click();
    await page.waitForTimeout(1000);

    const viewAudit = await page.evaluate(() => {
      // Check alignment
      const main = document.querySelector('[class*="main-stage"], [class*="view-stack"]');
      if (!main) return { error: 'no main container' };

      const children = main.querySelectorAll('*');
      let misaligned = 0;
      const leftEdges = new Set();

      for (const child of children) {
        const r = child.getBoundingClientRect();
        if (r.width > 50 && r.height > 20 && r.left > 0) {
          leftEdges.add(Math.round(r.left));
        }
      }

      // Check for empty states
      const hasEmpty = !!document.querySelector('[class*="empty"], [class*="Empty"]');

      // Check scrollbars
      const scrollables = document.querySelectorAll('*');
      let unexpectedScroll = 0;
      for (const el of scrollables) {
        if (el.scrollHeight > el.clientHeight + 5 && el.clientHeight > 100) {
          const cs = getComputedStyle(el);
          if (cs.overflow === 'visible' || cs.overflowY === 'visible') unexpectedScroll++;
        }
      }

      // Check for pixel-level issues
      const images = document.querySelectorAll('img');
      let blurryImages = 0;
      for (const img of images) {
        if (img.naturalWidth < img.clientWidth * 1.5) blurryImages++;
      }

      // Measure whitespace ratio
      const viewRect = main.getBoundingClientRect();

      return {
        leftEdgeVariants: leftEdges.size,
        hasEmpty,
        unexpectedScroll,
        blurryImages,
        viewW: Math.round(viewRect.width),
        viewH: Math.round(viewRect.height),
      };
    });

    if (viewAudit.error) { console.log(`    ⚠ ${viewAudit.error}`); continue; }

    console.log(`    View size: ${viewAudit.viewW}×${viewAudit.viewH}`);

    if (viewAudit.leftEdgeVariants > 6)
      note('visual', 'medium', `${view.name}: Alignment inconsistency`, `${viewAudit.leftEdgeVariants} different left edges — poor grid alignment`);
    if (viewAudit.unexpectedScroll > 0)
      note('visual', 'low', `${view.name}: Unexpected scrollable areas`, `${viewAudit.unexpectedScroll} elements overflow without proper scroll handling`);

    await screenshot(page, `03-${view.slug}`);
  }

  // ═══════════════════════════════════════════
  // 4. INTERACTION MICRO-DETAILS
  // ═══════════════════════════════════════════
  console.log('\n\n4. INTERACTION MICRO-DETAILS');

  // 4a. Hover states — do buttons respond?
  const hoverTest = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    let noHoverTransition = 0;
    for (const btn of buttons) {
      const cs = getComputedStyle(btn);
      const transition = cs.transition || cs.webkitTransition || '';
      if (!transition.includes('background') && !transition.includes('all') && !transition.includes('color') && !transition.includes('opacity') && !transition.includes('transform')) {
        if (btn.getBoundingClientRect().width > 20) noHoverTransition++;
      }
    }
    return { total: buttons.length, noTransition: noHoverTransition };
  });

  console.log(`  Buttons: ${hoverTest.total} total, ${hoverTest.noTransition} without hover transition`);
  if (hoverTest.noTransition > 10)
    note('polish', 'medium', 'Buttons lack hover feedback', `${hoverTest.noTransition} buttons have no transition — feels unresponsive`);

  // 4b. Focus states — keyboard accessibility
  await page.keyboard.press('Tab');
  await page.waitForTimeout(200);
  const focusVisible = await page.evaluate(() => {
    const focused = document.activeElement;
    if (!focused || focused === document.body) return { hasFocus: false };
    const cs = getComputedStyle(focused);
    const outline = cs.outline || cs.outlineStyle;
    const boxShadow = cs.boxShadow;
    const hasFocusRing = (outline && outline !== 'none' && !outline.includes('0px')) ||
                          (boxShadow && boxShadow !== 'none');
    return { hasFocus: true, hasFocusRing, element: focused.tagName + '.' + focused.className?.toString()?.slice(0, 30) };
  });

  if (focusVisible.hasFocus && !focusVisible.hasFocusRing)
    note('a11y', 'high', 'No visible focus indicator', `Tab-focused element has no outline/ring: ${focusVisible.element}`);

  // 4c. Touch targets — check minimum sizes
  const touchTargets = await page.evaluate(() => {
    const interactive = document.querySelectorAll('button, a, input, [role="button"]');
    let tooSmall = 0;
    const smallOnes = [];
    for (const el of interactive) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && (r.width < 32 || r.height < 32)) {
        tooSmall++;
        if (smallOnes.length < 5) {
          smallOnes.push(`${el.tagName}(${Math.round(r.width)}×${Math.round(r.height)}) "${el.textContent?.trim()?.slice(0,15)}"`);
        }
      }
    }
    return { total: interactive.length, tooSmall, examples: smallOnes };
  });

  if (touchTargets.tooSmall > 5)
    note('ux', 'medium', 'Small touch targets', `${touchTargets.tooSmall} elements < 32px: ${touchTargets.examples.join(', ')}`);

  // ═══════════════════════════════════════════
  // 5. ANIMATION & MOTION
  // ═══════════════════════════════════════════
  console.log('\n5. ANIMATION & MOTION');

  // Switch views and measure transition smoothness
  const viewSwitchBtns = ['日历', '看板', '时间线'];
  for (const v of viewSwitchBtns) {
    const b = await page.evaluateHandle((name) => {
      const all = document.querySelectorAll('button');
      return Array.from(all).find(b => b.textContent?.includes(name)) || null;
    }, v);
    const isN = await b.evaluate(el => el === null);
    if (isN) continue;

    const t0 = Date.now();
    await b.click();
    await page.waitForTimeout(500);
    const switchTime = Date.now() - t0;

    if (switchTime > 400)
      note('performance', 'low', `Slow view switch to ${v}`, `${switchTime}ms — should feel instant (<200ms)`);
  }

  // ═══════════════════════════════════════════
  // 6. MOBILE EXPERIENCE
  // ═══════════════════════════════════════════
  console.log('\n6. MOBILE EXPERIENCE');
  await page.setViewportSize({ width: 390, height: 844 }); // iPhone 14 Pro
  await page.waitForTimeout(1000);

  const mobileAudit = await page.evaluate(() => {
    // Check if content overflows horizontally
    const hasHScroll = document.documentElement.scrollWidth > document.documentElement.clientWidth;

    // Check touch target sizes
    const btns = document.querySelectorAll('button, a, [role="button"]');
    let tinyTargets = 0;
    for (const b of btns) {
      const r = b.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.height < 44) tinyTargets++;
    }

    // Check text readability
    const texts = document.querySelectorAll('span, p, strong, small');
    let tinyText = 0;
    for (const t of texts) {
      const fs = parseFloat(getComputedStyle(t).fontSize);
      if (fs < 12 && t.getBoundingClientRect().width > 0) tinyText++;
    }

    // Check bottom safe area
    const tabBar = document.querySelector('[class*="tabBar"], [class*="TabBar"]');
    const tabBarBottom = tabBar ? tabBar.getBoundingClientRect().bottom : 0;
    const viewportH = window.innerHeight;

    return { hasHScroll, tinyTargets, tinyText, tabBarBottom: Math.round(tabBarBottom), viewportH };
  });

  if (mobileAudit.hasHScroll)
    note('mobile', 'critical', 'Horizontal scroll on mobile', 'Content overflows viewport — broken responsive layout');
  if (mobileAudit.tinyTargets > 5)
    note('mobile', 'high', 'Mobile touch targets < 44px', `${mobileAudit.tinyTargets} elements below Apple HIG minimum`);
  if (mobileAudit.tinyText > 10)
    note('mobile', 'medium', 'Tiny text on mobile', `${mobileAudit.tinyText} text elements < 12px`);

  await screenshot(page, '06-mobile');

  // Restore desktop
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(500);

  // ═══════════════════════════════════════════
  // 7. DETAIL PANEL — Task Editing UX
  // ═══════════════════════════════════════════
  console.log('\n7. TASK DETAIL PANEL');

  // Click on a task to open detail
  const taskCard = await page.evaluateHandle(() => {
    const cards = document.querySelectorAll('[class*="task-card"], [class*="taskCard"], [class*="FocusCard"]');
    return cards[0] || null;
  });
  const taskNull = await taskCard.evaluate(el => el === null);
  if (!taskNull) {
    await taskCard.click();
    await page.waitForTimeout(800);

    const detailAudit = await page.evaluate(() => {
      const panel = document.querySelector('[class*="detail-card"], [class*="DetailPanel"], [class*="detail"]');
      if (!panel) return { found: false };

      const r = panel.getBoundingClientRect();
      const inputs = panel.querySelectorAll('input, textarea, select, [contenteditable]');
      const buttons = panel.querySelectorAll('button');

      return {
        found: true,
        width: Math.round(r.width),
        height: Math.round(r.height),
        inputCount: inputs.length,
        buttonCount: buttons.length,
      };
    });

    if (detailAudit.found) {
      console.log(`  Panel: ${detailAudit.width}×${detailAudit.height}, ${detailAudit.inputCount} inputs, ${detailAudit.buttonCount} buttons`);
      if (detailAudit.width < 300)
        note('ux', 'high', 'Detail panel too narrow', `${detailAudit.width}px — insufficient editing space`);
    }

    await screenshot(page, '07-detail');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // ═══════════════════════════════════════════
  // 8. VISUAL CONSISTENCY SCAN
  // ═══════════════════════════════════════════
  console.log('\n8. VISUAL CONSISTENCY');

  const consistency = await page.evaluate(() => {
    // Collect all border-radius values
    const radii = new Map();
    const borders = new Map();
    const shadows = new Map();
    const paddings = new Map();

    const allEls = document.querySelectorAll('button, div, section, article, [class*="card"], [class*="panel"]');
    for (const el of allEls) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) continue;

      const br = cs.borderRadius;
      if (br && br !== '0px') radii.set(br, (radii.get(br) || 0) + 1);

      const bs = cs.boxShadow;
      if (bs && bs !== 'none') shadows.set(bs.slice(0, 40), (shadows.get(bs.slice(0, 40)) || 0) + 1);
    }

    return {
      borderRadiusVariants: radii.size,
      topRadii: [...radii.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} (×${v})`),
      shadowVariants: shadows.size,
    };
  });

  console.log(`  Border-radius variants: ${consistency.borderRadiusVariants}`);
  console.log(`  Top radii: ${consistency.topRadii.join(', ')}`);
  console.log(`  Box-shadow variants: ${consistency.shadowVariants}`);

  if (consistency.borderRadiusVariants > 6)
    note('visual', 'medium', 'Too many border-radius values', `${consistency.borderRadiusVariants} variants — Things 3 uses 2-3`);
  if (consistency.shadowVariants > 5)
    note('visual', 'low', 'Many shadow variants', `${consistency.shadowVariants} — consider consolidating to 2-3 elevation levels`);

  // ═══════════════════════════════════════════
  // FINAL REPORT
  // ═══════════════════════════════════════════
  await browser.close();

  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' PRODUCT AUDIT REPORT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const bySeverity = { critical: [], high: [], medium: [], low: [] };
  findings.forEach(f => bySeverity[f.severity].push(f));

  for (const [sev, items] of Object.entries(bySeverity)) {
    if (items.length === 0) continue;
    const icon = sev === 'critical' ? '🔴' : sev === 'high' ? '🟠' : sev === 'medium' ? '🟡' : '🔵';
    console.log(`${icon} ${sev.toUpperCase()} (${items.length}):`);
    items.forEach(f => {
      console.log(`  • [${f.category}] ${f.title}`);
      if (f.detail) console.log(`    ${f.detail}`);
    });
    console.log();
  }

  console.log(`Total findings: ${findings.length} (${bySeverity.critical.length} critical, ${bySeverity.high.length} high, ${bySeverity.medium.length} medium, ${bySeverity.low.length} low)`);
  console.log(`\nScreenshots saved to /tmp/audit-*.png`);

  if (consoleErrors.length > 0) {
    console.log(`\n⚠ Console errors during audit: ${consoleErrors.length}`);
    consoleErrors.slice(0, 5).forEach(e => console.log(`  ${e}`));
  }
})();
