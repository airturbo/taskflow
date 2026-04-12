# Role Handoff RS-20260410-001 → frontend_engineer

- workflow_id: `WF-20260410-001`
- from_role: `project_manager_orchestrator`
- to_role: `frontend_engineer`
- intent: `修复 TaskFlow 移动端 4 个 UI bug 并由体验官走查 5 轮`

## Summary

## 任务摘要  修复用户报告的 4 个移动端 UI 问题，改动范围限于 `web/src/App.tsx` 和 `web/src/index.css`。  ## Bug 清单  ### Bug 1：象限视图卡片太大 - **现象**：标签 chips（#产品 #设计 #深度工作）、优先级标记（P1）、状态下拉（进行中）都显示了，导致卡片很肥 - **修复**：手机端象限卡片隐藏所有标签 chips、优先级标记、状态下拉、添加按钮，只保留标题和时间 - **CSS 选择器**

## Content

## 任务摘要

修复用户报告的 4 个移动端 UI 问题，改动范围限于 `web/src/App.tsx` 和 `web/src/index.css`。

## Bug 清单

### Bug 1：象限视图卡片太大
- **现象**：标签 chips（#产品 #设计 #深度工作）、优先级标记（P1）、状态下拉（进行中）都显示了，导致卡片很肥
- **修复**：手机端象限卡片隐藏所有标签 chips、优先级标记、状态下拉、添加按钮，只保留标题和时间
- **CSS 选择器**：`.is-phone .matrix-quadrant .task-card` 作用域下隐藏非标题元素

### Bug 2：看板视图卡片太小
- **现象**：看板卡片只显示时间，标题完全看不到
- **修复**：看板卡片必须同时显示标题和时间，标题在上、时间在下
- **CSS**：确保 `.is-phone .kanban-card h4` 不被 `display: none`，font-size 10-11px

### Bug 3：月历视图无法展示（严重 Bug）
- **现象**：日历 Tab 切到月历时页面空白，完全无法展示日期格子
- **根因排查方向**：检查 `calendarMode === 'month'` 分支在手机端的渲染逻辑，可能条件判断错误或 CSS 隐藏了月历
- **修复**：确保月历视图在手机端正确渲染，格子 36px 高，选中日期下方展示当日任务列表

### Bug 4：操作记录通知影响布局
- **现象**：创建任务后弹出 "已创建 xxx" 的确认框，占据大面积空间，有"知道了"按钮
- **修复**：改为底部轻量浮层 toast（固定底部、高度 40-48px、3 秒自动消失、不影响页面布局）
- **注意**：之前已经对 `statusChangeFeedback` 做了手机端隐藏，但可能还有其他反馈组件

## 约束
- 不破坏桌面端
- 所有改动仅在 `isPhoneViewport` / `.is-phone` 下生效
- 完成后 `npm run build:web` 构建通过
