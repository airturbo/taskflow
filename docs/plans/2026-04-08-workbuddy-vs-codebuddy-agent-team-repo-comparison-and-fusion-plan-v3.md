# WorkBuddy vs CodeBuddy `agent-team` 仓库对比与融合方案 V3

**Date:** 2026-04-08  
**Status:** Draft v3  
**Owner:** Project Manager / Orchestrator  
**Correction Of:** `2026-04-08-workbuddy-codebuddy-agent-team-fusion-plan-v2.md`  
**Actual Comparison Target:** `/Users/turbo/CodeBuddy/agent-team`

---

### 1. 纠偏说明

本版用于纠正前一版比较对象不准确的问题。

前一版把一个 skill 参考骨架当成了主要参照物，但你这次明确指定的真正对比对象是：

- `/Users/turbo/CodeBuddy/agent-team`

这不是单纯的一份项目本地 `.agent-team/` 配置，而是一整个 **CodeBuddy agent-team 框架仓库**。它同时包含：

- 项目模板
- 运行时代码
- CLI
- MCP Server
- CodeBuddy 接入文件生成逻辑
- tests / docs / scripts

因此，正确的比较方式不能再是“`.agent-team/` 对 `.agent-team/`”的一对一对照，而应当拆成两层：

1. **框架仓库层对比**：`/Users/turbo/CodeBuddy/agent-team` vs 当前 WorkBuddy 工作区结构  
2. **项目治理骨架层对比**：CodeBuddy `agent-team` 初始化后期望得到的项目形态 vs WorkBuddy 当前 `.agent-team/` 真相层

---

### 2. 先给结论

这次按真实参照物重做对比后，结论和前一版有明显修正：

1. **WorkBuddy 当前不是“缺一套官方 `.agent-team/` 骨架”**，而是**缺少 CodeBuddy `agent-team` 这整个框架仓库所提供的运行时内核层和宿主接入层**。  
2. **`/Users/turbo/CodeBuddy/agent-team` 与 WorkBuddy 当前 `.agent-team/` 并不处于同一层级**。前者是完整治理内核仓库；后者是已落盘的项目治理真相层。  
3. **WorkBuddy 的强项在“项目真相层”**：制品、基线、CR/IA、UX 门禁、浏览证据都已经有了。  
4. **CodeBuddy `agent-team` 仓库的强项在“运行时内核层”**：`state/`、`workflow`、`role_session`、`handoff`、`execution_run`、CLI、MCP、`.codebuddy` 接入生成。  
5. **正确融合路线不是把 WorkBuddy 的隐藏 `.agent-team/` 替换掉，而是把 CodeBuddy 的 `agent-team` 仓库作为侧车治理内核接进来。**

---

### 3. 真实参照物到底是什么

### 3.1 `/Users/turbo/CodeBuddy/agent-team` 的角色定位

从仓库结构与源码可确认，这个目录包含 4 类东西：

#### A. 项目模板

`README.md`、`bootstrap-manifest.v1.json`、`configs/`、`roles/`、`artifacts/`、`logs/`、`runtime/`、`templates/` 构成初始化模板来源。

#### B. 运行时治理内核

`src/agent_team_core/` 提供：

- `AgentTeamProject`
- `ProjectStateStore`
- `WorkflowStore`
- `RoleSessionStore`
- `HandoffStore`
- `ExecutionRunStore`
- 角色 payload 编译与 provider 执行适配

#### C. 宿主接入与对外接口

- `src/agent_team_cli/main.py`：CLI 入口
- `src/agent_team_mcp/server.py`：MCP tools 暴露层
- `.codebuddy/agent-team/mcp.json`：CodeBuddy MCP 配置样例

#### D. 初始化与运维配套

- `scripts/init_project.sh`
- `scripts/setup_venv.sh`
- `scripts/run_mcp_server.sh`
- `tests/`
- `docs/PROJECT-INIT.md`
- `docs/MCP-INTEGRATION.md`

这说明：**你指定的比较对象，其实是完整的“agent-team 产品化仓库”，不是一份静态配置。**

---

### 3.2 CodeBuddy `agent-team` 期望的新项目目录形态

从 `docs/PROJECT-INIT.md` 与 `src/agent_team_core/scaffold.py` 可确认，它推荐的新项目形态是：

```text
<workspace-root>/
├── 业务代码
├── .codebuddy/
│   ├── agents/
│   └── agent-team/
└── agent-team/
    ├── configs/
    ├── docs/
    ├── roles/
    ├── runtime/
    ├── scripts/
    ├── src/
    ├── state/
    ├── artifacts/
    ├── logs/
    └── ...
```

而当前 WorkBuddy 项目更接近：

```text
<workspace-root>/
├── web/
├── docs/
├── .agent-team/
├── .workbuddy/
└── .codebuddy/
```

两者的差异不是“有没有角色配置文件”这么简单，而是**治理内核放在什么位置、运行时对象落在什么位置、宿主接线文件是否存在**的系统性差异。

---

### 4. 与 WorkBuddy 当前项目的关键差异

### 4.1 目录层级差异

#### CodeBuddy `agent-team` 仓库

它希望在工作区里有一个**显式顶层目录**：

- `agent-team/`

里面同时容纳：

- 模板配置
- 运行时实现
- state 持久化
- CLI / MCP / tests / docs

#### WorkBuddy 当前项目

它把项目治理真相层放在：

- `.agent-team/`
- `.workbuddy/`

这意味着：

- WorkBuddy 当前是“隐藏治理层 + 业务代码目录”模式
- CodeBuddy `agent-team` 是“显式治理内核目录 + 宿主侧 `.codebuddy/` 接线”模式

**这是第一层根本差异。**

---

### 4.2 角色配置组织方式差异

#### CodeBuddy `agent-team`

角色配置按目录拆开：

- `roles/<role-folder>/role.profile.json`
- `roles/<role-folder>/permissions.yaml`
- `roles/<role-folder>/query-playbook.yaml`
- `roles/<role-folder>/prompt.system.md`

#### WorkBuddy 当前项目

角色配置聚合在：

- `.agent-team/roles/roles.v1.yaml`

#### 结论

两边**语义接近，但结构完全不同**：

- CodeBuddy 方案偏“按角色分目录、方便宿主单角色读取”
- WorkBuddy 方案偏“单文件总表、方便项目级整体审阅”

这意味着后续如果要真正接入 CodeBuddy `agent-team` 的 `list_roles / get_role_bundle / prepare_role_session_for_role` 这一套能力，就必须补一个**roles materializer / translator**，把 WorkBuddy 的 `roles.v1.yaml` 投影成 CodeBuddy 期待的多文件结构。

---

### 4.3 项目状态与运行时对象落盘位置差异

#### CodeBuddy `agent-team`

核心状态与运行时对象落在：

- `state/project-state.v1.json`
- `state/workflows/...`
- `state/role-sessions/...`
- `state/handoffs/...`
- `state/execution-runs/...`

`src/agent_team_core/project.py` 与 `workflow.py` 已经把这些对象建模成正式运行时存储。

#### WorkBuddy 当前项目

当前只有：

- `.agent-team/configs/global/project-state.v1.json`
- `.agent-team/logs/change-requests/*.json`
- `.agent-team/logs/impact-assessments/*.json`
- `.agent-team/artifacts/registry/artifact-registry.v1.json`

缺少显式的：

- `workflow_id`
- `role_session_id`
- `handoff_id`
- `execution_run_id`
- `state/workflows/*`
- `state/role-sessions/*`
- `state/handoffs/*`
- `state/execution-runs/*`

#### 结论

**这才是 WorkBuddy 相对你那套真实 CodeBuddy `agent-team` 框架的核心缺口。**

不是缺角色、不是缺状态机，而是**缺运行时对象层**。

---

### 4.4 体验门禁语义差异

#### CodeBuddy `agent-team`

在真实仓库里，体验门禁主要采用这套命名：

- 状态：`experience_review`、`experience_rework`
- 体验官制品：
  - `EXPERIENCE_REVIEW`
  - `EXPERIENCE_REWORK_NOTE`
  - `EXPERIENCE_SIGN_OFF`

#### WorkBuddy 当前项目

当前使用的是：

- 状态：`ux_review`
- 体验制品：
  - `UX_COVERAGE_MATRIX`
  - `UX_REVIEW_REPORT`
  - `UX_ISSUE_LOG`
  - `EXPERIENCE_ACCEPTANCE_NOTE`

而且 WorkBuddy 当前项目已经把体验门禁做得更细：

- 明确要求前台真实操作
- 明确要求浏览器/实机可回放证据
- 明确要求产品经理承接体验问题再回流

#### 结论

这不是简单的“谁对谁错”，而是**两套体验治理词汇表不同**：

- CodeBuddy `agent-team` 偏简化、产品化、通用化命名
- WorkBuddy 当前项目偏细粒度、证据化、实操化命名

因此融合时必须建立**语义映射层**，而不是强行把 WorkBuddy 的 `UX_*` 全改名成 `EXPERIENCE_*`。

建议最小映射如下：

- `experience_review` ←→ `ux_review`
- `EXPERIENCE_REVIEW` ←→ `UX_REVIEW_REPORT`
- `EXPERIENCE_REWORK_NOTE` ←→ `UX_ISSUE_LOG`
- `EXPERIENCE_SIGN_OFF` ←→ `EXPERIENCE_ACCEPTANCE_NOTE`
- `UX_COVERAGE_MATRIX` 作为 WorkBuddy 扩展制品保留，不强行压扁

---

### 4.5 CodeBuddy 宿主接入层差异

#### CodeBuddy `agent-team`

真实仓库已经具备：

- `setup-codebuddy` CLI
- `.codebuddy/agents/agent-team-orchestrator.md`
- 角色级 subagents
- `.codebuddy/agent-team/mcp.json`
- `.codebuddy/agent-team/README.md`

并且 `mcp.json` 会把 MCP server 指向该仓库自己的 `.venv` 与 `agent_team_cli`。

#### WorkBuddy 当前项目

当前 `.codebuddy/` 里只有：

- `rules/anydev/...`

缺少：

- `.codebuddy/agents/`
- `.codebuddy/agent-team/mcp.json`
- 项目级 orchestrator agent
- 角色级 subagents
- 基于当前项目的 CodeBuddy 接线说明

#### 结论

**WorkBuddy 当前并没有真正接入你那套 CodeBuddy `agent-team` 仓库。**

前一版说“已有框架、只差一点初始化”并不准确；更准确的说法是：

- **项目内已有治理真相层**
- **但尚未接上真实 CodeBuddy `agent-team` 仓库提供的宿主接入层与运行时内核层**

---

### 4.6 Master Preferences / Knowledge 层差异

CodeBuddy `agent-team` 真实仓库还内建了：

- `knowledge/master-preferences/`
- `record-master-preference`
- `sync-master-preferences`
- 在 payload 编译时自动注入长期偏好

而当前 WorkBuddy 项目更多使用：

- `.workbuddy/memory/`
- `.workbuddy/plans/`

这两者方向相关，但不是同一个机制。

#### 结论

WorkBuddy 当前有“记忆与计划”，但还没有接入 CodeBuddy `agent-team` 的**跨项目共享偏好注入链路**。

---

### 5. 这次真实对比后的总体判断

### 判断 1：两边不是平级替代关系

`/Users/turbo/CodeBuddy/agent-team` 是：

- 框架仓库
- 项目模板
- 运行时内核
- 宿主集成生成器

当前 WorkBuddy 的 `.agent-team/` 是：

- 项目内治理真相层
- 已沉淀真实状态/基线/制品/CR/IA/UX 证据

所以：

- **CodeBuddy `agent-team` 不能被直接等价视为 WorkBuddy 当前的 `.agent-team/`**
- **WorkBuddy 当前 `.agent-team/` 也不能替代 CodeBuddy `agent-team` 仓库的运行时内核功能**

---

### 判断 2：WorkBuddy 在“真相层”比框架模板更成熟

当前 WorkBuddy 已经明显强于模板初始化态的点包括：

- 更完整的 artifact registry 历史
- 更完整的 baseline history
- 更丰富的 CR / IA 记录
- 更严的 UX 证据链与门禁机制
- 更贴近项目实际的产品/设计/研发/体验协作边界

所以不应让外部框架仓库覆盖这些内容。

---

### 判断 3：CodeBuddy `agent-team` 在“运行时内核层”明显更强

真实仓库已经实现或暴露了：

- CLI
- MCP server
- `workflow / role_session / handoff / execution_run`
- `prepare_role_session`
- `create_handoff_packet`
- `prepare_next_role_session`
- `execute_prepared_payload`
- `setup-codebuddy`
- `init-project`
- `master-preferences`

这些恰恰是当前 WorkBuddy 最欠缺的部分。

---

### 6. 修正后的融合方案

### 6.1 总体路线

**建议采用“侧车治理内核 + 保留真相层”的双根结构，而不是覆盖式迁移。**

目标结构建议调整为：

```text
<workspace-root>/
├── web/
├── docs/
├── .agent-team/          ← 继续保留，作为 WorkBuddy 真相层
├── .workbuddy/           ← 继续保留，作为计划 / memory / browser audit 层
├── .codebuddy/           ← 由 CodeBuddy 接入产物填充
│   ├── agents/
│   └── agent-team/
└── agent-team/           ← 新增，作为 CodeBuddy agent-team 侧车治理内核
```

这里的职责划分应明确为：

- `.agent-team/`：**项目真相层**
- `agent-team/`：**运行时内核与宿主接入层**
- `.codebuddy/agents + .codebuddy/agent-team`：**CodeBuddy 宿主接线层**
- `.workbuddy/`：**任务计划、浏览审计、工作记忆层**

---

### 6.2 为什么推荐“新增顶层 `agent-team/` 侧车目录”

因为这是与你指定的真实参照物最对齐、同时又不破坏现有结构的做法：

1. 当前工作区顶层还没有 `agent-team/`，因此新增不会覆盖现有 `.agent-team/`  
2. 这样可以最大限度复用真实仓库已有的 `scripts/`、`src/`、`tests/`、`setup-codebuddy`、`serve-mcp` 逻辑  
3. CodeBuddy `agent-team` 真实仓库本身就推荐这种目录形态  
4. 后续生成 `.codebuddy/agents/` 与 `.codebuddy/agent-team/mcp.json` 会更自然

---

### 6.3 融合的关键不是“复制仓库”，而是“建立桥接映射”

如果只是把 `/Users/turbo/CodeBuddy/agent-team` 整个复制进当前工作区，问题不会自动解决。真正关键的是下面 5 个桥接器：

#### A. Roles Materializer

把：

- `.agent-team/roles/roles.v1.yaml`

投影成：

- `agent-team/roles/<role-folder>/role.profile.json`
- `agent-team/roles/<role-folder>/permissions.yaml`
- `agent-team/roles/<role-folder>/query-playbook.yaml`
- `agent-team/roles/<role-folder>/prompt.system.md`

#### B. State Bridge

把：

- `.agent-team/configs/global/project-state.v1.json`

映射到：

- `agent-team/state/project-state.v1.json`

并补充：

- `workflow-registry`
- `role-session-registry`
- `handoff-registry`
- `execution-run-registry`

#### C. Artifact / Experience Taxonomy Bridge

建立 `UX_*` 与 `EXPERIENCE_*` 的映射，不直接粗暴改名。

#### D. CodeBuddy Setup Bridge

让当前工作区生成：

- `.codebuddy/agents/agent-team-orchestrator.md`
- 角色级 subagents
- `.codebuddy/agent-team/mcp.json`

并确保其指向工作区内的 `agent-team/.venv`。

#### E. Preference Bridge

把 WorkBuddy 现有 `.workbuddy/memory/` 与 CodeBuddy `agent-team` 的 `knowledge/master-preferences/` 接起来，至少先形成单向同步策略。

---

### 7. 分阶段实施建议

### 阶段 A：只做侧车框架落位，不动真相层

动作：

1. 在当前工作区新增顶层 `agent-team/` 目录  
2. 其内容来源于 `/Users/turbo/CodeBuddy/agent-team` 的框架仓库  
3. 暂时不覆盖 `.agent-team/`，不迁移历史制品，不改业务代码

目标：

- 把运行时内核与宿主接线能力先落位

### 阶段 B：打通最小桥接

优先补：

1. `roles materializer`  
2. `state bridge`  
3. `.codebuddy` 接线文件生成  
4. `workflow / role_session / handoff` 的 state 持久化目录

目标：

- 先让 CodeBuddy `agent-team` 能读懂当前项目的角色与状态
- 先让它能开始持久化 runtime 对象

### 阶段 C：补体验词汇表映射

优先建立：

- `ux_review` ↔ `experience_review`
- `UX_REVIEW_REPORT` ↔ `EXPERIENCE_REVIEW`
- `UX_ISSUE_LOG` ↔ `EXPERIENCE_REWORK_NOTE`
- `EXPERIENCE_ACCEPTANCE_NOTE` ↔ `EXPERIENCE_SIGN_OFF`

目标：

- 不丢失 WorkBuddy 当前更细的体验治理资产
- 同时兼容 CodeBuddy `agent-team` 的运行时工具链

### 阶段 D：再考虑反向收敛

当桥接稳定后，再决定是否需要：

- 把 `.agent-team/` 逐步迁移为 `agent-team/` 下的 project-local data root
- 或继续长期维持“双根结构”

当前阶段**不建议立即做这个收敛动作**。

---

### 8. 纠偏后的最终结论

**这次按真实参照物重做对比后的正式结论如下：**

1. `/Users/turbo/CodeBuddy/agent-team` 是完整框架仓库，不是简单的配置基线。  
2. WorkBuddy 当前 `.agent-team/` 已经是成熟项目真相层，但还没接上这个真实仓库提供的运行时与 CodeBuddy 接线能力。  
3. 真正缺的不是“再初始化一份 `.agent-team/`”，而是：
   - 顶层 `agent-team/` 侧车内核
   - `.codebuddy/agents` 与 `.codebuddy/agent-team/mcp.json`
   - `state/workflows / role-sessions / handoffs / execution-runs`
   - roles / state / experience taxonomy 的桥接层  
4. 因此，**正确方案不是覆盖 WorkBuddy，而是把真实 CodeBuddy `agent-team` 仓库作为侧车治理内核接入当前工作区。**

---

### 9. 下一步最小执行清单

如果继续推进，我建议下一步按这个顺序做：

1. 在工作区内创建顶层 `agent-team/` 侧车目录（只复制框架，不碰现有 `.agent-team/`）  
2. 生成 `.codebuddy/agents/` 和 `.codebuddy/agent-team/mcp.json`  
3. 先落 `state/` 运行时目录  
4. 实现 `roles.v1.yaml -> per-role files` 的 materializer  
5. 实现 `project-state / UX taxonomy` 的桥接脚本  
6. 再接通 CLI / MCP 的真实项目读写链路

### 10. 轻量测评机制入口

为了判断“融合后的 `agent-team` 是否真的比独立版更好”，以及进一步区分**前端收益**与**后端收益**，已补充一份独立设计文档：

- `docs/plans/2026-04-08-agent-team-fusion-lightweight-evaluation-design.md`

该文档定义了：

- A/B 对照组
- 结构快照
- 6 个 Golden Cases
- 前端 / 后端双 lane 评分
- 最小结论模板

建议在后续桥接继续推进时，把它作为统一验收口径。 
