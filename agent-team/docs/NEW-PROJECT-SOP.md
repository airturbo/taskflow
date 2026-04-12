# Agent Team 新项目 1 分钟启动 SOP

## 适用场景

当你要把当前这套 `agent-team` 模板复用到一个新项目时，按这页执行即可。

如果你希望把一份 Markdown 直接发给 CodeBuddy 或其他 Agent 让工具自动执行，优先使用：`docs/NEW-PROJECT-AGENT-CARD.md`

如果你想看完整执行约束与验证标准，再看：`docs/NEW-PROJECT-AGENT-RUNBOOK.md`

这套文档当前对应的目标形态是：**Agent 自动把目录和文件准备好，然后把最后的手动配置步骤告诉你**。

目标是 4 件事：

1. 在新工作区落一套干净的 `agent-team/`
2. 自动带上共享 `master-preferences`
3. 自动生成 CodeBuddy 的 Agent 与 MCP 接线文件
4. 让你可以马上开始通过 `agent-team-orchestrator` 推项目

---

## 你只需要准备两个路径

- **模板路径**：当前这套 `agent-team` 所在目录
- **新项目工作区路径**：你准备开展新项目的根目录

示例：

- 模板路径：`/Users/turbo/CodeBuddy/agent-team`
- 新项目工作区路径：`/Users/turbo/Projects/my-new-project`

---

## 最短启动步骤

### 第 1 步：执行一键初始化

进入模板目录后执行：

```bash
cd /Users/turbo/CodeBuddy/agent-team
./scripts/init_project.sh /Users/turbo/Projects/my-new-project
```

默认会自动完成：

- 复制 `agent-team/` 项目骨架到新工作区
- 重置 `artifacts/`、`logs/`、`state/`
- 同步共享 `master-preferences`
- 创建新项目 `.venv`
- 生成 `.codebuddy/agents/` 与 `.codebuddy/agent-team/mcp.json`

---

### 第 2 步：在 CodeBuddy 打开新项目工作区

打开：

```text
/Users/turbo/Projects/my-new-project
```

不是只打开里面的 `agent-team/`，而是打开**整个项目工作区根目录**。

---

### 第 3 步：接入 MCP

在 CodeBuddy 中进入：

- `Settings`
- `MCP`
- `Add MCP`

然后把下面这个文件内容粘进去：

```text
my-new-project/.codebuddy/agent-team/mcp.json
```

如果你想先确认文件是否存在，可在终端执行：

```bash
cat /Users/turbo/Projects/my-new-project/.codebuddy/agent-team/mcp.json
```

---

### 第 4 步：选择总入口 Agent

在 Agent 列表里优先选择：

- `agent-team-orchestrator`

后续日常使用时，默认都从它进。

不要一开始就手动切到某个子角色，除非你在做专项调试。

---

### 第 5 步：直接提第一个任务

你可以直接这样开场：

- “先基于这个项目目录建立认知，输出需求 / 技术 / 风险的初步判断。”
- “先不要写代码，先帮我梳理 PRD、验收标准和实施路线。”
- “先扫描当前代码和文档，判断应该由哪些角色接力推进。”
- “按我的长期偏好，先给结论，再展开细节。”

到这一步，这个新项目就已经启动完成了。

---

## 1 分钟检查清单

完成后你应该能看到这些结果：

- **工作区里有 `agent-team/`**
- **工作区里有 `.codebuddy/agents/agent-team-orchestrator.md`**
- **工作区里有 `.codebuddy/agent-team/mcp.json`**
- **新项目里有 `knowledge/master-preferences/master-preferences.snapshot.md`**
- **CodeBuddy 里能选到 `agent-team-orchestrator`**

如果这 5 项都成立，说明新项目已经可用了。

---

## 常见变体

### 只想先复制骨架，不装环境

```bash
./scripts/init_project.sh /Users/turbo/Projects/my-new-project --skip-venv
```

后续进入新项目补执行：

```bash
cd /Users/turbo/Projects/my-new-project/agent-team
./scripts/setup_venv.sh
.venv/bin/agent-team setup-codebuddy --workspace-root ..
```

### 只想先复制骨架，不立刻生成 CodeBuddy 接线

```bash
./scripts/init_project.sh /Users/turbo/Projects/my-new-project --skip-codebuddy-setup
```

后续再执行：

```bash
cd /Users/turbo/Projects/my-new-project/agent-team
.venv/bin/agent-team setup-codebuddy --workspace-root ..
```

### 想指定共享偏好目录

```bash
./scripts/init_project.sh /Users/turbo/Projects/my-new-project \
  --shared-preferences-dir ~/.codebuddy/agent-team/master-preferences
```

---

## 新项目启动后，你通常只需要做两件事

### 1. 沉淀新的长期偏好

在任意一个 `agent-team` 项目里执行：

```bash
.venv/bin/agent-team record-master-preference \
  --summary "默认先给结论，再展开细节"
```

### 2. 让老项目同步最新偏好

```bash
.venv/bin/agent-team sync-master-preferences
```

---

## 如果启动失败，先看这 4 个点

1. **脚本是否从模板目录执行**：确认当前目录是模板的 `agent-team/`
2. **工作区路径是否正确**：确认传入的是新项目根目录，不是某个子目录
3. **`.venv` 是否创建成功**：若失败，先执行 `./scripts/setup_venv.sh`
4. **MCP 是否粘贴的是新项目里的 `mcp.json`**：不要误用模板项目自己的配置

---

## 一句话记忆版

**以后新项目启动就一句话：执行 `init_project.sh`，打开新工作区，接上 `mcp.json`，选择 `agent-team-orchestrator`，然后直接提需求。**
