# ROADMAP — TaskFlow

## Milestone v1.1 — 同步优化与 Obsidian 升级 ✅ COMPLETED

| Phase | Title | Status | Completed |
|-------|-------|--------|-----------|
| Phase 1 | Obsidian 同步频率优化 | ✅ Done | 2026-04 |
| Phase 2 | Obsidian 插件 UI 大幅升级 | ✅ Done | 2026-04 |
| Phase 3 | Web 端实时同步降频优化 | ✅ Done | 2026-04 |
| Phase 4 | 代码质量与错误处理 | ✅ Done | 2026-04 |

**Summary:** Obsidian sync debounce 2000ms+、插件 UI 升级（Command Palette / TaskDetailPanel / WorkspaceSidebar）、Web Realtime 指数退避 + visibilitychange 暂停、JWT 自动刷新、导出错误统一处理。

---

## Milestone v2.0 — 交互体验全面优化

**总计 44 需求 · 11 阶段 · ~14 周 · ~51 dev-days**

策略：个人体验优先，架构先行，渐进式拆分，field-level merge 架构就绪后落地。

---

### Phase 5: 安全网 + 速赢（~3 days） ✅
**Goal:** 建立错误隔离 + 离线队列防护 + 第一个用户可感知改进

| REQ | Description | Est |
|-----|-------------|-----|
| ARCH-03 | 每个视图独立 React Error Boundary | 0.5d |
| ARCH-04 | 离线队列 500 条上限 + 7 天过期 | 0.5d |
| ARCH-05 | 移除全局 `* { transition: all }`，按需精确声明 | 0.5d |
| UX-01 | 移动端完成任务：移除确认弹窗 → Undo Toast | 1.5d |

**Depends on:** —

---

### Phase 6: App.tsx 拆分（~5 days） ✅
**Goal:** 将 App.tsx 从巨石拆分为 <400 行壳 + 5+ 状态 hooks

| REQ | Description | Est |
|-----|-------------|-----|
| ARCH-01 | App.tsx 拆分：状态分域为独立 hooks（tasks/ui/filters/sync/workspace） | 5d |

**Depends on:** Phase 5

---

### Phase 7: CSS 架构（~4 days） ✅ COMPLETE
**Goal:** 6908 行单文件 CSS → CSS Modules 模块化

| REQ | Description | Est |
|-----|-------------|-----|
| ARCH-02 | CSS 拆分为 CSS Modules，按组件/视图模块化 | 3.5d |
| MINOR-04 | 主内容区滚动条 thin auto-hide 样式 | 0.5d |

**Depends on:** Phase 6

---

### Phase 8: 路由系统（~5 days）
**Goal:** 引入客户端路由，视图状态可恢复

| REQ | Description | Est |
|-----|-------------|-----|
| ROUTE-01 | 引入客户端路由，每个视图独立 URL | 2d |
| ROUTE-02 | 搜索词/过滤器/选中任务序列化到 URL params | 1d |
| ROUTE-03 | 浏览器刷新后恢复完全相同视图状态 | 1d |
| ROUTE-04 | 浏览器 back/forward 正确导航 | 1d |

**Depends on:** Phase 6

---

### Phase 9: 四象限修正（~5 days）
**Goal:** isUrgent/isImportant 独立字段替代标签驱动

| REQ | Description | Est |
|-----|-------------|-----|
| MATRIX-01 | 新增 isUrgent/isImportant 独立布尔字段 | 1d |
| MATRIX-02 | 数据迁移：tag → 独立字段，清理 tagIds | 2d |
| MATRIX-03 | 矩阵拖拽修改独立字段而非标签 | 1d |
| MATRIX-04 | 卡片显示分类理由 pill + hover tooltip | 1d |

**Depends on:** Phase 6

---

### Phase 10: 双日期体验强化（~5 days）
**Goal:** dueAt + deadlineAt 双日期模型在所有视图中清晰展示

| REQ | Description | Est |
|-----|-------------|-----|
| DATE-01 | 所有视图双日期同时展示，颜色/图标区分 | 1.5d |
| DATE-02 | Focus Tab 5 组区分 + 清晰副标题 | 1d |
| DATE-03 | dueAt > deadlineAt 警告 badge + 一键修正 | 1d |
| DATE-04 | 日历视图双天标记（蓝 dueAt / 红 deadlineAt） | 1d |
| DATE-05 | 快速创建默认"计划完成"，可展开添加"截止日期" | 0.5d |

**Depends on:** Phase 8

---

### Phase 11: 搜索过滤统一 + NLP（~5 days）
**Goal:** 统一 FilterState 模型 + URL 序列化 + NLP 预览

| REQ | Description | Est |
|-----|-------------|-----|
| FILTER-01 | 统一 FilterState 模型驱动搜索栏/CommandPalette/Saved Filters | 2d |
| FILTER-02 | 过滤状态序列化到 URL search params | 1d |
| FILTER-03 | NLP 输入实时解析预览（日期/标签/优先级 chip） | 2d |

**Depends on:** Phase 8

---

### Phase 12: 统一拖拽（~4 days）
**Goal:** @dnd-kit 统一拖拽，桌面+移动端

| REQ | Description | Est |
|-----|-------------|-----|
| DND-01 | KanbanView 迁移到 @dnd-kit | 2d |
| DND-02 | AppShell 共享 DndProvider | 1d |
| DND-03 | 桌面鼠标 + 移动触摸拖拽验证 | 1d |

**Depends on:** Phase 6

---

### Phase 13: 状态管理 + UX 打磨（~5 days）
**Goal:** Zustand 统一 UI 状态 + 完成动画 + 重复任务提示 + 浮动定位

| REQ | Description | Est |
|-----|-------------|-----|
| UX-02 | 桌面端完成动画仪式（✓弹跳 + strikethrough + 滑出 + Undo Toast） | 1.5d |
| UX-03 | 重复任务卡片 🔄 图标 + 完成 Toast 含下次日期 | 1d |
| UX-04 | Zustand 统一所有 UI 状态（替代 useState 双轨） | 1.5d |
| UX-05 | InlineCreatePopover 用 @floating-ui/react 替换手写定位 | 1d |

**Depends on:** Phase 6

---

### Phase 14: 看板增强 + 发现性 + 小 UX（~5 days）
**Goal:** WIP 限制、Stats 操作按钮、快捷键引导、批量操作、小修小补

| REQ | Description | Est |
|-----|-------------|-----|
| KANBAN-01 | 每列 WIP 限制，超出时列头视觉警示 | 1d |
| STATS-01 | Stats 洞察卡片旁操作按钮 → 跳转预设过滤 | 0.5d |
| DISC-01 | 有快捷键的按钮显示 tooltip 提示 | 0.5d |
| DISC-02 | 首次使用 Top-5 快捷键引导 overlay | 1d |
| DISC-03 | 批量操作入口（Shift+Click / 工具栏） + 底部浮动操作栏 | 1d |
| MINOR-01 | 附件上传限制 1.5MB → 10MB + 进度条 | 0.5d |
| MINOR-02 | 标签颜色选择器 hover 实时预览 | 0.25d |
| MINOR-03 | 时间线视图红色"今天"竖线 + 自动居中 | 0.25d |

**Depends on:** Phase 8, Phase 12

---

### Phase 15: 性能 + Field-level Merge（~5 days）
**Goal:** 渲染性能优化 + 代码拆分 + 离线队列 IndexedDB + 冲突解决 UI

| REQ | Description | Est |
|-----|-------------|-----|
| PERF-01 | TaskCard/KanbanColumn React.memo + 自定义 comparator | 1d |
| PERF-02 | 每个 page/view React.lazy 代码拆分 | 1d |
| PERF-03 | 离线队列升级 IndexedDB + 指数退避重试 | 1d |
| SYNC-01 | Field-level merge 引擎：逐字段比较，单方修改自动合并 | 1d |
| SYNC-02 | 冲突解决 UI：双方同字段冲突并排展示，用户选择 | 0.5d |
| SYNC-03 | Supabase tasks 表新增 field_versions JSONB 列 | 0.5d |

**Depends on:** Phase 13

---

## Phase Dependency Graph

```
Phase 5 (安全网+速赢)
  └─→ Phase 6 (App.tsx 拆分)
        ├─→ Phase 7 (CSS 架构)
        ├─→ Phase 8 (路由)
        │     ├─→ Phase 10 (双日期)
        │     ├─→ Phase 11 (搜索+NLP)
        │     └─→ Phase 14 (看板+发现性) ←── Phase 12
        ├─→ Phase 9 (四象限)
        ├─→ Phase 12 (统一拖拽)
        └─→ Phase 13 (状态+UX)
              └─→ Phase 15 (性能+Merge)
```

---
Last updated: 2026-04-13
