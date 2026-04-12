# Host Templates

本目录存放宿主侧 Agent / Skill 模板。

## 子目录

- `codebuddy/`：适合 CodeBuddy 自定义 Agent 或 Skill
- `generic/`：适合 WorkBuddy、OpenClaw 或其他支持工具调用的宿主

## 使用原则

宿主不要重写治理规则，只做三件事：

1. 接收用户请求
2. 调用 `agent-team` MCP tools
3. 优先用 `execution_payload` 驱动宿主模型，再结合 `role_bundle` 做补充解释或约束校验
4. 如果宿主已配置真实 provider，可直接使用 `execute_prepared_payload`；只有在还没拿到 payload 时再用 `execute_role_with_provider`
5. 未配置或首次接线时先用 `dry_run=true` 校验请求结构

在当前项目中，宿主接入前还应先阅读：

- `docs/AGENT-TEAM-RUN-GUIDELINES-V2.md`
- `knowledge/master-preferences/project-overrides.md`

尤其要遵守这 4 条：

- 不要把 `main` 当 formal role，也不要临时创建角色
- 不要自创固定长链，只卷入必要角色
- 遵循 `artifact-first, handoff-light`
- 不要把宿主聊天记忆当正式项目状态

### CodeBuddy 推荐分工

- **自定义 Agent**：承载角色与流程
- **Skill**：承载原子化专业能力
- **MCP Server**：承载外部工具与治理内核

更多 provider 配置与 `dry_run` 示例见 `docs/LLM-ADAPTERS.md`。
如果你想先把当前项目直接接进 CodeBuddy，可先执行 `agent-team setup-codebuddy`，它会生成项目级 Orchestrator Agent、角色级 `.codebuddy/agents/` 以及 `mcp.json`。
如果你想先拿到一份可直接喂给 CodeBuddy 的宿主 handoff 契约，可直接执行 `agent-team execute "..." --adapter codebuddy`，或通过 MCP 调 `execute_prepared_payload(adapter="codebuddy")`。

## 最小工作流

1. `route_request`
2. 总入口 Agent 在 `mode=readonly` 时优先使用 `prepare_role_session`
3. 总入口 Agent 按 `target_role` 自动卷入匹配的角色 Agentic Subagent；若该角色已收到 handoff，则优先使用 `prepare_next_role_session`
4. 如果 `mode=change` → 可直接使用 `orchestrate_change_flow`
5. 需要跨角色交接时，走 `create_handoff_packet` → `prepare_next_role_session`
6. 默认交付链路中，项目团队完成实现与测试后，应把可体验产物交给 `独立体验官` 做高标准体验评审；若被挑出问题，再回流团队优化并复审
7. 需要细粒度治理时再拆成 `create_change_request` → `create_impact_assessment` → `transition_state`
8. 产物和基线动作走 `list_artifacts` / `approve_artifact` / `freeze_baseline`
