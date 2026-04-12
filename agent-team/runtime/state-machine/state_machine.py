"""
Agent Team State Machine Executor — Phase 1 Prototype

职责：
1. 管理项目当前阶段（state）
2. 校验状态转换是否合法（guard 检查）
3. 执行阶段推进 / 回退
4. 只读查询不改变状态

依赖配置：
- configs/global/state-machine.v1.yaml
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Optional

import yaml  # pip install pyyaml


# ---------------------------------------------------------------------------
# 数据类
# ---------------------------------------------------------------------------

class TransitionVerdict(Enum):
    ALLOWED = "allowed"
    BLOCKED = "blocked"
    REQUIRES_IMPACT_ASSESSMENT = "requires_impact_assessment"


@dataclass
class TransitionRequest:
    from_state: str
    to_state: str
    triggered_by: str  # role_id
    reason: str = ""
    change_request_id: Optional[str] = None


@dataclass
class TransitionResult:
    verdict: TransitionVerdict
    from_state: str
    to_state: str
    message: str = ""
    timestamp: str = ""


@dataclass
class ProjectState:
    current_state: str = "intake"
    history: list[dict] = field(default_factory=list)
    baseline_tag: Optional[str] = None


# ---------------------------------------------------------------------------
# 合法转换图（Phase 1 默认）
# ---------------------------------------------------------------------------

# 前向流
DEFAULT_TRANSITIONS: dict[str, list[str]] = {
    "intake": ["readonly_query", "change_request_received", "scoped"],
    "readonly_query": ["intake", "scoped", "design_in_progress", "architecture_in_progress",
                       "implementation_in_progress", "testing", "experience_review",
                       "release_ready", "released", "post_release_analysis"],
    "change_request_received": ["impact_assessment"],
    "impact_assessment": ["scoped", "design_in_progress", "architecture_in_progress",
                          "implementation_in_progress", "testing", "experience_review", "intake"],
    "scoped": ["readonly_query", "design_in_progress", "change_request_received"],
    "design_in_progress": ["readonly_query", "architecture_in_progress", "change_request_received"],
    "architecture_in_progress": ["readonly_query", "implementation_in_progress", "security_review",
                                  "change_request_received"],
    "implementation_in_progress": ["readonly_query", "security_review", "test_preparation",
                                    "experience_review", "change_request_received"],
    "security_review": ["readonly_query", "implementation_in_progress", "test_preparation",
                        "change_request_received"],
    "test_preparation": ["readonly_query", "testing", "change_request_received"],
    "testing": ["readonly_query", "experience_review", "implementation_in_progress",
                "change_request_received"],
    "experience_review": ["readonly_query", "experience_rework", "release_preparation",
                          "implementation_in_progress", "change_request_received"],
    "experience_rework": ["readonly_query", "implementation_in_progress", "testing",
                          "experience_review", "change_request_received"],
    "release_preparation": ["readonly_query", "release_ready", "experience_review",
                            "testing", "change_request_received"],
    "release_ready": ["readonly_query", "released", "change_request_received"],
    "released": ["readonly_query", "post_release_analysis", "rolled_back"],
    "post_release_analysis": ["readonly_query", "archived", "change_request_received"],
    "rolled_back": ["readonly_query", "implementation_in_progress", "change_request_received"],
    "archived": ["readonly_query"],
}


# ---------------------------------------------------------------------------
# State Machine 主类
# ---------------------------------------------------------------------------

class StateMachine:
    """基于配置驱动的状态机。从 YAML 加载规则，不硬编码阶段逻辑。"""

    def __init__(self, project_root: str | Path):
        self.project_root = Path(project_root)
        self.config: dict = {}
        self.states: list[str] = []
        self.core_rules: list[str] = []
        self.transitions = dict(DEFAULT_TRANSITIONS)
        self.state_labels: dict[str, str] = {}
        self.guards: dict[str, dict] = {}
        self.project_state = ProjectState()
        self._load_config()

    def _load_config(self) -> None:
        config_path = self.project_root / "configs" / "global" / "state-machine.v1.yaml"
        if not config_path.exists():
            raise FileNotFoundError(f"State machine config not found: {config_path}")
        with open(config_path, "r", encoding="utf-8") as f:
            self.config = yaml.safe_load(f) or {}

        self.states = self.config.get("states", [])
        self.core_rules = self.config.get("core_rules") or self.config.get("rules", [])
        self.state_labels = self.config.get("state_labels", {})
        self.guards = self.config.get("guards", {})
        configured_transitions = self.config.get("transitions") or {}
        if configured_transitions:
            self.transitions = {
                str(state): [str(item) for item in (targets or [])]
                for state, targets in configured_transitions.items()
            }

    # ---- Guard 检查 ----

    def _is_valid_state(self, state: str) -> bool:
        return state in self.states or state in self.transitions

    def _is_transition_allowed(self, from_state: str, to_state: str) -> bool:
        allowed = self.transitions.get(from_state, [])
        return to_state in allowed

    def _requires_impact_assessment(self, to_state: str) -> bool:
        """非只读查询的前向跳转在某些情况下需要影响评估。"""
        # 从 change_request_received 出去的都已经包含了 impact_assessment
        # 其他情况：如果直接跳跃多个阶段，建议影响评估
        return False  # Phase 1 简化：靠路由器保证变更先走 CR

    # ---- 只读查询 ----

    def query_state(self) -> dict:
        """只读查询当前状态。不改变任何东西。"""
        return {
            "current_state": self.project_state.current_state,
            "baseline_tag": self.project_state.baseline_tag,
            "history_length": len(self.project_state.history),
            "available_transitions": self.transitions.get(
                self.project_state.current_state, []
            ),
        }

    # ---- 状态推进 ----

    def transition(self, request: TransitionRequest) -> TransitionResult:
        """
        尝试推进状态。
        1. 校验 from_state 是否与当前状态一致
        2. 校验转换是否合法
        3. 执行推进并记录历史
        """
        now = datetime.now(timezone.utc).isoformat()

        # 如果 from_state 不匹配当前状态
        if request.from_state != self.project_state.current_state:
            return TransitionResult(
                verdict=TransitionVerdict.BLOCKED,
                from_state=request.from_state,
                to_state=request.to_state,
                message=(
                    f"状态不匹配：请求从 {request.from_state} 转换，"
                    f"但当前状态是 {self.project_state.current_state}"
                ),
                timestamp=now,
            )

        # 校验目标状态是否合法
        if not self._is_valid_state(request.to_state):
            return TransitionResult(
                verdict=TransitionVerdict.BLOCKED,
                from_state=request.from_state,
                to_state=request.to_state,
                message=f"未知状态: {request.to_state}",
                timestamp=now,
            )

        # 校验转换是否在允许列表
        if not self._is_transition_allowed(request.from_state, request.to_state):
            return TransitionResult(
                verdict=TransitionVerdict.BLOCKED,
                from_state=request.from_state,
                to_state=request.to_state,
                message=(
                    f"不允许从 {request.from_state} 直接转换到 {request.to_state}。"
                    f"允许的目标: {self.transitions.get(request.from_state, [])}"
                ),
                timestamp=now,
            )

        # 特殊 guard：进入 change_request_received 必须有 CR ID
        guard_cfg = self.guards.get(request.to_state, {})
        guard_requires = guard_cfg.get("requires")
        if request.to_state == "change_request_received" and not request.change_request_id:
            return TransitionResult(
                verdict=TransitionVerdict.REQUIRES_IMPACT_ASSESSMENT,
                from_state=request.from_state,
                to_state=request.to_state,
                message=guard_cfg.get("message", "进入变更流程需要提供 change_request_id"),
                timestamp=now,
            )
        if guard_requires == "change_request_id" and not request.change_request_id:
            return TransitionResult(
                verdict=TransitionVerdict.REQUIRES_IMPACT_ASSESSMENT,
                from_state=request.from_state,
                to_state=request.to_state,
                message=guard_cfg.get("message", "进入该状态需要提供 change_request_id"),
                timestamp=now,
            )
        if isinstance(guard_requires, list) and guard_requires:
            return TransitionResult(
                verdict=TransitionVerdict.BLOCKED,
                from_state=request.from_state,
                to_state=request.to_state,
                message=guard_cfg.get("message", "当前状态转换需要额外 guard 证据，现阶段 sidecar 尚未接入对应校验链路"),
                timestamp=now,
            )

        # 执行转换
        old_state = self.project_state.current_state
        self.project_state.current_state = request.to_state
        self.project_state.history.append({
            "from": old_state,
            "to": request.to_state,
            "triggered_by": request.triggered_by,
            "reason": request.reason,
            "change_request_id": request.change_request_id,
            "timestamp": now,
        })

        return TransitionResult(
            verdict=TransitionVerdict.ALLOWED,
            from_state=old_state,
            to_state=request.to_state,
            message=f"状态已从 {old_state} 推进到 {request.to_state}",
            timestamp=now,
        )

    # ---- 回退 ----

    def rollback(self, to_state: str, triggered_by: str, reason: str) -> TransitionResult:
        """
        回退到指定状态。回退不走常规 guard，但必须记录。
        """
        now = datetime.now(timezone.utc).isoformat()
        if not self._is_valid_state(to_state):
            return TransitionResult(
                verdict=TransitionVerdict.BLOCKED,
                from_state=self.project_state.current_state,
                to_state=to_state,
                message=f"未知回退目标状态: {to_state}",
                timestamp=now,
            )

        old_state = self.project_state.current_state
        self.project_state.current_state = to_state
        self.project_state.history.append({
            "from": old_state,
            "to": to_state,
            "triggered_by": triggered_by,
            "reason": f"[ROLLBACK] {reason}",
            "change_request_id": None,
            "timestamp": now,
        })

        return TransitionResult(
            verdict=TransitionVerdict.ALLOWED,
            from_state=old_state,
            to_state=to_state,
            message=f"[回退] 状态已从 {old_state} 回退到 {to_state}",
            timestamp=now,
        )

    # ---- 序列化 ----

    def export_state(self) -> dict:
        return {
            "current_state": self.project_state.current_state,
            "baseline_tag": self.project_state.baseline_tag,
            "history": self.project_state.history,
        }


# ---------------------------------------------------------------------------
# CLI 入口（调试用）
# ---------------------------------------------------------------------------

def main():
    import sys

    project_root = os.environ.get("AGENT_TEAM_ROOT", ".")
    sm = StateMachine(project_root)

    print("=" * 60)
    print("Agent Team State Machine — Phase 1 Prototype")
    print(f"合法状态: {sm.states}")
    print(f"当前状态: {sm.project_state.current_state}")
    print("=" * 60)

    # 交互式 demo
    while True:
        print(f"\n当前状态: {sm.project_state.current_state}")
        available = sm.transitions.get(sm.project_state.current_state, [])
        print(f"可转换到: {available}")
        cmd = input("输入目标状态 (或 'q' 退出, 'history' 查看历史) > ").strip()
        if cmd.lower() == "q":
            break
        if cmd.lower() == "history":
            for h in sm.project_state.history:
                print(f"  {h['timestamp']}: {h['from']} → {h['to']} ({h['triggered_by']})")
            continue

        req = TransitionRequest(
            from_state=sm.project_state.current_state,
            to_state=cmd,
            triggered_by="cli_user",
            reason="CLI manual transition",
        )
        result = sm.transition(req)
        print(f"  结果: {result.verdict.value} — {result.message}")


if __name__ == "__main__":
    main()
