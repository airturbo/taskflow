# UX_COVERAGE_MATRIX — Onboarding & Frontstage Evidence Recheck

| 字段 | 值 |
|---|---|
| 制品 ID | ART-UX_COVERAGE_MATRIX-0004 |
| 版本 | v1.0.0 |
| 状态 | draft |
| 产出角色 | user_experience_officer |
| 评审时间 | 2026-04-07 13:27 +08:00 |
| 评审对象 | `http://127.0.0.1:4173/`（focused follow-up：onboarding + 浏览器端提醒声音回退） |
| 证据目录 | `.workbuddy/browser-audit/results/2026-04-07-ux-officer-review/summary.json`、`screenshots/01-05` |
| 关联变更 | `CR-20260407-001` / `IA-20260407-001` |

## 1. 覆盖摘要
- focused scope 样本总数：6
- 已完整体验：2
- 存在问题：3
- 阻断项：1
- 覆盖结论：本轮 focused follow-up 已完成取证，但 onboarding slice 仍不能继续沿用“已收口”判断

## 2. 用户剧本
- 剧本 A：首次用户点击“跟着做 5 步”，按提示用一句带时间的人话创建第一条任务。
- 剧本 B：回访用户不按顺序做题，直接从 checklist 跳到“完成一条任务”，验证主区与右栏是否仍在同一上下文。
- 剧本 C：首次用户点击“先看示例工作区”，验证轻量浏览路径是否仍保留足够的下一步引导。
- 剧本 D：浏览器用户依赖提醒/番茄声音反馈，验证声音回退是否会在真实运行中留下可感知风险。

## 3. 覆盖矩阵
| Feature ID | Area | Journey | Persona | Trigger | Interaction Check | Result Check | Evidence | Verdict | Issue IDs | Next Action | Owner |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F-013 | 欢迎层入口分流 | 首次进入 | 新用户 | 打开应用并看到 welcome layer | “跟着做 5 步”与“先看示例工作区”两条路径的文案语义已明显区分 | 用户能理解这是“被引导”与“先浏览”的不同入口 | `summary.json -> checks.welcome`、`screenshots/01-welcome.png` | pass | — | 保持当前入口命名 | 产品 / 设计 |
| F-014 | checklist 首步聚焦 | 首次进入 | 新用户 | 点击“跟着做 5 步” | checklist 当前聚焦正确落在“新建你的第一条任务”，没有一上来就乱跳 | 进度保持 `0/5`，首步意图明确 | `summary.json -> checks.datedQuickCreateStepAdvance.progressBeforeCreate`、`screenshots/02-start-guide.png` | pass | — | 保持当前 focus step 解析逻辑 | 前端 |
| F-015 | onboarding 步骤完成语义 | 首次创建 | 新用户 | 在第 1 步输入“今天晚上 9 点体验官第一条任务”后创建 | 用户明明还在“新建第一条任务”，但系统把带时间文本同时算作排期完成 | 进度从 `0/5` 直接跳到 `2/5`，当前步骤变成“拖动一次任务”，日历排期心智被整段略过 | `summary.json -> checks.datedQuickCreateStepAdvance`、`screenshots/03-dated-quick-create.png` | issue | UX-017 | 改为 onboarding 期间只在显式排期交互后完成第 2 步，或重写第 1 步文案与例子 | 产品 / 前端 |
| F-016 | checklist 跳步后的上下文一致性 | 直接跳到完成步骤 | 回访用户 | 在 checklist 里直接点击“完成一条任务” | 主区顶部仍停在“今天先跑一遍”，右栏却选中 `整理发布页首屏文案` | 右栏选中任务不在当前可见列表里，用户无法确认自己到底要完成哪条任务 | `summary.json -> checks.completeStepContext`、`screenshots/04-complete-step-context.png` | blocked | UX-018 | 将第 5 步目标任务切回当前 list，或同步切换主区到任务真实所在清单 | 产品 / 前端 |
| F-017 | 浏览路径的导引连续性 | 先浏览示例工作区 | 新用户 | 点击“先看示例工作区” | 系统直接把 checklist 折叠，同时不再显示 cue | 浏览路径一落地就是 `0/5 + 折叠态 + 无提示气泡`，导引存在感过弱 | `summary.json -> checks.browsePath`、`screenshots/05-browse-path.png` | issue | UX-019 | 保留一个轻量但可见的当前步骤提示，不要把指引直接折成几乎不可见的状态 | 产品 / 设计 / 前端 |
| F-018 | 浏览器端提醒/番茄声音回退 | 提醒与结果反馈 | 浏览器用户 | 多次进入页面并触发提醒能力初始化 | console 连续出现 AudioContext 未被用户手势解锁的 warning，说明声音回退链路不够稳 | 浏览器端真实提醒/番茄声音反馈存在丢失风险，和“真实反馈”目标冲突 | `summary.json -> consoleMessages`、`web/src/hooks/useReminderCenter.ts` | issue | UX-020 | 把 AudioContext 解锁改成首个明确用户手势后再初始化，并补浏览器端声音 smoke | 前端 / QA |

## 4. 覆盖缺口
- 本轮是 focused follow-up，只重查 onboarding 与浏览器端声音回退，不替代 `ART-UX_COVERAGE_MATRIX-0003 v1.0.0` 的完整产品 scope 覆盖记录。

## 5. 复审重点
- UX-017：带时间的首条创建不能再让 onboarding 自动跳过排期步骤。
- UX-018：第 5 步必须保证主区与右栏指向同一任务上下文。
- UX-019：浏览路径必须保留足够可见的下一步引导。
- UX-020：浏览器端提醒/番茄声音回退不得再出现未解锁的 AudioContext warning。
