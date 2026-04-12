"""
Agent Team Artifact Registry Service — Phase 1 Prototype

职责：
1. 加载 artifact-registry.v1.json
2. 注册新产物 / 更新版本
3. 按 ID / 类型 / 角色 / 阶段查询产物
4. 基线冻结与替换
5. 产物文件落盘到 by-type/ 目录

依赖配置：
- artifacts/registry/artifact-registry.v1.json
- configs/baselines/baseline.current.v1.json
"""

from __future__ import annotations

import json
import os
import re
import shutil
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


# ---------------------------------------------------------------------------
# 数据类
# ---------------------------------------------------------------------------

@dataclass
class Artifact:
    artifact_id: str
    artifact_type: str
    owner_role: str
    stage: str
    status: str  # draft | in_review | approved | superseded | archived
    version: str
    storage_path: str
    baseline: Optional[str] = None
    upstream: list[str] = field(default_factory=list)
    downstream: list[str] = field(default_factory=list)
    checksum: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    def to_dict(self) -> dict:
        d = {
            "artifact_id": self.artifact_id,
            "artifact_type": self.artifact_type,
            "owner_role": self.owner_role,
            "stage": self.stage,
            "status": self.status,
            "version": self.version,
            "storage_path": self.storage_path,
        }
        if self.baseline:
            d["baseline"] = self.baseline
        if self.upstream:
            d["upstream"] = self.upstream
        if self.downstream:
            d["downstream"] = self.downstream
        if self.checksum:
            d["checksum"] = self.checksum
        if self.created_at:
            d["created_at"] = self.created_at
        if self.updated_at:
            d["updated_at"] = self.updated_at
        return d


# ---------------------------------------------------------------------------
# Artifact Service 主类
# ---------------------------------------------------------------------------

class ArtifactService:
    """产物注册表读写服务。"""

    def __init__(self, project_root: str | Path):
        self.project_root = Path(project_root)
        self.registry_path = self.project_root / "artifacts" / "registry" / "artifact-registry.v1.json"
        self.baseline_path = self.project_root / "configs" / "baselines" / "baseline.current.v1.json"
        self.registry: dict = {}
        self.artifacts: list[Artifact] = []
        self._load_registry()

    def _load_registry(self) -> None:
        if not self.registry_path.exists():
            self.registry = {
                "schema_version": "1.0",
                "registry_name": "agent-team-artifact-registry",
                "phase": "phase1",
                "governance": {
                    "approved_only_as_default_input": True,
                    "no_silent_overwrite": True,
                    "rollback_record_required": True,
                    "baseline_tracking_enabled": True,
                },
                "artifacts": [],
            }
            return
        with open(self.registry_path, "r", encoding="utf-8") as f:
            self.registry = json.load(f)
        for item in self.registry.get("artifacts", []):
            self.artifacts.append(Artifact(**{
                k: item.get(k, None) for k in Artifact.__dataclass_fields__
                if k in item
            }))

    def _save_registry(self) -> None:
        self.registry["artifacts"] = [a.to_dict() for a in self.artifacts]
        self.registry_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.registry_path, "w", encoding="utf-8") as f:
            json.dump(self.registry, f, ensure_ascii=False, indent=2)

    # ---- 查询（只读）----

    def get_by_id(self, artifact_id: str) -> Optional[Artifact]:
        for a in self.artifacts:
            if a.artifact_id == artifact_id:
                return a
        return None

    def query(
        self,
        artifact_type: Optional[str] = None,
        owner_role: Optional[str] = None,
        stage: Optional[str] = None,
        status: Optional[str] = None,
    ) -> list[Artifact]:
        results = self.artifacts
        if artifact_type:
            results = [a for a in results if a.artifact_type == artifact_type]
        if owner_role:
            results = [a for a in results if a.owner_role == owner_role]
        if stage:
            results = [a for a in results if a.stage == stage]
        if status:
            results = [a for a in results if a.status == status]
        return results

    def list_all(self) -> list[dict]:
        return [a.to_dict() for a in self.artifacts]

    # ---- 注册 / 更新 ----

    def register(self, artifact: Artifact) -> Artifact:
        """注册新产物。如果 ID 已存在则拒绝（需要用 update_version）。"""
        existing = self.get_by_id(artifact.artifact_id)
        if existing:
            raise ValueError(
                f"产物 {artifact.artifact_id} 已存在（版本 {existing.version}）。"
                f"如需更新版本，请使用 update_version()。"
            )
        now = datetime.now(timezone.utc).isoformat()
        artifact.created_at = now
        artifact.updated_at = now

        # 确保 storage_path 对应的目录存在
        full_path = self.project_root / artifact.storage_path
        full_path.parent.mkdir(parents=True, exist_ok=True)

        self.artifacts.append(artifact)
        self._save_registry()
        return artifact

    def update_version(
        self,
        artifact_id: str,
        new_version: str,
        new_status: str = "draft",
        new_stage: Optional[str] = None,
    ) -> Artifact:
        """更新现有产物的版本。旧版本标记为 superseded。"""
        existing = self.get_by_id(artifact_id)
        if not existing:
            raise ValueError(f"产物 {artifact_id} 不存在。")

        now = datetime.now(timezone.utc).isoformat()

        # 标记旧版本为 superseded
        existing.status = "superseded"
        existing.updated_at = now

        # 构建新版本的 storage_path
        new_path = re.sub(
            r"--v[\d.]+\.",
            f"--{new_version}.",
            existing.storage_path,
        )

        new_artifact = Artifact(
            artifact_id=artifact_id,
            artifact_type=existing.artifact_type,
            owner_role=existing.owner_role,
            stage=new_stage or existing.stage,
            status=new_status,
            version=new_version,
            storage_path=new_path,
            baseline=existing.baseline,
            upstream=list(existing.upstream),
            downstream=list(existing.downstream),
            created_at=now,
            updated_at=now,
        )

        # 确保目录存在
        full_path = self.project_root / new_path
        full_path.parent.mkdir(parents=True, exist_ok=True)

        self.artifacts.append(new_artifact)
        self._save_registry()
        return new_artifact

    # ---- 状态变更 ----

    def approve(self, artifact_id: str) -> Artifact:
        a = self.get_by_id(artifact_id)
        if not a:
            raise ValueError(f"产物 {artifact_id} 不存在。")
        if a.status == "approved":
            raise ValueError(f"产物 {artifact_id} 已是 approved 状态。")
        a.status = "approved"
        a.updated_at = datetime.now(timezone.utc).isoformat()
        self._save_registry()
        return a

    def archive(self, artifact_id: str) -> Artifact:
        a = self.get_by_id(artifact_id)
        if not a:
            raise ValueError(f"产物 {artifact_id} 不存在。")
        a.status = "archived"
        a.updated_at = datetime.now(timezone.utc).isoformat()

        # 移动文件到 archive/
        src = self.project_root / a.storage_path
        archive_dir = self.project_root / "artifacts" / "archive"
        archive_dir.mkdir(parents=True, exist_ok=True)
        if src.exists():
            dst = archive_dir / src.name
            shutil.move(str(src), str(dst))
            a.storage_path = f"artifacts/archive/{src.name}"

        self._save_registry()
        return a

    # ---- 基线操作 ----

    def freeze_baseline(self, baseline_tag: str, artifact_ids: list[str]) -> dict:
        """冻结基线：将指定产物标记为该基线的组成部分。"""
        now = datetime.now(timezone.utc).isoformat()
        frozen = []
        for aid in artifact_ids:
            a = self.get_by_id(aid)
            if a and a.status == "approved":
                a.baseline = baseline_tag
                a.updated_at = now
                frozen.append(a.artifact_id)

        self._save_registry()

        # 更新 baseline.current
        baseline_data = {
            "schema_version": "1.0",
            "baseline_tag": baseline_tag,
            "frozen_at": now,
            "artifacts": frozen,
        }
        self.baseline_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.baseline_path, "w", encoding="utf-8") as f:
            json.dump(baseline_data, f, ensure_ascii=False, indent=2)

        # 追加到 baseline.history
        history_path = self.baseline_path.parent / "baseline.history.v1.jsonl"
        with open(history_path, "a", encoding="utf-8") as f:
            f.write(json.dumps({
                "baseline_tag": baseline_tag,
                "frozen_at": now,
                "artifacts": frozen,
            }, ensure_ascii=False) + "\n")

        return baseline_data


# ---------------------------------------------------------------------------
# CLI 入口（调试用）
# ---------------------------------------------------------------------------

def main():
    project_root = os.environ.get("AGENT_TEAM_ROOT", ".")
    svc = ArtifactService(project_root)

    print("=" * 60)
    print("Agent Team Artifact Service — Phase 1 Prototype")
    print(f"已加载 {len(svc.artifacts)} 个产物")
    print("=" * 60)

    for a in svc.artifacts:
        print(f"  {a.artifact_id} [{a.artifact_type}] {a.version} ({a.status}) → {a.owner_role}")

    print(f"\n可用命令: list / query <type> / register / approve <id> / freeze <tag> <ids> / quit")

    while True:
        cmd = input("\n> ").strip()
        if not cmd or cmd == "quit":
            break
        parts = cmd.split()
        if parts[0] == "list":
            for a in svc.list_all():
                print(f"  {json.dumps(a, ensure_ascii=False)}")
        elif parts[0] == "query" and len(parts) > 1:
            results = svc.query(artifact_type=parts[1])
            for a in results:
                print(f"  {a.artifact_id} {a.version} ({a.status})")
        elif parts[0] == "approve" and len(parts) > 1:
            try:
                a = svc.approve(parts[1])
                print(f"  已批准: {a.artifact_id}")
            except ValueError as e:
                print(f"  错误: {e}")
        elif parts[0] == "freeze" and len(parts) > 2:
            tag = parts[1]
            ids = parts[2:]
            result = svc.freeze_baseline(tag, ids)
            print(f"  基线已冻结: {json.dumps(result, ensure_ascii=False)}")
        else:
            print("  未知命令")


if __name__ == "__main__":
    main()
