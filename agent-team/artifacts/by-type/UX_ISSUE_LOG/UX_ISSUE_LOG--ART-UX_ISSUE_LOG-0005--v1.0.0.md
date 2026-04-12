# UX_ISSUE_LOG — Onboarding & Frontstage Evidence Recheck

| 字段 | 值 |
|---|---|
| 制品 ID | ART-UX_ISSUE_LOG-0005 |
| 版本 | v1.0.0 |
| 状态 | draft |
| 产出角色 | user_experience_officer |
| 关联覆盖矩阵 | ART-UX_COVERAGE_MATRIX-0004 |
| 关联评审 | ART-UX_REVIEW_REPORT-0005 v1.0.0 |
| 证据目录 | `.workbuddy/browser-audit/results/2026-04-07-ux-officer-review/summary.json`、`screenshots/01-05` |

| Issue ID | Level | Status | Area | Journey | Symptom | Repro Steps | Evidence | Expected | Actual | Impact | Suggested Fix | Next Action | Owner |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| UX-017 | P1 | open | onboarding 步骤完成语义 | 首次进入 → 第 1 步创建 | 用户在第 1 步输入带时间的自然语言后，系统会把第 2 步一起自动算完 | 1. 打开 welcome layer 2. 点击“跟着做 5 步” 3. 输入“今天晚上 9 点体验官第一条任务”并创建 4. 观察 progress 与当前步骤 | `summary.json -> checks.datedQuickCreateStepAdvance`、`screenshots/03-dated-quick-create.png` | 第 1 步应只完成“新建任务”，第 2 步应保留给显式排期动作 | 实际 progress 从 `0/5` 直接跳到 `2/5`，当前步骤变成“拖动一次任务” | 新用户会错过排期心智，onboarding 看起来像系统自己跳题 | onboarding 期间把“创建成功”和“排期完成”拆开；若保留带时间示例，也不能自动吃掉第 2 步 | 产品先定完成口径，前端修状态机并补回归 | 产品 / 前端 |
| UX-018 | P1 | open | checklist 跳步上下文一致性 | 直接跳到“完成一条任务” | 第 5 步把右栏选中任务切到当前主区列表之外的对象 | 1. 打开 welcome layer 2. 点击“跟着做 5 步” 3. 在 checklist 直接点“完成一条任务” 4. 对比主区标题与右栏选中任务 | `summary.json -> checks.completeStepContext`、`screenshots/04-complete-step-context.png` | 主区与右栏应指向同一条可见任务，用户一眼知道该完成哪条 | 实际 workspaceLabel 为“今天先跑一遍”，右栏选中 `整理发布页首屏文案`，但主区只显示 onboarding list 的另外 3 条任务 | 这是明显的上下文错位，会直接伤害引导可信度与任务完成闭环 | 把第 5 步目标任务切换到当前 list，或同步切主区到任务真实所在清单 | 前端修选中逻辑后，QA 回放本条 jump-step 场景 | 产品 / 前端 / QA |
| UX-019 | P2 | open | browse path 导引连续性 | 先浏览示例工作区 | 用户点“先看示例工作区”后，guidance 立刻折叠并且 cue 消失，导引几乎失去存在感 | 1. 打开 welcome layer 2. 点击“先看示例工作区” 3. 观察 checklist 与 cue | `summary.json -> checks.browsePath`、`screenshots/05-browse-path.png` | 轻量浏览路径也应保留一个清楚、低压但可见的下一步提示 | 实际表现为 `checklistCollapsedByDefault = true`、`cueVisibleAfterBrowse = false`、progress 仍是 `0/5` | 用户容易把“先看”理解成“系统不再继续接住我”，降低 onboarding 完成率 | browse path 保留一个可恢复 CTA、简版当前步骤条或轻提示，而不是直接折没 | 设计给轻量持续态，前端补显隐策略并复测 | 产品 / 设计 / 前端 |
| UX-020 | P2 | open | 浏览器端提醒 / 番茄声音回退 | 结果反馈可靠性 | 浏览器 console 连续出现 AudioContext 未被用户手势解锁的 warning，说明声音回退链路不稳 | 1. 前台多次打开当前预览 2. 观察浏览器 console 3. 检查 `useReminderCenter` 的声音解锁逻辑 | `summary.json -> consoleMessages`、`web/src/hooks/useReminderCenter.ts` | 浏览器端提醒 / 番茄声音回退不应持续报未解锁 warning，且首次有效用户手势后应进入稳定可播放状态 | 本轮证据里重复出现 `The AudioContext was not allowed to start...` warning | 一旦浏览器端声音没有真正站稳，“真实通知/声音反馈”就会从承诺变成碰运气 | 将 AudioContext 初始化与 resume 延后到首个明确用户手势后，并补浏览器声音 smoke 与 warning 守护 | 前端修 hook，QA 补浏览器声音专项回归 | 前端 / QA |

## 当前结论
- open：4 项
- blocked：0 项（但 UX-018 对 onboarding 闭环形成实质阻断）
- ready_for_recheck：0 项
- 当前不能继续把 onboarding / 浏览器声音反馈视为已通过最终体验门禁。
