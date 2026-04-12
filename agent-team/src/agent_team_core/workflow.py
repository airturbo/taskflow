from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class JSONRegistryStore:
    def __init__(
        self,
        project_root: str | Path,
        *,
        id_prefix: str,
        id_field: str,
        registry_relative_path: str,
        object_dir_relative_path: str,
        schema_version: str = "1.0",
    ):
        self.project_root = Path(project_root).resolve()
        self.id_prefix = id_prefix
        self.id_field = id_field
        self.registry_path = self.project_root / registry_relative_path
        self.object_dir = self.project_root / object_dir_relative_path
        self.schema_version = schema_version

    def ensure(self) -> None:
        self.object_dir.mkdir(parents=True, exist_ok=True)
        if self.registry_path.exists():
            return
        self._write_json(
            self.registry_path,
            {
                "schema_version": self.schema_version,
                "items": [],
            },
        )

    def next_id(self) -> str:
        self.ensure()
        today = datetime.now(timezone.utc).strftime("%Y%m%d")
        existing = list(self.object_dir.glob(f"{self.id_prefix}-{today}-*.json"))
        return f"{self.id_prefix}-{today}-{len(existing) + 1:03d}"

    def list(self, **filters: Any) -> list[dict[str, Any]]:
        items = list(self._load_registry().get("items", []))
        if not filters:
            return items
        result: list[dict[str, Any]] = []
        for item in items:
            matched = True
            for key, value in filters.items():
                if value is None:
                    continue
                if item.get(key) != value:
                    matched = False
                    break
            if matched:
                result.append(item)
        return result

    def get(self, record_id: str) -> dict[str, Any]:
        self.ensure()
        record_path = self.object_dir / f"{record_id}.json"
        if record_path.exists():
            with open(record_path, "r", encoding="utf-8") as f:
                return json.load(f)

        for item in self._load_registry().get("items", []):
            if item.get(self.id_field) == record_id:
                return item
        raise KeyError(f"Unknown {self.id_field}: {record_id}")

    def save(self, record: dict[str, Any]) -> dict[str, Any]:
        self.ensure()
        record_id = record[self.id_field]
        self._write_json(self.object_dir / f"{record_id}.json", record)
        registry = self._load_registry()
        items = registry.get("items", [])
        updated = False
        for idx, item in enumerate(items):
            if item.get(self.id_field) == record_id:
                items[idx] = record
                updated = True
                break
        if not updated:
            items.append(record)
        registry["items"] = sorted(items, key=lambda item: item.get("created_at") or "")
        self._write_json(self.registry_path, registry)
        return record

    def _load_registry(self) -> dict[str, Any]:
        self.ensure()
        with open(self.registry_path, "r", encoding="utf-8") as f:
            return json.load(f)

    @staticmethod
    def _write_json(path: Path, data: dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = path.with_suffix(f"{path.suffix}.tmp")
        with open(temp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        temp_path.replace(path)


class WorkflowStore:
    def __init__(self, project_root: str | Path):
        self._store = JSONRegistryStore(
            project_root,
            id_prefix="WF",
            id_field="workflow_id",
            registry_relative_path="state/workflows/workflow-registry.v1.json",
            object_dir_relative_path="state/workflows/by-id",
        )

    def create(
        self,
        *,
        workflow_type: str,
        entry_user_input: str,
        current_state: str,
        created_by: str,
        route_snapshot: Optional[dict[str, Any]] = None,
        change_request_id: Optional[str] = None,
        impact_assessment_id: Optional[str] = None,
        status: str = "open",
    ) -> dict[str, Any]:
        now = _now_iso()
        workflow = {
            "workflow_id": self._store.next_id(),
            "workflow_type": workflow_type,
            "entry_user_input": entry_user_input,
            "current_state": current_state,
            "active_role_session_id": None,
            "change_request_id": change_request_id,
            "impact_assessment_id": impact_assessment_id,
            "status": status,
            "route_snapshot": route_snapshot or {},
            "created_by": created_by,
            "created_at": now,
            "updated_at": now,
        }
        return self._store.save(workflow)

    def save(self, workflow: dict[str, Any]) -> dict[str, Any]:
        workflow["updated_at"] = _now_iso()
        return self._store.save(workflow)

    def get(self, workflow_id: str) -> dict[str, Any]:
        return self._store.get(workflow_id)

    def list(self, *, workflow_type: Optional[str] = None, status: Optional[str] = None) -> list[dict[str, Any]]:
        return self._store.list(workflow_type=workflow_type, status=status)


class RoleSessionStore:
    def __init__(self, project_root: str | Path):
        self._store = JSONRegistryStore(
            project_root,
            id_prefix="RS",
            id_field="role_session_id",
            registry_relative_path="state/role-sessions/role-session-registry.v1.json",
            object_dir_relative_path="state/role-sessions/by-id",
        )

    def create(
        self,
        *,
        workflow_id: str,
        role_id: str,
        stage: str,
        input_refs: list[str],
        input_summary: str,
        selected_model: dict[str, Any],
        selected_model_source: str,
        selected_model_reason: str,
        expected_outputs: list[str],
        handoff_id: Optional[str] = None,
        task_id: Optional[str] = None,
        artifact_ids: Optional[list[str]] = None,
        status: str = "queued",
        created_by: str = "host_agent",
    ) -> dict[str, Any]:
        now = _now_iso()
        role_session = {
            "role_session_id": self._store.next_id(),
            "workflow_id": workflow_id,
            "role_id": role_id,
            "stage": stage,
            "input_refs": input_refs,
            "input_summary": input_summary,
            "selected_model": selected_model,
            "selected_model_source": selected_model_source,
            "selected_model_reason": selected_model_reason,
            "expected_outputs": expected_outputs,
            "handoff_id": handoff_id,
            "task_id": task_id,
            "artifact_ids": artifact_ids or [],
            "status": status,
            "produced_handoff_packet_ids": [],
            "produced_artifact_ids": [],
            "last_execution_run_id": None,
            "created_by": created_by,
            "started_at": None,
            "ended_at": None,
            "created_at": now,
            "updated_at": now,
        }
        return self._store.save(role_session)

    def save(self, role_session: dict[str, Any]) -> dict[str, Any]:
        role_session["updated_at"] = _now_iso()
        return self._store.save(role_session)

    def get(self, role_session_id: str) -> dict[str, Any]:
        return self._store.get(role_session_id)

    def list(
        self,
        *,
        workflow_id: Optional[str] = None,
        role_id: Optional[str] = None,
        status: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        return self._store.list(workflow_id=workflow_id, role_id=role_id, status=status)


class HandoffStore:
    def __init__(self, project_root: str | Path):
        self.project_root = Path(project_root).resolve()
        self._store = JSONRegistryStore(
            self.project_root,
            id_prefix="HO",
            id_field="handoff_id",
            registry_relative_path="state/handoffs/handoff-registry.v1.json",
            object_dir_relative_path="state/handoffs/by-id",
        )

    def create(
        self,
        *,
        workflow_id: str,
        from_role: str,
        to_role: str,
        from_role_session_id: str,
        intent: str,
        input_summary: str,
        content_markdown: str,
        upstream_artifacts: list[str],
        questions_to_answer: list[str],
        acceptance_focus: list[str],
        recommended_model: Optional[dict[str, Any]],
        recommended_execution_mode: Optional[str],
        task_id: Optional[str],
        created_by: str,
        status: str = "open",
    ) -> dict[str, Any]:
        now = _now_iso()
        handoff_id = self._store.next_id()
        content_path = self._write_markdown(handoff_id, content_markdown)
        handoff = {
            "handoff_id": handoff_id,
            "workflow_id": workflow_id,
            "from_role": from_role,
            "to_role": to_role,
            "from_role_session_id": from_role_session_id,
            "intent": intent,
            "payload_type": "ROLE_HANDOFF",
            "input_summary": input_summary,
            "content_path": content_path,
            "upstream_artifacts": upstream_artifacts,
            "questions_to_answer": questions_to_answer,
            "acceptance_focus": acceptance_focus,
            "recommended_model": recommended_model,
            "recommended_execution_mode": recommended_execution_mode,
            "task_id": task_id,
            "status": status,
            "created_by": created_by,
            "accepted_by": None,
            "created_at": now,
            "updated_at": now,
        }
        return self._store.save(handoff)

    def save(self, handoff: dict[str, Any]) -> dict[str, Any]:
        handoff["updated_at"] = _now_iso()
        return self._store.save(handoff)

    def get(self, handoff_id: str) -> dict[str, Any]:
        return self._store.get(handoff_id)

    def list(
        self,
        *,
        workflow_id: Optional[str] = None,
        to_role: Optional[str] = None,
        status: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        return self._store.list(workflow_id=workflow_id, to_role=to_role, status=status)

    def read_content(self, handoff: dict[str, Any]) -> str:
        content_path = self.project_root / handoff["content_path"]
        with open(content_path, "r", encoding="utf-8") as f:
            return f.read()

    def _write_markdown(self, handoff_id: str, content_markdown: str) -> str:
        relative_path = f"artifacts/by-type/ROLE_HANDOFF/ROLE_HANDOFF--{handoff_id}--v1.0.0.md"
        target_path = self.project_root / relative_path
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_text(content_markdown.rstrip() + "\n", encoding="utf-8")
        return relative_path


class ExecutionRunStore:
    def __init__(self, project_root: str | Path):
        self._store = JSONRegistryStore(
            project_root,
            id_prefix="ER",
            id_field="execution_run_id",
            registry_relative_path="logs/execution-runs/execution-run-registry.v1.json",
            object_dir_relative_path="logs/execution-runs/by-id",
        )

    def create(
        self,
        *,
        role_session_id: str,
        workflow_id: Optional[str],
        provider: str,
        model_alias: str,
        execution_mode: str,
        request_hash: str,
        result_summary: str,
        stream_event_count: int,
        usage: Optional[dict[str, Any]],
        status: str,
        dry_run: bool,
        error: Optional[str] = None,
    ) -> dict[str, Any]:
        now = _now_iso()
        execution_run = {
            "execution_run_id": self._store.next_id(),
            "role_session_id": role_session_id,
            "workflow_id": workflow_id,
            "provider": provider,
            "model_alias": model_alias,
            "execution_mode": execution_mode,
            "request_hash": request_hash,
            "result_summary": result_summary,
            "stream_event_count": stream_event_count,
            "usage": usage,
            "status": status,
            "dry_run": dry_run,
            "error": error,
            "created_at": now,
            "updated_at": now,
        }
        return self._store.save(execution_run)

    def list(self, *, role_session_id: Optional[str] = None, status: Optional[str] = None) -> list[dict[str, Any]]:
        return self._store.list(role_session_id=role_session_id, status=status)
