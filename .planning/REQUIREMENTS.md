# REQUIREMENTS — v2.0 TaskFlow 交互体验全面优化

## Active Requirements

### ARCH — 架构治理
- [x] **ARCH-01**: App.tsx 拆分至 <400 行，状态分域为 5+ 个独立 hooks
- [ ] **ARCH-02**: CSS 从 6908 行单文件拆分为 CSS Modules 模块化结构
- [x] **ARCH-03**: 每个视图有独立 React Error Boundary，崩溃不影响其他区域
- [x] **ARCH-04**: 离线队列有 500 条容量上限和 7 天过期策略
- [x] **ARCH-05**: 移除全局 `* { transition: all }`，按需声明精确 transition

### ROUTE — 路由与状态恢复
- [ ] **ROUTE-01**: 引入客户端路由，每个视图对应独立 URL 路径
- [ ] **ROUTE-02**: 视图切换时搜索词、过滤器、选中任务通过 URL params 持久化
- [ ] **ROUTE-03**: 浏览器刷新后恢复到完全相同的视图状态
- [ ] **ROUTE-04**: 浏览器 back/forward 在视图间正确导航

### DATE — 双日期体验强化
- [ ] **DATE-01**: 所有视图中 dueAt（计划完成）和 deadlineAt（硬性截止）同时展示，通过颜色/图标一眼可分
- [ ] **DATE-02**: Focus Tab 保留 5 组区分（逾期/今日计划/今日截止/即将/收件箱），每组有清晰副标题
- [ ] **DATE-03**: dueAt > deadlineAt 时显示警告 badge + 一键修正按钮
- [ ] **DATE-04**: 日历视图中 dueAt 蓝色标记、deadlineAt 红色标记，同任务双日期双天标记
- [ ] **DATE-05**: 快速创建默认"计划完成"，可展开添加"截止日期"

### MATRIX — 四象限修正
- [ ] **MATRIX-01**: 新增 isUrgent/isImportant 独立布尔字段替代标签驱动
- [ ] **MATRIX-02**: 数据迁移：tag-urgent/tag-important → 独立字段，从 tagIds 中移除
- [ ] **MATRIX-03**: 矩阵拖拽修改 isUrgent/isImportant 而非标签
- [ ] **MATRIX-04**: 每个卡片显示分类理由 pill + hover tooltip

### DND — 统一拖拽
- [ ] **DND-01**: KanbanView 从手写 pointer events 迁移到 @dnd-kit
- [ ] **DND-02**: AppShell 层共享 DndProvider，所有视图可复用
- [ ] **DND-03**: 桌面鼠标和移动触摸拖拽均正常工作

### FILTER — 搜索过滤统一
- [ ] **FILTER-01**: 统一 FilterState 模型驱动搜索栏、CommandPalette、Saved Filters
- [ ] **FILTER-02**: 过滤状态序列化到 URL search params
- [ ] **FILTER-03**: NLP 输入实时解析预览（日期/标签/优先级 chip）

### UX — 交互打磨
- [x] **UX-01**: 移动端完成任务移除确认弹窗，改为 Undo Toast
- [ ] **UX-02**: 桌面端完成任务有动画仪式（✓ 弹跳 + strikethrough + 滑出 + Undo Toast）
- [ ] **UX-03**: 重复任务卡片常驻 🔄 图标，完成 Toast 含下次重复日期
- [ ] **UX-04**: Zustand 统一所有 UI 状态（替代 useState 双轨）
- [ ] **UX-05**: InlineCreatePopover 用 @floating-ui/react 替换手写定位

### KANBAN — 看板增强
- [ ] **KANBAN-01**: 每列可设置 WIP 限制，超出时列头视觉警示

### STATS — 洞察可操作
- [ ] **STATS-01**: Stats 视图每个洞察卡片旁有操作按钮，点击跳转预设过滤条件

### DISC — 发现性
- [ ] **DISC-01**: 有快捷键的按钮显示 tooltip 提示
- [ ] **DISC-02**: 首次使用 Top-5 快捷键引导 overlay
- [ ] **DISC-03**: 批量操作入口明确（Shift+Click / 工具栏按钮），底部浮动操作栏

### MINOR — 小 UX
- [ ] **MINOR-01**: 附件上传限制从 1.5MB 提升到 10MB + 进度条
- [ ] **MINOR-02**: 标签颜色选择器 hover 实时预览
- [ ] **MINOR-03**: 时间线视图红色"今天"竖线 + 自动居中
- [x] **MINOR-04**: 主内容区滚动条改为 thin auto-hide 样式

### PERF — 性能与韧性
- [ ] **PERF-01**: TaskCard/KanbanColumn 包裹 React.memo + 自定义 comparator
- [ ] **PERF-02**: 每个 page/view 用 React.lazy 代码拆分
- [ ] **PERF-03**: 离线队列升级 IndexedDB + 指数退避重试

### SYNC — 同步升级
- [ ] **SYNC-01**: Field-level merge 引擎：逐字段比较，单方修改自动合并
- [ ] **SYNC-02**: 冲突解决 UI：双方同字段冲突时并排展示，用户选择
- [ ] **SYNC-03**: Supabase tasks 表新增 field_versions JSONB 列

## Future Requirements
- 多 workspace 支持（URL 加入 /w/:wid 前缀）
- Deep link 分享给其他用户
- 多人协作（权限系统、@mention、通知）
- Obsidian 插件支持更多视图（Kanban/Calendar/Timeline）
- 跨平台功能集一致性策略

## Out of Scope (v2.0)
- 多人协作功能（先做极致个人工具）
- URL 分享（路由侧重状态恢复，不为分享场景优化）
- 跨平台功能集差异治理（标注为战略议题，非本期范围）
- Obsidian 插件功能扩展（v1.1 已完成，v2.0 聚焦 Web/Desktop）

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| ARCH-03, ARCH-04, ARCH-05, UX-01 | Phase 5 (安全网+速赢) | Pending |
| ARCH-01 | Phase 6 (App.tsx 拆分) | Complete |
| ARCH-02, MINOR-04 | Phase 7 (CSS 架构) | Pending |
| ROUTE-01..04 | Phase 8 (路由) | Pending |
| MATRIX-01..04 | Phase 9 (四象限) | Pending |
| DATE-01..05 | Phase 10 (双日期) | Pending |
| FILTER-01..03 | Phase 11 (搜索+NLP) | Pending |
| DND-01..03 | Phase 12 (拖拽) | Pending |
| UX-02..05 | Phase 13 (状态+UX) | Pending |
| KANBAN-01, STATS-01, DISC-01..03, MINOR-01..03 | Phase 14 (看板+发现性) | Pending |
| PERF-01..03, SYNC-01..03 | Phase 15 (性能+Merge) | Pending |

---
Last updated: 2026-04-13
