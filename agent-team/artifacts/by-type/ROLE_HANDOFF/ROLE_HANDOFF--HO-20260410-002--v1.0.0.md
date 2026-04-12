# Role Handoff RS-20260410-002 → user_experience_officer

- workflow_id: `WF-20260410-001`
- from_role: `frontend_engineer`
- to_role: `user_experience_officer`
- intent: `前端修复完成，请体验官走查 5 轮`

## Summary

# FRONTEND_DELIVERY_NOTE  ## 已修复 Bug  ### Bug 1：象限卡片太大 - **根因**：CSS 隐藏规则不全，`select`（状态下拉）、`.tag-list`、`.priority-indicator`、`footer`、`.action-row` 等元素未被隐藏 - **修复**：扩展 `.is-phone .matrix-quadrant .task-card` 作用域下的隐藏规则，新增 `.tag-list`/`.tag-ch

## Content

# FRONTEND_DELIVERY_NOTE

## 已修复 Bug

### Bug 1：象限卡片太大
- **根因**：CSS 隐藏规则不全，`select`（状态下拉）、`.tag-list`、`.priority-indicator`、`footer`、`.action-row` 等元素未被隐藏
- **修复**：扩展 `.is-phone .matrix-quadrant .task-card` 作用域下的隐藏规则，新增 `.tag-list`/`.tag-chip`/`.priority-indicator`/`footer`/`.action-row`/`.subtask-summary`/`.note-preview`，全部用 `display: none !important`
- **象限 + 添加按钮**：`.matrix-create-card` 已隐藏（FAB 替代）

### Bug 2：看板卡片只有时间没标题
- **根因**：`.kanban-card__title-row` 和 `h4` CSS 规则正确但 `min-height: 20px` 过小导致内容被截断
- **修复**：min-height 调至 36px，`h4` 用 `display: block !important`，`.kanban-card__title-row` 用 `display: flex !important`，标题 order:1 时间 order:2 确保标题在上

### Bug 3：月历视图空白
- **根因**：`@media (max-width: 680px)` 中 `.calendar-grid.month` 设了 `grid-template-columns: repeat(7, minmax(120px, 1fr))`，7列 × 120px = 840px 远超手机宽度，加上 `.calendar-grid.month { grid-auto-rows: minmax(120px, 1fr) }` 每行 120px 高，导致月历内容溢出被 `overflow: hidden` 隐藏
- **修复**：新增 `.is-phone .calendar-grid.month` 规则用 `!important` 覆盖为 `repeat(7, 1fr)`、`grid-auto-rows: auto`、`overflow-x: hidden`

### Bug 4：操作通知影响布局
- **根因**：`createFeedback` 组件（`.quick-feedback`）在手机端虽有 CSS toast 样式但 `height: 48px` 被内容撑开
- **修复**：改用 `max-height: 48px !important; overflow: hidden !important`，添加 `toast-fade-out` 动画 2.7s 后淡出，JS 中 `isPhoneViewport` 时 3 秒后 `setCreateFeedback(null)`

## 待回答问题
1. 月历为何空白？→ CSS `minmax(120px, 1fr)` 导致 7 列最小宽 840px 超屏幕，被 overflow 隐藏
2. 除 statusChangeFeedback 外还有什么？→ `createFeedback`（`.quick-feedback`）是主要的另一个反馈组件

## 已知限制
- 象限卡片隐藏了所有非标题内容，如果用户希望在象限中快速看到优先级，需要改为用左边框色条（已有 CSS）替代标签
- 月历格子强制 `1fr` 等分后，极长月份（6行）在小屏上格子会很小

## 给体验官的验收建议
1. 打开象限 Tab → 确认卡片只有标题+时间，无标签/优先级/状态下拉/添加按钮
2. 切到看板 → 确认每张卡片都有标题（上）+时间（下），三列可见
3. 切到日历 Tab → 顶栏切到月历 → 确认完整月历格子渲染，可点选日期
4. 在任何 Tab 用 FAB 创建任务 → 确认反馈是底部浮层 toast（48px 高、3秒消失、不影响布局）
5. 确认桌面端以上功能不受影响
