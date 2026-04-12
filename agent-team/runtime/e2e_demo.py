#!/usr/bin/env python3
"""
Agent Team — 端到端完整流程 Demo

场景：产品经理提出 PRD 变更请求，走完路由 → 变更请求 → 影响评估
      → 状态推进 → 产物版本更新 → 审批 → 基线冻结 的完整生命周期。

用法：
    export AGENT_TEAM_ROOT=/path/to/agent-team
    python3 e2e_demo.py
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

root = Path(os.environ.get("AGENT_TEAM_ROOT", ".")).resolve()
for sub in ["router", "state-machine", "artifact-service", "logger"]:
    sys.path.insert(0, str(root / "runtime" / sub))

from router import Router
from state_machine import StateMachine, TransitionRequest
from artifact_service import ArtifactService
from logger import Logger


def sep(title: str) -> None:
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")


def main():
    # 初始化
    router = Router(root)
    sm = StateMachine(root)
    svc = ArtifactService(root)
    lgr = Logger(root)

    sep("Step 1: 用户输入 → 路由分发")
    user_input = "修改PRD中搜索功能的需求描述"
    route = router.route(user_input)
    print(f"  用户输入: {user_input}")
    print(f"  意图:     {route.intent.value}")
    print(f"  目标角色: {route.target_role}")
    print(f"  模式:     {route.mode}")
    print(f"  关键词:   {route.matched_keywords}")

    sep("Step 2: 创建变更请求 (Change Request)")
    cr = lgr.create_change_request(
        requested_by=route.target_role,
        target_artifacts=["ART-PRD-0001"],
        change_type="content_update",
        description=user_input,
        justification="用户反馈搜索体验不佳，需增加筛选维度",
        priority="high",
    )
    print(f"  变更请求 ID: {cr.cr_id}")
    print(f"  请求角色:   {cr.requested_by}")
    print(f"  优先级:     {cr.priority}")
    print(f"  状态:       {cr.status}")
    print(f"  文件落盘:   logs/change-requests/{cr.cr_id}.json")

    sep("Step 3: 状态推进 → change_request_received")
    tr = sm.transition(TransitionRequest(
        from_state=sm.project_state.current_state,
        to_state="change_request_received",
        triggered_by="project_manager_orchestrator",
        reason=f"收到变更请求 {cr.cr_id}",
        change_request_id=cr.cr_id,
    ))
    lgr.log_state_transition("project_manager_orchestrator", tr.from_state, tr.to_state)
    print(f"  {tr.from_state} → {tr.to_state}: {tr.verdict.value}")

    sep("Step 4: 影响评估 (Impact Assessment)")
    ia = lgr.create_impact_assessment(
        cr_id=cr.cr_id,
        assessed_by="project_manager_orchestrator",
        affected_roles=["product_manager", "frontend_engineer", "backend_engineer", "qa_engineer"],
        affected_artifacts=["ART-PRD-0001", "ART-ARCH-0001"],
        affected_baselines=[],
        risk_level="medium",
        requires_retest=True,
        rollback_plan="回退到 PRD v1.2.0",
        recommendation="proceed",
    )
    print(f"  评估 ID:     {ia.ia_id}")
    print(f"  风险等级:   {ia.risk_level}")
    print(f"  需要重测:   {ia.requires_retest}")
    print(f"  建议:       {ia.recommendation}")
    print(f"  影响角色:   {ia.affected_roles}")
    print(f"  影响产物:   {ia.affected_artifacts}")

    sep("Step 5: 状态推进 → impact_assessment → scoped")
    tr2 = sm.transition(TransitionRequest(
        from_state="change_request_received",
        to_state="impact_assessment",
        triggered_by="project_manager_orchestrator",
        reason=f"开始影响评估 {ia.ia_id}",
    ))
    lgr.log_state_transition("project_manager_orchestrator", tr2.from_state, tr2.to_state)
    print(f"  {tr2.from_state} → {tr2.to_state}: {tr2.verdict.value}")

    tr3 = sm.transition(TransitionRequest(
        from_state="impact_assessment",
        to_state="scoped",
        triggered_by="project_manager_orchestrator",
        reason="评估通过，重新进入 scoped 阶段",
    ))
    lgr.log_state_transition("project_manager_orchestrator", tr3.from_state, tr3.to_state)
    print(f"  {tr3.from_state} → {tr3.to_state}: {tr3.verdict.value}")
    print(f"  当前状态:   {sm.project_state.current_state}")

    sep("Step 6: 产物版本更新")
    new_prd = svc.update_version(
        artifact_id="ART-PRD-0001",
        new_version="v1.3.0",
        new_status="draft",
        new_stage="scoped",
    )
    print(f"  产物 ID:    {new_prd.artifact_id}")
    print(f"  新版本:     {new_prd.version}")
    print(f"  新状态:     {new_prd.status}")
    print(f"  存储路径:   {new_prd.storage_path}")

    # 查看旧版本状态
    all_prd = svc.query(artifact_type="PRD")
    for a in all_prd:
        print(f"  → {a.artifact_id} {a.version} ({a.status})")

    sep("Step 7: 审批")
    svc.approve("ART-PRD-0001")
    lgr.log_approval("project_manager_orchestrator", "ART-PRD-0001", "批准 PRD v1.3.0")
    approved_prd = svc.get_by_id("ART-PRD-0001")
    print(f"  {approved_prd.artifact_id} {approved_prd.version} → 状态: {approved_prd.status}")

    sep("Step 8: 基线冻结")
    baseline = svc.freeze_baseline(
        baseline_tag="BL-20260330-E2E",
        artifact_ids=["ART-PRD-0001", "ART-ARCH-0001"],
    )
    lgr.log_baseline_freeze(
        "project_manager_orchestrator",
        baseline["baseline_tag"],
        baseline["artifacts"],
    )
    print(f"  基线标签:   {baseline['baseline_tag']}")
    print(f"  冻结时间:   {baseline['frozen_at']}")
    print(f"  包含产物:   {baseline['artifacts']}")

    sep("完整状态机历史")
    for h in sm.project_state.history:
        print(f"  {h['from']:30s} → {h['to']:30s}  ({h['triggered_by']})")
        print(f"  {'':30s}   原因: {h['reason']}")

    sep("只读查询示例")
    readonly_input = "看看当前PRD的进展"
    readonly_route = router.route(readonly_input)
    lgr.log_query(readonly_route.target_role, "ART-PRD-0001", readonly_input)
    state = sm.query_state()  # 不改变状态
    print(f"  用户输入:   {readonly_input}")
    print(f"  路由结果:   意图={readonly_route.intent.value}, 角色={readonly_route.target_role}")
    print(f"  当前状态:   {state['current_state']}（未被只读查询改变）")

    sep("🎉 端到端 Demo 完成")
    print("""
  回顾一下走过的完整流程：
  
  ① 用户输入 "修改PRD中搜索功能的需求描述"
  ② Router 判断为 explicit_change → 路由到 product_manager
  ③ 创建变更请求 CR，落盘到 logs/change-requests/
  ④ 状态机推进到 change_request_received
  ⑤ 执行影响评估 IA，落盘到 logs/impact-assessments/
  ⑥ 状态机经 impact_assessment 回到 scoped
  ⑦ 产物版本从 v1.2.0 升级到 v1.3.0，旧版标记 superseded
  ⑧ 审批新版本
  ⑨ 冻结基线 BL-20260330-E2E
  ⑩ 只读查询不改变任何状态

  所有操作均留有审计日志：logs/audit/audit-log.v1.jsonl
""")


if __name__ == "__main__":
    main()
