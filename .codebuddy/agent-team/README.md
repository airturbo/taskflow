# Agent Team × CodeBuddy

已为当前项目生成 CodeBuddy 接入文件。

## 文件说明

- `.codebuddy/agents/agent-team-orchestrator.md`：项目级自定义 Agent（Manual 模式，负责总入口、角色编排、制品流转与治理编排）
- 角色级 Subagents（Agentic 模式，由总入口按需自动卷入）：
- `.codebuddy/agents/agent-team-role-backend-engineer.md`
- `.codebuddy/agents/agent-team-role-data-analyst.md`
- `.codebuddy/agents/agent-team-role-devops-engineer.md`
- `.codebuddy/agents/agent-team-role-frontend-engineer.md`
- `.codebuddy/agents/agent-team-role-product-manager.md`
- `.codebuddy/agents/agent-team-role-qa-engineer.md`
- `.codebuddy/agents/agent-team-role-security-compliance-engineer.md`
- `.codebuddy/agents/agent-team-role-system-architect.md`
- `.codebuddy/agents/agent-team-role-ui-ux-designer.md`
- `.codebuddy/agents/agent-team-role-user-experience-officer.md`
- `.codebuddy/agent-team/mcp.json`：用于导入到 CodeBuddy Settings → MCP → Add MCP 的 JSON（该文件本身不是 CodeBuddy 自动监听路径）
- `.codebuddy/agent-team/README.md`：当前说明文件

## 使用步骤

1. 在 CodeBuddy 中打开当前工作区：`/Users/turbo/WorkBuddy/20260330162606`。
2. 打开 CodeBuddy Settings → MCP → Add MCP，并粘贴 `mcp.json` 内容；CodeBuddy 实际生效的配置位置由宿主管理，通常不是当前工作区下的该文件本身。
3. 打开 Agent 列表，优先选择项目级 Agent：`agent-team-orchestrator` 作为总入口。
4. 正常在同一个对话中下达任务；总入口 Agent 应根据 `agent-team` 的路由、handoff 与产物状态，自动卷入对应角色 Subagents。
5. 默认交付链路中，项目团队完成一轮产品后应交给 `独立体验官` 复审；若体验官提出问题，再回流项目团队优化并继续复审。
6. 若你需要调试某个角色，可临时查看对应角色 Subagent 配置，但日常使用不建议手工切换。
7. 若想拿单次 handoff，也可以执行：
   - `.venv/bin/agent-team execute "看看当前PRD的进展" --adapter codebuddy`

## 当前 WorkBuddy 融合状态

- 当前工作区检测到 `.agent-team`，它仍是 WorkBuddy 历史真相层。
- 当前 `agent-team` 目录仅作为 CodeBuddy 侧车运行时内核。
- 执行 `agent-team sync-workbuddy` 后，`agent-team/artifacts/` 与 `configs/baselines/` 会刷新为 WorkBuddy 制品 / 基线的镜像投影。
- 当前 `agent-team/state/` 与 `agent-team/logs/` 仍以侧车运行态为主，不等于 WorkBuddy 历史治理真相全集。


## 说明

- 当前 `agent-team` 项目根目录：`agent-team`
- 所有 `agent-team` MCP tools 的 `project_root` 都应固定传这个路径，不能改成 CodeBuddy 工作区根目录。
- 项目级 Agent 与角色级 Subagent 文件遵循 CodeBuddy 官方约定，必须位于当前工作区根目录下的 `.codebuddy/agents/`。
- 角色 Subagent 中同步的是 `agent-team` 的角色 prompt 与默认模型；总入口 Agent 也会同步 Orchestrator 的默认模型。
- 当前项目如存在 `knowledge/master-preferences/`，其中的共享偏好快照与项目补充偏好会自动注入到角色执行上下文。
- 在仅走 CodeBuddy 宿主执行时，frontmatter 中的模型与 `execution_payload.model` 一起构成宿主侧模型选择依据；其中 `execution_payload.model` 仍是 `agent-team` 的审计与 override 真源，不代表平台一定百分百强绑定成功。
- 如果 `agent-team` 位于工作区子目录，可执行 `setup-codebuddy --workspace-root <工作区根目录>`。
- 一旦 MCP 接通，Agent 应优先通过 `agent-team` 的 MCP tools 推进查询和正式变更。
- `独立体验官` 默认是项目团队之外的高标准体验把关角色，不能被产品、设计、研发或测试自评替代。
