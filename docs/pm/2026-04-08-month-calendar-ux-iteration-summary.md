# 2026-04-08 月历视图视觉收口与桌面端复核摘要

## 本轮完成

### 1. 修复月历优先级细条颜色错误
- 根因：`priority-accent-*` 通过 CSS 变量写入颜色，但 `.calendar-chip` 自己又在后面覆盖了默认变量，导致紧急任务仍落回蓝色默认值。
- 修复：改成由 `priority-accent-*` 只负责注入 `--calendar-chip-accent / --calendar-chip-accent-soft`，`calendar-chip` 通过 fallback 读取，不再反向覆盖。
- 结果：`urgent / high / normal / low` 现在能稳定映射到红 / 黄 / 蓝 / 灰语义。

### 2. 继续压低月历 chip 的视觉噪音
- 左侧优先级细条从 `3px` 收到 `2px`
- hover 改成更轻的浅底与轻边框，不再靠更深文字和外阴影抢存在感
- 选中任务 chip 再降一档：背景、边框和文字都更克制，避免在月历里显得过硬

### 3. 增加“选中日更聚焦、非当天更退后”的层级
- `CalendarView` 新增本地 `focusedDateKey`
- 来源优先级：选中任务所在日期 > 当前已聚焦日期 > 今天 > 当前窗口锚点
- 交互回写来源：
  - 点击某一天空白区域
  - 点击任务
  - 拖拽任务到新日期
  - 点击该日创建入口
- 结果：当前聚焦日更清楚，其他非当天日期自动退后；切换聚焦日后，原日期会进入 muted 层级。

## 代码落点
- `web/src/App.tsx`
  - `CalendarView` 补 `selectedTaskId` 透传
  - 新增 `focusedDateKey` 状态与任务/拖拽/点击联动
  - 新增 `getPreferredFocusedCalendarDate()` helper
- `web/src/index.css`
  - 修正 `priority-accent-*` 与 `calendar-chip` 的层级关系
  - 收细优先级条、减轻 hover、压低 selected chip
  - 新增 `.calendar-cell.is-focused / .is-muted` 月历层级样式

## 验证结果

### 构建
- `cd /Users/turbo/WorkBuddy/20260330162606/web && npm run build` ✅
- `cd /Users/turbo/WorkBuddy/20260330162606/web && npm run desktop:build` ✅
- 桌面 bundle 产物：
  - `web/src-tauri/target/release/bundle/macos/Todo Workspace.app`

### focused UX 回放（网页端共享前端）
- 脚本：`.workbuddy/browser-audit/ux-review-round38-41-month-focus.mjs`
- 结果：`.workbuddy/browser-audit/results/2026-04-08-round38-41-month-focus-review/summary.json`
- 结论：`pass: true`
- 关键校验：
  - 紧急任务细条颜色与普通任务显著区分 ✅
  - 细条宽度稳定为 `2px` ✅
  - hover 不再把文字继续压深 ✅
  - 点击新日期后，新日期进入 focused，原非当天日期进入 muted ✅

### 桌面端 parity / smoke
- 共享前端仍然来自同一套 `web/src/App.tsx`，本轮月历交互与样式变更会同时落到网页端与桌面端。
- 已验证桌面 bundle 可成功构建。
- 已验证桌面 app 进程可启动，并能从系统窗口列表里读到 `Todo Workspace` 可见窗口。

## 当前仍保持严格阻塞的事项
- **尚未宣告“桌面端体验官已放行”。**
- 原因不是功能缺失，而是当前执行环境无法成功完成桌面前台窗口截图/回放采集：
  - `System Events` UI 脚本超时
  - `screencapture` 无法从当前环境抓取桌面图像
- 因此，本轮我只确认到：
  - 代码已收口
  - 网页端共享前端 focused UX 已通过
  - 桌面 bundle 能构建并启动到窗口层
- **按你要求，release gate 继续保持阻塞**，直到能在有真实 display 的前台环境里完成桌面 app 的实际点击/切换/拖拽复查并留存证据。

## 下一步建议
1. 直接在有可见桌面的环境里跑一轮桌面端 focused UX 走查
2. 覆盖本轮 4 个点：
   - 紧急 / 普通任务细条颜色
   - 细条宽度与 hover 质感
   - 选中日聚焦 / 非当天退后
   - 详情侧栏与月历选中任务的上下文一致性
3. 体验官通过后，再更新 release-ready 结论
