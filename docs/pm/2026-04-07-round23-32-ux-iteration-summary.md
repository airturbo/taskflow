# 2026-04-07 第 23-32 轮体验迭代与产品承接执行总结

## 本轮目标
围绕 `CR-20260407-001` / `IA-20260407-001` 里 reopened 的 4 个问题，按新的团队机制完成一轮闭环：
1. 先把体验官提出的 `UX-017/018/019/020` 转成产品经理承接单；
2. 再由项目团队把 onboarding 与浏览器声音回退链路真正修到位；
3. 修完以后让体验官基于新的前台证据复查；
4. 在同一轮里连续跑满 10 个 round，把“承接 → 修正 → 复查 → 再挑刺”这条链路固定下来。

---

## 产品经理承接单

### 输入来源
- `CR-20260407-001`
- `IA-20260407-001`
- `ART-UX_COVERAGE_MATRIX-0004 v1.0.0`
- `ART-UX_REVIEW_REPORT-0005 v1.0.0`
- `ART-UX_ISSUE_LOG-0005 v1.0.0`
- 体验官旧证据：`.workbuddy/browser-audit/results/2026-04-07-ux-officer-review/summary.json`

### 产品侧正式判断

| Issue | 产品判断 | 调整后的验收口径 | 交付 owner |
|---|---|---|---|
| UX-017 | onboarding 第 1 步的成功标准应当只等于“落下一条任务”，不能因为自然语言里顺带带时间就提前吞掉第 2 步 | 第 1 步完成后进度必须从 `0/5` 到 `1/5`；当前步骤必须落到“给任务安排一个时间” | 产品 / 前端 |
| UX-018 | 第 5 步的完成动作必须发生在当前主区可见任务上，不能让右栏跳到另一个 list 的对象 | 点击“完成一条任务”时，右栏当前任务必须出现在主区列表里 | 产品 / 前端 |
| UX-019 | “先看示例工作区”是轻量浏览，不是把导引折叠到几乎失联 | 进入 browse path 后 checklist 默认可见，且当前步骤 cue 仍然存在 | 产品 / 设计 / 前端 |
| UX-020 | 浏览器端声音回退要承认用户手势限制，但不能继续在 console 里持续报 `AudioContext` warning | 在没有原生声音时，Web 回退链路只能在首个真实用户手势后解锁；focused 复查里不得再出现该 warning | 前端 / QA |

### 本轮不接受的降级
- 不接受把第 1 步示例文案改回“不要带时间”来掩盖状态机问题。
- 不接受只改第 5 步文案、不修主区/右栏目标任务的真实上下文。
- 不接受把 browse path 解释成“本来就该弱提示”。
- 不接受用“浏览器就这样”当理由继续放着 `AudioContext` warning 不管。

---

## 10 轮循环结果

### Round 23 - 产品经理正式承接问题
- 把体验官的 4 个问题从“修复建议”转成产品逻辑与验收口径。
- 结论：这轮不是小修小补，而是 onboarding 首分钟心智和声音反馈可信度的 focused 返工。

### Round 24 - 项目经理锁定返工范围
- 结合代码与证据重排本轮交付点：
  - `web/src/App.tsx`
  - `web/src/hooks/useReminderCenter.ts`
- 结论：onboarding 3 个问题都集中在 `App.tsx`，声音 warning 根因集中在 `useReminderCenter.ts`。

### Round 25 - 落地 UX-017
- 给 `CreateTaskPayload` 增加显式 `markOnboardingScheduleComplete` 开关。
- 取消“创建任务时只要带时间就自动完成 schedule step”的旧逻辑。
- 把第 2 步完成条件收回到显式排期入口。

### Round 26 - 落地 UX-018 / UX-019
- 把第 5 步目标任务切回当前 onboarding list 内的 `task-onboarding-detail`。
- 把 browse path 从“默认折叠 checklist + 隐藏 cue”改成“保留可见 checklist + 当前步骤 cue”。
- 结论：主区与右栏重新落回同一上下文，“先看示例工作区”不再等于先失联。

### Round 27 - 落地 UX-020
- 重写浏览器音频回退策略：
  - 不再在 reminder tick 里直接创建 / resume `AudioContext`
  - 改为首个真实用户手势后解锁
  - 在解锁前把待播放提示音短暂排队，解锁后再补放
- 结论：声音能力承认浏览器边界，但不再用 warning 污染首屏体验。

### Round 28 - 构建与预览复核
- 执行 `cd /Users/turbo/WorkBuddy/20260330162606/web && npm run build`
- 结果：构建通过。
- 同时启动 `http://127.0.0.1:4174/` 作为本轮 focused 复查预览地址。

### Round 29 - 补 focused 复查脚本
- 新增 `.workbuddy/browser-audit/ux-review-round23-32.mjs`。
- 这轮脚本只针对 4 个 reopened 问题回放，不再混入旧 scope。
- 新证据目录：`.workbuddy/browser-audit/results/2026-04-07-round23-32-ux-review/`

### Round 30 - 体验官复查 4 个原问题
- 新证据摘要见：`.workbuddy/browser-audit/results/2026-04-07-round23-32-ux-review/summary.json`
- 复查结论：
  - `UX-017`：已收口，进度从 `0/5` 正确变成 `1/5`
  - `UX-018`：已收口，右栏任务重新落回当前主区可见列表
  - `UX-019`：已收口，browse path 默认不再折叠且 cue 仍可见
  - `UX-020`：已收口，console 不再出现 `AudioContext was not allowed to start` warning

### Round 31 - 继续挑刺但不硬造问题
- 对同一批链路再看一轮：welcome → start guide → dated quick create → direct complete-step → browse path。
- 当前未再发现新的 open / blocked 级问题。
- 结论：focused scope 已从“首分钟会自我打脸”回到“可以继续挑更细的问题”。

### Round 32 - 项目团队收口判断
- 就 `CR-20260407-001` 本轮 focused scope 而言，4 个 reopened 问题已被项目团队消化并交回体验官复查通过。
- 当前状态更适合继续进入下一轮更苛刻的体验挑刺，而不是停留在这 4 个旧问题上反复打转。

---

## 本轮关键证据

### 新复查结果
- `summary.json`：`.workbuddy/browser-audit/results/2026-04-07-round23-32-ux-review/summary.json`
- 截图：
  - `01-welcome.png`
  - `02-start-guide.png`
  - `03-dated-quick-create.png`
  - `04-complete-step-context.png`
  - `05-browse-path.png`

### 关键通过点
- `progressAfterDatedCreate = 1/5`
- `activeStepAfterDatedCreate = 给任务安排一个时间`
- `selectedTaskVisibleInCurrentList = true`
- `checklistCollapsedByDefault = false`
- `cueVisibleAfterBrowse = true`
- `consoleMessages` 中已无 `The AudioContext was not allowed to start...` warning

---

## 本轮实际修改文件
- `web/src/App.tsx`
- `web/src/hooks/useReminderCenter.ts`
- `.workbuddy/browser-audit/ux-review-round23-32.mjs`
- `docs/pm/2026-04-07-round23-32-ux-iteration-summary.md`

---

## 当前判断
这 10 轮跑完以后，可以下一个明确结论：

**体验官上一轮打回的 4 个问题，本轮已经按“体验官提问题 → 产品经理承接 → 项目团队落地 → 体验官复查”完整闭环。**

但这不等于项目从此不用再挑刺了。下一轮最值得继续深挖的不是这 4 个旧点，而是：
1. onboarding 完成 5 步后的收口体验是否足够像成熟产品；
2. browse path 与 guided path 之间是否还可以拉开更克制但清楚的差异；
3. 打包桌面端的原生通知 / 声音 smoke 是否也和 Web 一样稳；
4. 是否要把这次 focused 复查正式刷新进新的 UX 治理制品版本。
