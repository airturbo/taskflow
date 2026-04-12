# Agent Team 新项目启动卡片（最短可转发版）

## 用途

这是一张**可以直接发给 CodeBuddy 或其他 Agent** 的最短启动卡片。

适用目标：

- 让 Agent **自动准备新项目里的目录和文件**
- 自动生成 `agent-team/`、偏好快照、`.venv`、`.codebuddy/agents/*.md`、`.codebuddy/agent-team/mcp.json`
- 完成后只把 **最后需要你手动做的 CodeBuddy 配置** 告诉你

不追求 GUI 自动化，不要求 Agent 自动点击 CodeBuddy 界面。

---

## 你每次只需要改这两个路径

- `TEMPLATE_ROOT`：当前 `agent-team` 模板目录
- `WORKSPACE_ROOT`：新项目工作区目录

默认值：

- `PROJECT_DIR_NAME=agent-team`
- `SHARED_PREFERENCES_DIR=~/.codebuddy/agent-team/master-preferences`
- `SKIP_VENV=false`
- `SKIP_CODEBUDDY_SETUP=false`

---

## 直接发给 Agent 的内容

```md
请直接执行，不要只解释。

严格按 `docs/NEW-PROJECT-AGENT-RUNBOOK.md` 完成新项目初始化。
目标是：自动把新项目所需的目录和文件准备好，并在完成后明确告诉我还需要手动做哪些 CodeBuddy 配置。
不要尝试 GUI 自动化。

输入变量如下：
- TEMPLATE_ROOT: /你的模板路径/agent-team
- WORKSPACE_ROOT: /你的新项目工作区
- PROJECT_DIR_NAME: agent-team
- SHARED_PREFERENCES_DIR: ~/.codebuddy/agent-team/master-preferences
- SKIP_VENV: false
- SKIP_CODEBUDDY_SETUP: false

执行完成后，请按 runbook 的结果模板汇报，并单独列出：
- 已自动完成
- 还需要我手动完成的下一步
```

---

## 推荐汇报结果

Agent 完成后，理想输出应包含：

- **已自动完成**：
  - `agent-team/` 已初始化
  - `.venv` 是否已创建
  - `.codebuddy/agents/agent-team-orchestrator.md` 是否已生成
  - `.codebuddy/agent-team/mcp.json` 是否已生成
  - `knowledge/master-preferences/master-preferences.snapshot.md` 是否已同步
- **校验结果**：目录骨架、运行态重置、关键文件存在性是否通过
- **你要手动做的下一步**：
  - 在 CodeBuddy 打开 `WORKSPACE_ROOT`
  - 导入 `.codebuddy/agent-team/mcp.json`
  - 选择 `agent-team-orchestrator`

---

## 什么时候用这张卡

- **高频开新项目**：优先发这张卡
- **想看完整执行约束**：改用 `docs/NEW-PROJECT-AGENT-RUNBOOK.md`
- **想人工照着做**：改用 `docs/NEW-PROJECT-SOP.md`
