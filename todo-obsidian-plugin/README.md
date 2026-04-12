## Todo Workspace for Obsidian

这是一个**完全独立于 `web/` 主项目**的 Obsidian 插件支线，用来验证 Todo Workspace 改造成 Obsidian 插件的可行性。

### 设计原则

- **零侵入主线**：当前阶段不修改 `web/`，也不直接从 `web/` 运行时引用代码。
- **先验证宿主，再迁核心**：先跑通 `manifest + main.ts + View + SettingTab + loadData/saveData`，再有选择地迁任务内核。
- **宿主边界明确**：Obsidian 能力只出现在这个子项目里，避免和原有 `Tauri / localStorage / Supabase` 逻辑混用。

### 当前已实现

- 自定义 `Todo Workspace` View
- Ribbon Icon + Command Palette 入口
- 插件设置页
- 基于 `loadData/saveData` 的最小任务持久化
- React 驱动的最小任务列表 CRUD
- 从当前活动笔记快速捕获任务

### 本地开发

1. 进入目录：`cd todo-obsidian-plugin`
2. 安装依赖：`npm install`
3. 开发监听：`npm run dev`
4. 生产构建：`npm run build`

### 建议的调试接法

推荐把这个目录软链接到某个 Obsidian Vault 的插件目录，例如：

- 目标目录：`<YourVault>/.obsidian/plugins/todo-workspace-plugin`
- 然后在插件目录中确保存在：`manifest.json`、`main.js`、`styles.css`

一个常见做法是：

1. 在 Vault 里创建插件目录
2. 将当前项目目录软链接过去，或把构建产物拷贝过去
3. 回到 Obsidian 中重新加载社区插件

### 下一步建议

- **Phase 1**：继续补 `TaskDetailPanel`、分组筛选、批量操作
- **Phase 2**：从 `web/` 中抽 `domain / selectors / smart entry / reminder-engine`
- **Phase 3**：评估 `KanbanView` 与 Vault 文件化存储

### 重要说明

这个子项目现在的目标是**验证 Obsidian 宿主适配**，不是立刻复制完整产品功能。只有当这个支线证明宿主承载和状态模型都稳定后，才建议从主项目迁移更重的业务内核。
