# Agent Team 新项目初始化与 Master 偏好指南

## 目标

这份指南解决两件事：

1. **如何一键初始化一个新的 `agent-team` 项目骨架**
2. **如何把你在多个项目里反复提出的要求沉淀成共享的 master 偏好**

这样做以后，新项目团队不只是“有一套框架”，还会天然带着你长期稳定的思路偏好启动。

---

## 推荐目录形态

```text
<workspace-root>/
├── 业务代码 / 文档 / 设计稿 ...
├── .codebuddy/
│   ├── agents/
│   └── agent-team/
└── agent-team/
    ├── configs/
    ├── docs/
    ├── knowledge/
    │   └── master-preferences/
    ├── roles/
    ├── runtime/
    ├── scripts/
    ├── src/
    └── ...
```

说明：

- 工作区根目录是你平时在 CodeBuddy 中打开的项目目录。
- `agent-team/` 是治理内核与项目治理配置。
- `.codebuddy/` 下的 Agent 与 MCP 配置由 `setup-codebuddy` 自动生成。

---

## 一键初始化新项目

如果你只想快速照着做，不看完整背景，优先看：`docs/NEW-PROJECT-SOP.md`

如果你想把一份 Markdown 直接丢给 CodeBuddy 或其他 AI 工具自动执行，优先看：`docs/NEW-PROJECT-AGENT-RUNBOOK.md`


### 方式一：直接用脚本

在模板项目根目录执行：

```bash
./scripts/init_project.sh /path/to/new-workspace
```

常见参数：

```bash
./scripts/init_project.sh /path/to/new-workspace \
  --project-dir-name agent-team \
  --shared-preferences-dir ~/.codebuddy/agent-team/master-preferences
```

### 方式二：直接用 CLI

```bash
PYTHONPATH=src python3 -m agent_team_cli \
  --project-root /path/to/current-agent-team-template \
  init-project /path/to/new-workspace
```

### 初始化完成后会发生什么

`init-project` 会自动完成以下动作：

1. 把模板骨架复制到新工作区中的 `agent-team/`
2. 重置 `artifacts/`、`logs/`、`state/` 等运行态目录，避免继承旧项目历史
3. 创建共享 master 偏好库（若还不存在）
4. 把共享偏好快照同步到新项目的 `knowledge/master-preferences/`
5. 默认创建新项目 `.venv` 并安装当前包
6. 默认执行 `setup-codebuddy`，生成 `.codebuddy/agents/` 与 `.codebuddy/agent-team/mcp.json`

如果你只想先生成骨架，不想装环境：

```bash
./scripts/init_project.sh /path/to/new-workspace --skip-venv
```

如果你只想先复制框架，不想立刻生成 CodeBuddy 接线文件：

```bash
./scripts/init_project.sh /path/to/new-workspace --skip-codebuddy-setup
```

---

## Shared Master 偏好库是什么

默认共享偏好目录：

```text
~/.codebuddy/agent-team/master-preferences/
```

其中主要包含：

- `master-preferences.md`：跨项目长期有效的偏好摘要
- `records/`：每次新增偏好的原始记录
- `README.md`：维护说明

你可以把它理解为：“我这个人做项目时的长期偏好手册”。

---

## 如何沉淀历史项目里的偏好

当你发现自己在多个项目里反复强调某类要求时，就应该把它记录成 master 偏好。

例如：

- 默认先给结论，再展开分析
- 输出方案时先讲约束和风险，不要一上来就写代码
- 页面设计优先克制、清晰、信息密度高，不要花哨
- 涉及上线时优先给回滚条件和风险面
- 文档先写验收标准，再写实现细节

### 记录一条偏好

```bash
cd /path/to/some-agent-team-project
.venv/bin/agent-team record-master-preference \
  --summary "默认先给结论，再展开细节" \
  --rationale "这样更方便我快速判断方向是否正确" \
  --source-project "renpan" \
  --tags 输出风格,沟通方式 \
  --importance high
```

执行后会：

1. 在共享偏好库 `records/` 下保存一条记录
2. 同步把该偏好追加到 `master-preferences.md`

### 刷新已有项目的偏好快照

如果共享偏好更新了，已有项目可以执行：

```bash
cd /path/to/existing-agent-team-project
.venv/bin/agent-team sync-master-preferences
```

这样会更新当前项目中的：

- `knowledge/master-preferences/master-preferences.snapshot.md`
- `knowledge/master-preferences/project-overrides.md`（仅首次创建）

---

## 新项目是如何“知道”你的偏好的

这次实现不是只把偏好写进文档，而是直接接进了执行链路：

- `agent-team` 在构建 `execution_payload` 时
- 会自动读取：
  - `knowledge/master-preferences/master-preferences.snapshot.md`
  - `knowledge/master-preferences/project-overrides.md`
- 并把这些内容注入到所有角色的系统上下文里

因此：

- 新项目初始化后，角色团队天然会读到你的长期偏好
- 当前项目如果还有额外要求，可以补在 `project-overrides.md`
- 如果当前明确需求与长期偏好冲突，仍以当前明确需求为准

---

## 推荐的日常工作流

### 1. 启动新项目

```bash
./scripts/init_project.sh /path/to/new-workspace
```

### 2. 在项目推进中持续沉淀长期偏好

```bash
.venv/bin/agent-team record-master-preference --summary "..."
```

### 3. 对已有项目定期同步

```bash
.venv/bin/agent-team sync-master-preferences
```

### 4. 当前项目的特殊偏好直接写到

```text
agent-team/knowledge/master-preferences/project-overrides.md
```

---

## 偏好沉淀的边界建议

建议沉淀：

- 长期稳定的沟通风格
- 反复出现的验收口径
- 你对风险、节奏、质量的常用判断偏好
- 你对 UI / 文档 / 技术方案的稳定审美与取舍

不建议沉淀：

- 某个项目的一次性临时需求
- 明显依赖业务上下文的特殊规则
- 很快就会过时的战术性偏好

原则上：

- **长期有效** → 共享 `master-preferences.md`
- **项目特有** → `project-overrides.md`
- **当前对话的一次性要求** → 直接在本轮任务里说清楚

---

## 建议你先沉淀的第一批偏好

如果你现在就想把历史项目中的习惯总结进去，建议先从下面四类开始：

1. **沟通方式**：先结论还是先分析、是否偏好表格、是否强调风险
2. **交付风格**：偏向最小可用还是偏向完整方案、是否喜欢先出 SOP
3. **设计审美**：克制 / 极简 / 信息密度 / 动效偏好
4. **工程取舍**：保守上线、回滚优先、可观测性优先、不要过度抽象

这四类一旦沉淀好，后面新项目团队的贴合度会明显提升。
