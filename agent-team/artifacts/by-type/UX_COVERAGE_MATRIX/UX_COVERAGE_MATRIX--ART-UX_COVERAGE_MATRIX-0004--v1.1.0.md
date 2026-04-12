# UX_COVERAGE_MATRIX — Onboarding & Frontstage Evidence Recheck

| 字段 | 值 |
|---|---|
| 制品 ID | ART-UX_COVERAGE_MATRIX-0004 |
| 版本 | v1.1.0 |
| 状态 | draft |
| 产出角色 | user_experience_officer |
| 评审时间 | 2026-04-07 15:05 +08:00 |
| 评审对象 | `http://127.0.0.1:4174/`（focused recheck：onboarding + 浏览器端提醒声音回退） |
| 证据目录 | `.workbuddy/browser-audit/results/2026-04-07-round23-32-ux-review/summary.json`、`screenshots/01-05` |
| 关联变更 | `CR-20260407-001` / `IA-20260407-001` |

## 1. 覆盖摘要
- focused scope 样本总数：6
- 已完整体验：6
- 存在问题：0
- 阻断项：0
- 覆盖结论：本轮 focused scope 已完成复查，`UX-017/018/019/020` 对应链路已回到可继续深挖新问题的状态

## 2. 用户剧本
- 剧本 A：首次用户点击“跟着做 5 步”，用一句带时间的人话创建第一条任务。
- 剧本 B：回访用户不按顺序做题，直接从 checklist 跳到“完成一条任务”，验证主区与右栏是否仍在同一上下文。
- 剧本 C：首次用户点击“先看示例工作区”，验证轻量浏览路径是否仍保留足够的下一步引导。
- 剧本 D：浏览器用户依赖提醒/番茄声音反馈，验证声音回退是否还会留下 `AudioContext` warning。

## 3. 覆盖矩阵
| Feature ID | Area | Journey | Persona | Trigger | Interaction Check | Result Check | Evidence | Verdict | Issue IDs | Next Action | Owner |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F-013 | 欢迎层入口分流 | 首次进入 | 新用户 | 打开应用并看到 welcome layer | “跟着做 5 步”与“先看示例工作区”两条路径仍然语义清楚 | 用户能理解这是“跟着做”与“先浏览”的不同入口 | `summary.json -> checks.welcome`、`screenshots/01-welcome.png` | pass | — | 保持当前入口文案 | 产品 / 设计 |
| F-014 | checklist 首步聚焦 | 首次进入 | 新用户 | 点击“跟着做 5 步” | checklist 当前聚焦正确落在“新建你的第一条任务” | 进度保持 `0/5`，首步意图明确 | `summary.json -> screenshots.startGuide`、`screenshots/02-start-guide.png` | pass | — | 保持当前 focus step 解析逻辑 | 前端 |
| F-015 | onboarding 步骤完成语义 | 首次创建 | 新用户 | 在第 1 步输入“今天晚上 9 点体验官第一条任务”后创建 | 系统不再把带时间文本误判成第 2 步排期完成 | 进度从 `0/5` 正确变成 `1/5`，当前步骤切到“给任务安排一个时间” | `summary.json -> checks.datedQuickCreateStepAdvance`、`screenshots/03-dated-quick-create.png` | pass | UX-017 | 保持“创建成功”与“显式排期”拆开的验收口径 | 产品 / 前端 |
| F-016 | checklist 跳步后的上下文一致性 | 直接跳到完成步骤 | 回访用户 | 在 checklist 里直接点击“完成一条任务” | 主区顶部与右栏详情重新落在同一 onboarding list 语义 | 右栏选中任务重新出现在当前可见列表里 | `summary.json -> checks.completeStepContext`、`screenshots/04-complete-step-context.png` | pass | UX-018 | 保持第 5 步目标任务与当前 list 对齐 | 产品 / 前端 |
| F-017 | 浏览路径的导引连续性 | 先浏览示例工作区 | 新用户 | 点击“先看示例工作区” | checklist 默认保持可见，cue 仍然存在 | 浏览路径不再落成“0/5 + 折叠态 + 无提示气泡” | `summary.json -> checks.browsePath`、`screenshots/05-browse-path.png` | pass | UX-019 | 后续只再优化 browse / guided 的语气差异，不回退导引连续性 | 产品 / 设计 / 前端 |
| F-018 | 浏览器端提醒/番茄声音回退 | 提醒与结果反馈 | 浏览器用户 | 多次进入页面并触发前台操作 | console 不再出现 `AudioContext was not allowed to start` warning | 浏览器端声音链路改为首个真实手势后解锁，focused evidence 已无 warning | `summary.json -> consoleMessages`、`web/src/hooks/useReminderCenter.ts` | pass | UX-020 | 下一轮把 packaged desktop 声音 smoke 也补齐 | 前端 / QA |

## 4. 覆盖缺口
- 本轮仍是 focused recheck，只覆盖 `UX-017/018/019/020` 对应链路，不替代全量 release scope 体验门禁。

## 5. 下一轮复审重点
- onboarding 5 步全部跑完后的完成收口体验。
- browse path 与 guided path 是否还能进一步拉开层级而不失联。
- packaged desktop 的原生通知 / 声音 smoke。
