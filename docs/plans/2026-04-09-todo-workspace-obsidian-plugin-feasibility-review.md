## Todo 管理工具改造成 Obsidian 插件的可行性评审

日期：2026-04-09  
对象：`web/` 待办管理工具  
目标：评估当前 Todo Workspace 是否适合改造成 Obsidian 插件，并给出评估方案与落地计划。

### 1. 结论先行

**结论：具备可行性，但不适合“直接搬运”，适合“保留领域模型与核心业务规则，重做宿主适配层与部分 UI 外壳”。**

更准确地说：

- **可复用**：任务领域模型、CRUD 规则、筛选逻辑、提醒规则、快速录入解析、多视图里的部分 React 组件思想。
- **必须重做**：存储层、宿主交互层、附件处理、通知策略、插件入口、视图挂载、设置页、命令系统。
- **不建议首版保留**：Supabase 账号体系、Tauri 能力链路、桌面 SQLite 双持久化路线。

建议路线不是把现有 `web/` 原样塞进 Obsidian，而是按“**内核复用 + 平台适配**”方式推进：

1. 先抽出 `domain / application / infra` 三层。  
2. 再做 Obsidian 插件宿主适配。  
3. 先做 **Vault-first / local-first / desktop-first** 的 MVP。  
4. 最后才考虑云同步或 Markdown 双向同步。

### 2. 当前代码现状 review（基于最新代码）

### 2.1 当前产品形态

当前待办工具主实现集中在 `web/`：

- 前端：React + TypeScript + Vite
- 桌面壳：Tauri
- 云能力：Supabase（认证 + workspace 状态快照）

整体更像：**Web App 优先，Tauri 作为桌面外壳，Supabase 作为可选云同步后端**。

### 2.2 当前代码结构特征

#### 优点

- 领域模型较完整：`Task / Tag / List / Reminder / Subtask / Comment / Attachment` 已成型。
- 功能闭环完整：创建、编辑、完成、恢复、删除、复制、提醒、评论、附件、日历、时间线、看板、四象限都有实现。
- 任务筛选逻辑清晰：`today / upcoming / inbox / completed / trash / list / tag / filter` 口径明确。
- 提醒规则和时间语义较强：同时支持 `planned / deadline / start`。
- 认证是可选增强，不是强依赖；未配置 Supabase 时也能本地运行。

#### 主要问题

- **`App.tsx` 过大**：当前主文件超过 5k 行，承担了状态管理、视图切换、业务规则、拖拽、详情面板、提醒、onboarding 等过多职责。
- **平台耦合明显**：同时混用了浏览器 API、Tauri API、Supabase 逻辑。
- **持久化路线存在历史分叉**：当前主链路已经回到 `localStorage + Supabase`，但仓库里仍保留了一套较完整的 Tauri SQLite repository。
- **桌面能力未真正成为主链路**：虽然有 SQLite、文件选择器、原生通知适配，但 `desktopMode` 已被废弃。
- **品牌与存储命名有历史包袱**：`Todo Workspace / FlowTask / flowtask-v2 / ticktick-parity-demo-v2` 并存，说明仍处于演进中。

### 2.3 对插件化最关键的代码事实

#### 事实 A：主应用核心仍是 Web 状态驱动

当前入口是 `src/main.tsx -> AuthGate -> App`，说明主应用仍是标准 React SPA，而不是宿主原生驱动。

#### 事实 B：当前真实持久化主链路是 `localStorage + Supabase`

`storage.ts` 的实际策略是：

- 写入：先写 `localStorage`，再节流同步到 Supabase
- 读取：优先拉 Supabase，失败则回退本地
- 云端数据结构：`workspace_states.state_json` 整体快照

这意味着：**当前数据同步不是操作级、不是 CRDT、不是 Markdown-native，而是状态快照型同步。**

#### 事实 C：桌面 SQLite 能力存在，但当前未接为主链路

仓库里有：

- `src/utils/desktop-sqlite.ts`
- `src/utils/desktop-repository.ts`

它们已经实现结构化表、迁移和查询能力，但当前 `App.tsx` 里明确把 `desktopMode` 固定为废弃状态。因此这部分更像“已做过探索 / 可复用资产”，不是当前稳定架构的核心。

#### 事实 D：当前附件与通知都有宿主耦合

- 附件：网页端走 `dataUrl`，桌面端尝试走本地路径 + Tauri dialog/opener。
- 通知：浏览器 Notification 与 Tauri notification 做双适配。

改成 Obsidian 插件时，这两条都不能直接继承，需要换成 Obsidian 语义。

### 3. Obsidian 插件框架要点

基于官方文档与 sample plugin，Obsidian 插件的基本框架如下：

### 3.1 交付物

一个标准 Obsidian 插件产物通常是：

- `manifest.json`
- `main.js`
- `styles.css`

其中：

- `manifest.json` 提供 `id / name / version / minAppVersion / author / isDesktopOnly` 等元数据。
- `main.js` 是打包后的插件入口。
- 官方 sample plugin 默认使用 `esbuild`，输出格式为 `cjs`，并把 `obsidian` 设为 external。

### 3.2 插件入口能力

插件通常继承 `Plugin` 基类，并在 `onload()` 中注册：

- `addCommand`
- `addRibbonIcon`
- `addStatusBarItem`
- `addSettingTab`
- `registerView`
- `registerEvent`

同时插件可通过：

- `this.loadData()` / `this.saveData()` 保存插件私有数据
- `app.vault` 访问 Vault 文件
- `app.workspace` 管理视图与工作区挂载

### 3.3 UI 承载方式

Obsidian 支持通过自定义 `ItemView` 挂载复杂 UI；这意味着：

- 可以做一个独立的 Todo Workspace 面板
- 可以挂在左侧栏、右侧栏或主工作区 tab 中
- 可以在 View 里自行挂 React Root

这对当前项目很关键：**多视图工作台不是不能做，而是要改成“插件 View 内运行的 React 应用”。**

### 3.4 对平台能力的现实约束

Obsidian 插件虽然运行在桌面应用里，但它不是 Tauri 宿主，因此：

- **不能直接使用 Tauri plugin API**
- 不能直接沿用当前的 `@tauri-apps/plugin-dialog / opener / sql / notification`
- 更适合使用 Obsidian 提供的 `Vault / Workspace / Modal / SettingTab / Notice` 等能力

### 4. 可行性判断：哪些能迁，哪些要重做

### 4.1 高可复用部分

#### 1) 领域模型

可直接迁移或轻量调整：

- `Task`
- `Tag`
- `TodoList`
- `Reminder`
- `Subtask`
- `Comment`
- `PersistedState`

这部分已经比较成熟，适合作为插件化的内核模型。

#### 2) 业务规则

高价值可复用逻辑包括：

- `commitTask`
- `updateTask`
- `toggleTaskComplete`
- `moveTaskToStatus`
- `restoreTask`
- `duplicateTask`
- `getTasksForSelection`
- `applySavedFilter`
- `matchesSearch`
- `matchesSelectedTags`
- `normalizeTaskPatch`
- `getQuadrant / getTagIdsForQuadrant`
- `parseSmartEntry`
- `reminder-engine.ts`

这些逻辑本质上与宿主关系不大，应该优先抽离。

#### 3) 部分 React 视图思想

虽然不能直接无脑搬运，但以下视图的结构思路有较强复用价值：

- `ListView`
- `CalendarView`
- `KanbanView`
- `TimelineView`
- `MatrixView`
- `TaskDetailPanel`

推荐保留其交互模型，但拆分为更小组件后再接入 Obsidian View。

### 4.2 中等改造部分

#### 1) 提醒中心

当前提醒中心基于：

- 内存中的 reminder feed
- 浏览器 / Tauri 通知
- 轮询触发

插件里可以保留：

- 提醒规则计算
- feed 展示
- 命令入口

但要改写：

- 通知触达方式
- 后台触发与生命周期管理

现实上，首版更适合做“**当 Obsidian 正在打开时，插件内提醒生效**”，而不是承诺系统级长期后台提醒。

#### 2) 多视图工作台

Obsidian 可承载复杂 View，但当前视图交互默认假设的是一个完整应用 shell。迁移时要处理：

- Obsidian 面板尺寸变化
- 侧边栏/主区切换
- 与 Obsidian 快捷键冲突
- 拖拽在插件 panel 中的可用性

结论：**能做，但需要重新适配布局和交互边界。**

### 4.3 必须重做部分

#### 1) 存储层

当前 `localStorage + Supabase` 不适合作为插件主存储方案。更合理的插件化方案有两种：

- **方案 A：插件私有 JSON 存储**
  - 使用 `this.loadData()` / `this.saveData()` 保存整个 workspace state
  - 优点：迁移成本最低，最容易复用现有状态模型
  - 缺点：不够 Obsidian-native，数据不直接体现在笔记里

- **方案 B：Vault 文件化存储**
  - 将任务保存在 Vault 中的 JSON/Markdown 文件，例如 `Todo Workspace/*.json` 或特定 `.md`
  - 优点：更符合 Obsidian 本地文件哲学
  - 缺点：实现复杂度更高，需要处理文件读写、索引与冲突

**建议：MVP 先 A，第二阶段再评估 B 或混合方案。**

#### 2) 附件模型

当前附件支持：

- 小文件内嵌 dataUrl
- 本地路径

但在 Obsidian 里更合理的附件语义应是：

- 指向 Vault 内文件
- 或复制到约定附件目录后建立引用

因此附件能力要改造成“**Vault file reference first**”。

#### 3) Tauri 适配层

以下依赖应视为不可直接复用：

- `@tauri-apps/plugin-dialog`
- `@tauri-apps/plugin-opener`
- `@tauri-apps/plugin-sql`
- `@tauri-apps/plugin-notification`

这意味着当前桌面壳相关代码不能成为插件 MVP 的基础。

#### 4) Supabase 账号体系

从产品定位上看，Obsidian 用户更接受：

- 本地优先
- Vault 内可追踪数据
- 尽量少引入额外账户体系

因此当前的 `AuthGate / AuthPage / MigrationWizard / useAuth / Supabase session` 整套链路，不建议作为首版插件核心。  
如果未来保留，也应作为**可选同步增强**，而不是入口必经路径。

### 5. 推荐的插件化目标形态

### 5.1 不建议的目标

**不要把当前产品完整等价搬成 Obsidian 社区插件首版。**

原因：

- 宿主语义不一样
- 过度耦合浏览器/Tauri/Supabase
- 首版很容易做成“能跑但不 Obsidian-native”

### 5.2 建议的目标

建议定义一个更合理的首版目标：

**Obsidian Todo Workspace Plugin MVP**

能力边界：

- 在 Obsidian 中提供一个独立 Todo Workspace View
- 支持任务 CRUD
- 支持 list / tag / saved filter
- 支持 list / kanban / agenda 三个核心视图
- 支持任务详情、子任务、评论、提醒规则
- 本地持久化（插件私有 JSON）
- 支持从/向 Markdown 任务做有限导入导出（可选）

首版暂不承诺：

- Supabase 登录/多端云同步
- Tauri 本地文件能力
- 完整 timeline 拖拽
- 完整 matrix 拖拽
- 系统级长期后台提醒
- 多人协作

### 6. 可行性评估方案

建议把评估拆成 **5 个维度 + 2 周技术 Spike**。

### 6.1 评估维度

#### 维度 A：框架适配可行性

目标：确认 Obsidian 是否能承载一个复杂 Todo 面板。

检查项：

- 能否在 `ItemView` 中挂 React 应用
- 能否在主区稳定承载复杂布局
- 面板 resize 时布局是否可接受
- 命令、设置页、Ribbon、状态栏是否能无缝接入

通过标准：

- 成功打开一个自定义 Todo View
- 支持视图切换与状态保持
- 无明显宿主冲突

#### 维度 B：状态与存储适配可行性

目标：确认当前状态模型能否脱离 `localStorage + Supabase`。

检查项：

- `PersistedState` 是否能直接用 `loadData/saveData` 存取
- 数据量增长后的读写性能
- Vault 切换 / 插件重载后的恢复能力

通过标准：

- 500~2000 条任务下加载与保存流畅
- 插件重启后状态一致
- 不依赖浏览器 localStorage

#### 维度 C：UI 与交互迁移可行性

目标：确认关键交互在 Obsidian 面板中是否还能成立。

优先验证：

- `ListView`
- `KanbanView`
- `TaskDetailPanel`
- 轻量 `AgendaView`

延后验证：

- `TimelineView`
- `MatrixView`
- 大量 pointer drag

通过标准：

- 核心信息密度和操作路径不劣化
- 拖拽即使降级，也能用命令/按钮替代

#### 维度 D：宿主语义适配程度

目标：确认它不是“嵌了一个网页”，而是像 Obsidian 插件。

检查项：

- 是否支持 Obsidian Command Palette
- 是否有 Setting Tab
- 是否能与 Vault/当前笔记形成关系
- 是否可 desktop-only 起步

通过标准：

- 至少 3 个入口：命令、Ribbon、View
- 至少 1 个 Obsidian-native 数据交互点

#### 维度 E：工程复杂度与可维护性

目标：确认改造不是一次性工程灾难。

检查项：

- `App.tsx` 拆分成本
- 平台适配层边界是否清楚
- 是否能建立单独 `packages/core` 或 `src/core`
- 是否能把 React 视图层与宿主层隔离

通过标准：

- 形成明确目录分层
- 插件宿主不直接依赖 Web/Tauri/Supabase 旧实现

### 6.2 两周 Spike 交付物

建议用两个技术 Spike 作为决策门：

#### Spike 1：最小插件壳

交付：

- 一个可在 Obsidian 中启用的插件工程
- `manifest.json + main.ts + SettingTab + View`
- React 成功挂入自定义 View
- 一个最小任务列表可以显示和创建

成功标准：

- 插件可开发态运行
- `loadData/saveData` 持久化通
- 热更新/重载流程稳定

#### Spike 2：核心业务迁移验证

交付：

- 抽离后的 `task core` 模块
- 任务 CRUD
- tag/filter
- detail panel
- 简化版 kanban 或 agenda

成功标准：

- 不依赖 `localStorage`
- 不依赖 Tauri API
- 不依赖 Supabase 登录链路
- 代码结构已出现宿主隔离层

### 6.3 决策门

两周后只回答 3 个问题：

1. **是否能做？**
2. **首版应该做到哪里？**
3. **是否值得继续按产品形态推进，而不是只做轻量任务面板？**

若 Spike 通过，则进入 MVP 开发。  
若 Spike 不通过，则退而做“Markdown task 增强插件”，而不是完整工作台。

### 7. 落地计划

### Phase 0：整理现有代码（3~5 天）

目标：为插件化扫清结构障碍。

任务：

- 从 `App.tsx` 抽离：
  - `domain`
  - `selectors`
  - `task mutations`
  - `reminder rules`
  - `smart entry`
- 定义平台接口：
  - `StorageAdapter`
  - `NotificationAdapter`
  - `AttachmentAdapter`
  - `WorkspaceHostAdapter`
- 去掉核心层对 `window/localStorage/Tauri/Supabase` 的直接依赖

产物：

- `core/` 目录
- `platform/` 目录
- 插件化前的内核接口清单

### Phase 1：建立 Obsidian 插件骨架（2~3 天）

目标：让插件在 Obsidian 中跑起来。

任务：

- 新建插件工程（建议独立子目录，如 `obsidian-plugin/`）
- 配置 `manifest.json`
- 实现 `main.ts`
- 注册：
  - Command
  - Ribbon Icon
  - Setting Tab
  - Custom View
- 在 View 中挂载 React Root

产物：

- 可被 Obsidian 识别与加载的插件壳

### Phase 2：接入最小任务内核（4~6 天）

目标：跑通 MVP 的最小闭环。

任务：

- 用插件 `loadData/saveData` 替换旧 `storage.ts`
- 接入核心状态
- 实现：
  - create task
  - update task
  - complete task
  - delete/restore task
  - list / tag / filter
  - detail panel

产物：

- 可在 Obsidian 中独立使用的最小任务工作区

### Phase 3：补 2~3 个高价值视图（4~7 天）

目标：做出“值得用”的版本，而不是只有列表。

建议优先级：

1. `ListView`
2. `KanbanView`
3. `Agenda/Calendar-lite`

建议推迟：

- `TimelineView`
- `MatrixView`
- 高复杂 pointer drag

原因：这些是视觉加分项，但不是 MVP 的生死线。

### Phase 4：做 Obsidian-native 增强（3~5 天）

目标：让它真正像插件，而不是嵌网页。

任务：

- 从当前 note 创建任务
- 把任务链接回 note
- 支持命令面板快速创建
- 支持与 Vault 中附件建立引用
- 增加插件设置：
  - 默认存储策略
  - 默认视图
  - 是否 desktop-only
  - 提醒策略

### Phase 5：第二阶段能力评估（后续）

按价值再决定是否继续：

- Markdown task 导入/导出
- Vault 文件化存储
- 与 Daily Note/Calendar 集成
- Supabase 可选同步
- 更复杂的 timeline/matrix

### 8. 推荐的技术策略

### 8.1 架构策略

推荐目标结构：

- `core/`
  - 纯业务模型与规则
- `ui/`
  - React 组件
- `host-web/`
  - 当前 Web/Tauri 宿主适配
- `host-obsidian/`
  - Obsidian 插件宿主适配

核心原则：

**让任务系统是产品内核，让 Web / Tauri / Obsidian 只是不同宿主。**

### 8.2 数据策略

MVP 建议：

- 主存储：插件私有 JSON（`loadData/saveData`）
- 备选导出：JSON 导出到 Vault
- 暂不做：Supabase 登录同步

### 8.3 产品策略

MVP 建议定位为：

**面向 Obsidian 用户的“结构化待办工作台插件”**  
而不是“把现有独立 Todo 产品原封不动搬进 Obsidian”。

### 9. 风险清单

### 高风险

- `App.tsx` 拆分不彻底，导致插件壳继续耦合旧实现
- timeline / matrix / pointer drag 在 Obsidian 中体验不稳
- 继续保留 Supabase/Tauri 历史包袱，导致插件复杂度失控

### 中风险

- 插件数据存在私有存储中，不够 Markdown-native，用户预期可能有落差
- 附件处理改造成 Vault 引用后，现有体验会变化
- 通知在插件场景下无法完全等价系统级提醒

### 低风险

- React 组件本身复用
- 命令/设置/View 接入
- 本地单用户使用场景

### 10. 最终建议

**建议做，但要换打法。**

不是“把这个工具做成 Obsidian 插件”这句话本身不可行，  
而是“**按现有代码直接搬**”不可行。

正确路线应是：

- **短期**：做一个 `desktop-only` 的 Obsidian MVP 插件，保留任务内核，重做宿主适配。
- **中期**：补 Obsidian-native 入口与 Vault 数据关系。
- **长期**：再决定是否做 Markdown 双向同步、云同步、多端一致性。

如果只问一句值不值得：

**值得做一个 MVP 级插件化尝试。**  
因为当前代码里最有价值的，不是 Web/Tauri 外壳，而是已经积累出来的**任务模型、筛选规则、提醒逻辑和多视图工作流**；这些资产具备跨宿主复用价值。

### 11. 建议的下一步最小执行清单

如果马上开做，建议顺序如下：

1. 先把 `App.tsx` 中任务规则和平台耦合代码分离。  
2. 新建一个最小 `obsidian-plugin/` 壳工程。  
3. 先跑通 `loadData/saveData + ListView + TaskDetailPanel`。  
4. 再补 `KanbanView`。  
5. 通过两周 Spike 后，再决定是否继续做 agenda / markdown sync / vault file storage。  
