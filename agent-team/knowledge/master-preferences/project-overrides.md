# Project Overrides

> 仅记录当前项目额外需要强调的偏好。
> 若与共享偏好冲突，以当前项目明确要求为准。

## 当前项目补充偏好

- 当前项目的 `agent-team` 宿主与角色协作，统一以 `docs/AGENT-TEAM-RUN-GUIDELINES-V2.md` 为运行准则真源；若旧计划、历史对话习惯或宿主临时套路与其冲突，以该文为准。
- `main` 不是 formal role。当前项目的可见总入口是 `agent-team-orchestrator`，其绑定的正式角色始终是 `project_manager_orchestrator`。
- 禁止临时创建角色、禁止把宿主伪装成新角色、禁止在聊天里改写既有角色边界；若用户明确要某个正式角色处理，使用 `prepare_role_session_for_role`。
- 宿主禁止自创固定长链或新治理主链。默认优先使用 `route_request`、`prepare_role_session`、`prepare_role_session_for_role`、`prepare_next_role_session`、`orchestrate_change_flow` 这些原始高层路径。
- 只卷入必要角色；不要默认套用 `PM → 前端 → QA → DevOps → PM → 体验官` 固定长链。`user_experience_officer` 是发布前独立门禁，不是每轮象征性追加的一站。
- 遵循 **artifact-first, handoff-light**：正式产物优先进入 registry / artifact 流转；handoff 只保留短摘要、问题、验收焦点和上游 artifact 引用，不要把整份上游正文重复塞给下游。
- 正式项目状态以 `get_project_state`、`workflow`、`role_session`、`handoff`、artifact / baseline / audit / CR / IA 持久化文件为准；不要把宿主短期聊天记忆当作正式状态。
- 当前项目仍处于 **WorkBuddy × CodeBuddy agent-team 融合引导阶段**，目录采用双根结构：`.agent-team/` 保留为 WorkBuddy 历史真相层，`agent-team/` 作为新接入的 CodeBuddy 侧车运行时内核。
- 在 `roles materializer / state mirror / artifact view / UX 语义映射` 这些 bridge 完成前，**不要把 `agent-team/state/`、`agent-team/artifacts/`、`agent-team/logs/` 中的初始化内容误判为 WorkBuddy 既有历史真相**。
- 涉及 WorkBuddy 既有制品、基线、CR/IA、UX 评审证据时，应优先查看工作区下原有的 `.agent-team/` 与 `docs/plans/`，再决定是否同步或投影到侧车 `agent-team/`。
- 对外接入 CodeBuddy / MCP 时，`project_root` 固定使用工作区下的 `agent-team/`；但在治理语义上，需要持续明确 **`.agent-team/` 仍是当前阶段的 source of truth**，直到 bridge 正式上线。
