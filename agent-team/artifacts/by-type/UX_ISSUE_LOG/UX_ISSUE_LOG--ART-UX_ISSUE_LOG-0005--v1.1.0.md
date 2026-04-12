# UX_ISSUE_LOG — Onboarding & Frontstage Evidence Recheck

| 字段 | 值 |
|---|---|
| 制品 ID | ART-UX_ISSUE_LOG-0005 |
| 版本 | v1.1.0 |
| 状态 | draft |
| 产出角色 | user_experience_officer |
| 关联覆盖矩阵 | ART-UX_COVERAGE_MATRIX-0004 v1.1.0 |
| 关联评审 | ART-UX_REVIEW_REPORT-0005 v1.1.0 |
| 证据目录 | `.workbuddy/browser-audit/results/2026-04-07-round23-32-ux-review/summary.json`、`screenshots/01-05` |

| Issue ID | Level | Status | Area | Journey | Symptom | Repro Steps | Evidence | Expected | Actual | Impact | Suggested Fix | Next Action | Problem Owner | Delivery Owner | Recheck Owner |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| UX-017 | P1 | closed | onboarding 步骤完成语义 | 首次进入 → 第 1 步创建 | 带时间自然语言会把第 2 步一起算完 | 1. 打开 welcome layer 2. 点击“跟着做 5 步” 3. 输入“今天晚上 9 点体验官第一条任务”并创建 | `summary.json -> checks.datedQuickCreateStepAdvance`、`screenshots/03-dated-quick-create.png` | 第 1 步只完成“新建任务”，第 2 步保留给显式排期动作 | 本轮结果：`progressAfterDatedCreate = 1/5`，当前步骤正确落到“给任务安排一个时间” | 已消除 onboarding 首分钟跳题风险 | 保持“创建成功”与“显式排期”拆开 | 继续观察后续 onboarding 全链路，但本 issue 不再阻断 | 产品经理 | 前端工程师 | 用户体验官 |
| UX-018 | P1 | closed | checklist 跳步上下文一致性 | 直接跳到“完成一条任务” | 第 5 步会把右栏选中任务切到主区列表之外 | 1. 打开 welcome layer 2. 点击“跟着做 5 步” 3. 在 checklist 直接点“完成一条任务” | `summary.json -> checks.completeStepContext`、`screenshots/04-complete-step-context.png` | 主区与右栏应指向同一条可见任务 | 本轮结果：`selectedTaskVisibleInCurrentList = true` | 已消除主区 / 右栏双世界问题 | 保持第 5 步目标任务与当前 onboarding list 对齐 | 继续观察任务完成后的收口体验，但本 issue 已关闭 | 产品经理 | 前端工程师 | 用户体验官 |
| UX-019 | P2 | closed | browse path 导引连续性 | 先浏览示例工作区 | 点击 browse path 后 checklist 折叠且 cue 消失 | 1. 打开 welcome layer 2. 点击“先看示例工作区” | `summary.json -> checks.browsePath`、`screenshots/05-browse-path.png` | 轻量浏览路径也应保留一个可见、低压的下一步提示 | 本轮结果：`checklistCollapsedByDefault = false`、`cueVisibleAfterBrowse = true` | 已恢复轻量浏览路径的接住感 | 保持 checklist 与 cue 的可见性，下轮只优化语气层级 | 产品经理 | 前端工程师 | 用户体验官 |
| UX-020 | P2 | closed | 浏览器端提醒 / 番茄声音回退 | 结果反馈可靠性 | console 连续出现 `AudioContext` 未解锁 warning | 1. 前台多次打开当前预览 2. 观察浏览器 console | `summary.json -> consoleMessages`、`web/src/hooks/useReminderCenter.ts` | 浏览器端回退不应继续留下未解锁 warning | 本轮结果：focused recheck 中未再出现 `The AudioContext was not allowed to start...` warning | 已把浏览器端声音反馈从“会报警”收口到“按手势解锁再工作” | 下一轮继续补 packaged desktop 声音 smoke | 产品经理 | 前端工程师 / QA 工程师 | 用户体验官 |

## 当前结论
- open：0 项
- blocked：0 项
- ready_for_recheck：0 项
- closed：4 项
- 本轮 focused scope 已不再被这 4 个问题阻断，可继续进入新的体验找茬轮次。
