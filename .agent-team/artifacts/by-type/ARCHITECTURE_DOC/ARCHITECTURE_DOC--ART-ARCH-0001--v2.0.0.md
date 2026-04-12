# 🏗️ 待办管理工具 — 技术架构文档 (ARCHITECTURE_DOC)

| 字段 | 值 |
|------|-----|
| **制品 ID** | ART-ARCH-0001 |
| **版本** | v2.0.0 |
| **状态** | approved |
| **产出角色** | system_architect |
| **关联 PRD** | ART-PRD-0001 v3.0.0 |
| **关联 UI_SPEC** | ART-UI-0001 v2.0.0 |
| **创建时间** | 2026-03-31 |

---

## 1. 架构目标

本轮不是继续补丁式扩展旧 MVP，而是重建一个能承接 TickTick 级工作台的前端骨架。目标如下：

1. **单一数据源**：所有视图从同一份任务/习惯/标签/过滤器数据派生。
2. **多视图承载**：列表、日历、看板、时间线、四象限共享同一任务实体。
3. **本地优先 Demo**：先以浏览器本地存储完成闭环，未来可替换到 IndexedDB/云同步。
4. **字段先行**：即使某些外部能力未真正接通，也先把数据模型设计正确。
5. **可快速重写 UI**：代码结构必须允许继续迭代，而不是再次把所有逻辑塞进单一视图分支里。

---

## 2. 技术方案

| 维度 | 方案 | 原因 |
|------|------|------|
| 前端框架 | React + TypeScript | 保持当前工程一致，便于快速重构 |
| 构建工具 | Vite | 快速启动与构建 |
| 状态管理 | `useReducer` + 派生选择器 | 本轮复杂度已高于简单 `useState` 脚本 |
| 样式 | 单独全局 CSS + 语义类名 | 保持构建轻量，利于快速打磨大界面 |
| 持久化 | localStorage + storage adapter | 先保闭环，后续可替换 IndexedDB |
| 图表 | 原生 DOM/CSS 表达 | Demo 阶段避免重依赖 |

---

## 3. 核心数据模型

### 3.1 Task
必须支持以下字段：
- `title`
- `note`
- `listId`
- `tagIds`
- `priority`
- `status`
- `startAt`
- `dueAt`
- `repeatRule`
- `reminders[]`
- `subtasks[]`
- `attachments[]`
- `estimatedPomodoros`
- `completedPomodoros`
- `focusMinutes`
- `assignee`
- `comments[]`
- `activity[]`
- `deleted`
- `completed`

### 3.2 Supporting Entities
- `Folder`
- `TodoList`
- `Tag`
- `SavedFilter`
- `Habit`
- `FocusState`
- `ThemePreference`

---

## 4. 目录建议

```text
web/src/
├── App.tsx
├── index.css
├── types/
│   └── domain.ts
├── data/
│   └── seed.ts
├── utils/
│   ├── dates.ts
│   ├── storage.ts
│   └── smart-entry.ts
└── （后续可继续拆分 components/ views/ store/）
```

说明：
- 本轮可接受 `App.tsx` 仍较大，但必须按“状态、选择器、视图组件、纯工具函数”组织段落
- 下一轮优先拆 `components/` 与 `store/`

---

## 5. 状态组织

### 5.1 Store 边界
Store 内维护：
- folders / lists / tags / filters
- tasks / habits
- active workspace context
- current view mode
- search keyword
- selected task id
- focus state
- theme

### 5.2 派生数据
以下内容必须派生，不得重复存储：
- 今日任务
- 最近 7 天任务
- 看板列分组
- 时间线跨度
- 四象限归类
- 各类统计指标
- 标签计数 / 清单计数

### 5.3 更新原则
- 所有实体修改都通过统一 action 入口
- 详情面板修改实时回写
- 任何视图中的操作都回到统一任务实体

---

## 6. 视图架构

### 6.1 Task Workspace Views
- ListView
- CalendarView
- KanbanView
- TimelineView
- MatrixView

这些视图接收的不是各自私有数据，而是同一组“当前上下文任务 + 派生规则”。

### 6.2 Tool Views
- HabitsView
- StatsView
- FocusPanel / FocusView

### 6.3 Detail Rail
右栏永远服务于“当前上下文”：
- 选中任务时显示详情
- 未选中任务时显示使用提示与焦点信息

---

## 7. 持久化策略

`storage.ts` 提供：
- `loadState()`
- `saveState()`

约束：
- 保存完整业务状态
- 排除只影响瞬时动画的 UI 状态
- 为未来改造成 `StorageAdapter` 预留接口形态

---

## 8. 平台受限能力的技术策略

| 能力 | 本轮策略 |
|------|----------|
| 位置提醒 | 数据模型保留，界面展示，不做真实能力 |
| 浏览器通知 | 先保留提醒中心与任务提醒字段 |
| 外部日历同步 | 保留订阅入口与占位态 |
| 文件上传 | 先存文件名与类型占位 |
| 多人协作 | 先存 assignee / comments / activity，本地化反馈 |

---

## 9. 实施建议

1. 先重写领域类型和种子数据
2. 再重写主工作台骨架与顶部/侧边/右栏
3. 再落列表、日历、看板、时间线、四象限
4. 最后接习惯、番茄、统计与细节打磨
5. 每一步都保证构建通过并可预览

---

*本文档由系统架构师角色产出，用于保证本轮 Demo 不是再做一次浅层待办页，而是建立可延展的生产力工作台骨架。*
