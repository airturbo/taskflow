# WorkBuddy × CodeBuddy Agent-Team 融合改造方案 V2

**Date:** 2026-04-08  
**Status:** Superseded / 参照物已纠正  
**Owner:** Project Manager / Orchestrator  
**V1 Reference:** `docs/plans/2026-04-08-workbuddy-codebuddy-agent-team-fusion-plan.md`  
**Backup Snapshot:** `.workbuddy/backups/2026-04-08-agent-team-fusion-prep/`  
**Shadow Baseline:** `.workbuddy/shadow/codebuddy-agent-team-baseline/.agent-team/`

> **说明：** 本文基于一个 skill 参考骨架做比较，后续已确认用户要求的真实对比对象应为 `/Users/turbo/CodeBuddy/agent-team`。正式纠偏结论请以 `2026-04-08-workbuddy-vs-codebuddy-agent-team-repo-comparison-and-fusion-plan-v3.md` 为准。

---

### 1. V2 相比 V1 的关键变化

V1 的核心判断是：**保留 WorkBuddy 作为治理真相层，引入 CodeBuddy agent-team 作为运行时编排层，并通过 bridge 完成融合。**

V2 在此基础上补充了一次**非侵入式官方基线初始化**与**现状差异对比**，因此结论更具体：

1. **当前项目并不是“没装 agent-team”**。它与官方 `multi-role-project-team` 基线在骨架层面已经高度同构。  
2. **不应对现有 `.agent-team/` 做覆盖式初始化**。因为当前项目的本地治理层已经承载真实状态、真实基线、真实制品与更严格的 UX 门禁语义。  
3. **最合适的接入方式不是“重装框架”，而是“保留现状 + 固化影子基线 + 引入 runtime bridge + 引入 override 机制”。**  
4. **当前真正缺的不是基础骨架，而是运行时桥接层**：`workflow`、`role_session`、`handoff`、`runtime event`、`live vs baseline view` 以及可持续的 `base + override` 演进路径。

---

### 2. 本次初始化与对比的执行原则

本次工作遵循 4 条原则：

1. **不破坏现有 WorkBuddy 结构**：不在工作区根目录直接覆盖 `.agent-team/`。  
2. **先做影子初始化**：把官方基线落到 `.workbuddy/shadow/codebuddy-agent-team-baseline/`。  
3. **先比对再定方案**：基于实际差异，而不是凭想象做迁移设计。  
4. **以现有真相层为准**：任何已有 `state`、`baseline`、`artifact`、`UX` 规则均视为项目资产，不因为“官方默认值”而回退。

---

### 3. 初始化实验记录

### 3.1 影子初始化方法

初始化来源：

- Skill：`multi-role-project-team`
- Bootstrap Script：`/Users/turbo/.workbuddy/skills/multi-role-project-team/scripts/bootstrap.py`

核查结果：

- `bootstrap.py` 内实现了 `init_project()` 与 `project_status()`
- 但脚本文件本身缺少可直接消费 `--init/--status` 的 CLI 入口

因此，本次没有依赖脚本 CLI，而是采用 **Python 函数直调** 的方式，将官方骨架初始化到：

- `.workbuddy/shadow/codebuddy-agent-team-baseline/.agent-team/`

### 3.2 初始化保护措施

为保证可回滚和可追溯，本次在继续分析前补充归档了：

- `.codebuddy/`
- `.agent-team/`

归档文件：

- `.workbuddy/backups/2026-04-08-agent-team-fusion-prep/codebuddy-shadow-init-inputs.tar.gz`

### 3.3 MCP 运行时现状

本次尝试通过 `agent-team` MCP 直接调用以下能力：

- `bootstrap_project`
- `healthcheck`
- `list_roles`

结果均返回执行失败。

这说明在当前环境里：

- **项目本地治理骨架是存在的**
- 但 **CodeBuddy agent-team 的 MCP 运行时链路还不能作为本次初始化与对比的唯一依赖**

因此，V2 方案需要把“运行时可用性不稳定”视为现实约束：**先让文件真相层和桥接层成立，再等 MCP 运行时恢复后接入。**

---

### 4. 差异对比结论

### 4.1 结论先行

这次对比最重要的发现不是“差异很大”，而是：

> **当前项目已经在官方 agent-team 骨架之上做了真实项目级落地，而且本地增强方向总体正确。**

换句话说，当前项目不是偏离官方，而是：

- 在官方骨架上**沉淀了真实运行数据**
- 在官方治理语义上**做了更严格的本地约束**
- 但尚未补上**运行时桥接层**与**可持续 override 机制**

---

### 4.2 结构层差异

#### A. 核心骨架：基本同构

影子官方基线与当前项目在以下区域的文件集合已经对齐：

- `configs/global/`
- `roles/`
- `artifacts/registry/`
- `artifacts/by-type/`
- `artifacts/by-role/`
- `logs/`

说明：

- 现有项目并不缺官方骨架
- 当前 `.agent-team/` 不是一套“自造目录”，而是与官方 skill 结构高度兼容

#### B. 当前项目多出的结构

目前在关键文件层面，当前项目比影子官方基线多出的显式文件主要是：

- `configs/baselines/baseline.history.v1.jsonl`

这说明当前项目在官方默认的 `baseline.current` 基础上，已经进一步把**基线历史**正式落盘，而这恰恰是成熟治理所需要的能力。

#### C. 双方共同缺失的结构

无论是影子官方基线还是当前项目，以下结构都还没有成为正式骨架：

- `runtime/workflows/`
- `runtime/sessions/`
- `runtime/handoffs/`
- `runtime/events/`
- `runtime/indexes/`
- `views/project-summary.v1.md`
- `views/live-vs-baseline.v1.json`
- `overrides/*.override.v1.*`

这就是 V2 需要补的重点。

---

### 4.3 配置层差异

#### A. `router-config.v1.yaml`

对比结果：**无语义差异**。

含义：

- 当前项目在意图路由与角色匹配机制上，仍与官方基线保持一致
- 后续不需要在 router 上做大迁移，最多只需要 override 扩展

#### B. `state-machine.v1.yaml`

对比结果：**当前项目只做了一处关键增强**，集中在 `ux_review` 的阶段语义说明上。

当前项目新增强调：

- 用户体验官只负责提出问题与复验
- 产品经理承接产品逻辑与验收修订
- 项目经理协调返工与回流

含义：

- 当前项目已经把 UX rejection loop 从抽象原则落到了**明确的协作边界**
- 这是一种应当保留的本地增强，而不是需要被回滚的偏差

#### C. `roles.v1.yaml`

对比结果：当前项目相较官方基线做了 3 类增强：

1. **产品经理责任增强**  
   从“配合返工”升级为“体验问题第一承接角色”，更强调把 UX 问题转化为产品逻辑、需求优先级与验收标准。

2. **用户体验官责任增强**  
   显式加入：
   - 前台真实交互要求
   - 浏览器 / 实机评审证据要求
   - 若缺少前台证据则不得宣称完成体验评审

3. **角色别名与可识别性修正**  
   当前项目补齐了 `security_compliance_engineer` 的 alias，并修正了 `data_analyst` 别名尾部异常。

含义：

- 当前项目的本地角色定义不是“漂移失控”，而是**朝着更可执行的方向增强**
- 这些增强应转为 `override`，而不是未来继续直接改写 base 文件

#### D. `ux-governance-rules.v1.md` 与 `ux-review-sop.v1.md`

对比结果：当前项目把官方 UX gate 从“要求真实体验”进一步强化为“要求前台真实操作 + 至少一种可回放证据”。

增强点包括：

- 不能只看文档、截图或代码就宣称完成体验评审
- 必须进入前台可交互界面
- 必须真实执行点击、输入、切换、拖拽、关闭、返回、撤销、重试等操作
- 必须保留浏览器自动化、录屏、截图序列或操作日志等至少一种证据
- 若无法进入前台交互，则应明确记为证据缺口并打回，不得伪装成完整评审

含义：

- 这是**高价值治理增强**，与当前项目已有 `.workbuddy/browser-audit/` 的证据链方向一致
- 应被正式吸纳进 V2 设计，而不是作为“临时本地修改”继续散落在 base 文件里

---

### 4.4 数据层差异

#### A. `project-state.v1.json`

影子官方基线：

- `current_state = intake`
- `baseline_tag = null`
- `history = []`

当前项目：

- `current_state = impact_assessment`
- `baseline_tag = BL-20260402-001`
- `history_count = 39`
- 额外包含 `updated_at`

含义：

- 当前项目并不是只“装了配置”，而是已经进入真实运行态
- `updated_at` 是合理补充，不构成破坏性偏差
- 真正需要补的是**运行时主键与交接主键**，而不是重建 `project-state`

#### B. `artifact-registry.v1.json`

影子官方基线：

- schema 与 governance 规则齐全
- `artifacts = []`

当前项目：

- 顶层键与 governance 规则与官方一致
- 已沉淀 `48` 条 artifact 记录
- 多轮版本演化、superseded、approved、draft 轨迹均已存在

含义：

- 当前项目的 registry schema 与官方兼容
- 当前差异本质是**真实数据沉淀差异**，不是 schema 偏差
- 因此未来最重要的是给 artifact 记录补 runtime linkage，而不是替换 registry 结构

---

### 5. V2 的总体判断

基于本次影子初始化与差异分析，V2 的总体判断是：

### 判断 1：不需要对现有项目做覆盖式“重新初始化”

原因：

- 核心骨架已经对齐
- 当前项目存在真实运行历史和真实制品
- 本地增强方向是正确的

因此，不建议执行：

- 用官方基线覆盖现有 `.agent-team/`
- 用空白 `project-state` 回写当前状态
- 用空白 `artifact-registry` 替换现有注册表

### 判断 2：影子官方基线应当保留，作为长期对照组

原因：

- 未来 skill 升级时，可以直接拿影子基线与项目现状做 diff
- 可以把“哪些是官方 base、哪些是项目 override”从概念变成事实

### 判断 3：V2 的主要工作重心要从“是否先初始化”切换为“如何桥接运行时”

因为真正的缺口是：

- 缺少 `workflow_id`
- 缺少 `role_session_id`
- 缺少 `handoff_id`
- 缺少 `execution_payload_id`
- 缺少面向读者的一页式 `summary view`
- 缺少 `base + override` 的正式落点

---

### 6. V2 目标架构

### 6.1 四层结构（由 V1 的三层升级而来）

#### 第一层：官方影子基线层（新增）

路径：

- `.workbuddy/shadow/codebuddy-agent-team-baseline/.agent-team/`

职责：

- 保存一份未经项目本地数据污染的官方骨架快照
- 用于后续版本升级对比
- 作为 `base` 的事实来源之一

#### 第二层：项目治理真相层（保留）

路径：

- `.agent-team/`
- `.workbuddy/`
- `docs/`

职责：

- 承载真实状态、真实基线、真实制品、真实证据
- 继续作为项目唯一真相层

#### 第三层：项目本地 override 层（新增）

建议路径：

- `.agent-team/overrides/roles.override.v1.yaml`
- `.agent-team/overrides/state-machine.override.v1.yaml`
- `.agent-team/overrides/router.override.v1.yaml`
- `.agent-team/overrides/ux-governance.override.v1.md`
- `.agent-team/overrides/ux-review-sop.override.v1.md`

职责：

- 承载当前项目相对于官方基线的本地增强
- 避免后续继续直接改官方 materialized 文件
- 把“本地增强”变成正式、可审查、可升级的 override

#### 第四层：运行时桥接层（新增）

建议路径：

- `.agent-team/runtime/workflows/`
- `.agent-team/runtime/sessions/`
- `.agent-team/runtime/handoffs/`
- `.agent-team/runtime/events/`
- `.agent-team/runtime/indexes/`
- `.agent-team/views/project-summary.v1.md`
- `.agent-team/views/live-vs-baseline.v1.json`

职责：

- 把 CodeBuddy agent-team 运行时动作投影到本地文件
- 让 runtime 可恢复、可审计、可回连到制品和基线

---

### 7. V2 实施方案

### 阶段 0：冻结现状，不动真相层

已完成：

- WorkBuddy 真相层备份
- `.codebuddy + .agent-team` 输入快照
- 影子官方基线初始化

### 阶段 1：正式承认“影子基线 + 本地真相层”双轨结构

动作：

1. 保留 `.workbuddy/shadow/codebuddy-agent-team-baseline/` 不删除  
2. 在 V2 文档中把它定义为官方对照组  
3. 后续任何升级均先与影子基线 diff，再决定是否 materialize 到项目层

### 阶段 2：把当前本地增强从“直接改 base 文件”迁移到 override

首批建议迁移的内容：

1. `roles.v1.yaml` 中关于：
   - 产品经理作为 UX 问题第一承接角色
   - UX Officer 的前台真实交互与证据要求
   - alias 修正

2. `state-machine.v1.yaml` 中关于：
   - `ux_review` 阶段协作边界说明

3. `ux-governance-rules.v1.md` / `ux-review-sop.v1.md` 中关于：
   - 前台交互门槛
   - 证据回放要求
   - 无证据不得宣称完整体验

迁移原则：

- `shadow baseline` 作为 base 参考
- `override` 存项目特化
- `configs/global/` 可作为 materialized merge result

### 阶段 3：补运行时桥接层

最小可落地结构：

- `runtime/workflows/WF-*.json`
- `runtime/sessions/RS-*.json`
- `runtime/handoffs/HO-*.json`
- `runtime/events/runtime-events.v1.jsonl`
- `runtime/indexes/current-workflow.v1.json`
- `views/project-summary.v1.md`
- `views/live-vs-baseline.v1.json`

首批必须落的字段：

- `workflow_id`
- `role_session_id`
- `handoff_id`
- `execution_payload_id`
- `source_change_request_id`
- `related_artifact_ids`
- `related_baseline_tag`
- `from_role`
- `to_role`
- `status`
- `created_at`
- `accepted_at`
- `closed_at`

### 阶段 4：待 MCP 恢复后再接入运行时自动回写

待 `agent-team` MCP 运行稳定后，再让以下动作自动投影到桥接层：

- `route_request`
- `prepare_role_session`
- `prepare_next_role_session`
- `create_handoff_packet`
- `accept_handoff_packet`
- `create_change_request`
- `create_impact_assessment`
- `transition_state`
- `freeze_baseline`

在这之前，不要让 MCP 成为唯一真相来源。

---

### 8. V2 对冲突处理的正式策略

后续若再做 CodeBuddy agent-team 初始化、升级或同步，统一遵循以下策略：

1. **禁止覆盖现有 `.agent-team/` 真相文件**  
2. **官方变更先进入影子基线**  
3. **影子基线与当前项目先做 diff**  
4. **确认需要吸收的内容先转成 override**  
5. **只有 materialized merge result 才允许进入 `configs/global/`**  
6. **真实状态、真实 registry、真实 baseline history 永远不回退到空白基线**

这套策略能避免两类典型事故：

- 把真实项目状态误恢复成官方默认值
- 让未来 skill 升级继续以“手工复制粘贴”方式漂移

---

### 9. V2 最终结论

**本次初始化与差异分析后的正式结论如下：**

1. **当前项目已与官方 agent-team 骨架高度兼容，不需要重装。**  
2. **当前项目的本地增强方向正确，尤其是 UX 前台证据链与产品经理承接机制，应保留。**  
3. **真正需要新增的是影子基线、override 机制和 runtime bridge，而不是覆盖现有治理层。**  
4. **在 MCP 运行时恢复稳定之前，WorkBuddy 文件真相层仍应保持主导地位。**

因此，V2 推荐路线不是：

- “先重装 CodeBuddy agent-team，再迁移 WorkBuddy”

而是：

- **“保留 WorkBuddy 真相层 → 固化 CodeBuddy 官方影子基线 → 把本地增强转成 override → 补 runtime bridge → 等 MCP 稳定后再接入自动回写”**

---

### 10. 下一步最小执行清单

如果继续推进，实现优先级应为：

1. 新建 `.agent-team/overrides/` 结构  
2. 把现有本地增强整理为 override 草案  
3. 新建 `.agent-team/runtime/` 与 `.agent-team/views/` 结构  
4. 定义 `workflow / session / handoff` schema v1  
5. 生成 `project-summary.v1.md` 与 `live-vs-baseline.v1.json`  
6. 待 MCP 恢复后，再接自动回写与 bridge 执行链
