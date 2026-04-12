## Obsidian 插件独立支线启动方案

日期：2026-04-09  
目标：在**不影响现有 `web/` 主项目**的前提下，单独起一个 Obsidian 插件支线工程，作为 Todo Workspace 插件化 Spike 的落地起点。

### 1. 本次决策

基于前一轮可行性评审，当前正式采用：

- **目录隔离**：在仓库根目录新增 `todo-obsidian-plugin/`
- **依赖隔离**：单独 `package.json`
- **运行隔离**：当前阶段不改 `web/`、不复用其运行时代码
- **迁移策略**：先在新项目里验证 Obsidian 宿主闭环，再把旧项目中的领域逻辑按模块复制/抽离进来

这样做的原因是：

1. 现有主项目仍处于演进中，`App.tsx` 与平台层耦合较重；
2. 如果一开始就边拆主线边做插件，很容易让两个方向互相拖累；
3. Obsidian 插件要先验证的是宿主边界、视图承载、持久化和命令系统，这些并不要求立刻复用主线全部代码。

### 2. 当前支线工程范围

新建的 `todo-obsidian-plugin/` 已包含：

- `manifest.json`
- `versions.json`
- `esbuild.config.mjs`
- `src/main.ts`
- `src/view.ts`
- `src/settings.ts`
- `src/ui/TodoWorkspaceApp.tsx`
- `styles.css`
- `README.md`

最小功能闭环：

- 插件注册与加载
- 自定义 Todo Workspace View
- Ribbon / Command / Setting Tab
- `loadData/saveData` 本地持久化
- 最小任务创建、完成、删除
- 从当前活动笔记捕获任务

### 3. 与主项目的边界约束

当前阶段明确约束：

- **不直接 import `web/` 里的模块**，避免构建边界、样式、依赖树和平台逻辑互相污染；
- **不改 `web/` 的现有功能实现**，避免主线回归风险；
- **不急于迁移 Supabase / Tauri / localStorage 旧链路**，只保留 Obsidian 原生宿主所需的最小数据路径。

换句话说，这个支线当前的职责不是“复刻主产品”，而是先证明：

**Todo Workspace 的交互模式是否能在 Obsidian 插件框架下稳定落地。**

### 4. 接下来的推进顺序

#### Phase A：把支线壳跑稳

- 安装依赖
- 完成本地构建
- 在真实 Vault 内完成手工加载验证
- 校正 View 打开位置、样式和生命周期

#### Phase B：逐步迁移高价值核心

优先迁移：

- `Task` 领域模型
- CRUD / toggle / restore / duplicate 规则
- filter / selector
- smart entry
- reminder engine

暂缓迁移：

- Supabase 认证与同步
- Tauri 桌面能力
- timeline / matrix 等重交互视图

#### Phase C：进入 MVP 形态

- `TaskDetailPanel`
- `ListView`
- `KanbanView`
- Obsidian note backlink
- Vault 附件引用

### 5. 决策门

建议把这个独立支线作为 **1~2 周 Spike** 使用。到时重点只看三件事：

1. **宿主是否稳定承载复杂 Todo 面板**
2. **任务内核能否在不依赖旧平台能力的情况下迁入**
3. **这个方向是否值得继续产品化**

如果这三个问题答案都偏正向，再考虑第二阶段把主项目里真正有价值的领域逻辑系统化迁入。
