# UX_ISSUE_LOG — Web/Desktop Parity Deep Review

| 字段 | 值 |
|---|---|
| 制品 ID | ART-UX_ISSUE_LOG-0004 |
| 版本 | v1.0.0 |
| 状态 | approved |
| 产出角色 | user_experience_officer |
| 关联覆盖矩阵 | ART-UX_COVERAGE_MATRIX-0003 |
| 证据目录 | `.workbuddy/browser-audit/results/ux-review-summary.json`、`runner-output-round6.json`、桌面端 build 输出 |

| Issue ID | Level | Status | Area | Journey | Symptom | Repro Steps | Expected | Actual / 当前状态 | Impact | Suggested Fix | Next Action | Owner |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| UX-015 | P1 | closed | 网页端全屏右侧详情栏 | 全屏浏览 → 右栏深入编辑 | 右栏底部出现横向滚动条，必须左右拖动才看得全内容 | 1. 全屏打开 web 版 2. 创建并选中任务 3. 在详情里加入长附件名、长评论并观察底部滚动条 | 右侧详情栏应只纵向滚动，长内容自动断行，排期控件不撑破 rail | 已修复：`detailOverflow.hasHorizontalOverflow = false`、`rightRailOverflow.hasHorizontalOverflow = false`、`pageOverflow.hasHorizontalOverflow = false`；详情排期区改为单列，长文本已断行 | 这是核心编辑路径，横向滚动会直接把产品打回 demo 感 | 保持 `detail-grid--schedule` 单列、长文本断行和 rail overflow 约束；后续详情增字段时禁止回退双列挤压 | 保持在 runner 中长期回归 | 前端 |
| UX-016 | P2 | closed | 体验门禁 scope 对齐 | 体验官复审 / 项目团队判断 | 回归脚本与覆盖矩阵仍混用已下线的 focus / habits 口径，团队容易拿错基线继续评估 | 1. 查看旧 `UX_COVERAGE_MATRIX-0002` 与旧 runner 输出 2. 发现统计字段仍叫 focus / habit，覆盖矩阵仍写番茄 / 习惯 | 体验证据必须与当前产品 scope 同步，否则评审结论会偏移 | 已修复：runner 统计字段改为 `overdueMetric` / `scheduledMetric`，并新建 `ART-UX_COVERAGE_MATRIX-0003` 作为当前门禁基线 | 不一定直接伤用户，但会伤项目团队判断质量，后续迭代容易跑偏 | 后续凡是产品下线或收口功能，必须同步刷新 runner、coverage matrix、review report 三件套 | 纳入下一次 UX 复审 checklist | UX / QA / 项目经理 |

## 结论
- 当前无 open / blocked 级别问题。
- 本轮新增问题已全部关闭。
- 后续仅保留两条长期建议：
  1. 发布前补一次桌面打包 app 的原生通知 / 声音人工 smoke。
  2. 后续若继续扩右栏字段，先跑长文本 / 长附件名压力回归，再决定是否恢复双列布局。
