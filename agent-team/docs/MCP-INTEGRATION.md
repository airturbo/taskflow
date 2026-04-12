# Agent Team MCP 集成说明

## 目标定位

`agent-team` 现在被拆成三层：

- `runtime/`：保留原有 Phase 1 执行器原型
- `src/agent_team_core/`：统一协调器、状态持久化、`.env` 自动加载、provider 执行层
- `src/agent_team_mcp/`：对外暴露 MCP tools 的宿主适配层

这意味着不同宿主不需要理解 `runtime/` 的内部细节，只要会调用 MCP tools，就能使用这套项目治理框架。

如果你要接真实模型执行，继续看 `docs/LLM-ADAPTERS.md`。

## 当前项目运行约束优先级

若当前工作区同时存在以下文件，应把它们视为宿主执行时的补充真源：

- `docs/AGENT-TEAM-RUN-GUIDELINES-V2.md`
- `knowledge/master-preferences/project-overrides.md`

这意味着：

- 不要把 `main` 当 formal role，也不要临时创建角色
- 不要自创固定长链或宿主私有治理主链
- 默认遵循 `artifact-first, handoff-light`
- 正式项目状态以 `project_state / workflow / role_session / handoff / artifact` 持久化对象为准

## 当前目录增量

```text
agent-team/
├── .env.example
├── pyproject.toml
├── scripts/
│   ├── run_mcp_server.sh
│   └── setup_venv.sh
├── state/
│   └── project-state.v1.json
├── tests/
│   ├── test_adapters.py
│   ├── test_cli.py
│   ├── test_project.py
│   └── test_server.py
└── src/
    ├── agent_team_cli/
    │   └── main.py
    ├── agent_team_core/
    │   ├── __init__.py
    │   ├── legacy.py
    │   ├── locking.py
    │   ├── project.py
    │   ├── runtime_env.py
    │   └── llm_adapter/
    │       ├── base.py
    │       ├── compiler.py
    │       ├── mock.py
    │       └── providers.py
    └── agent_team_mcp/
        ├── __init__.py
        └── server.py
```

## 已暴露的 MCP Tools

- `healthcheck`
- `bootstrap_project`
- `route_request`
- `list_workflows`
- `list_role_sessions`
- `list_handoffs`
- `prepare_role_session`
- `prepare_role_session_for_role`
- `build_execution_payload`
- `build_execution_payload_for_role`
- `create_handoff_packet`
- `accept_handoff_packet`
- `prepare_next_role_session`
- `get_llm_adapter_status`
- `simulate_role_execution`
- `execute_prepared_payload`
- `execute_role_with_provider`
- `get_project_state`
- `transition_state`
- `rollback_state`
- `create_change_request`
- `create_impact_assessment`
- `orchestrate_change_flow`
- `list_artifacts`
- `approve_artifact`
- `freeze_baseline`
- `list_roles`
- `get_role_bundle`

## 推荐宿主调用路径

### CodeBuddy

根据官方文档的能力定位，更推荐这样分层：

- **自定义 Agent**：承载角色与流程编排
- **Skill**：承载原子化专业能力
- **MCP Server**：承载外部工具与治理内核

建议接线路径：

1. 宿主侧自定义 `Agent` 先调用 `route_request`
2. 如果是 `readonly`：
   - 总入口 Agent 优先调 `prepare_role_session`
   - 若宿主已经知道任务编号或输入产物，可额外传 `task_id` / `artifact_ids`
   - 若用户在 CodeBuddy 中显式切到了某个角色 Agent，优先调 `prepare_role_session_for_role`
   - 读取返回中的 `workflow`、`role_session`、`execution_payload`
   - 直接使用 `execution_payload.messages` 与 `execution_payload.model`
   - 在仅走 CodeBuddy 宿主执行时，`execution_payload.model` 应视为推荐模型上下文，而不是已强绑定的 provider
   - 如果已配置 provider，可直接调 `execute_prepared_payload`
   - 如果想消费 chunk 轨迹，可传 `stream=true` 并读取 `result.events`
3. 如果某角色需要把中间产物交给下一个角色：
   - 调 `create_handoff_packet`
   - 再调 `prepare_next_role_session`
   - 若未显式传入，`prepare_next_role_session` 会自动继承 handoff 中的 `task_id` 与 `upstream_artifacts`
   - 宿主显式切到新的 `role_session`，继续执行下游角色
4. 如果是 `change`：
   - 优先调 `orchestrate_change_flow`
   - 使用返回的 `workflow`、`role_session`、`execution_payload` 继续驱动目标角色执行
   - 若要让 `agent-team` 直接发请求，优先调 `execute_prepared_payload`
5. 若有安全审计、性能压测、规范检查等原子能力，再由 Agent 调用对应 `Skill`

补充约束：

- 只卷入当前任务必要角色，不默认走固定长链
- 若用户明确指定某个正式已有角色，优先 `prepare_role_session_for_role`
- 若已有 handoff，则优先 `prepare_next_role_session`，不要新开平行 workflow
- handoff 只保留必要摘要、问题与 `upstream_artifacts`，不要重复粘贴上游全文

### WorkBuddy / OpenClaw

推荐直接挂 MCP Server：

- 由宿主负责调用 tools
- 由 `agent-team` 负责治理规则、审计、状态与角色配置
- 宿主无需自行实现状态机或 CR/IA 规则
- 若宿主只想调模型，不想自己拼请求，可直接复用 `execute_prepared_payload`

## 安装与运行

### 初始化 Python 3.10+ 虚拟环境

```bash
cd /Users/turbo/CodeBuddy/agent-team
./scripts/setup_venv.sh
```

### 本地运行 MCP（stdio）

```bash
cd /Users/turbo/CodeBuddy/agent-team
./scripts/run_mcp_server.sh
```

### 切到 streamable-http

```bash
cd /Users/turbo/CodeBuddy/agent-team
AGENT_TEAM_MCP_TRANSPORT=streamable-http ./scripts/run_mcp_server.sh
```

### 使用 CLI 而不是自己写脚本

```bash
cd /Users/turbo/CodeBuddy/agent-team
.venv/bin/agent-team healthcheck
.venv/bin/agent-team setup-codebuddy
.venv/bin/agent-team route "看看当前PRD的进展"
.venv/bin/agent-team execute "看看当前PRD的进展" --dry-run
.venv/bin/agent-team execute "看看当前PRD的进展" --adapter codebuddy
.venv/bin/agent-team execute "看看当前PRD的进展" --adapter mock --stream
.venv/bin/agent-team execute "看看当前PRD的进展" --adapter mock --stream-jsonl
.venv/bin/agent-team sync-master-preferences
.venv/bin/agent-team record-master-preference --summary "默认先给结论，再展开细节"
```

## 当前实现边界

当前版本已经做到：

- 兼容复用现有 `runtime/` 原型
- 补充状态持久化文件 `state/project-state.v1.json`
- 新增 `workflow / role_session / handoff / execution_run` 四类运行时对象
- `prepare_role_session` 会创建真实 `workflow` 与 `role_session`
- `create_handoff_packet -> prepare_next_role_session` 支持角色间中间产物流转
- `task_id / artifact_ids` 会进入 `role_session / handoff / execution_payload.metadata`，便于宿主审计与下游继承
- 支持模型选择优先级：`artifact_override > task_override > handoff_recommendation > role_default > global_default`
- `execute_prepared_payload` 会自动落 execution run 审计记录
- 暴露可用 MCP tools、高阶编排工具与 provider 执行入口
- 提供宿主侧 orchestrator 模板
- 为 `state / registry / baselines / audit / CR / IA / workflows / role-sessions / handoffs / execution-runs` 增加项目级文件锁
- 补充 `tests/` 下的 smoke tests 与 CLI 测试
- 增加 `llm_adapter/`，支持 `mock / openai / anthropic / gemini`
- 支持 `.env` 自动加载与 `dry_run` 请求预览
- 支持 prepared payload 直接执行，避免宿主重复路由
- 支持基础重试退避与超时控制
- 支持 `stream=true` 返回缓冲后的结构化流式事件
- 支持 `init-project` 一键生成新项目骨架与 CodeBuddy 接入文件
- 支持共享 `master-preferences` 偏好库，并自动注入角色执行上下文

尚未完成：

- `fallback / parallel_compare / compare_and_merge` 等 multi-model 执行模式（当前会显式 fail-fast）
- CodeBuddy 内核私有直调 SDK / transport
- 更细粒度的 artifact 内容生成协议
- 真实生产凭证下的端到端执行回归
- 真正的 MCP transport-level token push

## 下一步建议

1. 增加流式输出、重试退避细化和速率限制策略
2. 增加宿主特定 SDK adapter（例如 CodeBuddy 专有接法）
3. 给 artifact 内容生成引入结构化输入输出协议
4. 为并行多 Agent 场景补冲突恢复、幂等键和更细粒度锁策略
