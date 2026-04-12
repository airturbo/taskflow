# 🏗️ 待办管理工具 — 技术架构文档 (ARCHITECTURE_DOC)

| 字段 | 值 |
|------|-----|
| **制品 ID** | ART-ARCH-0001 |
| **版本** | v1.0.0 |
| **状态** | draft |
| **产出角色** | system_architect |
| **关联 PRD** | ART-PRD-0001 v2.0.0 |
| **关联 UI_SPEC** | ART-UI-0001 v1.0.0 |
| **创建时间** | 2026-03-31 |

---

## 1. 架构目标

本轮目标不是一次性实现滴答清单全量能力，而是落地一个**单人本地优先的可用 MVP**，要求：

1. **启动简单**：开发环境与预览环境都足够轻，便于快速迭代。
2. **本地可用**：不依赖后端即可完成核心任务管理流程。
3. **可扩展**：后续接入 IndexedDB、云同步、协作能力时，尽量不推翻现有 UI 与状态模型。
4. **性能足够**：日常 500～2000 条任务范围内保持流畅。
5. **实现聚焦**：本轮聚焦任务、清单、今日、搜索、看板、番茄，不做协作与复杂日历。

---

## 2. 总体方案

### 2.1 技术选型

| 维度 | 方案 | 原因 |
|------|------|------|
| 前端框架 | React + TypeScript | 开发效率高，适合组件化页面 |
| 构建工具 | Vite | 启动快、配置轻、适合从零构建 MVP |
| 样式 | 原生 CSS + CSS Variables | 当前规模无需引入更重方案，便于快速打磨视觉细节 |
| 状态管理 | React `useReducer` + Context | 避免早期依赖膨胀，同时能清晰承载领域状态 |
| 持久化 | `localStorage` | 首发版最小可行，后续可替换为 Dexie/IndexedDB |
| 时间处理 | 原生 `Date` + 小量工具函数 | 先避免外部依赖，控制复杂度 |

### 2.2 应用结构

采用**单页前端应用**，以“单一领域状态 + 多视图派生”的模式组织：

- 核心实体统一存放在全局 store 中。
- 列表视图、今日视图、看板视图都从同一份任务数据派生。
- 番茄专注是独立功能面板，但可与当前选中任务关联。
- 数据持久化通过 store 变更后序列化写入浏览器存储实现。

---

## 3. 目录结构

```text
web/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── types/
│   │   └── domain.ts
│   ├── data/
│   │   └── seed.ts
│   ├── utils/
│   │   ├── dates.ts
│   │   ├── storage.ts
│   │   └── filters.ts
│   ├── store/
│   │   ├── app-store.tsx
│   │   └── reducer.ts
│   └── components/
│       ├── Shell.tsx
│       ├── Sidebar.tsx
│       ├── Topbar.tsx
│       ├── TaskComposer.tsx
│       ├── TaskList.tsx
│       ├── TaskCard.tsx
│       ├── TaskPanel.tsx
│       ├── KanbanView.tsx
│       ├── PomodoroPanel.tsx
│       └── StatsPanel.tsx
```

---

## 4. 核心数据模型

### 4.1 List

```ts
interface TodoList {
  id: string;
  name: string;
  color: string;
  kind: "system" | "custom";
}
```

### 4.2 Task

```ts
type Priority = "urgent" | "high" | "normal" | "low";
type Status = "todo" | "doing" | "done";

interface Task {
  id: string;
  title: string;
  description: string;
  listId: string;
  tags: string[];
  priority: Priority;
  status: Status;
  dueDate: string | null;
  completed: boolean;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
  focusMinutes: number;
}
```

### 4.3 Focus Session

```ts
interface FocusState {
  running: boolean;
  mode: "focus" | "break";
  remainingSeconds: number;
  selectedTaskId: string | null;
}
```

---

## 5. 状态管理策略

### 5.1 Store 边界

Store 中维护：
- `lists`
- `tasks`
- `selectedTaskId`
- `activeView`
- `activeListId`
- `searchKeyword`
- `focusState`
- `theme`

### 5.2 Action 设计

```ts
ADD_TASK
UPDATE_TASK
TOGGLE_TASK_COMPLETE
DELETE_TASK
RESTORE_TASK
ADD_LIST
SET_ACTIVE_VIEW
SET_ACTIVE_LIST
SET_SEARCH_KEYWORD
SELECT_TASK
START_FOCUS
PAUSE_FOCUS
RESET_FOCUS
TICK_FOCUS
TOGGLE_THEME
```

### 5.3 派生数据原则

不要把以下内容重复存入 store，而是在渲染阶段计算：
- 今日任务
- 搜索结果
- 看板列分组
- 统计卡片数字
- 已过期任务

这样能减少同步错误，并让多个视图共享同一真相源。

---

## 6. 关键模块设计

### 6.1 任务模块

负责：
- 新建 / 编辑 / 完成 / 删除 / 恢复
- 任务选择与详情侧板
- 按清单 / 今日 / 搜索结果派生展示

实现要点：
- 删除采用软删除字段 `deleted: true`
- 完成态与看板状态分离，但完成后统一归入 done
- 所有编辑操作即时写入 store，并自动持久化

### 6.2 视图模块

首发版实现：
- **List View**：默认视图，承载日常管理
- **Today View**：显示到期为今天或已逾期未完成任务
- **Kanban View**：按 `todo / doing / done` 三列分组

暂不实现完整月/周日历和时间线，但在顶部保留未来扩展入口空间。

### 6.3 番茄模块

功能边界：
- 25 分钟专注 / 5 分钟休息
- 开始 / 暂停 / 重置
- 可关联当前选中任务
- 完成一个专注周期后给任务累计 `focusMinutes`

为避免浏览器后台定时漂移，计时逻辑应采用：
- 记录目标结束时间戳
- 每秒计算剩余秒数
- 页面重新激活后自动纠偏

### 6.4 持久化模块

`storage.ts` 提供：
- `loadAppState()`
- `saveAppState()`

约束：
- 只序列化业务状态，不存临时 UI hover 状态
- 加载失败时回退到 seed data
- 本轮先用 `localStorage`，保留未来替换为 `adapter` 的位置

---

## 7. 组件职责划分

| 组件 | 职责 |
|------|------|
| `Shell` | 页面骨架，组织三栏布局 |
| `Sidebar` | 系统视图、自定义清单、主题切换 |
| `Topbar` | 搜索、视图切换、全局统计摘要 |
| `TaskComposer` | 快速新建任务 |
| `TaskList` | 任务集合展示 |
| `TaskCard` | 单条任务呈现与快捷操作 |
| `TaskPanel` | 任务详情编辑面板 |
| `KanbanView` | 三列任务板 |
| `PomodoroPanel` | 番茄计时与任务关联 |
| `StatsPanel` | 今日数、完成数、专注分钟数 |

---

## 8. 非功能要求

### 8.1 可维护性
- 领域类型统一定义在 `types/domain.ts`
- 组件保持“展示 + 少量交互”，复杂更新逻辑放 reducer
- 工具函数与 UI 组件分离

### 8.2 性能
- 派生数据使用 `useMemo`
- 任务列表避免不必要的全量重算
- 当前版本不做虚拟滚动，但组件层级控制在可维护范围内

### 8.3 可用性
- 主流程可纯鼠标完成
- 支持 Enter 快速创建任务
- 明显的优先级颜色与到期态样式
- 亮暗主题可切换

---

## 9. 后续演进路径

| 版本 | 方向 |
|------|------|
| v1.1 | 子任务、标签管理器、回收站面板 |
| v1.2 | Dexie / IndexedDB 持久化替换 localStorage |
| v1.3 | 完整日历与拖拽 |
| v1.4 | 习惯打卡 |
| v2.0 | 账号、云同步、协作 |

---

## 10. 实施建议

1. 先完成应用壳、store、任务 CRUD。
2. 再完成 Today / Search / Kanban 三个派生视图。
3. 最后补 Pomodoro 与视觉打磨。
4. 每一阶段都用 `npm run build` 做烟雾验证。

---

*本文档由系统架构师角色（system_architect）产出，用于指导当前 usable MVP 的技术落地。*
