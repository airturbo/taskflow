#!/usr/bin/env python3
"""
Agent Team Bootstrap — Phase 1

功能：
1. 校验工程骨架完整性（目录 + 配置文件）
2. 初始化缺失目录
3. 运行简单的 smoke test（路由器 + 状态机 + 产物注册 + 日志）
4. 输出初始化报告

用法：
    export AGENT_TEAM_ROOT=/path/to/agent-team
    python bootstrap.py [--check | --init | --demo]

    --check  只检查，不创建
    --init   检查并自动创建缺失目录
    --demo   检查 + 初始化 + 运行 demo 流程
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# 配置
# ---------------------------------------------------------------------------

REQUIRED_GLOBAL_FILES = [
    "configs/global/model-config.v1.json",
    "configs/global/router-config.v1.yaml",
    "configs/global/state-machine.v1.yaml",
    "configs/global/naming-rules.v1.md",
]

REQUIRED_BASELINE_FILES = [
    "configs/baselines/baseline.current.v1.json",
    "configs/baselines/baseline.history.v1.jsonl",
]

ROLE_FOLDERS = [
    "project-manager-orchestrator",
    "product-manager",
    "ui-ux-designer",
    "user-experience-officer",
    "system-architect",
    "frontend-engineer",
    "backend-engineer",
    "qa-engineer",
    "devops-engineer",
    "data-analyst",
    "security-compliance-engineer",
]

PER_ROLE_FILES = [
    "role.profile.json",
    "permissions.yaml",
    "query-playbook.yaml",
    "prompt.system.md",
]

REQUIRED_DIRS = [
    "artifacts/registry",
    "artifacts/by-type",
    "artifacts/by-role",
    "artifacts/archive",
    "logs/change-requests",
    "logs/impact-assessments",
    "logs/rollbacks",
    "logs/audit",
    "runtime/router",
    "runtime/state-machine",
    "runtime/artifact-service",
    "runtime/logger",
]


# ---------------------------------------------------------------------------
# 检查逻辑
# ---------------------------------------------------------------------------

def check_structure(root: Path) -> tuple[list[str], list[str]]:
    """返回 (通过项, 缺失项)"""
    passed: list[str] = []
    missing: list[str] = []

    # 全局配置
    for f in REQUIRED_GLOBAL_FILES + REQUIRED_BASELINE_FILES:
        p = root / f
        if p.exists():
            passed.append(f"✅ {f}")
        else:
            missing.append(f"❌ {f}")

    # 角色配置
    for role in ROLE_FOLDERS:
        for rf in PER_ROLE_FILES:
            rel = f"roles/{role}/{rf}"
            p = root / rel
            if p.exists():
                passed.append(f"✅ {rel}")
            else:
                missing.append(f"❌ {rel}")

    # 目录
    for d in REQUIRED_DIRS:
        p = root / d
        if p.is_dir():
            passed.append(f"✅ {d}/")
        else:
            missing.append(f"❌ {d}/")

    # Artifact Registry
    reg = "artifacts/registry/artifact-registry.v1.json"
    if (root / reg).exists():
        passed.append(f"✅ {reg}")
    else:
        missing.append(f"❌ {reg}")

    # Audit log
    audit = "logs/audit/audit-log.v1.jsonl"
    if (root / audit).exists():
        passed.append(f"✅ {audit}")
    else:
        missing.append(f"❌ {audit}")

    return passed, missing


def init_missing(root: Path, missing: list[str]) -> list[str]:
    """自动创建缺失的目录。文件不会自动创建（需要有效内容）。"""
    created: list[str] = []
    for item in missing:
        # 去掉前缀 ❌
        rel = item.replace("❌ ", "").strip()
        if rel.endswith("/"):
            # 目录
            p = root / rel
            p.mkdir(parents=True, exist_ok=True)
            created.append(f"📁 已创建目录: {rel}")
    return created


# ---------------------------------------------------------------------------
# Demo 流程
# ---------------------------------------------------------------------------

def run_demo(root: Path) -> None:
    """运行 smoke test，验证 4 个执行器都能正常初始化和执行基本操作。"""
    print("\n" + "=" * 60)
    print("🚀 Demo: Smoke Test")
    print("=" * 60)

    # 添加 runtime 到 Python path
    sys.path.insert(0, str(root / "runtime" / "router"))
    sys.path.insert(0, str(root / "runtime" / "state-machine"))
    sys.path.insert(0, str(root / "runtime" / "artifact-service"))
    sys.path.insert(0, str(root / "runtime" / "logger"))

    os.environ["AGENT_TEAM_ROOT"] = str(root)

    # 1. Router
    print("\n--- 1. Router ---")
    try:
        from router import Router
        r = Router(root)
        result = r.route("看看当前PRD的进展")
        print(f"  输入: '看看当前PRD的进展'")
        print(f"  意图: {result.intent.value}")
        print(f"  目标: {result.target_role}")
        print(f"  模式: {result.mode}")
        print("  ✅ Router 正常")
    except Exception as e:
        print(f"  ❌ Router 异常: {e}")

    # 2. State Machine
    print("\n--- 2. State Machine ---")
    try:
        from state_machine import StateMachine, TransitionRequest
        sm = StateMachine(root)
        state = sm.query_state()
        print(f"  当前状态: {state['current_state']}")
        print(f"  可转换到: {state['available_transitions']}")

        req = TransitionRequest(
            from_state="intake",
            to_state="scoped",
            triggered_by="project_manager_orchestrator",
            reason="Demo: 需求已确认范围",
        )
        result = sm.transition(req)
        print(f"  转换结果: {result.verdict.value} — {result.message}")
        print("  ✅ State Machine 正常")
    except Exception as e:
        print(f"  ❌ State Machine 异常: {e}")

    # 3. Artifact Service
    print("\n--- 3. Artifact Service ---")
    try:
        from artifact_service import ArtifactService
        svc = ArtifactService(root)
        print(f"  已加载 {len(svc.artifacts)} 个产物")
        approved = svc.query(status="approved")
        print(f"  已批准产物: {len(approved)} 个")
        print("  ✅ Artifact Service 正常")
    except Exception as e:
        print(f"  ❌ Artifact Service 异常: {e}")

    # 4. Logger
    print("\n--- 4. Logger ---")
    try:
        from logger import Logger
        lgr = Logger(root)
        cr = lgr.create_change_request(
            requested_by="product_manager",
            target_artifacts=["ART-PRD-0001"],
            change_type="content_update",
            description="[Smoke Test] 验证日志写入",
            justification="Bootstrap demo",
        )
        print(f"  变更请求已创建: {cr.cr_id}")
        print("  ✅ Logger 正常")
    except Exception as e:
        print(f"  ❌ Logger 异常: {e}")

    print("\n" + "=" * 60)
    print("🎉 Smoke Test 完成")
    print("=" * 60)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    root_str = os.environ.get("AGENT_TEAM_ROOT", ".")
    root = Path(root_str).resolve()

    mode = "check"
    if len(sys.argv) > 1:
        arg = sys.argv[1].lstrip("-")
        if arg in ("init", "demo", "check"):
            mode = arg

    print("=" * 60)
    print("Agent Team Bootstrap — Phase 1")
    print(f"项目根目录: {root}")
    print(f"模式: {mode}")
    print("=" * 60)

    # Step 1: 检查
    passed, missing = check_structure(root)
    print(f"\n📋 检查结果: {len(passed)} 通过, {len(missing)} 缺失")
    if missing:
        print("\n缺失项:")
        for m in missing:
            print(f"  {m}")
    else:
        print("\n✅ 所有检查项通过！")

    # Step 2: 初始化（如果 mode 是 init 或 demo）
    if mode in ("init", "demo") and missing:
        print(f"\n📦 自动初始化缺失目录...")
        created = init_missing(root, missing)
        for c in created:
            print(f"  {c}")
        if not created:
            print("  （无目录需要创建，缺失的是文件 — 需要手动补充内容）")

    # Step 3: Demo（如果 mode 是 demo）
    if mode == "demo":
        run_demo(root)

    print("\n完成。")


if __name__ == "__main__":
    main()
