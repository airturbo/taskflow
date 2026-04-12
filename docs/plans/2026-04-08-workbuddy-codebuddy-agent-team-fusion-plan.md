# WorkBuddy × CodeBuddy Agent-Team 融合改造方案

**Date:** 2026-04-08  
**Status:** Draft v1  
**Owner:** Project Manager / Orchestrator  
**Backup Snapshot:** `.workbuddy/backups/2026-04-08-agent-team-fusion-prep/`

---

### 1. 目标与结论

本方案的核心判断是：**保留 WorkBuddy 作为项目级治理真相层，引入 CodeBuddy agent-team 作为运行时编排层，并用一层可审计的桥接结构把两者接起来**。

不建议推倒重来，原因如下：

- 当前仓库已经把角色、状态机、CR / IA、基线、制品注册表、UX gate 和浏览器证据链落在了本地目录中。
- 当前最缺的不是治理规则，而是 **显式 workflow / role session / handoff / runtime linkage**。
- CodeBuddy agent-team 的价值更偏运行时：角色路由、会话准备、handoff packet、状态流转、基线冻结、异步协作。
- 因此最优解不是“切换框架”，而是做成 **双层架构**：
  - **下层**：WorkBuddy 文件化治理真相层
  - **上层**：CodeBuddy agent-team 运行时编排层

目标状态应当同时满足 5 件事：

1. **可追责**：当前状态、基线、审批、证据都能直接在仓库中找到。  
2. **可恢复**：任一 workflow / session / handoff 都有持久化记录，可在中断后续跑。  
3. **可并行**：执行层允许多角色并行，但治理层仍保持串行门禁。  
4. **可审计**：每个运行时动作都能回连到 CR、IA、artifact、baseline、UX 证据。  
5. **可演进**：全局 skill 升级时，本地项目不再依赖整包复制，而是基于 `base + override` 受控演进。

---

### 2. 当前项目快照（基于仓库现状） 

### 2.1 WorkBuddy 已有能力

当前仓库中的 WorkBuddy 治理层已经具备较完整的本地真相层：

- **角色定义**：`.agent-team/roles/roles.v1.yaml`
  - 11 个角色，含 `project_manager_orchestrator`、`product_manager`、`ui_ux_designer`、`system_architect`、`frontend_engineer`、`backend_engineer`、`qa_engineer`、`user_experience_officer`、`devops_engineer`、`data_analyst`、`security_compliance_engineer`
  - 每个角色都具备 `primary_stages`、`owned_artifacts`、`permissions`、`query_playbook`、`system_prompt`、`default_model`

- **状态机**：`.agent-team/configs/global/state-machine.v1.yaml`
  - 状态覆盖 `intake → readonly_query → change_request_received → impact_assessment → scoped → design_in_progress → architecture_in_progress → implementation_in_progress → security_review → test_preparation → testing → ux_review → release_preparation → release_ready → released → post_release_analysis → rolled_back → archived`
  - 明确要求：`readonly_no_mutation`、`change_request_requires_id`、`impact_assessment_before_resume`、`ux_gate_required_before_release`

- **当前状态视图**：`.agent-team/configs/global/project-state.v1.json`
  - 当前状态：`impact_assessment`
  - 当前冻结基线：`BL-20260402-001`
  - 已记录完整流转历史，且历史里出现了多轮 `CR` 与 `UX review` 回流

- **基线视图**：`.agent-team/configs/baselines/`
  - `baseline.current.v1.json`
  - `baseline.history.v1.jsonl`

- **制品注册表**：`.agent-team/artifacts/registry/artifact-registry.v1.json`
  - 已启用：`approved_only_as_default_input`、`no_silent_overwrite`、`rollback_record_required`、`baseline_tracking_enabled`
  - 已沉淀 PRD、USER_STORY、UI_SPEC、UX_FLOW、ARCHITECTURE_DOC、TEST_REPORT、RELEASE_MANIFEST、DELIVERY_NOTE、UX 系列制品等多版版本轨迹

- **UX 治理规则**：`.agent-team/configs/global/ux-governance-rules.v1.md` 与 `ux-review-sop.v1.md`
  - 已把真实前台体验、完整覆盖账本、Trigger → Interaction → Result 三段式核对、问题分派边界、CR / IA 进入条件、放行门槛、复审顺序等落成正式制度

- **证据链与工作记忆**：`.workbuddy/`
  - `browser-audit/`：浏览器自动化证据
  - `plans/`：任务计划
  - `memory/`：上下文记忆

- **文档侧沉淀**：`docs/plans/` 与 `docs/pm/`
  - 已存在多份实现计划和项目经理协调文档，说明当前流程是“文档驱动 + 制品驱动 + 审计驱动”的顺序治理模式

### 2.2 当前缺口

当前仓库里最主要的缺口有 4 个：

1. **交接仍偏隐式**  
   仓库中没有形成统一、标准化、可机读的显式 `handoff packet` 目录。角色交接更多依赖 PM 文档、memory、artifact version 和审计日志。

2. **runtime 标识未贯通**  
   现有制品、日志、状态流转中缺少统一的 `workflow_id`、`role_session_id`、`handoff_id`、`execution_payload_id` 等运行时主键，导致治理层和运行时层之间缺少“硬链接”。

3. **当前工作态与冻结基线分离但缺少总览**  
   仓库里已经同时存在 `current_state`、`baseline.current`、`baseline.history`、`draft artifact`、`approved artifact`，但缺少一个统一的 `live state vs frozen baseline` 视图，容易让读者混淆“正在返工的当前态”和“上次正式冻结态”。

4. **全局 skill 与项目本地副本存在漂移风险**  
   当前结构已经体现出 “全局技能源 + 项目本地落地” 的模式，但仍偏复制式同步；随着规则持续升级，后续维护成本会越来越高。

---

### 3. 设计原则

融合方案遵循以下 6 条原则：

1. **真相仍在盘上**：任何关键治理结论最终都必须在项目目录落盘，而不是只存在于运行时内存。  
2. **runtime 只是加速层**：CodeBuddy agent-team 负责路由、会话、handoff 和并行执行，但不能替代 WorkBuddy 的审计真相层。  
3. **执行并行，治理串行**：前端、后端、QA、UX 证据采集等可并行；CR 入口、IA、UX gate、baseline freeze、release gate 必须串行。  
4. **显式交接优先于口头交接**：从 PM 摘要升级为结构化 `handoff packet`。  
5. **base + override 优先于整包复制**：全局 skill 为 base，项目本地只保存 override 和 materialized merge result。  
6. **先桥接，再切换**：先把 runtime 信息投影到现有真相层；不要一上来替换现有治理文件。

---

### 4. 方案选型对比

### 方案 A：保留 WorkBuddy 真相层 + 新增 CodeBuddy runtime bridge（推荐）

**做法**

- 保留现有 `.agent-team/`、`.workbuddy/`、`docs/` 的治理体系
- 增加一层 `runtime + handoff + summary + override` 结构
- 让 CodeBuddy agent-team 的 workflow / session / handoff / state transition 被投影到本地文件

**优点**

- 风险最低
- 可逐步落地
- 不破坏现有 UX gate 和 artifact registry
- 能把 CodeBuddy 的 session / handoff 能力接进来

**缺点**

- 初期会出现“双写”与桥接逻辑
- 需要定义新的 runtime schema 和 materialized view

### 方案 B：以 CodeBuddy runtime 为主，WorkBuddy 退化为导出层

**优点**

- 运行时结构最清晰
- 最利于统一 workflow / session / handoff

**缺点**

- 迁移成本高
- 容易把当前成熟的文件审计体系削弱
- 对现有项目风险过大

### 方案 C：维持现状，只补文档约束

**优点**

- 成本最低

**缺点**

- 无法解决显式交接和 runtime linkage 的核心问题
- 后续复杂项目仍会卡在协作恢复、并行执行和状态追踪上

**推荐结论：采用方案 A。**

---

### 5. 目标架构

### 5.1 三层结构

#### 第一层：治理真相层（保留并强化）

继续以 `.agent-team/` 和 `.workbuddy/` 为项目真相层，包含：

- 角色定义
- 状态机
- 项目状态
- CR / IA 日志
- baseline 与 history
- artifact registry
- UX gate 制品
- 浏览证据
- PM / plan 文档

这一层的职责是：**让任何人即使离开运行时，也能从仓库直接复原项目治理状态。**

#### 第二层：桥接投影层（新增）

新增一层面向 CodeBuddy runtime 的可机读桥接结构，把 workflow / session / handoff / execution payload 信息投影到本地文件。

推荐目录：

```text
.agent-team/
├── runtime/
│   ├── workflows/
│   ├── sessions/
│   ├── handoffs/
│   ├── events/
│   └── indexes/
├── views/
│   ├── project-summary.v1.md
│   └── live-vs-baseline.v1.json
└── overrides/
    ├── roles.override.v1.yaml
    ├── router.override.v1.yaml
    └── state-machine.override.v1.yaml
```

这层的职责是：**把运行时上下文标准化，并把运行痕迹桥接到 WorkBuddy 真相层。**

#### 第三层：运行时编排层（接入 CodeBuddy agent-team）

让 CodeBuddy agent-team 负责：

- `route_request`
- `prepare_role_session`
- `prepare_next_role_session`
- `create_handoff_packet`
- `accept_handoff_packet`
- `create_change_request`
- `create_impact_assessment`
- `transition_state`
- `freeze_baseline`

但这些动作不应只存在于运行时；每次调用都要回写第二层和第一层。

### 5.2 一句话的结构关系

- **WorkBuddy**：定义“什么是真相，什么算通过，什么必须审计”  
- **CodeBuddy**：定义“谁来执行，如何路由，如何交接，如何并行”  
- **Bridge**：定义“运行时发生过什么，如何回连到治理真相层”

---

### 6. 建议新增的数据结构

### 6.1 Workflow Index

文件：`.agent-team/runtime/workflows/WF-*.json`

建议字段：

- `workflow_id`
- `source_user_request`
- `intent_classification`
- `router_selected_role`
- `created_at`
- `status`
- `linked_change_request_id`
- `linked_impact_assessment_id`
- `current_role_session_id`
- `current_state`
- `baseline_tag_at_start`
- `summary`

用途：记录一次用户请求在 agent-team 里的完整执行链。

### 6.2 Role Session

文件：`.agent-team/runtime/sessions/RS-*.json`

建议字段：

- `role_session_id`
- `workflow_id`
- `role_id`
- `stage`
- `input_artifacts`
- `output_artifacts`
- `accepted_handoff_id`
- `produced_handoff_id`
- `execution_payload_ref`
- `status`
- `started_at`
- `ended_at`
- `operator_mode`（single / async / parallel）

用途：把“某个角色一次执行”显式化，并能和 artifact、状态机、handoff 建立关联。

### 6.3 Handoff Packet

文件：`.agent-team/runtime/handoffs/HO-*.json`

建议字段：

- `handoff_id`
- `workflow_id`
- `from_role`
- `to_role`
- `from_session_id`
- `recommended_next_stage`
- `source_artifacts`
- `required_inputs`
- `blocking_issues`
- `acceptance_criteria`
- `evidence_links`
- `change_request_id`
- `impact_assessment_id`
- `baseline_reference`
- `status`（draft / accepted / superseded / closed）
- `created_at`
- `accepted_at`

用途：解决当前“交接内容散落在 PM 文档 / memory / artifact 注释里”的问题。

### 6.4 Live vs Baseline View

文件：`.agent-team/views/live-vs-baseline.v1.json`

建议字段：

- `current_state`
- `last_frozen_baseline_tag`
- `open_change_requests`
- `open_impact_assessments`
- `draft_artifacts`
- `approved_artifacts`
- `open_ux_blockers`
- `ready_for_release`
- `last_updated_at`

用途：统一显示“现在在做什么”和“最近正式冻结到哪”。

### 6.5 Runtime Event Log

文件：`.agent-team/runtime/events/runtime-events.v1.jsonl`

建议记录事件类型：

- `workflow_created`
- `role_session_started`
- `handoff_created`
- `handoff_accepted`
- `state_transition_requested`
- `state_transition_applied`
- `artifact_registered`
- `artifact_approved`
- `baseline_frozen`
- `workflow_closed`

用途：为审计、排障、回放和统计提供统一事件流。

---

### 7. 核心改造点

### 7.1 把隐性交接升级为显式 handoff

这是最优先的改造项。

**当前问题**

- 角色间的传递目前主要依赖 PM 协调文档、artifact 版本、memory 和 UX issue log
- 这些信息对人类可读，但对运行时不够“可执行”

**改造方式**

- 每次角色切换前，要求输出标准化 `handoff packet`
- 下游角色必须先接受 handoff，再开始新的 `role session`
- `handoff packet` 必须能回连：artifact、CR、IA、baseline、证据链

**收益**

- 交接清晰可追踪
- 支持中断恢复
- 支持并行下发多个下游任务
- 支持回放“谁把什么交给了谁”

### 7.2 给 artifact、state、logs 注入统一 runtime ID

建议给以下对象统一加元信息：

- `workflow_id`
- `role_session_id`
- `handoff_id`
- `change_request_id`
- `impact_assessment_id`
- `baseline_tag`

最低接入点：

- `project-state.v1.json`
- `artifact-registry.v1.json`
- 新增 `runtime-events.v1.jsonl`
- PM 总结文档 front matter
- UX 相关制品 front matter

这样用户请求到最终制品之间才能形成一条连续链路。

### 7.3 把 “全局 skill → 项目本地副本” 改为 `base + override + materialized view`

建议结构：

- 全局 skill：标准 base
- 项目本地：只存 override
- 运行时加载：base 与 override merge
- materialized result：落到 `.agent-team/configs/global/`
- 输出 drift report：说明哪些是上游继承、哪些是本地覆盖

**收益**

- 降低项目本地复制膨胀
- 降低升级冲突
- 保留项目定制能力
- 让“当前规则到底来自哪里”变得清晰

### 7.4 建立 `project-summary` 视图

新增 `.agent-team/views/project-summary.v1.md`，至少汇总：

- 当前状态
- 当前活跃 workflow
- 当前活跃 role session
- 最近冻结 baseline
- 当前 open CR / IA
- 当前 open UX blockers
- 最近 5 个 handoff
- 当前 release readiness

这样 PM、Orchestrator 和外部观察者不必手动拼读多个 JSON 与 registry。

### 7.5 把 UX 证据契约标准化

当前 UX 治理已经很强，应继续强化而不是弱化。

建议每个 UX 制品新增统一 front matter 字段：

- `workflow_id`
- `role_session_id`
- `preview_url`
- `evidence_dir`
- `runner_script`
- `runner_version`
- `reviewed_journeys`
- `blocking_issue_ids`
- `recheck_scope`

这样一旦未来把 UX 证据纳入 runtime bridge，系统就能直接知道：

- 本轮是谁审的
- 审了什么
- 证据在哪
- 是基于哪次 workflow / role session 输出的

---

### 8. 分阶段实施方案

### Phase 0：安全基线与只读快照（已完成）

目标：冻结当前治理状态，确保任何实验都能回滚。

已完成动作：

- 创建备份目录：`.workbuddy/backups/2026-04-08-agent-team-fusion-prep/`
- 归档：`.agent-team/`、`.workbuddy/plans/`、`.workbuddy/memory/`、`docs/plans/`、`docs/pm/`
- 写入恢复说明：`README.md`

回滚方式：直接按备份 `README` 恢复即可。

### Phase 1：只读桥接层（低风险，优先落地）

目标：先新增 runtime 投影视图，不改变现有治理流程。

建议动作：

1. 新增 `.agent-team/runtime/` 与 `.agent-team/views/`
2. 从现有 `project-state.v1.json`、`artifact-registry.v1.json`、CR / IA 日志生成：
   - `project-summary.v1.md`
   - `live-vs-baseline.v1.json`
3. 约定 workflow / session / handoff 的 schema，但先不强制业务角色使用

回滚边界：删除新增目录即可，不影响现有治理文件。

### Phase 2：handoff packet 与 role session 最小落地

目标：让角色交接从隐式转为显式。

建议动作：

1. 增加 `handoffs/` 目录与 schema
2. 让 PM / Orchestrator 在下发到产品、设计、研发、QA、UX 前先写 handoff
3. 新增 `sessions/` 目录，把角色执行抽象为 `role session`
4. 在 PM 文档和 artifact front matter 中注入 `workflow_id` 与 `role_session_id`

回滚边界：保留 handoff 目录作为附属记录即可；不破坏既有流程。

### Phase 3：`base + override` 配置继承

目标：解决全局 skill 与项目本地副本漂移。

建议动作：

1. 新增 `.agent-team/overrides/`
2. 把项目级定制迁移到 override 文件
3. 把 `.agent-team/configs/global/` 改为 materialized merge result
4. 每次同步输出 `drift-report.v1.md`

回滚边界：保留现有 `.agent-team/configs/global/` 作为旧入口，override 机制可通过 feature flag 关闭。

### Phase 4：状态机桥接与 baseline bridge

目标：让 runtime 事件与治理状态机对齐。

建议动作：

1. 让状态推进都带上 `workflow_id`、`role_session_id`、`change_request_id`
2. `transition_state` 的结果写回 `project-state.v1.json`
3. `freeze_baseline` 的结果写回：
   - `baseline.current.v1.json`
   - `baseline.history.v1.jsonl`
   - `runtime-events.v1.jsonl`
4. 生成 `live-vs-baseline` 总览

回滚边界：若 bridge 不稳定，状态机仍可回退到当前 JSON 持久化逻辑。

### Phase 5：执行层并行化

目标：引入 CodeBuddy 的异步 team / task / message 模型，但不破坏治理串行门禁。

建议动作：

- 可并行：
  - 前端 / 后端并行实现
  - QA 并行收证据
  - UX 自动化脚本并行采集
  - 数据分析 / 安全评审并行准备

- 不可并行：
  - CR 受理
  - IA 结论
  - UX 放行
  - baseline freeze
  - release gate

回滚边界：如果异步 team 模式带来治理噪音，可只保留并行执行，不把 team runtime 记为正式治理输入。

---

### 9. 推荐优先级（只做 3 件事时）

如果只允许做 3 件事，建议优先顺序如下：

1. **显式 handoff packet**  
2. **live state vs frozen baseline 统一视图**  
3. **base + override 配置继承**

原因：这 3 项可以在不伤现有治理真相层的前提下，最大幅度提升“可协作、可恢复、可升级”的能力。

---

### 10. 风险与控制

### 风险 1：双写导致状态不一致

**表现**：runtime file 与 `project-state.v1.json`、artifact registry 不一致。  
**控制**：先只读投影，再逐步引入写桥接；所有写操作通过单一 bridge adapter 进入。

### 风险 2：handoff 过重导致团队负担过高

**表现**：每次交接都写很多字段，团队抵触。  
**控制**：先定义最小 schema，仅保留必须字段；复杂字段允许后补。

### 风险 3：base + override 合并逻辑过于复杂

**表现**：调试困难，出现意外 merge 结果。  
**控制**：只允许有限字段 override；生成 materialized result 与 drift report 供人工核验。

### 风险 4：并行执行破坏治理顺序

**表现**：多个角色各自推进，最后无法判断是否满足 release gate。  
**控制**：明确“执行并行、治理串行”的铁律；关键状态切换只允许 PM / Orchestrator 发起。

### 风险 5：UX evidence 与 runtime 没接好

**表现**：有 runtime 记录但没有真实前台证据。  
**控制**：UX 产物 front matter 强制带证据引用；无证据的 UX 结论视为不完整。

---

### 11. 验收标准

融合方案实施完成后，至少应满足以下验收标准：

1. 能从仓库中直接找到 **当前状态、最近冻结基线、当前 open CR / IA、当前 open UX blockers**。  
2. 任一正式角色交接都具备 **可机读 handoff packet**。  
3. 任一 artifact 都能回连到 **workflow / role session / CR / IA / baseline** 中的至少 3 项核心标识。  
4. 全局 skill 升级后，项目本地能通过 `base + override` 生成 materialized config，而不是手工覆盖整包。  
5. 并行执行不会绕过 UX gate、baseline freeze 和 release gate。  
6. UX 评审仍然保持当前高标准，并能把证据、问题、复审与运行时上下文关联起来。

---

### 12. 最小实施 backlog

#### B1. 只读桥接视图

- 新建 `.agent-team/views/project-summary.v1.md`
- 新建 `.agent-team/views/live-vs-baseline.v1.json`
- 由现有 `project-state`、`baseline`、`artifact-registry` 自动生成

#### B2. handoff schema

- 新建 `.agent-team/runtime/handoffs/README.md`
- 新建 `handoff.schema.v1.json`
- 新建 `HO-*.json` 模板

#### B3. role session schema

- 新建 `role-session.schema.v1.json`
- 新建 `RS-*.json` 模板

#### B4. workflow index

- 新建 `workflow.schema.v1.json`
- 新建 `WF-*.json` 模板

#### B5. artifact front matter 扩展

- 为 UX 系列产物增加 runtime linkage 字段
- 后续扩展到 PM 总结文档和其他核心 artifact

#### B6. override 机制

- 新建 `.agent-team/overrides/`
- 先迁移最小范围：`roles`、`router-config`、`state-machine`

#### B7. runtime event log

- 新建 `runtime-events.v1.jsonl`
- 记录 workflow / session / handoff / state / baseline 事件

---

### 13. 回滚策略

本方案建议的回滚分为 3 层：

#### Level 1：删除新增桥接结构

若 `runtime/`、`views/`、`overrides/` 设计不理想，可直接删除新增目录，不影响当前 `.agent-team/configs/global/` 与现有制品。

#### Level 2：恢复治理真相层

若桥接写入污染了 `project-state`、baseline 或 registry，直接恢复备份：

- `agent-team.tar.gz`
- `workbuddy-plans-memory.tar.gz`
- `docs-governance.tar.gz`

#### Level 3：关闭 runtime bridge，仅保留手工治理

如果 CodeBuddy runtime 接入阶段不稳定，可临时退回当前模式：

- 保留 WorkBuddy 的文件化治理层
- 暂停 workflow / session / handoff 自动写入
- 继续由 PM 文档 + artifact registry + UX 制品驱动治理

---

### 14. 推荐的下一步执行顺序

建议按下面顺序推进，而不是同时大改：

1. **先落只读 project summary 与 live-vs-baseline 视图**  
2. **再落 handoff packet schema 与 role session schema**  
3. **再落 runtime ID 注入与 UX evidence contract**  
4. **最后再推进 base + override 与并行执行接入**

这个顺序的优点是：每一步都能独立验收、独立回滚，而且不会一开始就动到当前最敏感的发布门禁。

---

### 15. 最终建议

**结论：保留 WorkBuddy 的治理真相层，把 CodeBuddy agent-team 作为运行时编排层接进来，通过显式 handoff、runtime linkage、summary view 和 base + override 继承机制完成融合。**

这条路线的关键不是“谁替代谁”，而是：

- 让 WorkBuddy 继续负责 **治理正确性**  
- 让 CodeBuddy 负责 **协作执行效率**  
- 让桥接层负责 **把效率变成可审计的真相**

只要这三层边界不乱，后续无论你继续强化 UX gate，还是引入多 agent 并行，都不会把现在这套已经很强的治理体系打散。
