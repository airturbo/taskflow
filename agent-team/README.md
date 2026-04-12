# Agent Team — 工程骨架（Phase 1 · Standard 11 Roles）

## 概述

这是一套面向复杂互联网项目的多角色 Agent Team 工程骨架。  
当前处于 **第一阶段**：标准版 10 角色，全部采用 `single` 模型模式，项目经理兼任 Orchestrator。

## Quick Start

### 1. 初始化本地环境

```bash
cd /Users/turbo/CodeBuddy/agent-team
./scripts/setup_venv.sh
cp .env.example .env
```

### 2. 先做健康检查、生成 CodeBuddy 接入文件、dry-run 与流式输出验证

```bash
.venv/bin/agent-team healthcheck
.venv/bin/agent-team setup-codebuddy
.venv/bin/agent-team execute "看看当前PRD的进展" --dry-run
.venv/bin/agent-team execute "看看当前PRD的进展" --adapter codebuddy
.venv/bin/agent-team execute "看看当前PRD的进展" --adapter mock --stream
```

### 3. 一键初始化新项目（推荐做复用入口）

```bash
./scripts/init_project.sh /path/to/new-workspace
```

初始化后会自动：

- 复制一套干净的 `agent-team/` 项目骨架
- 重置 `artifacts/` / `logs/` / `state/` 等运行态目录
- 同步共享的 master 偏好快照到新项目
- 默认创建 `.venv` 并执行 `setup-codebuddy`

### 4. 跨项目沉淀 master 偏好

```bash
.venv/bin/agent-team record-master-preference \
  --summary "默认先给结论，再展开细节" \
  --source-project "某历史项目" \
  --tags 输出风格,沟通方式 \
  --importance high
```

### 5. 轻量 A/B 测评（融合前后 / 前后端双 lane）

```bash
.venv/bin/agent-team eval-lightweight \
  --project-a /path/to/agent-team-baseline \
  --project-b /path/to/fused-agent-team \
  --label-a 独立版 \
  --label-b 融合版 \
  --output-dir /path/to/docs/evals/2026-04-08-run-001
```

如果想直接用脚本包装器：

```bash
./scripts/lightweight_eval.sh \
  /path/to/agent-team-baseline \
  /path/to/fused-agent-team \
  --label-a 独立版 \
  --label-b 融合版 \
  --output-dir /path/to/docs/evals/2026-04-08-run-001
```

如果 `agent-team` 位于 CodeBuddy 当前工作区的子目录，改用：

```bash
.venv/bin/agent-team setup-codebuddy --workspace-root ..
```

`setup-codebuddy` 会为当前工作区生成：

- `.codebuddy/agents/agent-team-orchestrator.md`
- `.codebuddy/agent-team/mcp.json`
- `.codebuddy/agent-team/README.md`

### 3. 启动 MCP Server

```bash
./scripts/run_mcp_server.sh
```

如果你是宿主接入方，优先阅读：

- `docs/NEW-PROJECT-SOP.md`
- `docs/NEW-PROJECT-AGENT-CARD.md`
- `docs/NEW-PROJECT-AGENT-RUNBOOK.md`
- `docs/AGENT-TEAM-RUN-GUIDELINES-V2.md`
- `docs/MCP-INTEGRATION.md`
- `docs/LLM-ADAPTERS.md`
- `docs/PROJECT-INIT.md`

## 目录结构

```text
agent-team/
├── README.md                          ← 本文件
├── bootstrap-manifest.v1.json         ← 初始化检查清单
│
├── configs/
│   ├── README.md
│   ├── global/
│   │   ├── model-config.v1.json       ← 模型策略
│   │   ├── router-config.v1.yaml      ← 路由规则
│   │   ├── state-machine.v1.yaml      ← 状态机
│   │   └── naming-rules.v1.md         ← 命名规范
│   └── baselines/
│       ├── baseline.current.v1.json   ← 当前基线
│       └── baseline.history.v1.jsonl  ← 基线历史
│
├── roles/
│   ├── README.md
│   └── <role-folder>/                 ← ×10 角色
│       ├── role.profile.json
│       ├── permissions.yaml
│       ├── query-playbook.yaml
│       └── prompt.system.md
│
├── artifacts/
│   ├── README.md
│   ├── registry/
│   │   └── artifact-registry.v1.json  ← 产物注册表
│   ├── by-type/                       ← 按产物类型归档
│   │   ├── TASK_BRIEF/
│   │   ├── PRD/
│   │   ├── UI_SPEC/
│   │   ├── ARCHITECTURE_DOC/
│   │   ├── API_SPEC/
│   │   ├── SECURITY_REVIEW/
│   │   ├── TEST_PLAN/
│   │   ├── RELEASE_MANIFEST/
│   │   ├── DATA_REPORT/
│   │   └── DEPLOY_SPEC/
│   ├── by-role/                       ← 按角色归档（符号链接）
│   │   └── <role-folder>/             ← ×10 角色
│   └── archive/                       ← 旧版本归档
│
├── logs/
│   ├── README.md
│   ├── change-requests/               ← CR-{YYYYMMDD}-{SEQ}.json
│   ├── impact-assessments/            ← IA-{YYYYMMDD}-{SEQ}.json
│   ├── rollbacks/                     ← RB-{YYYYMMDD}-{SEQ}.json
│   └── audit/
│       └── audit-log.v1.jsonl         ← 审计流水
│
└── runtime/                           ← 运行时执行器
    ├── README.md
    ├── router/                        ← 路由执行器
    ├── state-machine/                 ← 状态机执行器
    ├── artifact-service/              ← 产物注册读写服务
    ├── logger/                        ← 日志写入服务
    └── bootstrap.py                   ← 初始化入口（待实现）
```

## 核心约束

1. **只读查询不改状态**：用户按角色 / 阶段 / 产物提问时，默认只读，不扰动项目运行
2. **正式变更先做影响评估**：任何改动必须先创建 `CHANGE_REQUEST` 并完成 `IMPACT_ASSESSMENT`
3. **第一阶段 single 模式**：全角色固定单模型，不启用 fallback / parallel_compare
4. **产物可追溯可回退**：所有正式产物在 registry 中注册，版本受基线冻结保护
5. **日志 append-only**：审计日志只追加，不修改历史条目

## 如何初始化

1. 执行 `bootstrap-manifest.v1.json` 中的 7 步检查清单
2. 确认目录完整、配置齐备
3. 开始实现 `runtime/` 下的 4 个执行器

## 角色清单

| # | 角色 | 默认模型 | 目录 |
|---|------|---------|------|
| 1 | 项目经理 / Orchestrator | GPT-5 Light | `project-manager-orchestrator/` |
| 2 | 产品经理 | Gemini Pro | `product-manager/` |
| 3 | UI/UX 设计师 | Claude Sonnet | `ui-ux-designer/` |
| 4 | 系统架构师 | Claude | `system-architect/` |
| 5 | 前端开发 | Claude Sonnet | `frontend-engineer/` |
| 6 | 后端开发 | Claude Sonnet | `backend-engineer/` |
| 7 | QA 测试 | GPT-5 | `qa-engineer/` |
| 8 | DevOps | Claude Sonnet | `devops-engineer/` |
| 9 | 数据分析师 | Gemini Pro | `data-analyst/` |
| 10 | 安全 / 合规 | Claude | `security-compliance-engineer/` |
