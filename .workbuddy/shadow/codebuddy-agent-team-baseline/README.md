# CodeBuddy Agent-Team 影子初始化说明

**Created At:** 2026-04-08 18:18 CST  
**Purpose:** 在不修改项目现有 WorkBuddy / `.agent-team/` 真相层的前提下，生成一份可对比的 CodeBuddy agent-team 官方骨架基线。  
**Target Root:** `.workbuddy/shadow/codebuddy-agent-team-baseline/`  
**Generated Agent Root:** `.workbuddy/shadow/codebuddy-agent-team-baseline/.agent-team/`

---

### 1. 为什么放在影子目录

当前项目已经存在真实运行中的 `.agent-team/` 治理结构，并且已沉淀：

- 角色定义
- 状态机
- project state / baseline
- artifact registry
- UX gate 规则与 SOP
- 审计与制品历史

为了避免任何同名目录、同名文件或后续初始化逻辑对现有治理真相层产生覆盖风险，本次没有直接对工作区根目录执行“就地初始化”，而是采用**影子目录初始化**。

---

### 2. 初始化来源

影子基线来源于本机已加载的 `multi-role-project-team` skill：

- **Skill Base Dir:** `/Users/turbo/.workbuddy/skills/multi-role-project-team`
- **Bootstrap Script:** `scripts/bootstrap.py`
- **Reference Inputs:** `references/roles.yaml`、`references/state-machine.yaml`、`references/router-config.yaml`、`references/model-config.json`、`references/ux-*.md`、`references/naming-rules.md`

---

### 3. 初始化执行方式

在核查脚本后发现：`bootstrap.py` 定义了 `init_project()` 与 `project_status()`，但脚本文件内**没有可直接响应 `--init/--status` 的 CLI 入口**。

因此，本次初始化采用了**显式导入 Python 函数**的方式执行：

- 导入 `bootstrap.py`
- 调用 `init_project(".workbuddy/shadow/codebuddy-agent-team-baseline")`
- 由该函数在影子根目录下生成 `.agent-team/` 官方骨架

这样做的好处是：

- 不依赖缺失的脚本入口
- 行为可控、结果可重复
- 不会修改工作区根目录下现有 `.agent-team/`

---

### 4. 初始化结果摘要

本次影子初始化成功生成：

- `configs/global/`
- `configs/baselines/`
- `roles/`
- `artifacts/registry/`
- `artifacts/by-type/*`
- `artifacts/by-role/*`
- `logs/change-requests/`
- `logs/impact-assessments/`
- `logs/rollbacks/`
- `logs/audit/`

并复制了官方参考配置：

- `router-config.v1.yaml`
- `state-machine.v1.yaml`
- `model-config.v1.json`
- `ux-governance-rules.v1.md`
- `ux-review-sop.v1.md`
- `ux-review-templates.v1.md`
- `ux-review-examples.v1.md`
- `naming-rules.v1.md`
- `roles.v1.yaml`
- `artifact-registry.v1.json`
- `baseline.current.v1.json`
- `project-state.v1.json`

---

### 5. 当前项目保护说明

本次影子初始化过程中：

- **没有覆盖**工作区根目录下现有 `.agent-team/`
- **没有修改**现有 `.workbuddy/plans/`、`.workbuddy/memory/`、`docs/plans/`
- **没有改写**任何已存在的制品、状态、基线或日志

额外追溯快照：

- `.workbuddy/backups/2026-04-08-agent-team-fusion-prep/codebuddy-shadow-init-inputs.tar.gz`

---

### 6. 后续使用方式

这份影子基线的用途是：

1. 作为官方骨架参照组
2. 与当前项目 `.agent-team/` 做差异分析
3. 为 `base + override + bridge` 的 V2 融合方案提供客观依据

正式结论与改造建议见：

- `docs/plans/2026-04-08-workbuddy-codebuddy-agent-team-fusion-plan-v2.md`
