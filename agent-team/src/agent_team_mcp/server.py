from __future__ import annotations

import os
from typing import TYPE_CHECKING, Any, Optional

from agent_team_core import AgentTeamProject

if TYPE_CHECKING:
    from mcp.server.fastmcp import FastMCP


def _load_fastmcp() -> Any:
    try:
        from mcp.server.fastmcp import FastMCP
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "未安装 MCP Python SDK，请先在 agent-team 目录执行 `./scripts/setup_venv.sh`。"
        ) from exc
    return FastMCP


def build_server() -> Any:
    FastMCP = _load_fastmcp()
    mcp = FastMCP("Agent Team MCP Server", json_response=True)

    def project(project_root: str) -> AgentTeamProject:
        return AgentTeamProject(project_root)

    @mcp.tool()
    def healthcheck(project_root: str) -> dict:
        """Return project health summary for an agent-team workspace."""
        return project(project_root).healthcheck()

    @mcp.tool()
    def bootstrap_project(project_root: str) -> dict:
        """Run bootstrap structure checks and return missing items."""
        return project(project_root).bootstrap_check()

    @mcp.tool()
    def route_request(project_root: str, user_input: str, actor: str = "host_agent") -> dict:
        """Route a natural-language request to the most relevant role."""
        return project(project_root).route_request(user_input=user_input, actor=actor)

    @mcp.tool()
    def list_workflows(
        project_root: str,
        workflow_type: Optional[str] = None,
        status: Optional[str] = None,
    ) -> list[dict]:
        """List persisted workflows created by orchestrated role sessions."""
        return project(project_root).list_workflows(workflow_type=workflow_type, status=status)

    @mcp.tool()
    def list_role_sessions(
        project_root: str,
        workflow_id: Optional[str] = None,
        role_id: Optional[str] = None,
        status: Optional[str] = None,
    ) -> list[dict]:
        """List role sessions for a workflow or role."""
        return project(project_root).list_role_sessions(
            workflow_id=workflow_id,
            role_id=role_id,
            status=status,
        )

    @mcp.tool()
    def list_handoffs(
        project_root: str,
        workflow_id: Optional[str] = None,
        to_role: Optional[str] = None,
        status: Optional[str] = None,
    ) -> list[dict]:
        """List role handoff packets for downstream collaboration."""
        return project(project_root).list_handoffs(
            workflow_id=workflow_id,
            to_role=to_role,
            status=status,
        )

    @mcp.tool()
    def prepare_role_session(
        project_root: str,
        user_input: str,
        actor: str = "host_agent",
        task_id: Optional[str] = None,
        artifact_ids: Optional[list[str]] = None,
    ) -> dict:
        """Create or continue a workflow, persist a role session, and return the execution payload."""
        return project(project_root).prepare_role_session(
            user_input=user_input,
            actor=actor,
            task_id=task_id,
            artifact_ids=artifact_ids,
        )

    @mcp.tool()
    def prepare_role_session_for_role(
        project_root: str,
        role_id: str,
        user_input: str,
        actor: str = "host_agent",
        task_id: Optional[str] = None,
        artifact_ids: Optional[list[str]] = None,
    ) -> dict:
        """Create a role session for an explicitly selected role while keeping router-derived mode classification."""
        return project(project_root).prepare_role_session_for_role(
            role_id=role_id,
            user_input=user_input,
            actor=actor,
            task_id=task_id,
            artifact_ids=artifact_ids,
        )

    @mcp.tool()
    def build_execution_payload(
        project_root: str,
        user_input: str,
        actor: str = "host_agent",
        task_id: Optional[str] = None,
        artifact_ids: Optional[list[str]] = None,
    ) -> dict:
        """Compile a standardized role execution payload with model selection and messages."""
        return project(project_root).build_execution_payload(
            user_input=user_input,
            actor=actor,
            task_id=task_id,
            artifact_ids=artifact_ids,
        )

    @mcp.tool()
    def build_execution_payload_for_role(
        project_root: str,
        role_id: str,
        user_input: str,
        actor: str = "host_agent",
        task_id: Optional[str] = None,
        artifact_ids: Optional[list[str]] = None,
    ) -> dict:
        """Compile a role execution payload for an explicitly selected role."""
        return project(project_root).build_execution_payload_for_role(
            role_id=role_id,
            user_input=user_input,
            actor=actor,
            task_id=task_id,
            artifact_ids=artifact_ids,
        )

    @mcp.tool()
    def create_handoff_packet(
        project_root: str,
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
        recommended_model: Optional[dict] = None,
        recommended_execution_mode: Optional[str] = None,
        task_id: Optional[str] = None,
    ) -> dict:
        """Create a persisted handoff packet from one role session to the next role."""
        return project(project_root).create_handoff_packet(
            workflow_id=workflow_id,
            from_role=from_role,
            to_role=to_role,
            from_role_session_id=from_role_session_id,
            intent=intent,
            content_markdown=content_markdown,
            actor=actor,
            input_summary=input_summary,
            upstream_artifacts=upstream_artifacts,
            questions_to_answer=questions_to_answer,
            acceptance_focus=acceptance_focus,
            recommended_model=recommended_model,
            recommended_execution_mode=recommended_execution_mode,
            task_id=task_id,
        )

    @mcp.tool()
    def accept_handoff_packet(project_root: str, handoff_id: str, actor: str = "host_agent") -> dict:
        """Accept a handoff packet before preparing the next downstream role session."""
        return project(project_root).accept_handoff_packet(handoff_id=handoff_id, actor=actor)

    @mcp.tool()
    def prepare_next_role_session(
        project_root: str,
        handoff_id: str,
        actor: str = "host_agent",
        task_id: Optional[str] = None,
        artifact_ids: Optional[list[str]] = None,
    ) -> dict:
        """Accept a handoff if needed and prepare the downstream role session from that packet."""
        return project(project_root).prepare_next_role_session(
            handoff_id=handoff_id,
            actor=actor,
            task_id=task_id,
            artifact_ids=artifact_ids,
        )

    @mcp.tool()
    def get_llm_adapter_status(project_root: str) -> dict:
        """Report configured provider adapters, runtime defaults, streaming support, and env-file loading info."""
        return project(project_root).get_llm_adapter_status()

    @mcp.tool()
    def simulate_role_execution(
        project_root: str,
        user_input: str,
        actor: str = "host_agent",
        adapter: str = "mock",
        task_id: Optional[str] = None,
        artifact_ids: Optional[list[str]] = None,
    ) -> dict:
        """Simulate role execution with a local adapter for host integration testing."""
        return project(project_root).simulate_role_execution(
            user_input=user_input,
            actor=actor,
            adapter=adapter,
            task_id=task_id,
            artifact_ids=artifact_ids,
        )

    @mcp.tool()
    def execute_prepared_payload(
        project_root: str,
        execution_payload: dict,
        adapter: Optional[str] = None,
        timeout_seconds: Optional[float] = None,
        dry_run: bool = False,
        max_retries: Optional[int] = None,
        initial_backoff_seconds: Optional[float] = None,
        max_backoff_seconds: Optional[float] = None,
        stream: bool = False,
    ) -> dict:
        """Execute an existing execution payload through a provider adapter without re-routing."""
        return project(project_root).execute_prepared_payload(
            execution_payload,
            adapter=adapter,
            timeout_seconds=timeout_seconds,
            dry_run=dry_run,
            max_retries=max_retries,
            initial_backoff_seconds=initial_backoff_seconds,
            max_backoff_seconds=max_backoff_seconds,
            stream=stream,
        )

    @mcp.tool()
    def execute_role_with_provider(
        project_root: str,
        user_input: str,
        actor: str = "host_agent",
        adapter: Optional[str] = None,
        timeout_seconds: Optional[float] = None,
        dry_run: bool = False,
        max_retries: Optional[int] = None,
        initial_backoff_seconds: Optional[float] = None,
        max_backoff_seconds: Optional[float] = None,
        stream: bool = False,
        task_id: Optional[str] = None,
        artifact_ids: Optional[list[str]] = None,
    ) -> dict:
        """Execute a role payload through a real provider adapter or return buffered streaming events."""
        return project(project_root).execute_role_with_provider(
            user_input=user_input,
            actor=actor,
            adapter=adapter,
            timeout_seconds=timeout_seconds,
            dry_run=dry_run,
            max_retries=max_retries,
            initial_backoff_seconds=initial_backoff_seconds,
            max_backoff_seconds=max_backoff_seconds,
            stream=stream,
            task_id=task_id,
            artifact_ids=artifact_ids,
        )

    @mcp.tool()
    def get_project_state(project_root: str) -> dict:
        """Get current persisted project state and transition history."""
        return project(project_root).get_project_state()

    @mcp.tool()
    def transition_state(
        project_root: str,
        to_state: str,
        triggered_by: str,
        reason: str = "",
        change_request_id: Optional[str] = None,
    ) -> dict:
        """Advance project state through the governed state machine."""
        return project(project_root).transition_state(
            to_state=to_state,
            triggered_by=triggered_by,
            reason=reason,
            change_request_id=change_request_id,
        )

    @mcp.tool()
    def rollback_state(project_root: str, to_state: str, triggered_by: str, reason: str) -> dict:
        """Rollback project state to a previous stage and persist the result."""
        return project(project_root).rollback_state(
            to_state=to_state,
            triggered_by=triggered_by,
            reason=reason,
        )

    @mcp.tool()
    def create_change_request(
        project_root: str,
        requested_by: str,
        target_artifacts: list[str],
        change_type: str,
        description: str,
        justification: str,
        priority: str = "normal",
    ) -> dict:
        """Create a governed change request before any formal modification."""
        return project(project_root).create_change_request(
            requested_by=requested_by,
            target_artifacts=target_artifacts,
            change_type=change_type,
            description=description,
            justification=justification,
            priority=priority,
        )

    @mcp.tool()
    def create_impact_assessment(
        project_root: str,
        cr_id: str,
        assessed_by: str,
        affected_roles: list[str],
        affected_artifacts: list[str],
        affected_baselines: list[str],
        risk_level: str,
        requires_retest: bool,
        rollback_plan: str,
        recommendation: str,
    ) -> dict:
        """Record an impact assessment for an existing change request."""
        return project(project_root).create_impact_assessment(
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

    @mcp.tool()
    def orchestrate_change_flow(
        project_root: str,
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
    ) -> dict:
        """Execute a governed route -> CR -> IA -> transition preparation flow."""
        return project(project_root).orchestrate_change_flow(
            user_input=user_input,
            requested_by=requested_by,
            target_artifacts=target_artifacts,
            change_type=change_type,
            justification=justification,
            priority=priority,
            assessed_by=assessed_by,
            affected_roles=affected_roles,
            affected_artifacts=affected_artifacts,
            affected_baselines=affected_baselines,
            risk_level=risk_level,
            requires_retest=requires_retest,
            rollback_plan=rollback_plan,
            recommendation=recommendation,
            transition_after_assessment=transition_after_assessment,
            task_id=task_id,
            artifact_ids=artifact_ids,
        )

    @mcp.tool()
    def list_artifacts(
        project_root: str,
        artifact_type: Optional[str] = None,
        owner_role: Optional[str] = None,
        stage: Optional[str] = None,
        status: Optional[str] = None,
    ) -> list[dict]:
        """List artifacts with optional filters."""
        return project(project_root).list_artifacts(
            artifact_type=artifact_type,
            owner_role=owner_role,
            stage=stage,
            status=status,
        )

    @mcp.tool()
    def approve_artifact(project_root: str, artifact_id: str, actor: str = "host_agent") -> dict:
        """Approve an artifact in the registry."""
        return project(project_root).approve_artifact(artifact_id, actor=actor)

    @mcp.tool()
    def freeze_baseline(
        project_root: str,
        baseline_tag: str,
        artifact_ids: list[str],
        actor: str = "host_agent",
    ) -> dict:
        """Freeze a baseline from approved artifacts and persist the baseline tag."""
        return project(project_root).freeze_baseline(
            baseline_tag=baseline_tag,
            artifact_ids=artifact_ids,
            actor=actor,
        )

    @mcp.tool()
    def list_roles(project_root: str) -> list[dict]:
        """List role profiles configured in the project."""
        return project(project_root).list_roles()

    @mcp.tool()
    def get_role_bundle(project_root: str, role_id: str) -> dict:
        """Load role profile, permissions, query playbook, and system prompt."""
        return project(project_root).get_role_bundle(role_id)

    return mcp


def main() -> None:
    server = build_server()
    transport = os.environ.get("AGENT_TEAM_MCP_TRANSPORT", "stdio")
    server.run(transport=transport)


if __name__ == "__main__":
    main()
