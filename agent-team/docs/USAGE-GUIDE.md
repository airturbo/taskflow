# Agent Team 框架实战使用指南

> 从零开始，5 分钟跑通整条链路。

---

## 目录

1. [环境准备](#1-环境准备)
2. [快速验证（30 秒）](#2-快速验证30-秒)
3. [四个执行器各自的用法](#3-四个执行器各自的用法)
   - [3.1 Router — 请求路由](#31-router--请求路由)
   - [3.2 State Machine — 阶段管理](#32-state-machine--阶段管理)
   - [3.3 Artifact Service — 产物管理](#33-artifact-service--产物管理)
   - [3.4 Logger — 变更日志与审计](#34-logger--变更日志与审计)
4. [端到端完整流程示例](#4-端到端完整流程示例)
5. [在自己的项目中集成](#5-在自己的项目中集成)
6. [配置定制](#6-配置定制)
7. [常见问题](#7-常见问题)

---

## 1. 环境准备

```bash
# 前提：Python 3.10+
python3 --version

# 安装唯一的外部依赖
pip3 install pyyaml

# 设置环境变量（指向你的 agent-team 根目录）
export AGENT_TEAM_ROOT="/你的路径/agent-team-tree-v1/agent-team"
```

> **说明**：整个框架是纯 Python + JSON/YAML 文件驱动的，没有数据库、没有网络依赖、没有重框架。`AGENT_TEAM_ROOT` 指向工程根目录就能用。

---

## 2. 快速验证（30 秒）

```bash
cd "$AGENT_TEAM_ROOT"

# 方式一：只做骨架完整性检查
python3 runtime/bootstrap.py --check

# 方式二：检查 + 自动修复缺失目录
python3 runtime/bootstrap.py --init

# 方式三：检查 + 修复 + 跑一遍 smoke test（推荐首次使用）
python3 runtime/bootstrap.py --demo
```

看到 `✅ Router 正常`、`✅ State Machine 正常`、`✅ Artifact Service 正常`、`✅ Logger 正常` 就说明框架可以用了。

---

## 3. 四个执行器各自的用法

### 3.1 Router — 请求路由

**解决什么问题**：用户输入一句话，自动分析是「只读查询」还是「正式变更」，然后路由到对应角色。

#### CLI 交互模式

```bash
cd "$AGENT_TEAM_ROOT"
AGENT_TEAM_ROOT="$(pwd)" python3 runtime/router/router.py
```

会出现交互提示符，直接输入自然语言：

```
请输入请求 > 看看当前PRD的进展
─────────────────────────────
意图:       readonly_query
目标角色:   product_manager
模式:       readonly
匹配关键词: ['看看', '进展']
```

```
请输入请求 > 修改前端首页的搜索组件
─────────────────────────────
意图:       explicit_change
目标角色:   frontend_engineer
模式:       change
匹配关键词: ['修改']
```

#### CLI 单条命令模式

```bash
AGENT_TEAM_ROOT="$(pwd)" python3 runtime/router/router.py "把架构方案改成微服务"
```

#### Python 代码调用

```python
from pathlib import Path
import sys, os

os.environ["AGENT_TEAM_ROOT"] = "/你的路径/agent-team"
root = Path(os.environ["AGENT_TEAM_ROOT"])

# 把 router 目录加入 path
sys.path.insert(0, str(root / "runtime" / "router"))

from router import Router

router = Router(root)

# 路由一条请求
result = router.route("解释一下当前的系统架构方案")
print(result.intent.value)     # → "readonly_query"
print(result.target_role)      # → "system_architect"
print(result.mode)             # → "readonly"
print(result.matched_keywords) # → ["解释"]

# 路由一条变更请求
result = router.route("修改PRD中搜索功能的需求描述")
print(result.intent.value)     # → "explicit_change"
print(result.target_role)      # → "product_manager"
print(result.mode)             # → "change"
```

**意图分类规则**（可在 `configs/global/router-config.v1.yaml` 中定制）：

| 意图 | 触发关键词示例 | 行为 |
|------|--------------|------|
| `readonly_query` | 解释、看看、demo、当前状态、进展 | 只读，不改状态不改基线 |
| `explicit_change` | 修改、替换、调整、更新基线、发版、回退 | 走变更流程，需影响评估 |
| `ambiguous` | 两者都匹配或都不匹配 | 先交给项目经理确认意图 |

---

### 3.2 State Machine — 阶段管理

**解决什么问题**：管理项目处于哪个阶段，校验阶段转换是否合法，防止乱跳。

#### CLI 交互模式

```bash
AGENT_TEAM_ROOT="$(pwd)" python3 runtime/state-machine/state_machine.py
```

```
当前状态: intake
可转换到: ['readonly_query', 'change_request_received', 'scoped']
输入目标状态 > scoped
  结果: allowed — 状态已从 intake 推进到 scoped

当前状态: scoped
可转换到: ['readonly_query', 'design_in_progress', 'change_request_received']
输入目标状态 > design_in_progress
  结果: allowed — 状态已从 scoped 推进到 design_in_progress

输入目标状态 > history
  2026-03-30T...: intake → scoped (cli_user)
  2026-03-30T...: scoped → design_in_progress (cli_user)
```

#### Python 代码调用

```python
sys.path.insert(0, str(root / "runtime" / "state-machine"))
from state_machine import StateMachine, TransitionRequest

sm = StateMachine(root)

# 查询当前状态（只读，不会改任何东西）
state = sm.query_state()
print(state)
# {'current_state': 'intake', 'baseline_tag': None,
#  'history_length': 0, 'available_transitions': ['readonly_query', 'change_request_received', 'scoped']}

# 推进状态
req = TransitionRequest(
    from_state="intake",
    to_state="scoped",
    triggered_by="project_manager_orchestrator",
    reason="需求范围已确认",
)
result = sm.transition(req)
print(result.verdict.value)  # → "allowed"
print(result.message)        # → "状态已从 intake 推进到 scoped"

# 尝试非法跳转
req2 = TransitionRequest(
    from_state="scoped",
    to_state="released",           # 不能直接跳到 released
    triggered_by="devops_engineer",
    reason="急着上线",
)
result2 = sm.transition(req2)
print(result2.verdict.value)  # → "blocked"
print(result2.message)        # → "不允许从 scoped 直接转换到 released..."

# 回退（不走常规 guard，但会记录）
rollback = sm.rollback(
    to_state="intake",
    triggered_by="project_manager_orchestrator",
    reason="需求变更太大，回退重新梳理",
)
print(rollback.message)  # → "[回退] 状态已从 scoped 回退到 intake"

# 导出完整历史
print(sm.export_state())
```

**阶段流程图**（简化版）：

```
intake → scoped → design_in_progress → architecture_in_progress
  → implementation_in_progress → security_review → test_preparation
  → testing → experience_review → release_preparation → release_ready → released
                    ↘ experience_rework ↗
  → post_release_analysis → archived

任意阶段 → change_request_received → impact_assessment → 回到对应阶段
任意阶段 → readonly_query（不改变状态）
released → rolled_back → implementation_in_progress
```

---

### 3.3 Artifact Service — 产物管理

**解决什么问题**：管理所有产物（PRD、架构文档、测试计划等）的注册、版本、状态和基线。

#### CLI 交互模式

```bash
AGENT_TEAM_ROOT="$(pwd)" python3 runtime/artifact-service/artifact_service.py
```

```
可用命令: list / query <type> / register / approve <id> / freeze <tag> <ids> / quit

> list
  {"artifact_id": "ART-TASK-0001", "artifact_type": "TASK_BRIEF", ...}
  {"artifact_id": "ART-PRD-0001", "artifact_type": "PRD", ...}
  {"artifact_id": "ART-ARCH-0001", "artifact_type": "ARCHITECTURE_DOC", ...}

> query PRD
  ART-PRD-0001 v1.2.0 (approved)

> approve ART-TASK-0001
  已批准: ART-TASK-0001

> freeze BL-20260330-001 ART-PRD-0001 ART-ARCH-0001
  基线已冻结: {"baseline_tag": "BL-20260330-001", ...}
```

#### Python 代码调用

```python
sys.path.insert(0, str(root / "runtime" / "artifact-service"))
from artifact_service import ArtifactService, Artifact

svc = ArtifactService(root)

# 查询所有产物
for a in svc.artifacts:
    print(f"{a.artifact_id} [{a.artifact_type}] v{a.version} ({a.status})")

# 按条件查询
prd_list = svc.query(artifact_type="PRD")
approved = svc.query(status="approved")
pm_artifacts = svc.query(owner_role="product_manager")

# 按 ID 查询
prd = svc.get_by_id("ART-PRD-0001")

# 注册一个新产物
new_art = Artifact(
    artifact_id="ART-API-0001",
    artifact_type="API_SPEC",
    owner_role="backend_engineer",
    stage="architecture_in_progress",
    status="draft",
    version="v1.0.0",
    storage_path="artifacts/by-type/API_SPEC/API_SPEC--ART-API-0001--v1.0.0.yaml",
    upstream=["ART-ARCH-0001"],
)
svc.register(new_art)

# 更新版本（旧版本自动标记为 superseded）
new_version = svc.update_version(
    artifact_id="ART-API-0001",
    new_version="v1.1.0",
    new_status="in_review",
)

# 批准
svc.approve("ART-API-0001")

# 冻结基线（只有 approved 状态的产物才能被冻结）
baseline = svc.freeze_baseline(
    baseline_tag="BL-20260330-001",
    artifact_ids=["ART-PRD-0001", "ART-ARCH-0001", "ART-API-0001"],
)
print(baseline)
# 基线信息同时写入 configs/baselines/baseline.current.v1.json
# 和追加到 configs/baselines/baseline.history.v1.jsonl

# 归档（文件移入 artifacts/archive/）
svc.archive("ART-TASK-0001")
```

**产物状态流转**：

```
draft → in_review → approved → superseded（有新版本时自动标记）
                  ↘ archived（手动归档）
```

---

### 3.4 Logger — 变更日志与审计

**解决什么问题**：所有变更行为留痕，可追溯、可回退、可审计。

#### Python 代码调用

```python
sys.path.insert(0, str(root / "runtime" / "logger"))
from logger import Logger

lgr = Logger(root)

# ① 创建变更请求
cr = lgr.create_change_request(
    requested_by="product_manager",
    target_artifacts=["ART-PRD-0001"],
    change_type="content_update",
    description="增加搜索结果筛选维度",
    justification="用户反馈搜索不够精准",
    priority="high",
)
print(cr.cr_id)   # → "CR-20260330-001"
# 文件落盘到: logs/change-requests/CR-20260330-001.json

# ② 影响评估
ia = lgr.create_impact_assessment(
    cr_id=cr.cr_id,
    assessed_by="project_manager_orchestrator",
    affected_roles=["product_manager", "frontend_engineer", "backend_engineer"],
    affected_artifacts=["ART-PRD-0001", "ART-ARCH-0001"],
    affected_baselines=["BL-20260330-001"],
    risk_level="medium",
    requires_retest=True,
    rollback_plan="回退到 PRD v1.1.0",
    recommendation="proceed_with_caution",
)
print(ia.ia_id)   # → "IA-20260330-001"
# 文件落盘到: logs/impact-assessments/IA-20260330-001.json

# ③ 执行回退
rb = lgr.create_rollback_record(
    triggered_by="project_manager_orchestrator",
    reason="上线后发现搜索性能下降",
    rollback_from_version="v1.2.0",
    rollback_to_version="v1.1.0",
    affected_artifacts=["ART-PRD-0001"],
    steps=["恢复 PRD v1.1.0", "通知前后端回退", "重新运行回归测试"],
    verification_result="success",
    cr_id=cr.cr_id,
)
print(rb.rb_id)   # → "RB-20260330-001"

# ④ 记录审计事件（自动追加到 logs/audit/audit-log.v1.jsonl）
lgr.log_query("product_manager", "ART-PRD-0001", "查看 PRD 最新版本")
lgr.log_state_transition("project_manager_orchestrator", "scoped", "design_in_progress")
lgr.log_baseline_freeze("project_manager_orchestrator", "BL-20260330-001", ["ART-PRD-0001"])
lgr.log_approval("project_manager_orchestrator", "ART-PRD-0001", "批准 PRD v1.2.0")
```

**日志文件分布**：

```
logs/
├── change-requests/       # 每个 CR 一个 JSON 文件
│   └── CR-20260330-001.json
├── impact-assessments/    # 每个 IA 一个 JSON 文件
│   └── IA-20260330-001.json
├── rollbacks/             # 每个回退一个 JSON 文件
│   └── RB-20260330-001.json
└── audit/
    └── audit-log.v1.jsonl  # 所有事件的 append-only 审计流水
```

---

## 4. 端到端完整流程示例

下面是一个真实场景：**产品经理提了一个需求变更，走完整个生命周期**。

```python
#!/usr/bin/env python3
"""
完整端到端场景脚本：
  产品经理提需求变更 → 路由 → 影响评估 → 状态推进 → 产物更新 → 基线冻结
"""
import sys, os
from pathlib import Path

root = Path(os.environ["AGENT_TEAM_ROOT"])
for sub in ["router", "state-machine", "artifact-service", "logger"]:
    sys.path.insert(0, str(root / "runtime" / sub))

from router import Router
from state_machine import StateMachine, TransitionRequest
from artifact_service import ArtifactService
from logger import Logger

# 初始化四个执行器
router = Router(root)
sm = StateMachine(root)
svc = ArtifactService(root)
lgr = Logger(root)

# ===== Step 1: 用户输入 → 路由 =====
user_input = "修改PRD中搜索功能的需求描述"
route = router.route(user_input)
print(f"[路由] 意图={route.intent.value}, 目标={route.target_role}, 模式={route.mode}")
# → 意图=explicit_change, 目标=product_manager, 模式=change

# ===== Step 2: 创建变更请求 =====
cr = lgr.create_change_request(
    requested_by=route.target_role,
    target_artifacts=["ART-PRD-0001"],
    change_type="content_update",
    description=user_input,
    justification="用户反馈搜索体验不佳",
    priority="high",
)
print(f"[变更请求] {cr.cr_id} 已创建")

# ===== Step 3: 状态推进到 change_request_received =====
tr = sm.transition(TransitionRequest(
    from_state=sm.project_state.current_state,
    to_state="change_request_received",
    triggered_by="project_manager_orchestrator",
    reason=f"收到变更请求 {cr.cr_id}",
    change_request_id=cr.cr_id,
))
print(f"[状态机] {tr.from_state} → {tr.to_state}: {tr.verdict.value}")

# ===== Step 4: 影响评估 =====
ia = lgr.create_impact_assessment(
    cr_id=cr.cr_id,
    assessed_by="project_manager_orchestrator",
    affected_roles=["product_manager", "frontend_engineer", "backend_engineer"],
    affected_artifacts=["ART-PRD-0001", "ART-ARCH-0001"],
    affected_baselines=[],
    risk_level="medium",
    requires_retest=True,
    rollback_plan="回退到 PRD v1.2.0",
    recommendation="proceed",
)
print(f"[影响评估] {ia.ia_id}: 风险={ia.risk_level}, 建议={ia.recommendation}")

# ===== Step 5: 推进到 impact_assessment → scoped =====
sm.transition(TransitionRequest(
    from_state="change_request_received",
    to_state="impact_assessment",
    triggered_by="project_manager_orchestrator",
    reason=f"开始影响评估 {ia.ia_id}",
))
sm.transition(TransitionRequest(
    from_state="impact_assessment",
    to_state="scoped",
    triggered_by="project_manager_orchestrator",
    reason="评估通过，重新进入 scoped",
))
print(f"[状态机] 当前状态: {sm.project_state.current_state}")

# ===== Step 6: 产物版本更新 =====
new_prd = svc.update_version(
    artifact_id="ART-PRD-0001",
    new_version="v1.3.0",
    new_status="draft",
    new_stage="scoped",
)
print(f"[产物] PRD 新版本: {new_prd.version} ({new_prd.status})")

# ===== Step 7: 审批 + 冻结基线 =====
svc.approve("ART-PRD-0001")
baseline = svc.freeze_baseline("BL-20260330-003", ["ART-PRD-0001", "ART-ARCH-0001"])
lgr.log_baseline_freeze("project_manager_orchestrator", "BL-20260330-003", baseline["artifacts"])
print(f"[基线] 已冻结: {baseline['baseline_tag']}, 包含 {len(baseline['artifacts'])} 个产物")

# ===== 完整历史 =====
print("\n[状态机历史]")
for h in sm.project_state.history:
    print(f"  {h['from']} → {h['to']} ({h['triggered_by']}): {h['reason']}")
```

把上面这段保存为 `e2e_demo.py`，运行：

```bash
cd "$AGENT_TEAM_ROOT"
AGENT_TEAM_ROOT="$(pwd)" python3 e2e_demo.py
```

---

## 5. 在自己的项目中集成

### 方式一：环境变量 + 直接 import

```python
import os, sys
from pathlib import Path

# 指向 agent-team 的根目录
AGENT_TEAM = Path("/你的路径/agent-team")
os.environ["AGENT_TEAM_ROOT"] = str(AGENT_TEAM)

# 加入 Python path
for sub in ["router", "state-machine", "artifact-service", "logger"]:
    sys.path.insert(0, str(AGENT_TEAM / "runtime" / sub))

# 然后正常 import
from router import Router
from state_machine import StateMachine, TransitionRequest
from artifact_service import ArtifactService, Artifact
from logger import Logger
```

### 方式二：作为子模块 / 软链接

```bash
# 在你的项目里创建软链接
ln -s "/你的路径/agent-team" ./agent-team

# 然后 Python 中
sys.path.insert(0, "./agent-team/runtime/router")
# ...
```

### 方式三：包装成 HTTP API（后续扩展）

框架本身是纯 Python class，可以很容易用 FastAPI / Flask 包一层：

```python
from fastapi import FastAPI
app = FastAPI()

router_executor = Router(root)

@app.post("/route")
def route_request(user_input: str):
    result = router_executor.route(user_input)
    return {"intent": result.intent.value, "target": result.target_role, "mode": result.mode}
```

---

## 6. 配置定制

所有行为都通过配置文件驱动，不用改代码：

| 你想改的 | 改哪个文件 |
|---------|-----------|
| 意图分类的关键词 | `configs/global/router-config.v1.yaml` → `intent_classifier` |
| 默认路由策略 | `configs/global/router-config.v1.yaml` → `defaults` |
| 状态机的阶段列表 | `configs/global/state-machine.v1.yaml` → `states` |
| 角色的关键词匹配 | `roles/<角色>/role.profile.json` → `owned_artifacts` + Router 的 alias_map |
| 角色默认模型与 task/artifact 覆盖 | `configs/global/model-config.v1.json` → `default_model / task_overrides / artifact_overrides` |
| 新增一个产物类型 | 在 `artifacts/by-type/` 下创建目录，在 registry 中注册 |
| 新增一个角色 | 在 `roles/` 下创建四件套（profile/permissions/playbook/prompt） |

---

## 7. 常见问题

**Q: 我能不能用这套框架管理多个项目？**
A: 可以。每个项目用一个独立的 `agent-team/` 目录，`AGENT_TEAM_ROOT` 指向不同路径即可。

**Q: 状态机重启后会丢失状态吗？**
A: 当前 Phase 1 的状态是内存态（每次启动从 `intake` 开始）。如果需要持久化，调 `sm.export_state()` 保存到文件，下次启动时恢复。这是 Phase 2 的计划功能。

**Q: 怎么接真实的 LLM？**
A: Router 当前用关键词匹配做意图分类。升级路径是：
1. 在 `Router.classify_intent()` 中把关键词匹配替换为 LLM API 调用
2. 把 `roles/<角色>/prompt.system.md` 作为 system prompt 注入到 LLM 调用中
3. Router 返回的 `target_role` 用来选择对应的 prompt 和 model

**Q: 产物文件的内容由谁生成？**
A: 框架只管注册、版本、状态、基线。产物内容由对应角色的 LLM 生成（Phase 2），或者你手动写入文件后注册到 registry。

**Q: 审计日志会越来越大怎么办？**
A: `audit-log.v1.jsonl` 是 append-only 的。可以定期归档到 `artifacts/archive/` 并清空。建议写一个 cron 脚本按月切割。
