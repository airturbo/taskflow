# 2026-04-03 第 13-22 轮体验迭代与跨端一致性复核总结

## 本轮目标
围绕 master 新提出的 3 个方向继续推进：
1. 修掉网页端全屏下右侧详情栏的横向滚动问题；
2. 由体验官再完整体验产品功能，把对项目团队真正有价值的问题和建议筛出来，连续跑完 10 轮循环；
3. 确认 app 端仍然承接完整网页端的功能体验和交互，不让 web / desktop 在最后阶段分叉。

---

## 10 轮循环结果

### Round 13 - 重新建立当前 scope 基线
- 先把当前产品主线重新对齐：番茄 / 习惯已经下线，右栏当前主角是“提醒摘要 + 任务详情”。
- 结论：后续评审不能再沿用旧 coverage matrix 的旧 scope 口径。

### Round 14 - 复现网页端右栏问题
- 在网页端全屏下进入右侧详情，确认底部会出现横向滚动条。
- 结论：这不是小瑕疵，是核心编辑链路上的完成度问题，必须当轮收口。

### Round 15 - 定修正策略
- 不再强保 detail rail 里的排期区双列，改为单列优先可读性。
- 同时给详情卡、抽屉态、长文本内容补 `min-width: 0`、断行与横向裁切策略。

### Round 16 - 落地实现
- 更新 `web/src/App.tsx`
- 更新 `web/src/index.css`
- 结果：右栏排期区改为专门的 `detail-grid--schedule`，详情区长文本不再把 rail 撑破。

### Round 17 - 扩展体验回归脚本
- 更新 `.workbuddy/browser-audit/ux-review-runner.mjs`
- 新增长附件名 / 长评论压力用例。
- 新增 detail card / right rail / page 三级横向溢出测量。

### Round 18 - 网页端复测
- 重新执行 `npm run build`
- 重新跑浏览回归
- 结果：
  - `detailOverflow.hasHorizontalOverflow = false`
  - `rightRailOverflow.hasHorizontalOverflow = false`
  - `pageOverflow.hasHorizontalOverflow = false`

### Round 19 - 桌面端 parity 构建复核
- 执行 `npm run desktop:build`
- 结果：成功生成 `Todo Workspace.app`
- 判断：桌面壳仍能承接最新共享前端改动，没有出现 build 级分叉。

### Round 20 - 清理错误评审基线
- 发现旧 runner 和旧 coverage matrix 仍混有 focus / habits 旧口径。
- 修正 runner 统计输出命名，改为当前真实指标：`overdueMetric / scheduledMetric`。

### Round 21 - 体验官正式制品刷新
- 新增 `ART-UX_COVERAGE_MATRIX-0003 v1.0.0`
- 新增 `ART-UX_ISSUE_LOG-0004 v1.0.0`
- 新增 `ART-UX_REVIEW_REPORT-0004 v1.0.0`
- 新增 `ART-EAN-0003 v1.0.0`

### Round 22 - 项目团队结论收口
- 当前无新增 open / blocked 级体验问题。
- 本轮最重要的两项关闭：
  - `UX-015`：网页端全屏右栏横向溢出
  - `UX-016`：体验门禁 scope 漂移
- 项目继续保持在 `release_preparation`。

---

## 这 10 轮真正带来的价值
### 对产品
- 右栏终于从“信息太多就破相”回到稳定、可读、可持续扩展的状态。

### 对前端
- 详情 rail 有了明确的布局原则：
  - 高密度编辑以纵向滚动为主
  - 紧空间先保可读性，不硬撑双列
  - 长文本默认要能断行，不能拿用户内容去赌布局

### 对体验官 / QA
- 回归脚本第一次具备了“右栏横向溢出长期回归”能力。
- 体验门禁重新对齐当前 scope，不再让旧模块干扰结论。

### 对项目经理
- 这轮不只是修 UI，而是把“产品现状、评审证据、放行结论”重新拉回同一条线上。

---

## 当前判断
如果只看这轮结果，已经达到继续发布准备的标准；但发布前还应该补一件事：

1. 用打包出来的桌面 app 做一次人工 smoke，重点看原生通知 / 声音反馈。

除此之外，本轮不建议再对右栏结构做大改。现在这套约束是稳的，别为了一点“桌面上看着更整齐”的表面美观，把问题重新引回来。
