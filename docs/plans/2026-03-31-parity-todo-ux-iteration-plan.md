# Parity Todo UX Iteration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 按首轮体验报告修复待办管理工具的关键断点，连续完成至少 3 轮“修复 → 复审 → 再修复”，把体验评分提升到 9 分以上后再交付。

**Architecture:** 继续沿用 `web/src/App.tsx` 单文件工作台架构与 `localStorage` 状态持久化，不重做数据模型；本轮重点通过统一任务可见性规则、补强创建反馈与专注同步、增强稀疏场景视图信息承载，并扩展浏览自动化覆盖已完成 / 回收站 / 标签 / 智能清单等次级路径。体验闭环以正式 UX 制品和浏览证据为准。

**Tech Stack:** React 19, TypeScript, Vite, localStorage, Playwright

---

### Task 1: 收口核心可信度问题（快速创建、上下文保持、完成口径、专注同步）

**Files:**
- Modify: `web/src/utils/smart-entry.ts`
- Modify: `web/src/App.tsx`
- Modify: `web/src/index.css`

**Step 1: 修 smart entry 解析**
- 让“今天晚上 9 点体验官走查”被解析为标题“体验官走查”、`dueAt=当天 21:00`。
- 处理“点”字、分钟、省略分钟、尾部标点清理，避免标题残词。

**Step 2: 改创建后的上下文策略**
- 保留当前 `activeSelection` 和 `currentView`，不再强制跳去所属清单。
- 新增明确反馈：展示“已创建到哪个清单 / 是否留在当前工作区 / 是否当前可见”。

**Step 3: 统一 completed 过滤口径**
- 行动视图（今日 / 最近 7 天 / 收件箱 / 普通清单 / 标签 / 智能清单）默认只展示未完成项。
- `countsBySelection` 与 `visibleTasks` 使用同一套规则，避免左栏与主区互相打架。

**Step 4: 对齐专注任务来源**
- “开始专注”与“番茄专注”入口优先使用当前 `selectedTaskId`。
- 右栏和主区都要说同一条任务；必要时增加显式“跟随当前任务”提示。

**Step 5: 本轮验证**
- Run: `cd /Users/turbo/WorkBuddy/20260330162606/web && npm run build`
- Run: `cd /Users/turbo/WorkBuddy/20260330162606/.workbuddy/browser-audit && PLAYWRIGHT_BROWSERS_PATH='/Users/turbo/WorkBuddy/20260330162606/.workbuddy/browser-audit/ms-playwright' node ux-review-runner.mjs > results/runner-output-round1.json`
- Expected: build 通过；快速创建、上下文保持、完成口径、专注任务来源问题关闭或显著改善。

### Task 2: 提升多视图在低密度场景下的成熟感

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/index.css`

**Step 1: 为日历 / 时间线 / 四象限补摘要层**
- 提供当前范围摘要、任务总量、最近下一项、负荷分布等信息。
- 少任务时避免只剩大片空白。

**Step 2: 为稀疏状态补引导与填充**
- 当任务数过少时，显示可执行建议、当前节奏和空态解释。
- 保持视觉密度，避免“演示骨架感”。

**Step 3: 校准视图切换后的任务定位**
- 点击摘要、卡片、时间线条后仍能稳定联动右栏详情。

**Step 4: 本轮验证**
- Run: `cd /Users/turbo/WorkBuddy/20260330162606/web && npm run build`
- Run: `cd /Users/turbo/WorkBuddy/20260330162606/.workbuddy/browser-audit && PLAYWRIGHT_BROWSERS_PATH='/Users/turbo/WorkBuddy/20260330162606/.workbuddy/browser-audit/ms-playwright' node ux-review-runner.mjs > results/runner-output-round2.json`
- Expected: 日历 / 时间线 / 四象限在低任务量场景下仍有信息承载和下一步指引。

### Task 3: 补齐发布前体验门禁覆盖缺口

**Files:**
- Modify: `.workbuddy/browser-audit/ux-review-runner.mjs`
- Modify: `web/src/App.tsx`（如补测暴露新问题）
- Modify: `web/src/index.css`（如需补状态表达）

**Step 1: 扩展自动化走查脚本**
- 加入已完成、回收站恢复、标签筛选、智能清单、搜索叠加、跨视图上下文保持。
- 输出结构化结果，沉淀新截图证据。

**Step 2: 按补测结果继续修正**
- 若次级路径仍出现断点，立即收口，不把缺口留到最终报告。

**Step 3: 至少完成第 3 轮复审**
- 以“修完继续体验，体验有问题继续修”为准，必要时进入第 4 轮。

**Step 4: 本轮验证**
- Run: `cd /Users/turbo/WorkBuddy/20260330162606/web && npm run build`
- Run: `cd /Users/turbo/WorkBuddy/20260330162606/.workbuddy/browser-audit && PLAYWRIGHT_BROWSERS_PATH='/Users/turbo/WorkBuddy/20260330162606/.workbuddy/browser-audit/ms-playwright' node ux-review-runner.mjs > results/runner-output-round3.json`
- Expected: release scope 覆盖矩阵无 blocked 项；最终评分达到 9.0+。

### Task 4: 产出正式复审与项目经理协调结论

**Files:**
- Create/Modify: `.agent-team/artifacts/by-type/UX_COVERAGE_MATRIX/UX_COVERAGE_MATRIX--ART-UX_COVERAGE_MATRIX-0002--v2.0.0.md`
- Create/Modify: `.agent-team/artifacts/by-type/UX_ISSUE_LOG/UX_ISSUE_LOG--ART-UX_ISSUE_LOG-0002--v2.0.0.md`
- Create/Modify: `.agent-team/artifacts/by-type/UX_REVIEW_REPORT/UX_REVIEW_REPORT--ART-UX_REVIEW_REPORT-0002--v2.0.0.md`
- Create: `docs/pm/2026-03-31-parity-todo-ux-iteration-summary.md`

**Step 1: 更新覆盖矩阵**
- 明确所有 release scope 功能已完成 Trigger / Interaction / Result 覆盖。

**Step 2: 更新问题日志**
- 标注各问题在 round1 / round2 / round3 的关闭过程与残余风险。

**Step 3: 更新体验评审报告**
- 给出最终评分、是否放行、9 分以上的依据。

**Step 4: 输出项目经理协调总结**
- 总结每轮目标、动作、责任归属、复审结果与最终结论。
