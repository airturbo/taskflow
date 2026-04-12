# Agent Team 运行准则 V2

**Status**: Active / Canonical  
**Owner**: Project Manager / Orchestrator  
**Scope**: 当前工作区的 `agent-team` 宿主接入、角色协作、handoff、artifact、状态推进与发布门禁  
**Purpose**: 回到原始 `agent-team` 结构设计，纠正“宿主自创流程”“固定长链”“临时创建角色”等漂移做法，在保证输出质量的同时节约 token 消耗。

## 这份文档解决什么问题

最近几轮运行里，出现过 3 类偏差：

- 把宿主当成一个能随时“自演多角”的超级角色
- 把 `main` 当成正式角色，甚至临时发明新角色语义
- 为了“保险”强行套用固定长链，导致重复复述、token 浪费、治理语义失真

本文件把这些偏差统一纠正为一套 **长期有效、可执行、可审计** 的运行准则。
若旧计划、临时对话习惯或历史错误口径与本文件冲突，**以本文件为准**。

## 一、正式定位

### 1. 可见入口只有一个

- 对外可见总入口是 `agent-team-orchestrator`
- 它绑定的正式角色是 `project_manager_orchestrator`
- `main` **不是** 正式角色，只能作为人类口语里的“总入口”别名理解，不能进入 formal role 体系

### 2. 角色体系是静态正式角色，不允许聊天时临时发明

- 正式角色以 `roles/` 目录中的既有角色为准
- 若需要新增角色，必须按既有机制补齐 `profile / permissions / playbook / prompt` 四件套
- 修改角色配置必须走 `CHANGE_REQUEST → IMPACT_ASSESSMENT`
- **禁止** 宿主或其他大模型在对话中临时创建角色、改名角色、拼接伪角色

### 3. 宿主应薄，运行时应厚

宿主只负责：

1. 接收用户请求
2. 调用 `agent-team` MCP tools
3. 使用 `execution_payload`、`role_bundle`、`project_state`、`artifact_ids` 驱动后续执行

宿主 **不负责**：

- 自己重写状态机
- 自己脑补 CR / IA
- 自己创造长链工作流
- 用聊天临时记忆替代正式项目状态

## 二、不可突破的红线

### 1. 禁止临时创建角色

遇到“想直接让某个角色处理”的需求：

- 应使用 `prepare_role_session_for_role`
- 不应在宿主里写“现在我临时作为某某角色来处理”

### 2. 禁止宿主自创新流程

默认只允许沿用原始高层路径：

- `route_request`
- `prepare_role_session`
- `prepare_role_session_for_role`
- `prepare_next_role_session`
- `orchestrate_change_flow`
- `create_handoff_packet`
- `approve_artifact`
- `freeze_baseline`

如果用户没有明确要求细拆，**不要** 手工拼一条新的治理主链。

### 3. 禁止固定长链表演

**不要** 默认套用：

- `PM → 前端 → QA → DevOps → PM → 体验官`

也不要因为“怕漏角色”就把所有角色都走一遍。

正确原则是：

- **能单角色完成就单角色完成**
- **只有下游真的需要参与时才 handoff**
- **只有发布准备/运行依赖变更时才卷入 DevOps**
- **只有范围、优先级、验收标准真的变了，才显式拉产品经理**
- **用户体验官是发布前独立门禁，不是每轮象征性追加的一站**

### 4. 禁止把聊天记忆当正式项目状态

正式状态真源只能来自：

- `get_project_state`
- `workflow`
- `role_session`
- `handoff`
- artifact registry / baseline / audit / CR / IA 持久化文件

**不得** 用“我记得上一轮大概已经做完了”替代正式治理对象。

### 5. 禁止静默覆盖

- 不允许静默覆盖已批准 artifact
- 不允许绕过审批直接把新版本说成“已经完成”
- 不允许不经流程直接改写 baseline 语义

### 6. 禁止口头交接替代正式交接

跨角色继续处理时：

- 必须使用 `create_handoff_packet`
- 必须用 `prepare_next_role_session` 让下游承接
- 不要只在聊天里说“接下来你帮我当 QA 看看”

## 三、标准执行路径

### 1. 只读查询

默认路径：

1. `route_request`
2. `prepare_role_session`
3. 读取 `workflow / role_session / execution_payload / role_bundle / project_state`
4. 交给匹配角色 Subagent，或由宿主基于 `execution_payload` 承接

适用场景：

- 解释当前状态
- 看进展
- 问某个正式角色视角下的判断
- 查询已有产物

### 2. 已知目标角色的只读或专项处理

当用户已经明确要某个 **正式已有角色** 来处理：

1. `prepare_role_session_for_role`
2. 后续按该角色的 `execution_payload` 与 `role_bundle` 运行

这是“直达单角色”的正规模式，**不是** 临时创建角色。

### 3. 承接既有交接

当上游已经产生 handoff：

1. `prepare_next_role_session`
2. 让下游继续承接既有 `workflow`
3. 自动继承 `task_id`、`upstream_artifacts` 与相关上下文

**不要** 因为切到下游角色就新开平行 workflow。

### 4. 正式变更

默认路径：

1. `route_request`
2. `orchestrate_change_flow`
3. 使用返回的 `workflow / role_session / execution_payload`
4. 如需跨角色，再 `create_handoff_packet → prepare_next_role_session`
5. 如需放行，再走 `approve_artifact / freeze_baseline / state transition`

如果只是想更细粒度控制，才拆成：

- `create_change_request`
- `create_impact_assessment`
- `transition_state`

### 5. 模型执行 fallback

如果宿主或 Subagent 不方便直接承接角色内容：

- 已拿到 payload 时，优先 `execute_prepared_payload`
- 只有尚未拿到 payload 且要直接让内核代执行时，才考虑 `execute_role_with_provider`

**不要** 用“那我就直接替这个角色脑补执行”作为 fallback。

## 四、角色卷入原则

### 1. 最小必要角色链

推荐按任务性质决定链路，而不是按习惯决定链路。

示例：

- **单角色查询**：`project_manager_orchestrator` 或目标角色单独完成
- **前端交互修复**：`project_manager_orchestrator → frontend_engineer → qa_engineer → user_experience_officer`
- **涉及上线环境**：在确有部署/运行依赖时再补 `devops_engineer`
- **涉及需求范围返工**：在 scope 或验收口径变化时显式拉 `product_manager`

### 2. UX 门禁独立存在

- `user_experience_officer` 只负责高标准体验评审、打回与复验
- 体验问题先由 `product_manager` 承接产品逻辑与验收修订
- 再由 `project_manager_orchestrator` 组织返工闭环
- 未通过 UX 门禁前，不得推动发布

## 五、artifact-first，handoff-light

### 1. 正式产物优先于大段聊天正文

推荐顺序：

1. 先产出或更新正式 artifact
2. 再在 handoff 中引用 `upstream_artifacts`
3. 下游通过 `artifact_ids`、`workflow`、`role_session`、`project_state` 获取上下文

### 2. handoff 只保留必要信息

handoff 应优先保留：

- 极短摘要
- `questions_to_answer`
- `acceptance_focus`
- `task_id`
- `upstream_artifacts`

**不要** 把完整 `PRD`、完整 `TEST_REPORT`、完整 `FRONTEND_DELIVERY_NOTE` 再复制进 handoff。

### 3. 下游上下文应通过 runtime 继承

- 传 `task_id`
- 传 `artifact_ids`
- 让 `prepare_next_role_session` 自动继承 `upstream_artifacts`
- 让 `execution_payload.metadata` 承载关键选择上下文

这既更省 token，也更稳定。

## 六、反模式与替代方式

| 反模式 | 为什么错 | 正确替代 |
|---|---|---|
| 把 `main` 当正式角色 | 与原始角色结构不一致 | 只把 `agent-team-orchestrator` 视作总入口，formal role 始终是 `project_manager_orchestrator` |
| 聊天里临时创建角色 | 破坏治理边界与审计链路 | 使用既有角色；若要直达，用 `prepare_role_session_for_role` |
| 宿主自己写固定长链 | token 浪费，且偏离原始设计 | 只卷入必要角色 |
| handoff 塞满全文 | 重复、冗长、下游难消费 | `artifact-first, handoff-light` |
| 用宿主记忆判断当前状态 | 易漂移、不可审计 | 读取 `get_project_state`、`workflow`、`role_session`、artifact registry |
| 角色交接只靠口头描述 | 下游无法继承结构化上下文 | `create_handoff_packet → prepare_next_role_session` |
| Subagent 不可用时宿主直接“代演角色” | 角色边界失真 | 用 `execution_payload` 或 `execute_prepared_payload` 兜底 |

## 七、节约 token 的执行要点

### 1. 优先走高层工具，不要手搓低层流程

优先：

- `prepare_role_session`
- `prepare_role_session_for_role`
- `prepare_next_role_session`
- `orchestrate_change_flow`

少做：

- 重复解释旧上下文
- 手工拼流程
- 在每轮消息里完整复述上游正文

### 2. 优先传引用，不要传全文

- 能传 `artifact_ids` 就不要重复粘贴 artifact 正文
- 能传 `task_id` 就不要每次重讲任务身份
- 能复用 `workflow` / `role_session` / `handoff_id` 就不要新开平行上下文

### 3. 只在必要时升级角色链

一个角色能完成，就不要拉第二个；两个角色能闭环，就不要拉第三个。

## 八、当前工作区的特殊补充

当前工作区仍处于 **WorkBuddy × CodeBuddy `agent-team` 融合阶段**，因此还有两条项目级补充：

1. 目录采用双根结构：`.agent-team/` 保留为 WorkBuddy 历史真相层，`agent-team/` 作为 CodeBuddy 侧车运行时内核  
2. 在 `roles materializer / state mirror / artifact view / UX 语义映射` 等 bridge 完成前，**不要** 把 `agent-team/state/`、`agent-team/artifacts/`、`agent-team/logs/` 的初始化内容误判为全部历史真相

当前项目里，涉及既有制品、基线、CR/IA、UX 评审证据时，应优先核对 `.agent-team/` 与相关历史文档，再决定是否需要同步到 `agent-team/` 侧车层。

## 九、冲突时的优先级

发生冲突时，优先级如下：

1. 用户在当前轮的明确指令
2. 本文件与 `knowledge/master-preferences/project-overrides.md`
3. 已批准 artifact、baseline、state、audit、CR / IA 持久化真相
4. 现行 `roles/`、`templates/hosts/`、`MCP-INTEGRATION.md` 等正式结构定义
5. 历史 `docs/plans/`、旧对话习惯、临时执行套路

## 十、维护要求

### 1. 这份文档是当前项目的运行准则真源

建议入口：

- `README.md`
- `templates/hosts/README.md`
- `docs/MCP-INTEGRATION.md`
- `knowledge/master-preferences/project-overrides.md`

### 2. 修改本文件时的要求

- 不要直接追加新的“例外链路”掩盖问题
- 若要改变正式角色、流程或门禁语义，应同步评估相关模板与项目偏好
- 若只是一次性任务偏好，不要写进本文件

### 3. 这份文档的目标

不是让团队变慢，而是做到两件事：

- **质量更高**：角色边界清楚、治理链路可信、门禁语义一致
- **token 更省**：少复述、少空转、少固定长链、更多 runtime 继承与 artifact 引用
