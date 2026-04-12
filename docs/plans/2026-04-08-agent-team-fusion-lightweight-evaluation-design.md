# 融合后 `agent-team` 轻量测评机制设计

**Date:** 2026-04-08  
**Status:** Draft  
**Owner:** Project Manager / Orchestrator

---

### 1. 设计目标

这套机制的目标不是证明“融合后什么都更强”，而是用一套**低成本、可重复、可落盘**的方式，判断融合后的 `agent-team` 是否在以下 3 个维度上优于独立版：

1. **运行时更可用**：路由、会话、handoff、状态推进这些内核能力是否更顺。
2. **治理真相不回退**：WorkBuddy 现有的 artifact / baseline / CR / IA / UX 证据链是否仍能被正确读取和利用。
3. **前后端协作更顺滑**：前端与后端角色在同一套治理上下文里是否更容易被调度、追踪和复盘。

这里把“差异”拆成两条轴同时看：

- **轴 A：融合前 vs 融合后**
- **轴 B：前端链路 vs 后端链路**

也就是说，这套测评既能判断“新方案有没有比老方案更好”，也能判断“前端收益和后端收益是否均衡”。

---

### 2. 判优原则

### 2.1 什么叫“更好”

融合后的 `agent-team` 不要求每个指标都碾压独立版，但至少要满足：

- **硬门槛不退化**：治理保真、状态守卫、制品可追溯能力不能变差。
- **关键链路更完整**：前端和后端至少各有一条代表性链路，比独立版多出可验证的上下文衔接能力。
- **人工判断成本更低**：评审者在 10~15 分钟内就能看出差异，而不是需要跑完整项目周期。

### 2.2 判优规则

建议采用下面的结论规则：

- **硬门槛全部通过**
- **总分比独立版提升至少 8 分**
- **前端链路分数不低于独立版**
- **后端链路分数不低于独立版**
- **若某一侧（前端或后端）提升明显、另一侧持平，也算融合有效**

如果出现以下任一情况，则视为“暂不算更好”：

- 能跑起来，但真相层信息丢失
- FE 提升但 BE 明显倒退，或反过来
- 只是多了桥接文件，但实际任务链路没有改善

---

### 3. 评测对象与对照组

### 3.1 推荐对照组

建议至少保留 2 组对象：

- **A 组：独立版基线**  
  使用独立 `agent-team` 初始化出的干净项目，或 `.workbuddy/shadow/codebuddy-agent-team-baseline/` 对应的影子基线。

- **B 组：融合后项目**  
  当前工作区中已完成 `sync-workbuddy` 与桥接后的 `agent-team/`。

如需更稳，可加一个可选对照：

- **A2 组：仅有 sidecar、未桥接 truth layer 的版本**

这样就能分清：到底是 `agent-team` 自身带来的收益，还是 WorkBuddy 真相层桥接带来的收益。

### 3.2 保持公平的原则

同一轮评测里，A/B 组必须保持以下条件一致：

- 相同提示词
- 相同角色入口
- 相同模型配置或 mock 适配器
- 相同 baseline 时间点
- 相同人工打分人

否则结果很容易混入模型波动或上下文污染，不适合判断融合质量。

---

### 4. 三层轻量测评机制

### 4.1 第 0 层：结构快照（5 分钟，纯客观）

这一层不看“回答写得多漂亮”，只看**底座能力有没有真的接通**。

建议采集以下信息：

- `healthcheck`
  - `roles_count`
  - `artifacts_count`
  - `workflows_count`
  - `role_sessions_count`
  - `handoffs_count`
  - `current_state`
  - `baseline_tag`
- `get_project_state`
  - 当前状态
  - 可转移状态
  - `semantic_aliases`
- `list_artifacts`
  - 是否能查到 UX / EXPERIENCE 相关产物
  - 是否保留 baseline 关联

这一层主要回答 3 个问题：

1. **融合后是否真的连上了 truth layer？**
2. **运行时对象是否真的开始落盘？**
3. **体验语义桥接是否真的可查、可用？**

如果连这一层都过不了，后面的任务链路测评意义不大。

### 4.2 第 1 层：任务链路烟测（10~15 分钟，半自动）

这一层是整个机制的核心。

不追求大而全，只跑 **6 个 Golden Cases**，覆盖：

- 前端只读理解
- 前端体验闭环
- 后端只读理解
- 后端治理守卫
- 共享状态桥接
- 共享制品桥接

每个 case 只看最少几个事实：

- 路由是不是对的
- 运行时对象有没有生成
- 状态推进是否合法
- 制品查询有没有命中
- 返回信息是否可供下一角色继续使用

### 4.3 第 2 层：5 分钟人工复核（轻主观）

最后再加一层非常轻的人审，只问 4 件事：

- **可理解**：我能否快速看懂当前状态和责任人？
- **可追溯**：我能否追到 artifact / baseline / change 线索？
- **可接力**：前端/后端角色拿到的信息是否足够继续执行？
- **可复盘**：这次结果是否比独立版更容易解释“为什么这么路由、为什么能/不能推进”？

这一层不需要长评语，每项打 1~5 分，最多写一行备注即可。

---

### 5. 评分模型（100 分）

建议用下面这套轻量计分法：

| 维度 | 分值 | 说明 |
|---|---:|---|
| 结构快照 | 15 | 核心元数据、状态、baseline、artifact 是否可见 |
| 共享治理链路 | 25 | alias、state guard、artifact bridge、baseline bridge 是否生效 |
| 前端链路 | 20 | FE 角色是否更容易被调度、理解上下文、承接 UX 问题 |
| 后端链路 | 20 | BE 角色是否更容易承接 API / 契约 / 变更治理 |
| 人工复核 | 20 | 可理解、可追溯、可接力、可复盘 |

### 5.1 硬门槛（必须全部通过）

以下 4 条建议作为**否决项**：

1. `change_request_received` 等守卫状态不能被错误放行。
2. baseline / artifact registry 在融合后不能不可见。
3. `experience_review` / `ux_review` 别名不能出现一边能查、一边不能转状态的割裂现象。
4. 前端或后端任意一侧若关键 case 失败超过一半，则整轮评测不判优。

---

### 6. Golden Cases 设计

### 6.1 FE-1：前端只读理解链路

**目标**：验证融合后，前端角色是否能在不改状态的前提下快速获得上下文。

- **输入**：请前端评审当前关键页面的交互问题，并给出最小修复建议
- **调用建议**：`prepare_role_session_for_role(frontend_engineer, ...)`
- **通过标准**：
  - 角色为 `frontend_engineer`
  - `workflow` 与 `role_session` 已生成
  - payload 中包含项目状态与角色 bundle
  - 不发生非法状态变更

### 6.2 FE-2：前端体验闭环链路

**目标**：验证融合后，前端能否承接体验官语义，不再被 `ux_review / experience_review` 词汇差异卡住。

- **输入**：查询 `EXPERIENCE_REVIEW` / `experience_review` 相关资产
- **调用建议**：`list_artifacts(artifact_type="EXPERIENCE_REVIEW", stage="experience_review", status="approved")`
- **通过标准**：
  - 能命中 `UX_REVIEW_REPORT`
  - 返回结果中有语义 alias 回显
  - 输出可作为前端继续修复的输入依据

### 6.3 BE-1：后端只读理解链路

**目标**：验证后端角色是否能稳定承接 API / 数据契约类任务。

- **输入**：请后端评审登录接口兼容性、异常码与数据契约风险
- **调用建议**：`prepare_role_session_for_role(backend_engineer, ...)`
- **通过标准**：
  - 角色为 `backend_engineer`
  - `workflow` / `role_session` 生成成功
  - payload 中能看到当前状态、角色权限与任务上下文

### 6.4 BE-2：后端治理守卫链路

**目标**：验证融合后并没有为了“更顺”而牺牲治理约束。

- **输入**：尝试在缺少 `change_request_id` 时推进到正式变更状态
- **调用建议**：`transition_state("change_request_received", ...)`
- **通过标准**：
  - 返回 `requires_impact_assessment` 或等价阻断 verdict
  - message 明确指出缺少 CR / IA 前置条件

### 6.5 GOV-1：共享状态别名链路

**目标**：验证融合后状态机兼容 WorkBuddy / CodeBuddy 两套体验词汇。

- **输入**：从 `testing` 推进到 `experience_review`
- **调用建议**：`transition_state(to_state="experience_review", ...)`
- **通过标准**：
  - 实际进入 `ux_review`
  - 返回 `semantic_mapping`
  - `get_project_state()` 中可看到当前状态 alias

### 6.6 GOV-2：共享真相层可见性链路

**目标**：验证融合后不是只多了一层 sidecar，而是真的能读到 WorkBuddy 真相层。

- **输入**：采集 `healthcheck + get_project_state + artifact-projection`
- **通过标准**：
  - `baseline_tag` 可见
  - artifacts 数量明显高于独立初始化态
  - bridge projection 中可看到 registry / baseline 摘要

---

### 7. 前端 / 后端差异怎么轻量判断

如果你真正关心的是“融合后到底更利于前端还是后端”，建议不要只看总分，而是单独看两条 lane：

### 7.1 前端 Lane

关注这 4 个观察点：

- 是否更容易拿到 UX 相关上下文
- 是否更容易读到体验官结论与 issue log
- 是否更容易把页面修复任务放回治理链路
- 是否更容易解释“为什么这次要返工”

### 7.2 后端 Lane

关注这 4 个观察点：

- 是否更容易拿到 API / 数据契约上下文
- 是否更容易识别变更边界和风险
- 是否仍受 CR / IA 守卫保护
- 是否更容易沉淀成可追溯的服务侧结论

### 7.3 如何比较

推荐用下面的简单规则：

- 若 FE lane 提升 ≥ 5 分，说明融合对体验/页面协作收益明显。
- 若 BE lane 提升 ≥ 5 分，说明融合对契约/服务治理收益明显。
- 若 FE / BE 都提升，但一侧高于另一侧 ≥ 6 分，说明融合收益存在角色偏置，后续要补弱侧桥接。

---

### 8. 轻量执行流程

建议每次只花 15~25 分钟，按下面顺序：

1. 对 A 组和 B 组各跑一次结构快照。
2. 按固定顺序跑 6 个 Golden Cases。
3. 每个 case 只记录：`pass/fail + 1 行备注 + 关键返回字段`。
4. 由同一位评审做 5 分钟人工打分。
5. 输出一张对照表：A 组分数、B 组分数、差值、结论。

不建议一开始就引入大量真实模型输出质量评估，因为那会让波动来源变多。第一阶段先判断：

- **桥有没有搭通**
- **治理有没有保住**
- **FE / BE 链路有没有真改善**

---

### 9. 推荐落盘格式

建议把每轮评测结果落到：

- `docs/evals/<date>/snapshot-a.json`
- `docs/evals/<date>/snapshot-b.json`
- `docs/evals/<date>/cases.jsonl`
- `docs/evals/<date>/scorecard.md`

其中 `scorecard.md` 建议至少包含：

| Case | Lane | A组 | B组 | 差值 | 备注 |
|---|---|---:|---:|---:|---|
| FE-1 | frontend | 6 | 9 | +3 | 融合后能直接看到 UX 上下文 |
| FE-2 | frontend | 4 | 10 | +6 | alias bridge 生效 |
| BE-1 | backend | 7 | 9 | +2 | 会话上下文更完整 |
| BE-2 | backend | 8 | 8 | 0 | 守卫保持一致 |
| GOV-1 | shared | 3 | 10 | +7 | 状态 alias 不再割裂 |
| GOV-2 | shared | 5 | 9 | +4 | baseline / registry 可见 |

---

### 10. 最小结论模板

每轮评测结束后，只需要输出下面 3 句话：

1. **融合后是否更好：是 / 否 / 部分是**
2. **收益主要落在前端、后端，还是共享治理层**
3. **下一步该补哪条弱链路**

例如：

- 融合后整体 **更好**，总分 +14。
- 收益主要来自 **共享治理层 + 前端体验闭环**，后端收益为持平略增。
- 下一步应补 **CR / IA / audit logs 的只读 bridge**，让后端治理链路也能继续抬升。

---

### 11. 这套机制为什么适合当前项目

它适合当前项目，原因有 4 个：

1. 它直接复用了现有 `healthcheck`、`get_project_state`、`list_artifacts`、`transition_state`、`prepare_role_session_for_role` 这些能力。  
2. 它不要求完整跑一遍真实研发周期，只测最能体现融合价值的桥接点。  
3. 它把“融合前后差异”和“前端/后端差异”合并进同一张评分卡，便于快速判断收益分布。  
4. 它天然适合后续继续自动化：先从人工填表开始，后面可以再把 snapshot / cases 收集脚本化。

---

### 12. 当前落地状态与下一步

本轮已经补上两类落地产物：

1. `docs/evals/templates/`：提供 `scorecard.template.md` 与 `cases.template.jsonl`。
2. `agent-team eval-lightweight` + `scripts/lightweight_eval.sh`：可自动采集 snapshot、执行 6 个 Golden Cases，并生成 `scorecard.md`。

如果继续推进，建议按这个顺序深化：

1. 先用当前脚本对“独立版 vs 融合版”跑一轮真实 A/B。
2. 再把人工复核的 20 分补齐，形成第一份正式对照结论。
3. 最后再决定是否把这套轻量评测进一步接进 `tests/` 或 CI，作为持续回归基线。
