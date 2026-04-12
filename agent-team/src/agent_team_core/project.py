from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Callable, Optional

import yaml

from .legacy import load_legacy_runtime
from .llm_adapter import (
    MockLLMAdapter,
    RoleExecutionPayload,
    RoleExecutionPayloadCompiler,
    build_adapter,
    describe_adapter_support,
)
from .locking import FileLockManager
from .runtime_env import load_project_env
from .workbuddy_bridge import (
    resolve_artifact_type_alias,
    resolve_stage_alias,
    resolve_state_alias,
    semantic_aliases_for_artifact_type,
    semantic_aliases_for_stage,
    semantic_aliases_for_state,
)
from .workflow import ExecutionRunStore, HandoffStore, RoleSessionStore, WorkflowStore


class ProjectStateStore:
    def __init__(self, project_root: str | Path, relative_path: str = "state/project-state.v1.json"):
        self.project_root = Path(project_root).resolve()
        self.store_path = self.project_root / relative_path

    def ensure(self) -> None:
        if self.store_path.exists():
            return
        self.save(
            {
                "schema_version": "1.0",
                "current_state": "intake",
                "baseline_tag": None,
                "history": [],
            }
        )

    def load(self) -> dict[str, Any]:
        self.ensure()
        with open(self.store_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def save(self, data: dict[str, Any]) -> None:
        self.store_path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = self.store_path.with_suffix(f"{self.store_path.suffix}.tmp")
        with open(temp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        temp_path.replace(self.store_path)


class AgentTeamProject:
    def __init__(self, project_root: str | Path):
        self.project_root = Path(project_root).resolve()
        self.env_info = load_project_env(self.project_root)
        self.legacy = load_legacy_runtime(str(self.project_root))
        self.lock_manager = FileLockManager(self.project_root)
        self.state_store = ProjectStateStore(self.project_root)
        self.workflow_store = WorkflowStore(self.project_root)
        self.role_session_store = RoleSessionStore(self.project_root)
        self.handoff_store = HandoffStore(self.project_root)
        self.execution_run_store = ExecutionRunStore(self.project_root)
        self.model_config = self._read_json(self.project_root / "configs" / "global" / "model-config.v1.json")
        self.payload_compiler = RoleExecutionPayloadCompiler(self.project_root, self.model_config)

        self.router = self.legacy.router.Router(self.project_root)
        self.state_machine = self.legacy.state_machine.StateMachine(self.project_root)
        self.artifact_service = self.legacy.artifact_service.ArtifactService(self.project_root)
        self.logger = self.legacy.logger.Logger(self.project_root)

        self._hydrate_state_machine()

    def _hydrate_state_machine(self) -> None:
        stored = self.state_store.load()
        baseline_tag = stored.get("baseline_tag") or self._read_current_baseline_tag()
        self.state_machine.project_state.current_state = stored.get("current_state", "intake")
        self.state_machine.project_state.history = stored.get("history", [])
        self.state_machine.project_state.baseline_tag = baseline_tag
        if baseline_tag != stored.get("baseline_tag"):
            self._persist_state()

    def _persist_state(self) -> None:
        self.state_store.save(
            {
                "schema_version": "1.0",
                "current_state": self.state_machine.project_state.current_state,
                "baseline_tag": self.state_machine.project_state.baseline_tag,
                "history": self.state_machine.project_state.history,
            }
        )

    def _read_current_baseline_tag(self) -> Optional[str]:
        baseline_path = self.project_root / "configs" / "baselines" / "baseline.current.v1.json"
        if not baseline_path.exists():
            return None
        with open(baseline_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("baseline_tag")

    def _resolve_role_dir(self, role_id: str) -> Path:
        roles_dir = self.project_root / "roles"
        candidates = {role_id, role_id.replace("_", "-")}

        for role_dir in sorted(roles_dir.iterdir()):
            if not role_dir.is_dir():
                continue
            if role_dir.name in candidates:
                return role_dir
            profile_path = role_dir / "role.profile.json"
            if profile_path.exists():
                with open(profile_path, "r", encoding="utf-8") as f:
                    profile = json.load(f)
                if profile.get("role_id") == role_id:
                    return role_dir

        raise KeyError(f"Unknown role_id: {role_id}")

    def _read_json(self, path: Path) -> dict[str, Any]:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    def _read_yaml(self, path: Path) -> dict[str, Any]:
        with open(path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f)

    def _known_state_names(self) -> list[str]:
        states = {str(item) for item in getattr(self.state_machine, "states", []) if str(item).strip()}
        transitions = getattr(self.state_machine, "transitions", {}) or {}
        states.update(str(item) for item in transitions.keys() if str(item).strip())
        for targets in transitions.values():
            states.update(str(item) for item in (targets or []) if str(item).strip())
        current_state = getattr(self.state_machine.project_state, "current_state", None)
        if current_state:
            states.add(str(current_state))
        return sorted(states)

    def _known_artifact_types(self) -> list[str]:
        artifact_types = {
            str(item.artifact_type)
            for item in self.artifact_service.artifacts
            if getattr(item, "artifact_type", None)
        }
        if not artifact_types:
            for role in self.list_roles():
                artifact_types.update(str(item) for item in role.get("owned_artifacts", []) if str(item).strip())
        return sorted(artifact_types)

    def _known_artifact_stages(self) -> list[str]:
        stages = {
            str(item.stage)
            for item in self.artifact_service.artifacts
            if getattr(item, "stage", None)
        }
        stages.update(self._known_state_names())
        return sorted(stages)

    def _workflow_type_from_route(self, route: dict[str, Any]) -> str:
        if route.get("mode") == "readonly":
            return "readonly_query"
        return "formal_change"

    @staticmethod
    def _dedupe_strings(values: Optional[list[str]]) -> list[str]:
        if not values:
            return []
        result: list[str] = []
        for value in values:
            normalized = str(value).strip()
            if normalized and normalized not in result:
                result.append(normalized)
        return result

    def _build_selection_context(
        self,
        *,
        task_id: Optional[str] = None,
        artifact_ids: Optional[list[str]] = None,
        handoff: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        merged_artifacts: list[str] = list(artifact_ids or [])
        if handoff:
            merged_artifacts.extend(handoff.get("upstream_artifacts") or [])
        resolved_task_id = task_id or (handoff or {}).get("task_id")
        return {
            "task_id": str(resolved_task_id).strip() if resolved_task_id else None,
            "artifact_ids": self._dedupe_strings(merged_artifacts),
        }

    def _infer_expected_outputs(
        self,
        *,
        route: dict[str, Any],
        role_bundle: dict[str, Any],
        handoff: Optional[dict[str, Any]] = None,
    ) -> list[str]:
        owned_artifacts = role_bundle["profile"].get("owned_artifacts", [])
        expected: list[str] = []
        if route.get("mode") == "readonly":
            expected.append("role_response")
        if handoff:
            expected.append("handoff_resolution")
        expected.extend(owned_artifacts[:3])
        return list(dict.fromkeys(expected)) or ["role_output"]

    def _build_handoff_user_input(self, workflow: dict[str, Any], handoff: dict[str, Any]) -> str:
        handoff_markdown = self.handoff_store.read_content(handoff)
        questions = handoff.get("questions_to_answer", [])
        acceptance_focus = handoff.get("acceptance_focus", [])
        questions_block = "\n".join(f"- {item}" for item in questions) if questions else "- 无"
        acceptance_block = "\n".join(f"- {item}" for item in acceptance_focus) if acceptance_focus else "- 无"
        upstream_artifacts = handoff.get("upstream_artifacts") or []
        upstream_block = ", ".join(upstream_artifacts) if upstream_artifacts else "无"
        return (
            f"请接收来自角色 {handoff['from_role']} 的 handoff。\n"
            f"- workflow_id: {workflow['workflow_id']}\n"
            f"- handoff_id: {handoff['handoff_id']}\n"
            f"- handoff_intent: {handoff['intent']}\n"
            f"- task_id: {handoff.get('task_id') or '无'}\n"
            f"- upstream_artifacts: {upstream_block}\n"
            f"- 输入摘要: {handoff.get('input_summary', '')}\n\n"
            "## 待回答问题\n"
            f"{questions_block}\n\n"
            "## 验收关注点\n"
            f"{acceptance_block}\n\n"
            "## 上游交接正文\n"
            f"{handoff_markdown}"
        )

    def _route_for_handoff(self, workflow: dict[str, Any], handoff: dict[str, Any]) -> dict[str, Any]:
        workflow_type = workflow.get("workflow_type")
        return {
            "intent": "readonly_query" if workflow_type == "readonly_query" else "formal_change",
            "target_role": handoff["to_role"],
            "mode": "readonly" if workflow_type == "readonly_query" else "change",
            "matched_keywords": ["handoff", handoff.get("intent", "")],
            "message": f"根据 handoff {handoff['handoff_id']} 派发给 {handoff['to_role']}。",
        }

    def _build_route_dict(self, route_result: Any) -> dict[str, Any]:
        return {
            "intent": route_result.intent.value,
            "target_role": route_result.target_role,
            "mode": route_result.mode,
            "matched_keywords": route_result.matched_keywords,
            "message": route_result.message,
        }

    def _route_for_explicit_role(self, user_input: str, *, role_id: str, actor: str) -> dict[str, Any]:
        routed = self.router.route(user_input)
        route = self._build_route_dict(routed)
        original_target_role = route["target_role"]
        route["target_role"] = role_id
        route["selected_role"] = role_id
        route["router_target_role"] = original_target_role
        route["route_source"] = "explicit_role"
        if original_target_role == role_id:
            route["message"] = f"显式使用角色 {role_id}，与 Router 推荐一致。"
        else:
            route["message"] = (
                f"显式使用角色 {role_id}，覆盖 Router 推荐角色 {original_target_role}，"
                f"但保留其判定的模式 {route['mode']}。"
            )
        if route["mode"] == "readonly":
            with self.lock_manager.acquire_many("audit"):
                self.logger.log_query(actor, role_id, f"显式角色只读查询: {user_input[:80]}")
        return route

    def _compile_execution_payload_object(
        self,
        *,
        user_input: str,
        actor: str,
        route: dict[str, Any],
        project_state: dict[str, Any],
        role_bundle: dict[str, Any],
        workflow: Optional[dict[str, Any]] = None,
        handoff: Optional[dict[str, Any]] = None,
        selection_context: Optional[dict[str, Any]] = None,
    ) -> RoleExecutionPayload:
        return self.payload_compiler.compile(
            user_input=user_input,
            route=route,
            project_state=project_state,
            role_bundle=role_bundle,
            actor=actor,
            workflow=workflow,
            handoff=handoff,
            selection_context=selection_context,
        )

    def _prepare_session_bundle(
        self,
        *,
        user_input: str,
        actor: str,
        route: dict[str, Any],
        project_state: dict[str, Any],
        role_bundle: dict[str, Any],
        workflow: Optional[dict[str, Any]] = None,
        handoff: Optional[dict[str, Any]] = None,
        task_id: Optional[str] = None,
        artifact_ids: Optional[list[str]] = None,
        change_request_id: Optional[str] = None,
        impact_assessment_id: Optional[str] = None,
    ) -> dict[str, Any]:
        expected_outputs = self._infer_expected_outputs(route=route, role_bundle=role_bundle, handoff=handoff)
        selection_context = self._build_selection_context(task_id=task_id, artifact_ids=artifact_ids, handoff=handoff)
        with self.lock_manager.acquire_many("workflows", "audit"):
            if workflow is None:
                workflow = self.workflow_store.create(
                    workflow_type=self._workflow_type_from_route(route),
                    entry_user_input=user_input,
                    current_state=project_state.get("current_state", "unknown"),
                    created_by=actor,
                    route_snapshot=route,
                    change_request_id=change_request_id,
                    impact_assessment_id=impact_assessment_id,
                )
                self.logger.log_event(
                    "workflow_started",
                    actor,
                    workflow["workflow_id"],
                    f"创建 workflow，目标角色 {route['target_role']}",
                    detail={
                        "workflow_type": workflow["workflow_type"],
                        "route": route,
                    },
                )
        compiled_payload = self._compile_execution_payload_object(
            user_input=user_input,
            actor=actor,
            route=route,
            project_state=project_state,
            role_bundle=role_bundle,
            workflow=workflow,
            handoff=handoff,
            selection_context=selection_context,
        )
        input_refs = []
        if handoff:
            input_refs.append(handoff["handoff_id"])
        input_refs.extend(selection_context["artifact_ids"])
        input_refs = self._dedupe_strings(input_refs)
        input_summary = (handoff or {}).get("input_summary") or user_input[:240]

        with self.lock_manager.acquire_many("workflows", "role-sessions", "audit"):
            role_session = self.role_session_store.create(
                workflow_id=workflow["workflow_id"],
                role_id=role_bundle["role_id"],
                stage=project_state.get("current_state", "unknown"),
                input_refs=input_refs,
                input_summary=input_summary,
                selected_model=compiled_payload.model.to_dict(),
                selected_model_source=compiled_payload.metadata.get("selected_model_source", compiled_payload.model.source),
                selected_model_reason=compiled_payload.metadata.get("selected_model_reason", ""),
                expected_outputs=expected_outputs,
                handoff_id=(handoff or {}).get("handoff_id"),
                task_id=selection_context.get("task_id"),
                artifact_ids=selection_context["artifact_ids"],
                created_by=actor,
            )
            workflow["active_role_session_id"] = role_session["role_session_id"]
            workflow["current_state"] = project_state.get("current_state", workflow.get("current_state"))
            self.workflow_store.save(workflow)
            self.logger.log_event(
                "role_session_created",
                actor,
                role_session["role_session_id"],
                f"创建 role_session，角色 {role_bundle['role_id']}",
                detail={
                    "workflow_id": workflow["workflow_id"],
                    "handoff_id": (handoff or {}).get("handoff_id"),
                },
            )

        compiled_payload.metadata.update(
            {
                "workflow_id": workflow["workflow_id"],
                "role_session_id": role_session["role_session_id"],
                "expected_outputs": expected_outputs,
            }
        )
        if selection_context.get("task_id"):
            compiled_payload.metadata["task_id"] = selection_context["task_id"]
        if selection_context["artifact_ids"]:
            compiled_payload.metadata["artifact_ids"] = selection_context["artifact_ids"]
        if handoff:
            compiled_payload.metadata["handoff_id"] = handoff["handoff_id"]

        return {
            "workflow": workflow,
            "role_session": role_session,
            "execution_payload": compiled_payload.to_dict(),
            "expected_outputs": expected_outputs,
        }

    def _set_role_session_status(
        self,
        role_session_id: str,
        *,
        status: str,
        last_execution_run_id: Optional[str] = None,
        ended: bool = False,
    ) -> dict[str, Any]:
        with self.lock_manager.acquire_many("role-sessions"):
            role_session = self.role_session_store.get(role_session_id)
            role_session["status"] = status
            if role_session.get("started_at") is None and status in {"running", "completed", "blocked"}:
                role_session["started_at"] = role_session.get("started_at") or role_session.get("created_at")
            if ended:
                role_session["ended_at"] = role_session.get("ended_at") or role_session.get("updated_at") or role_session.get("created_at")
            if last_execution_run_id:
                role_session["last_execution_run_id"] = last_execution_run_id
            return self.role_session_store.save(role_session)

    def _append_role_session_handoff(self, role_session_id: str, handoff_id: str) -> dict[str, Any]:
        role_session = self.role_session_store.get(role_session_id)
        produced = role_session.get("produced_handoff_packet_ids", [])
        if handoff_id not in produced:
            produced.append(handoff_id)
        role_session["produced_handoff_packet_ids"] = produced
        return self.role_session_store.save(role_session)

    def _build_request_hash(self, execution_payload: dict[str, Any]) -> str:
        digest_input = json.dumps(execution_payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
        return hashlib.sha256(digest_input).hexdigest()[:16]

    def _record_execution_run(
        self,
        *,
        compiled_payload: RoleExecutionPayload,
        execution_payload: dict[str, Any],
        result: dict[str, Any],
    ) -> Optional[dict[str, Any]]:
        role_session_id = compiled_payload.metadata.get("role_session_id")
        if not role_session_id:
            return None
        workflow_id = compiled_payload.metadata.get("workflow_id")
        response_text = str(result.get("response_text") or result.get("simulated_response") or "")
        provider = str(result.get("provider") or compiled_payload.model.provider_family)
        summary = response_text.strip()[:240]
        status = "succeeded" if not result.get("error") else "failed"
        with self.lock_manager.acquire_many("execution-runs", "role-sessions", "audit"):
            execution_run = self.execution_run_store.create(
                role_session_id=role_session_id,
                workflow_id=workflow_id,
                provider=provider,
                model_alias=compiled_payload.model.model_alias,
                execution_mode=compiled_payload.model.execution_mode,
                request_hash=self._build_request_hash(execution_payload),
                result_summary=summary,
                stream_event_count=len(result.get("events", [])),
                usage=result.get("usage"),
                status=status,
                dry_run=bool(result.get("dry_run", False)),
                error=result.get("error"),
            )
            role_session = self.role_session_store.get(role_session_id)
            role_session["status"] = "completed" if status == "succeeded" else "blocked"
            role_session["last_execution_run_id"] = execution_run["execution_run_id"]
            role_session["started_at"] = role_session.get("started_at") or role_session.get("created_at")
            role_session["ended_at"] = execution_run["created_at"]
            self.role_session_store.save(role_session)
            self.logger.log_event(
                "execution_run_recorded",
                compiled_payload.metadata.get("actor", "host_agent"),
                execution_run["execution_run_id"],
                f"记录 execution_run，角色 {compiled_payload.role_id}",
                detail={
                    "workflow_id": workflow_id,
                    "role_session_id": role_session_id,
                    "provider": provider,
                    "model_alias": compiled_payload.model.model_alias,
                },
            )
        return execution_run

    def healthcheck(self) -> dict[str, Any]:
        return {
            "project_root": str(self.project_root),
            "roles_count": len(self.router.roles),
            "artifacts_count": len(self.artifact_service.artifacts),
            "workflows_count": len(self.workflow_store.list()),
            "role_sessions_count": len(self.role_session_store.list()),
            "handoffs_count": len(self.handoff_store.list()),
            "current_state": self.state_machine.project_state.current_state,
            "baseline_tag": self.state_machine.project_state.baseline_tag,
            "state_store": str(self.state_store.store_path),
            "locks_dir": str(self.lock_manager.locks_dir),
            "default_execution_mode": self.model_config.get("global", {}).get("execution_mode", "single"),
            "env_file": self.env_info,
        }

    def bootstrap_check(self) -> dict[str, Any]:
        passed, missing = self.legacy.bootstrap.check_structure(self.project_root)
        return {
            "project_root": str(self.project_root),
            "passed_count": len(passed),
            "missing_count": len(missing),
            "passed": passed,
            "missing": missing,
        }

    def route_request(self, user_input: str, actor: str = "host_agent") -> dict[str, Any]:
        result = self.router.route(user_input)
        if result.mode == "readonly":
            with self.lock_manager.acquire_many("audit"):
                self.logger.log_query(actor, result.target_role, f"只读查询: {user_input[:80]}")
        return self._build_route_dict(result)

    def list_workflows(
        self,
        workflow_type: Optional[str] = None,
        status: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        return self.workflow_store.list(workflow_type=workflow_type, status=status)

    def list_role_sessions(
        self,
        workflow_id: Optional[str] = None,
        role_id: Optional[str] = None,
        status: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        return self.role_session_store.list(workflow_id=workflow_id, role_id=role_id, status=status)

    def list_handoffs(
        self,
        workflow_id: Optional[str] = None,
        to_role: Optional[str] = None,
        status: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        return self.handoff_store.list(workflow_id=workflow_id, to_role=to_role, status=status)

    def prepare_role_session(
        self,
        user_input: str,
        actor: str = "host_agent",
        task_id: Optional[str] = None,
        artifact_ids: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        route = self.route_request(user_input=user_input, actor=actor)
        project_state = self.get_project_state()
        role_bundle = self.get_role_bundle(route["target_role"])
        bundle = self._prepare_session_bundle(
            user_input=user_input,
            actor=actor,
            route=route,
            project_state=project_state,
            role_bundle=role_bundle,
            task_id=task_id,
            artifact_ids=artifact_ids,
        )
        return {
            "route": route,
            "project_state": project_state,
            "role_bundle": role_bundle,
            **bundle,
        }

    def prepare_role_session_for_role(
        self,
        role_id: str,
        user_input: str,
        actor: str = "host_agent",
        task_id: Optional[str] = None,
        artifact_ids: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        route = self._route_for_explicit_role(user_input, role_id=role_id, actor=actor)
        project_state = self.get_project_state()
        role_bundle = self.get_role_bundle(role_id)
        bundle = self._prepare_session_bundle(
            user_input=user_input,
            actor=actor,
            route=route,
            project_state=project_state,
            role_bundle=role_bundle,
            task_id=task_id,
            artifact_ids=artifact_ids,
        )
        return {
            "route": route,
            "project_state": project_state,
            "role_bundle": role_bundle,
            **bundle,
        }

    def build_execution_payload(
        self,
        user_input: str,
        actor: str = "host_agent",
        task_id: Optional[str] = None,
        artifact_ids: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        return self.prepare_role_session(
            user_input=user_input,
            actor=actor,
            task_id=task_id,
            artifact_ids=artifact_ids,
        )["execution_payload"]

    def build_execution_payload_for_role(
        self,
        role_id: str,
        user_input: str,
        actor: str = "host_agent",
        task_id: Optional[str] = None,
        artifact_ids: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        return self.prepare_role_session_for_role(
            role_id=role_id,
            user_input=user_input,
            actor=actor,
            task_id=task_id,
            artifact_ids=artifact_ids,
        )["execution_payload"]

    def get_llm_adapter_status(self) -> dict[str, Any]:
        return {
            **describe_adapter_support(),
            "project_root": str(self.project_root),
            "env_file": self.env_info,
        }

    def simulate_role_execution(
        self,
        user_input: str,
        actor: str = "host_agent",
        adapter: str = "mock",
        task_id: Optional[str] = None,
        artifact_ids: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        session = self.prepare_role_session(
            user_input=user_input,
            actor=actor,
            task_id=task_id,
            artifact_ids=artifact_ids,
        )
        if adapter not in {"mock", "codebuddy"}:
            raise ValueError(f"Unsupported adapter: {adapter}")

        compiled_payload = RoleExecutionPayload.from_dict(session["execution_payload"])
        result = (
            MockLLMAdapter().execute(compiled_payload)
            if adapter == "mock"
            else build_adapter(payload=compiled_payload, adapter_name=adapter).execute(compiled_payload)
        )
        return {
            "workflow": session["workflow"],
            "role_session": session["role_session"],
            "payload": session["execution_payload"],
            "result": result,
        }

    def execute_prepared_payload(
        self,
        execution_payload: dict[str, Any],
        *,
        adapter: Optional[str] = None,
        timeout_seconds: Optional[float] = None,
        dry_run: bool = False,
        max_retries: Optional[int] = None,
        initial_backoff_seconds: Optional[float] = None,
        max_backoff_seconds: Optional[float] = None,
        stream: bool = False,
        event_handler: Optional[Callable[[dict[str, Any]], None]] = None,
    ) -> dict[str, Any]:
        compiled_payload = RoleExecutionPayload.from_dict(execution_payload)
        role_session_id = compiled_payload.metadata.get("role_session_id")
        if role_session_id:
            self._set_role_session_status(role_session_id, status="running")

        llm_adapter = build_adapter(
            payload=compiled_payload,
            adapter_name=adapter,
            timeout_seconds=timeout_seconds,
            dry_run=dry_run,
            max_retries=max_retries,
            initial_backoff_seconds=initial_backoff_seconds,
            max_backoff_seconds=max_backoff_seconds,
        )
        result = (
            llm_adapter.execute_stream(compiled_payload, on_event=event_handler)
            if stream
            else llm_adapter.execute(compiled_payload)
        )
        execution_run = self._record_execution_run(
            compiled_payload=compiled_payload,
            execution_payload=execution_payload,
            result=result,
        )
        payload = {
            "payload": execution_payload,
            "result": result,
        }
        if execution_run is not None:
            payload["execution_run"] = execution_run
        return payload

    def execute_role_with_provider(
        self,
        user_input: str,
        actor: str = "host_agent",
        adapter: Optional[str] = None,
        timeout_seconds: Optional[float] = None,
        dry_run: bool = False,
        max_retries: Optional[int] = None,
        initial_backoff_seconds: Optional[float] = None,
        max_backoff_seconds: Optional[float] = None,
        stream: bool = False,
        event_handler: Optional[Callable[[dict[str, Any]], None]] = None,
        task_id: Optional[str] = None,
        artifact_ids: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        session = self.prepare_role_session(
            user_input=user_input,
            actor=actor,
            task_id=task_id,
            artifact_ids=artifact_ids,
        )
        execution = self.execute_prepared_payload(
            session["execution_payload"],
            adapter=adapter,
            timeout_seconds=timeout_seconds,
            dry_run=dry_run,
            max_retries=max_retries,
            initial_backoff_seconds=initial_backoff_seconds,
            max_backoff_seconds=max_backoff_seconds,
            stream=stream,
            event_handler=event_handler,
        )
        return {
            **session,
            **execution,
        }

    def get_project_state(self) -> dict[str, Any]:
        state = self.state_machine.query_state()
        state["history"] = self.state_machine.project_state.history
        semantic_aliases: dict[str, Any] = {}
        current_state_aliases = semantic_aliases_for_state(state.get("current_state"))
        if current_state_aliases:
            semantic_aliases["current_state"] = current_state_aliases
        transition_aliases = {
            item: semantic_aliases_for_state(item)
            for item in state.get("available_transitions", [])
            if semantic_aliases_for_state(item)
        }
        if transition_aliases:
            semantic_aliases["available_transitions"] = transition_aliases
        if semantic_aliases:
            state["semantic_aliases"] = semantic_aliases
        return state

    def transition_state(
        self,
        to_state: str,
        triggered_by: str,
        reason: str = "",
        change_request_id: Optional[str] = None,
    ) -> dict[str, Any]:
        known_states = self._known_state_names()
        requested_from_state = self.state_machine.project_state.current_state
        resolved_from_state = resolve_state_alias(requested_from_state, known_states) or requested_from_state
        resolved_to_state = resolve_state_alias(to_state, known_states) or to_state
        request = self.legacy.state_machine.TransitionRequest(
            from_state=resolved_from_state,
            to_state=resolved_to_state,
            triggered_by=triggered_by,
            reason=reason,
            change_request_id=change_request_id,
        )
        result = self.state_machine.transition(request)
        payload = {
            "verdict": result.verdict.value,
            "from_state": result.from_state,
            "to_state": result.to_state,
            "message": result.message,
            "timestamp": result.timestamp,
        }
        if requested_from_state != resolved_from_state or to_state != resolved_to_state:
            payload["semantic_mapping"] = {
                "requested_from_state": requested_from_state,
                "resolved_from_state": resolved_from_state,
                "requested_to_state": to_state,
                "resolved_to_state": resolved_to_state,
            }
        if result.verdict.value == "allowed":
            with self.lock_manager.acquire_many("state", "audit"):
                self._persist_state()
                self.logger.log_state_transition(triggered_by, result.from_state, result.to_state)
        return payload

    def rollback_state(self, to_state: str, triggered_by: str, reason: str) -> dict[str, Any]:
        known_states = self._known_state_names()
        resolved_to_state = resolve_state_alias(to_state, known_states) or to_state
        result = self.state_machine.rollback(to_state=resolved_to_state, triggered_by=triggered_by, reason=reason)
        payload = {
            "verdict": result.verdict.value,
            "from_state": result.from_state,
            "to_state": result.to_state,
            "message": result.message,
            "timestamp": result.timestamp,
        }
        if to_state != resolved_to_state:
            payload["semantic_mapping"] = {
                "requested_to_state": to_state,
                "resolved_to_state": resolved_to_state,
            }
        if result.verdict.value == "allowed":
            with self.lock_manager.acquire_many("state", "audit"):
                self._persist_state()
                self.logger.log_state_transition(triggered_by, result.from_state, result.to_state)
        return payload

    def create_change_request(
        self,
        requested_by: str,
        target_artifacts: list[str],
        change_type: str,
        description: str,
        justification: str,
        priority: str = "normal",
    ) -> dict[str, Any]:
        with self.lock_manager.acquire_many("change-requests", "audit"):
            cr = self.logger.create_change_request(
                requested_by=requested_by,
                target_artifacts=target_artifacts,
                change_type=change_type,
                description=description,
                justification=justification,
                priority=priority,
            )
        return cr.__dict__

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
    ) -> dict[str, Any]:
        with self.lock_manager.acquire_many("impact-assessments", "audit"):
            ia = self.logger.create_impact_assessment(
                cr_id=cr_id,
                assessed_by=assessed_by,
                affected_roles=affected_roles,
                affected_artifacts=affected_artifacts,
                affected_baselines=affected_baselines,
                risk_level=risk_level,
                requires_retest=requires_retest,
                rollback_plan=rollback_plan,
                recommendation=recommendation,
            )
        return ia.__dict__

    def orchestrate_change_flow(
        self,
        user_input: str,
        requested_by: str,
        target_artifacts: list[str],
        change_type: str,
        justification: str,
        priority: str = "normal",
        assessed_by: str = "project_manager_orchestrator",
        affected_roles: Optional[list[str]] = None,
        affected_artifacts: Optional[list[str]] = None,
        affected_baselines: Optional[list[str]] = None,
        risk_level: str = "medium",
        requires_retest: bool = True,
        rollback_plan: str = "待补充回退方案",
        recommendation: str = "proceed_with_caution",
        transition_after_assessment: Optional[str] = None,
        task_id: Optional[str] = None,
        artifact_ids: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        route = self.route_request(user_input=user_input, actor=requested_by)
        cr = self.create_change_request(
            requested_by=requested_by,
            target_artifacts=target_artifacts,
            change_type=change_type,
            description=user_input,
            justification=justification,
            priority=priority,
        )
        transitions = [
            self.transition_state(
                to_state="change_request_received",
                triggered_by=assessed_by,
                reason=f"收到变更请求 {cr['cr_id']}",
                change_request_id=cr["cr_id"],
            )
        ]
        ia = self.create_impact_assessment(
            cr_id=cr["cr_id"],
            assessed_by=assessed_by,
            affected_roles=affected_roles or [route["target_role"]],
            affected_artifacts=affected_artifacts or list(target_artifacts),
            affected_baselines=affected_baselines or [],
            risk_level=risk_level,
            requires_retest=requires_retest,
            rollback_plan=rollback_plan,
            recommendation=recommendation,
        )
        transitions.append(
            self.transition_state(
                to_state="impact_assessment",
                triggered_by=assessed_by,
                reason=f"开始影响评估 {ia['ia_id']}",
            )
        )
        if transition_after_assessment:
            transitions.append(
                self.transition_state(
                    to_state=transition_after_assessment,
                    triggered_by=assessed_by,
                    reason=f"影响评估完成，推进到 {transition_after_assessment}",
                )
            )

        project_state = self.get_project_state()
        role_bundle = self.get_role_bundle(route["target_role"])
        bundle = self._prepare_session_bundle(
            user_input=user_input,
            actor=requested_by,
            route=route,
            project_state=project_state,
            role_bundle=role_bundle,
            task_id=task_id,
            artifact_ids=self._dedupe_strings(list(artifact_ids or []) + list(target_artifacts)),
            change_request_id=cr["cr_id"],
            impact_assessment_id=ia["ia_id"],
        )
        return {
            "route": route,
            "change_request": cr,
            "impact_assessment": ia,
            "transitions": transitions,
            "project_state": project_state,
            "role_bundle": role_bundle,
            **bundle,
        }

    def create_handoff_packet(
        self,
        workflow_id: str,
        from_role: str,
        to_role: str,
        from_role_session_id: str,
        intent: str,
        content_markdown: str,
        actor: str = "host_agent",
        input_summary: Optional[str] = None,
        upstream_artifacts: Optional[list[str]] = None,
        questions_to_answer: Optional[list[str]] = None,
        acceptance_focus: Optional[list[str]] = None,
        recommended_model: Optional[dict[str, Any]] = None,
        recommended_execution_mode: Optional[str] = None,
        task_id: Optional[str] = None,
    ) -> dict[str, Any]:
        workflow = self.workflow_store.get(workflow_id)
        role_session = self.role_session_store.get(from_role_session_id)
        if role_session["workflow_id"] != workflow_id:
            raise ValueError("role_session 与 workflow 不匹配")
        if role_session["role_id"] != from_role:
            raise ValueError("from_role 与 role_session 不匹配")

        target_role_bundle = self.get_role_bundle(to_role)
        target_profile = target_role_bundle["profile"]
        resolved_model = recommended_model or target_profile.get("default_model")
        resolved_mode = recommended_execution_mode or target_profile.get(
            "execution_mode",
            self.model_config.get("global", {}).get("execution_mode", "single"),
        )
        resolved_task_id = task_id or role_session.get("task_id")
        resolved_upstream_artifacts = self._dedupe_strings(
            list(role_session.get("artifact_ids") or []) + list(upstream_artifacts or [])
        )
        summary = input_summary or content_markdown.strip().replace("\n", " ")[:240]

        markdown = (
            f"# Role Handoff {from_role_session_id} → {to_role}\n\n"
            f"- workflow_id: `{workflow_id}`\n"
            f"- from_role: `{from_role}`\n"
            f"- to_role: `{to_role}`\n"
            f"- intent: `{intent}`\n\n"
            f"## Summary\n\n{summary}\n\n"
            f"## Content\n\n{content_markdown.strip()}\n"
        )
        with self.lock_manager.acquire_many("handoffs", "role-sessions", "audit"):
            handoff = self.handoff_store.create(
                workflow_id=workflow_id,
                from_role=from_role,
                to_role=to_role,
                from_role_session_id=from_role_session_id,
                intent=intent,
                input_summary=summary,
                content_markdown=markdown,
                upstream_artifacts=resolved_upstream_artifacts,
                questions_to_answer=questions_to_answer or [],
                acceptance_focus=acceptance_focus or [],
                recommended_model=resolved_model,
                recommended_execution_mode=resolved_mode,
                task_id=resolved_task_id,
                created_by=actor,
            )
            self._append_role_session_handoff(from_role_session_id, handoff["handoff_id"])
            self.logger.log_event(
                "handoff_created",
                actor,
                handoff["handoff_id"],
                f"创建 handoff: {from_role} -> {to_role}",
                detail={
                    "workflow_id": workflow_id,
                    "from_role_session_id": from_role_session_id,
                },
            )
        return handoff

    def accept_handoff_packet(self, handoff_id: str, actor: str = "host_agent") -> dict[str, Any]:
        with self.lock_manager.acquire_many("handoffs", "audit"):
            handoff = self.handoff_store.get(handoff_id)
            handoff["status"] = "accepted"
            handoff["accepted_by"] = actor
            updated = self.handoff_store.save(handoff)
            self.logger.log_event(
                "handoff_accepted",
                actor,
                handoff_id,
                f"接受 handoff {handoff_id}",
                detail={
                    "workflow_id": handoff["workflow_id"],
                    "to_role": handoff["to_role"],
                },
            )
        return updated

    def prepare_next_role_session(
        self,
        handoff_id: str,
        actor: str = "host_agent",
        task_id: Optional[str] = None,
        artifact_ids: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        handoff = self.handoff_store.get(handoff_id)
        if handoff["status"] != "accepted":
            handoff = self.accept_handoff_packet(handoff_id, actor=actor)
        workflow = self.workflow_store.get(handoff["workflow_id"])
        project_state = self.get_project_state()
        route = self._route_for_handoff(workflow, handoff)
        role_bundle = self.get_role_bundle(handoff["to_role"])
        user_input = self._build_handoff_user_input(workflow, handoff)
        bundle = self._prepare_session_bundle(
            user_input=user_input,
            actor=actor,
            route=route,
            project_state=project_state,
            role_bundle=role_bundle,
            workflow=workflow,
            handoff=handoff,
            task_id=task_id or handoff.get("task_id"),
            artifact_ids=self._dedupe_strings(list(artifact_ids or []) + list(handoff.get("upstream_artifacts") or [])),
            change_request_id=workflow.get("change_request_id"),
            impact_assessment_id=workflow.get("impact_assessment_id"),
        )
        return {
            "route": route,
            "handoff": handoff,
            "project_state": project_state,
            "role_bundle": role_bundle,
            **bundle,
        }

    def list_artifacts(
        self,
        artifact_type: Optional[str] = None,
        owner_role: Optional[str] = None,
        stage: Optional[str] = None,
        status: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        resolved_artifact_type = resolve_artifact_type_alias(artifact_type, self._known_artifact_types())
        resolved_stage = resolve_stage_alias(stage, self._known_artifact_stages())
        artifacts = self.artifact_service.query(
            artifact_type=resolved_artifact_type,
            owner_role=owner_role,
            stage=resolved_stage,
            status=status,
        )
        payload: list[dict[str, Any]] = []
        for artifact in artifacts:
            item = artifact.to_dict()
            artifact_aliases = semantic_aliases_for_artifact_type(item.get("artifact_type"))
            stage_aliases = semantic_aliases_for_stage(item.get("stage"))
            if artifact_aliases:
                item["semantic_artifact_type_aliases"] = artifact_aliases
            if stage_aliases:
                item["semantic_stage_aliases"] = stage_aliases
            payload.append(item)
        return payload

    def approve_artifact(self, artifact_id: str, actor: str = "host_agent") -> dict[str, Any]:
        with self.lock_manager.acquire_many("registry", "audit"):
            artifact = self.artifact_service.approve(artifact_id)
            self.logger.log_approval(actor, artifact_id, f"批准产物 {artifact_id}")
        return artifact.to_dict()

    def freeze_baseline(self, baseline_tag: str, artifact_ids: list[str], actor: str = "host_agent") -> dict[str, Any]:
        with self.lock_manager.acquire_many("registry", "baselines", "state", "audit"):
            baseline = self.artifact_service.freeze_baseline(baseline_tag, artifact_ids)
            self.state_machine.project_state.baseline_tag = baseline_tag
            self._persist_state()
            self.logger.log_baseline_freeze(actor, baseline_tag, baseline["artifacts"])
        return baseline

    def list_roles(self) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = []
        for role_dir in sorted((self.project_root / "roles").iterdir()):
            if not role_dir.is_dir():
                continue
            profile_path = role_dir / "role.profile.json"
            if not profile_path.exists():
                continue
            result.append(self._read_json(profile_path))
        return result

    def get_role_bundle(self, role_id: str) -> dict[str, Any]:
        role_dir = self._resolve_role_dir(role_id)
        profile = self._read_json(role_dir / "role.profile.json")
        permissions = self._read_yaml(role_dir / "permissions.yaml")
        query_playbook = self._read_yaml(role_dir / "query-playbook.yaml")
        with open(role_dir / "prompt.system.md", "r", encoding="utf-8") as f:
            prompt_system = f.read()

        return {
            "role_id": profile.get("role_id", role_id),
            "role_folder": role_dir.name,
            "profile": profile,
            "permissions": permissions,
            "query_playbook": query_playbook,
            "prompt_system": prompt_system,
        }
