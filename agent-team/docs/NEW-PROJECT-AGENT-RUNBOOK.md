# Agent Team 新项目初始化 Runbook（供 AI 工具直接执行）

## 用途

这份文档**不是给人阅读的普通说明**，而是给 CodeBuddy、Claude Code、Codex、Gemini CLI 等 AI 工具直接执行新项目初始化用的 runbook。

使用方式：

1. 把本文件内容发给 AI 工具
2. 在对话里补齐下面的输入变量
3. 明确要求：**按本 runbook 直接执行，不要只解释**

## 当前支持边界

这份 runbook 当前支持的目标是：

- **自动完成**：新工作区里的 `agent-team/` 骨架、共享偏好快照、运行态重置、`.venv`、`.codebuddy/agents/*.md`、`.codebuddy/agent-team/mcp.json`
- **人工完成**：CodeBuddy 宿主中的 MCP 导入，以及当前对话所选 Agent 切换

也就是说，这份文档适合让 Agent **先把目录和文件准备好，再把最后手动配置步骤告诉用户**。

除非用户明确要求，否则不要尝试 GUI 自动化、桌面自动化或其他脆弱的宿主操控方式。

---

## 给 Agent 的执行要求

你现在的任务是：**把 `agent-team` 模板初始化到一个新的项目工作区，并完成可用性验证。**

### 行为约束

- **直接执行**，不要只给建议或解释
- **优先使用绝对路径**
- **先检查，再执行，再验证**
- 如果主命令失败，按本文提供的 fallback 方案继续完成
- 除非用户明确要求，否则不要修改 `agent-team` 模板源码
- 除非用户明确要求，否则不要删除已有业务文件
- 如果新工作区已存在同名 `agent-team/`，先停止并向用户报告冲突
- 完成后输出一份简明结果，包含：执行命令、生成文件、验证结果、下一步动作

---

## 输入变量

在真正执行前，请先从用户消息中读取或让用户补齐这些变量：

- `TEMPLATE_ROOT`：当前 `agent-team` 模板目录绝对路径
- `WORKSPACE_ROOT`：新项目工作区根目录绝对路径
- `PROJECT_DIR_NAME`：初始化后落地的目录名，默认 `agent-team`
- `SHARED_PREFERENCES_DIR`：共享偏好目录，默认 `~/.codebuddy/agent-team/master-preferences`
- `SKIP_VENV`：是否跳过 `.venv` 创建，默认 `false`
- `SKIP_CODEBUDDY_SETUP`：是否跳过 CodeBuddy 接线，默认 `false`

如果用户没有显式给出某项，按默认值处理。

---

## 标准执行流程

### Step 1：校验输入

执行前确认：

1. `TEMPLATE_ROOT` 存在
2. `TEMPLATE_ROOT/scripts/init_project.sh` 存在
3. `WORKSPACE_ROOT` 存在，或其父目录存在且允许创建
4. `WORKSPACE_ROOT/<PROJECT_DIR_NAME>` 当前不存在

若第 4 条不满足：

- **不要覆盖**
- 直接停止
- 告知用户目标目录已存在，并请用户更换路径或先清理旧目录

---

### Step 2：执行初始化命令

优先执行脚本方式：

```bash
cd {{TEMPLATE_ROOT}} && ./scripts/init_project.sh {{WORKSPACE_ROOT}} --project-dir-name {{PROJECT_DIR_NAME}} --shared-preferences-dir {{SHARED_PREFERENCES_DIR}}
```

根据变量决定是否追加：

- 若 `SKIP_VENV=true`，追加 `--skip-venv`
- 若 `SKIP_CODEBUDDY_SETUP=true`，追加 `--skip-codebuddy-setup`

### Step 2 的 fallback

如果脚本入口不可用，则改用 CLI 入口：

```bash
cd {{TEMPLATE_ROOT}} && PYTHONPATH=src python3 -m agent_team_cli --project-root {{TEMPLATE_ROOT}} init-project {{WORKSPACE_ROOT}} --project-dir-name {{PROJECT_DIR_NAME}} --shared-preferences-dir {{SHARED_PREFERENCES_DIR}}
```

并追加相同的可选参数：

- `--skip-venv`
- `--skip-codebuddy-setup`

---

### Step 3：验证初始化结果

初始化成功后，检查以下路径：

#### 必须存在

- `{{WORKSPACE_ROOT}}/{{PROJECT_DIR_NAME}}`
- `{{WORKSPACE_ROOT}}/{{PROJECT_DIR_NAME}}/configs`
- `{{WORKSPACE_ROOT}}/{{PROJECT_DIR_NAME}}/roles`
- `{{WORKSPACE_ROOT}}/{{PROJECT_DIR_NAME}}/runtime`
- `{{WORKSPACE_ROOT}}/{{PROJECT_DIR_NAME}}/knowledge/master-preferences/master-preferences.snapshot.md`
- `{{WORKSPACE_ROOT}}/{{PROJECT_DIR_NAME}}/state/project-state.v1.json`
- `{{WORKSPACE_ROOT}}/{{PROJECT_DIR_NAME}}/artifacts/registry/artifact-registry.v1.json`

#### 当 `SKIP_CODEBUDDY_SETUP=false` 时还必须存在

- `{{WORKSPACE_ROOT}}/.codebuddy/agents/agent-team-orchestrator.md`
- `{{WORKSPACE_ROOT}}/.codebuddy/agent-team/mcp.json`

#### 当 `SKIP_VENV=false` 时建议检查

- `{{WORKSPACE_ROOT}}/{{PROJECT_DIR_NAME}}/.venv`

---

### Step 4：校验运行态是否为干净状态

读取并检查：

- `artifact-registry.v1.json`
- `baseline.current.v1.json`
- `project-state.v1.json`

期望：

- registry 中没有历史项目残留产物
- baseline 处于初始化状态
- project state 为初始阶段（通常是 `intake`）

如果发现带入旧状态，视为初始化异常，向用户报告。

---

### Step 5：输出结果摘要

执行完成后，输出一份简明摘要，至少包含：

- 实际执行的命令
- 初始化目录
- 是否创建 `.venv`
- 是否生成 CodeBuddy 接线文件
- 是否同步 `master-preferences`
- 校验是否通过
- 若用户下一步要在 CodeBuddy 使用，应提示：
  - 打开 `WORKSPACE_ROOT`
  - 导入 `.codebuddy/agent-team/mcp.json`
  - 选择 `agent-team-orchestrator`

---

## 推荐输出模板

可以按下面格式向用户汇报：

```md
### 初始化结果
- 状态：成功 / 失败
- 工作区：`{{WORKSPACE_ROOT}}`
- 项目目录：`{{WORKSPACE_ROOT}}/{{PROJECT_DIR_NAME}}`
- `.venv`：已创建 / 已跳过
- CodeBuddy 接线：已生成 / 已跳过
- 偏好快照：已同步

### 校验结果
- 目录骨架：通过 / 失败
- 运行态重置：通过 / 失败
- MCP 配置：通过 / 跳过 / 失败

### 下一步
- 在 CodeBuddy 打开：`{{WORKSPACE_ROOT}}`
- 导入：`{{WORKSPACE_ROOT}}/.codebuddy/agent-team/mcp.json`
- 选择 Agent：`agent-team-orchestrator`
```

---

## 建议给 AI 工具时一起发送的调用语句

你可以把这段和本文件一起发给工具：

```md
请严格按 `docs/NEW-PROJECT-AGENT-RUNBOOK.md` 执行，不要只解释。
目标是：把新项目所需的目录和文件准备好，并在完成后明确告诉我还需要手动做哪些 CodeBuddy 配置。
不要尝试 GUI 自动化。

输入变量如下：
- TEMPLATE_ROOT: /你的模板路径/agent-team
- WORKSPACE_ROOT: /你的新项目工作区
- PROJECT_DIR_NAME: agent-team
- SHARED_PREFERENCES_DIR: ~/.codebuddy/agent-team/master-preferences
- SKIP_VENV: false
- SKIP_CODEBUDDY_SETUP: false

执行完成后，请按 runbook 中的结果模板给我汇报，并单独列出“手动下一步”。
```

---

## 适配说明

这份 runbook 对不同 AI 工具都适用，但要满足一个前提：

- 该工具**有文件系统访问能力**
- 最好还能**执行命令**

如果工具只能聊天、不能执行命令，那么它最多只能把这里的步骤转述给你，不能真正完成初始化。
