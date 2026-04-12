# 2026-04-08 第二批 DDL 能力收口摘要

## 本轮完成

1. **日历里的 DDL 风险标识**
   - `web/src/App.tsx`
     - 月视图任务 chip 补了 DDL risk dot。
     - 周视图 `day-task` 与 agenda `agenda-item` 补了 DDL 风险 badge。
   - `web/src/index.css`
     - 新增 `task-deadline-dot`、`task-deadline-indicators`、`time-badge.is-deadline` 等样式。

2. **时间线里的 DDL marker**
   - `web/src/App.tsx`
     - 时间线标题区新增紧凑 DDL badge。
     - 时间线 lane 内新增垂直 `timeline-deadline-marker`，且风险高亮改为按 DDL 优先判断。
   - `web/src/index.css`
     - 新增 `timeline-title__meta` 与 `timeline-deadline-marker` 样式，marker 不抢拖拽事件。

3. **提醒引擎文案与到期触发切到 DDL 优先**
   - `web/src/utils/reminder-engine.ts`
     - 相对提醒 anchor 改为 `DDL > 计划完成 > 开始时间`。
     - 相对提醒文案显式标注“按 DDL / 按计划”。
     - 到期事件改为 `DDL 到期` 优先，body 改为“硬性 DDL 已到”。
   - `web/src/App.tsx`
     - 提醒面板空态文案同步到 DDL 优先语义。

## 构建验证

已通过：

- `cd /Users/turbo/WorkBuddy/20260330162606/web && npm run build`
- `cd /Users/turbo/WorkBuddy/20260330162606/web && npm run desktop:build`

产物：

- `/Users/turbo/WorkBuddy/20260330162606/web/dist/`
- `/Users/turbo/WorkBuddy/20260330162606/web/src-tauri/target/release/bundle/macos/Todo Workspace.app`

## Focused UX 复查结论

已完成一轮前台 focused 回放，结论 **passed**，未回收到新增问题。

证据目录：

- Summary JSON:
  - `/Users/turbo/WorkBuddy/20260330162606/.workbuddy/browser-audit/results/2026-04-08-round33-37-ux-review/summary.json`
- Screenshots:
  - `01-reminder-copy.png`
  - `02-calendar-month.png`
  - `03-calendar-week.png`
  - `04-calendar-agenda.png`
  - `05-timeline-ddl-marker.png`
  - `06-deadline-due-trigger.png`

本轮重点检查全部通过：

- 相对提醒文案已显示：`提前 30 分钟（按 DDL） · DDL ... · 计划 ...`
- 日历月视图 DDL dot 可见
- 日历周视图 / agenda DDL badge 可见
- 时间线标题区 DDL badge 与 lane 内 DDL marker 可见
- 到期提醒标题已优先使用 `DDL 到期`
- 到期提醒正文已优先使用 `硬性 DDL 已到`
- console / page error 均为 0

## 涉及文件

- `/Users/turbo/WorkBuddy/20260330162606/web/src/App.tsx`
- `/Users/turbo/WorkBuddy/20260330162606/web/src/index.css`
- `/Users/turbo/WorkBuddy/20260330162606/web/src/utils/reminder-engine.ts`
- `/Users/turbo/WorkBuddy/20260330162606/.workbuddy/browser-audit/ux-review-round33-37.mjs`
- `/Users/turbo/WorkBuddy/20260330162606/docs/pm/2026-04-08-round33-37-ddl-ux-summary.md`
