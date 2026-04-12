"""
Agent Team Logger — Phase 1 Prototype

职责：
1. 写入变更请求 (Change Request)
2. 写入影响评估 (Impact Assessment)
3. 写入回退记录 (Rollback Record)
4. 追加审计日志 (Audit Log)

所有日志落盘到 logs/ 目录，严格 append-only。

依赖配置：
- logs/ 目录结构
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


# ---------------------------------------------------------------------------
# 数据类
# ---------------------------------------------------------------------------

@dataclass
class ChangeRequest:
    cr_id: str
    requested_by: str  # role_id
    target_artifacts: list[str]
    change_type: str  # "content_update" | "config_change" | "role_change" | "baseline_change"
    description: str
    justification: str
    priority: str = "normal"  # "critical" | "high" | "normal" | "low"
    status: str = "open"  # "open" | "assessed" | "approved" | "rejected" | "executed" | "rolled_back"
    impact_assessment_id: Optional[str] = None
    created_at: Optional[str] = None


@dataclass
class ImpactAssessment:
    ia_id: str
    cr_id: str  # 关联的变更请求
    assessed_by: str  # role_id
    affected_roles: list[str]
    affected_artifacts: list[str]
    affected_baselines: list[str]
    risk_level: str  # "low" | "medium" | "high" | "critical"
    requires_retest: bool
    rollback_plan: str
    recommendation: str  # "proceed" | "proceed_with_caution" | "reject"
    created_at: Optional[str] = None


@dataclass
class RollbackRecord:
    rb_id: str
    triggered_by: str  # role_id
    reason: str
    rollback_from_version: str
    rollback_to_version: str
    affected_artifacts: list[str]
    steps: list[str]
    verification_result: str  # "success" | "partial" | "failed"
    cr_id: Optional[str] = None
    created_at: Optional[str] = None


@dataclass
class AuditEntry:
    event_type: str  # "query" | "change_request" | "impact_assessment" | "state_transition" |
                     # "baseline_freeze" | "rollback" | "approval" | "rejection"
    actor: str  # role_id
    target: str
    summary: str
    detail: Optional[dict] = None
    timestamp: Optional[str] = None


# ---------------------------------------------------------------------------
# ID 生成器
# ---------------------------------------------------------------------------

class IDGenerator:
    """简单的日期 + 序号 ID 生成器。"""

    def __init__(self, logs_dir: Path, prefix: str, subdir: str):
        self.logs_dir = logs_dir
        self.prefix = prefix
        self.subdir = subdir

    def next_id(self) -> str:
        today = datetime.now(timezone.utc).strftime("%Y%m%d")
        target_dir = self.logs_dir / self.subdir
        target_dir.mkdir(parents=True, exist_ok=True)
        # 扫描今天已有的文件
        existing = list(target_dir.glob(f"{self.prefix}-{today}-*.json"))
        seq = len(existing) + 1
        return f"{self.prefix}-{today}-{seq:03d}"


# ---------------------------------------------------------------------------
# Logger 主类
# ---------------------------------------------------------------------------

class Logger:
    """统一日志写入服务。所有写入操作都是 append-only。"""

    def __init__(self, project_root: str | Path):
        self.project_root = Path(project_root)
        self.logs_dir = self.project_root / "logs"
        self.cr_gen = IDGenerator(self.logs_dir, "CR", "change-requests")
        self.ia_gen = IDGenerator(self.logs_dir, "IA", "impact-assessments")
        self.rb_gen = IDGenerator(self.logs_dir, "RB", "rollbacks")

    # ---- 变更请求 ----

    def create_change_request(
        self,
        requested_by: str,
        target_artifacts: list[str],
        change_type: str,
        description: str,
        justification: str,
        priority: str = "normal",
    ) -> ChangeRequest:
        cr_id = self.cr_gen.next_id()
        now = datetime.now(timezone.utc).isoformat()
        cr = ChangeRequest(
            cr_id=cr_id,
            requested_by=requested_by,
            target_artifacts=target_artifacts,
            change_type=change_type,
            description=description,
            justification=justification,
            priority=priority,
            status="open",
            created_at=now,
        )
        self._write_json(
            self.logs_dir / "change-requests" / f"{cr_id}.json",
            self._cr_to_dict(cr),
        )
        self._append_audit(AuditEntry(
            event_type="change_request",
            actor=requested_by,
            target=cr_id,
            summary=f"创建变更请求: {description[:80]}",
            detail={"target_artifacts": target_artifacts, "change_type": change_type},
        ))
        return cr

    # ---- 影响评估 ----

    def create_impact_assessment(
        self,
        cr_id: str,
        assessed_by: str,
        affected_roles: list[str],
        affected_artifacts: list[str],
        affected_baselines: list[str],
        risk_level: str,
        requires_retest: bool,
        rollback_plan: str,
        recommendation: str,
    ) -> ImpactAssessment:
        ia_id = self.ia_gen.next_id()
        now = datetime.now(timezone.utc).isoformat()
        ia = ImpactAssessment(
            ia_id=ia_id,
            cr_id=cr_id,
            assessed_by=assessed_by,
            affected_roles=affected_roles,
            affected_artifacts=affected_artifacts,
            affected_baselines=affected_baselines,
            risk_level=risk_level,
            requires_retest=requires_retest,
            rollback_plan=rollback_plan,
            recommendation=recommendation,
            created_at=now,
        )
        self._write_json(
            self.logs_dir / "impact-assessments" / f"{ia_id}.json",
            self._ia_to_dict(ia),
        )
        self._append_audit(AuditEntry(
            event_type="impact_assessment",
            actor=assessed_by,
            target=ia_id,
            summary=f"影响评估完成: 风险={risk_level}, 建议={recommendation}",
            detail={"cr_id": cr_id, "affected_roles": affected_roles},
        ))
        return ia

    # ---- 回退记录 ----

    def create_rollback_record(
        self,
        triggered_by: str,
        reason: str,
        rollback_from_version: str,
        rollback_to_version: str,
        affected_artifacts: list[str],
        steps: list[str],
        verification_result: str,
        cr_id: Optional[str] = None,
    ) -> RollbackRecord:
        rb_id = self.rb_gen.next_id()
        now = datetime.now(timezone.utc).isoformat()
        rb = RollbackRecord(
            rb_id=rb_id,
            triggered_by=triggered_by,
            reason=reason,
            rollback_from_version=rollback_from_version,
            rollback_to_version=rollback_to_version,
            affected_artifacts=affected_artifacts,
            steps=steps,
            verification_result=verification_result,
            cr_id=cr_id,
            created_at=now,
        )
        self._write_json(
            self.logs_dir / "rollbacks" / f"{rb_id}.json",
            self._rb_to_dict(rb),
        )
        self._append_audit(AuditEntry(
            event_type="rollback",
            actor=triggered_by,
            target=rb_id,
            summary=f"回退执行: {rollback_from_version} → {rollback_to_version}, 验证={verification_result}",
            detail={"affected_artifacts": affected_artifacts},
        ))
        return rb

    # ---- 审计日志（追加）----

    def log_query(self, actor: str, target: str, summary: str) -> None:
        """记录只读查询事件。"""
        self._append_audit(AuditEntry(
            event_type="query",
            actor=actor,
            target=target,
            summary=summary,
        ))

    def log_state_transition(self, actor: str, from_state: str, to_state: str) -> None:
        self._append_audit(AuditEntry(
            event_type="state_transition",
            actor=actor,
            target=f"{from_state} → {to_state}",
            summary=f"状态转换: {from_state} → {to_state}",
        ))

    def log_baseline_freeze(self, actor: str, baseline_tag: str, artifacts: list[str]) -> None:
        self._append_audit(AuditEntry(
            event_type="baseline_freeze",
            actor=actor,
            target=baseline_tag,
            summary=f"基线冻结: {baseline_tag}",
            detail={"artifacts": artifacts},
        ))

    def log_approval(self, actor: str, target_id: str, summary: str) -> None:
        self._append_audit(AuditEntry(
            event_type="approval",
            actor=actor,
            target=target_id,
            summary=summary,
        ))

    def log_event(
        self,
        event_type: str,
        actor: str,
        target: str,
        summary: str,
        detail: Optional[dict] = None,
    ) -> None:
        self._append_audit(AuditEntry(
            event_type=event_type,
            actor=actor,
            target=target,
            summary=summary,
            detail=detail,
        ))

    # ---- 内部方法 ----

    def _append_audit(self, entry: AuditEntry) -> None:
        now = datetime.now(timezone.utc).isoformat()
        entry.timestamp = now
        audit_path = self.logs_dir / "audit" / "audit-log.v1.jsonl"
        audit_path.parent.mkdir(parents=True, exist_ok=True)
        with open(audit_path, "a", encoding="utf-8") as f:
            f.write(json.dumps({
                "event_type": entry.event_type,
                "actor": entry.actor,
                "target": entry.target,
                "summary": entry.summary,
                "detail": entry.detail,
                "timestamp": entry.timestamp,
            }, ensure_ascii=False) + "\n")

    @staticmethod
    def _write_json(path: Path, data: dict) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    @staticmethod
    def _cr_to_dict(cr: ChangeRequest) -> dict:
        return {
            "cr_id": cr.cr_id,
            "requested_by": cr.requested_by,
            "target_artifacts": cr.target_artifacts,
            "change_type": cr.change_type,
            "description": cr.description,
            "justification": cr.justification,
            "priority": cr.priority,
            "status": cr.status,
            "impact_assessment_id": cr.impact_assessment_id,
            "created_at": cr.created_at,
        }

    @staticmethod
    def _ia_to_dict(ia: ImpactAssessment) -> dict:
        return {
            "ia_id": ia.ia_id,
            "cr_id": ia.cr_id,
            "assessed_by": ia.assessed_by,
            "affected_roles": ia.affected_roles,
            "affected_artifacts": ia.affected_artifacts,
            "affected_baselines": ia.affected_baselines,
            "risk_level": ia.risk_level,
            "requires_retest": ia.requires_retest,
            "rollback_plan": ia.rollback_plan,
            "recommendation": ia.recommendation,
            "created_at": ia.created_at,
        }

    @staticmethod
    def _rb_to_dict(rb: RollbackRecord) -> dict:
        return {
            "rb_id": rb.rb_id,
            "triggered_by": rb.triggered_by,
            "reason": rb.reason,
            "rollback_from_version": rb.rollback_from_version,
            "rollback_to_version": rb.rollback_to_version,
            "affected_artifacts": rb.affected_artifacts,
            "steps": rb.steps,
            "verification_result": rb.verification_result,
            "cr_id": rb.cr_id,
            "created_at": rb.created_at,
        }


# ---------------------------------------------------------------------------
# CLI 入口（调试用）
# ---------------------------------------------------------------------------

def main():
    project_root = os.environ.get("AGENT_TEAM_ROOT", ".")
    logger = Logger(project_root)

    print("=" * 60)
    print("Agent Team Logger — Phase 1 Prototype")
    print("=" * 60)

    # Demo：创建一个完整的变更流程
    print("\n--- Demo: 完整变更流程 ---")

    cr = logger.create_change_request(
        requested_by="product_manager",
        target_artifacts=["ART-PRD-0001"],
        change_type="content_update",
        description="更新 PRD 中的搜索功能需求",
        justification="用户反馈搜索结果不够精准，需要增加筛选维度",
        priority="high",
    )
    print(f"1. 变更请求已创建: {cr.cr_id}")

    ia = logger.create_impact_assessment(
        cr_id=cr.cr_id,
        assessed_by="project_manager_orchestrator",
        affected_roles=["product_manager", "frontend_engineer", "backend_engineer", "qa_engineer"],
        affected_artifacts=["ART-PRD-0001", "ART-ARCH-0001"],
        affected_baselines=["BL-20260330-002"],
        risk_level="medium",
        requires_retest=True,
        rollback_plan="回退到 PRD v1.1.0 版本",
        recommendation="proceed_with_caution",
    )
    print(f"2. 影响评估已创建: {ia.ia_id}")

    logger.log_state_transition("project_manager_orchestrator", "scoped", "change_request_received")
    print("3. 审计日志已记录状态转换")

    print("\nDemo 完成。检查 logs/ 目录下的输出文件。")


if __name__ == "__main__":
    main()
