# UX_COVERAGE_MATRIX — Web/Desktop Parity Deep Review

| 字段 | 值 |
|---|---|
| 制品 ID | ART-UX_COVERAGE_MATRIX-0003 |
| 版本 | v1.0.0 |
| 状态 | approved |
| 产出角色 | user_experience_officer |
| 评审时间 | 2026-04-03 12:24 +08:00 |
| 评审对象 | `http://127.0.0.1:4173/` + `web/src-tauri/target/release/bundle/macos/Todo Workspace.app` |
| 证据目录 | `.workbuddy/browser-audit/results/ux-review-summary.json`、`runner-output-round6.json`、`screenshots/01-16`、`npm run desktop:build` 输出 |
| 关联轮次 | 2026-04-03 第 13-22 轮体验迭代与跨端一致性复核 |

## 1. 覆盖摘要
- scope 样本总数：12
- 本轮重新走查：10
- 沿用已批准基线并补充 spot-check：2
- 通过：12
- 阻断问题：0
- 非阻断遗留：0
- 覆盖结论：当前 web / desktop 共享壳在最新 scope 下可继续作为 `release_preparation` 门禁基线

## 2. 用户剧本
- 剧本 A：网页端用户以全屏进入工作台，在三栏布局下完成首次创建并打开右侧详情。
- 剧本 B：回访用户在右侧详情中编辑长文本、长附件名、提醒、子任务、评论，验证高密度内容下的可读性与无横向溢出。
- 剧本 C：重度用户在列表 / 日历 / 看板 / 时间线 / 四象限 / 统计之间切换，并继续走已完成、回收站、标签、智能清单。
- 剧本 D：桌面端用户以打包 app 为入口，验证 shared bundle、Tauri 壳构建与主工作台前端没有分叉失配。

## 3. 覆盖矩阵
| Feature ID | Area | Journey | Persona | Trigger | Interaction Check | Result Check | Verdict | Issue IDs | Next Action | Owner |
|---|---|---|---|---|---|---|---|---|---|---|
| F-001 | 应用启动 / 三栏布局 / 全屏 web | 首次进入 | 新用户 | 打开首页并进入全屏工作台 | 左栏 / 中区 / 右栏结构清楚，右侧详情区不再出现横向滚动 | `pageOverflow.hasHorizontalOverflow = false`，整体宽度稳定 | pass | UX-015 | 保持当前 rail 宽度与 overflow 约束 | 设计 / 前端 |
| F-002 | 快速创建 + 智能识别 | 首次创建 | 新用户 | 输入“今天晚上 9 点体验官走查”并创建 | 输入即时、创建后直接联动右栏详情 | 标题保留原输入，`dueAtAfterCreate = 2026-04-03T21:00` | pass | — | 保持当前 smart-entry 与反馈链路 | 前端 |
| F-003 | 任务详情高级编辑 / 长内容压力 | 回访编辑 | 回访用户 | 在右栏编辑标题、笔记、重复、提醒、子任务、长附件名、长评论 | 详情区只做纵向滚动，长内容自动断行，排期控件不再横向挤爆 | `detailOverflow.hasHorizontalOverflow = false`、`rightRailOverflow.hasHorizontalOverflow = false` | pass | UX-015 | 保持 schedule 单列与断行策略 | 前端 |
| F-004 | 搜索 | 高频定位 | 回访用户 | 顶部搜索“体验官” | 输入先即时，再轻量 debounce 触发查询 | 40ms 内旧结果仍在，220ms 后 miss 结果消失 | pass | UX-012 | 保持当前 debounce 口径 | 产品 / 前端 |
| F-005 | 列表主卡片 | 键盘操作 | 桌面用户 | 聚焦列表卡片并按 `Enter` | 主卡片可见焦点且不与内部按钮串扰 | 选中任务与右栏详情正确同步 | pass | UX-014 | 保持统一键盘激活助手 | 前端 |
| F-006 | 日历（月 / 周 / agenda） | 浏览后顺手创建 | 重度用户 | 切到日历并分别点击月格 / 周列 / 显式创建入口 | 浏览热区不再误开创建，正式入口仍可达 | 月 / 周整块阻断，显式 `+`、agenda 条和空态卡可打开 | pass | UX-013 | 保持显式入口优先 | 产品 / 前端 |
| F-007 | 看板 | 状态管理 / 键盘选中 | 重度用户 | 切到看板并聚焦卡片按 `Enter` | 列结构清楚，卡片仍支持直接进入详情 | 键盘选中成功，当前卡片标题与详情一致 | pass | UX-014 | 保持卡片主操作语义 | 前端 |
| F-008 | 时间线 | 排期浏览 | 重度用户 | 切到时间线 | 当前 scope 下时间条仍可读、视图可达 | `barCount = 1`，未出现回归性空壳或报错 | pass | — | 后续如改排期交互，补桌面壳 smoke | 前端 |
| F-009 | 四象限 | 标签驱动优先级整理 | 重度用户 | 切到四象限并聚焦卡片按 `Space` | 象限结构与键盘主操作一致 | 四象限 4 区稳定，卡片可通过键盘选中 | pass | UX-014 | 保持“紧急 / 重要”标签驱动口径 | 产品 / 前端 |
| F-010 | 已完成 / 回收站 / 标签 / 智能清单 | 次级路径回流 | 回访用户 | 完成任务 → 回收站 → 恢复 → 标签 / 智能清单切换 | 次级路径仍可完整回放，结果不会失踪 | 已完成 / 回收站 / 标签 / 智能清单结果保持稳定 | pass | — | 保持 runner 覆盖 | QA / 前端 |
| F-011 | 统计 | 当前 scope 对齐 | 回访用户 | 进入统计 | 指标口径已回到当前真实模块，不再混用已下线功能名 | 回归结果记录为 `overdueMetric` / `scheduledMetric` | pass | UX-016 | 后续 UX 制品禁止再写 focus / habits 旧口径 | UX / QA |
| F-012 | 桌面端共享壳 | app/web parity | 桌面用户 | 执行 `npm run desktop:build` | Tauri 壳成功复用最新前端 dist，未出现桌面编译分叉 | 产出 `Todo Workspace.app`，shared bundle 可用 | pass | — | 发布前仍需人工 smoke 一次原生通知 / 声音 | 前端 / QA |
