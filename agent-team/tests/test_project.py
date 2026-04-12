from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from agent_team_core import AgentTeamProject, initialize_project_from_template, record_master_preference, sync_project_master_preferences


class AgentTeamProjectSmokeTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tempdir = tempfile.TemporaryDirectory()
        self.source_root = Path(__file__).resolve().parents[1]
        workspace_root = Path(self._tempdir.name) / "fixture-workspace"
        result = initialize_project_from_template(
            template_root=self.source_root,
            workspace_root=workspace_root,
            project_dir_name="agent-team-fixture",
            install_venv=False,
        )
        self.fixture_root = Path(result["project_root"])

    def tearDown(self) -> None:
        self._tempdir.cleanup()

    def _update_model_config(self, mutate) -> None:
        config_path = self.fixture_root / "configs" / "global" / "model-config.v1.json"
        data = json.loads(config_path.read_text(encoding="utf-8"))
        mutate(data)
        config_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    def test_healthcheck_and_readonly_route(self) -> None:
        project = AgentTeamProject(self.fixture_root)

        health = project.healthcheck()
        routed = project.route_request("看看当前PRD的进展", actor="test_host")

        self.assertEqual(11, health["roles_count"])
        self.assertEqual(0, health["workflows_count"])
        self.assertEqual("readonly_query", routed["intent"])
        self.assertEqual("readonly", routed["mode"])
        self.assertEqual("product_manager", routed["target_role"])

    def test_route_request_can_target_independent_experience_officer(self) -> None:
        project = AgentTeamProject(self.fixture_root)

        routed = project.route_request("请体验评审当前产品并尽量挑刺", actor="test_host")

        self.assertEqual("readonly_query", routed["intent"])
        self.assertEqual("readonly", routed["mode"])
        self.assertEqual("user_experience_officer", routed["target_role"])

    def test_transition_persists_state(self) -> None:
        project = AgentTeamProject(self.fixture_root)
        result = project.transition_state(
            to_state="scoped",
            triggered_by="project_manager_orchestrator",
            reason="测试推进状态",
        )

        reloaded = AgentTeamProject(self.fixture_root)

        self.assertEqual("allowed", result["verdict"])
        self.assertEqual("scoped", reloaded.get_project_state()["current_state"])
        self.assertGreaterEqual(len(reloaded.get_project_state()["history"]), 1)

    def test_experience_review_alias_maps_to_current_ux_review_state(self) -> None:
        project = AgentTeamProject(self.fixture_root)
        project.state_machine.project_state.current_state = "testing"

        to_review = project.transition_state(
            to_state="experience_review",
            triggered_by="qa_engineer",
            reason="测试完成，交给独立体验官复审",
        )
        state = project.get_project_state()

        self.assertEqual("allowed", to_review["verdict"])
        self.assertEqual("ux_review", to_review["to_state"])
        self.assertEqual("experience_review", to_review["semantic_mapping"]["requested_to_state"])
        self.assertEqual("ux_review", to_review["semantic_mapping"]["resolved_to_state"])
        self.assertEqual("ux_review", state["current_state"])
        self.assertIn("experience_review", state["semantic_aliases"]["current_state"])

    def test_prepare_role_session_builds_execution_payload_and_persists_runtime_objects(self) -> None:
        project = AgentTeamProject(self.fixture_root)
        session = project.prepare_role_session("看看当前PRD的进展", actor="test_host")
        payload = session["execution_payload"]

        self.assertTrue(session["workflow"]["workflow_id"].startswith("WF-"))
        self.assertTrue(session["role_session"]["role_session_id"].startswith("RS-"))
        self.assertEqual(session["workflow"]["active_role_session_id"], session["role_session"]["role_session_id"])
        self.assertEqual("product_manager", payload["role_id"])
        self.assertEqual("readonly", payload["mode"])
        self.assertEqual("gemini-pro", payload["model"]["provider_family"])
        self.assertEqual(3, len(payload["messages"]))
        self.assertEqual("system", payload["messages"][0]["role"])
        self.assertIn("治理上下文", payload["messages"][0]["content"])
        self.assertEqual(session["workflow"]["workflow_id"], payload["metadata"]["workflow_id"])
        self.assertEqual(session["role_session"]["role_session_id"], payload["metadata"]["role_session_id"])
        self.assertIn("selected_model_reason", payload["metadata"])
        self.assertIn("role_response", session["expected_outputs"])
        self.assertEqual(1, len(project.list_workflows()))
        self.assertEqual(1, len(project.list_role_sessions()))

    def test_prepare_role_session_for_role_keeps_selected_role_and_router_mode(self) -> None:
        project = AgentTeamProject(self.fixture_root)
        session = project.prepare_role_session_for_role(
            "backend_engineer",
            "看看当前PRD的进展",
            actor="test_host",
            task_id="TASK-BE-REVIEW",
        )

        self.assertEqual("backend_engineer", session["route"]["target_role"])
        self.assertEqual("product_manager", session["route"]["router_target_role"])
        self.assertEqual("explicit_role", session["route"]["route_source"])
        self.assertEqual("readonly", session["execution_payload"]["mode"])
        self.assertEqual("backend_engineer", session["execution_payload"]["role_id"])
        self.assertEqual("claude-sonnet", session["execution_payload"]["model"]["model_alias"])
        self.assertEqual("TASK-BE-REVIEW", session["execution_payload"]["metadata"]["task_id"])

    def test_prepare_role_session_prefers_artifact_override_over_task_override(self) -> None:
        self._update_model_config(
            lambda data: data.update(
                {
                    "task_overrides": {
                        "TASK-SEARCH": {
                            "model": {
                                "provider_family": "gemini-pro",
                                "model_tier": "pro",
                                "model_alias": "gemini-pro",
                            }
                        }
                    },
                    "artifact_overrides": {
                        "ART-PRD-0001": {
                            "model": {
                                "provider_family": "gpt-5",
                                "model_tier": "light",
                                "model_alias": "gpt-5-mini",
                            }
                        }
                    },
                }
            )
        )
        project = AgentTeamProject(self.fixture_root)
        session = project.prepare_role_session(
            "看看当前PRD的进展",
            actor="test_host",
            task_id="TASK-SEARCH",
            artifact_ids=["ART-PRD-0001"],
        )

        self.assertEqual("artifact_override", session["execution_payload"]["metadata"]["selected_model_source"])
        self.assertEqual("gpt-5-mini", session["execution_payload"]["model"]["model_alias"])
        self.assertEqual("TASK-SEARCH", session["execution_payload"]["metadata"]["task_id"])
        self.assertEqual(["ART-PRD-0001"], session["execution_payload"]["metadata"]["artifact_ids"])
        self.assertEqual("TASK-SEARCH", session["role_session"]["task_id"])
        self.assertEqual(["ART-PRD-0001"], session["role_session"]["artifact_ids"])
        self.assertIn("ART-PRD-0001", session["role_session"]["input_refs"])

    def test_create_handoff_and_prepare_next_role_session_inherits_selection_context(self) -> None:
        project = AgentTeamProject(self.fixture_root)
        prepared = project.prepare_role_session(
            "看看当前PRD的进展",
            actor="test_host",
            task_id="TASK-ARCH",
            artifact_ids=["ART-PRD-0001"],
        )
        handoff = project.create_handoff_packet(
            workflow_id=prepared["workflow"]["workflow_id"],
            from_role="product_manager",
            to_role="system_architect",
            from_role_session_id=prepared["role_session"]["role_session_id"],
            intent="draft_for_review",
            content_markdown="请从架构角度评审该需求，并标记是否需要新增接口。",
            actor="test_host",
            questions_to_answer=["是否需要新接口？", "是否有跨模块影响？"],
            acceptance_focus=["影响范围", "技术风险"],
        )

        next_session = project.prepare_next_role_session(handoff["handoff_id"], actor="test_host")
        handoff_file = self.fixture_root / handoff["content_path"]

        self.assertTrue(handoff["handoff_id"].startswith("HO-"))
        self.assertTrue(handoff_file.exists())
        self.assertEqual("TASK-ARCH", handoff["task_id"])
        self.assertEqual(["ART-PRD-0001"], handoff["upstream_artifacts"])
        self.assertEqual("accepted", next_session["handoff"]["status"])
        self.assertEqual("system_architect", next_session["role_session"]["role_id"])
        self.assertEqual("TASK-ARCH", next_session["role_session"]["task_id"])
        self.assertEqual(["ART-PRD-0001"], next_session["role_session"]["artifact_ids"])
        self.assertIn(handoff["handoff_id"], next_session["role_session"]["input_refs"])
        self.assertIn("ART-PRD-0001", next_session["role_session"]["input_refs"])
        self.assertEqual(handoff["handoff_id"], next_session["execution_payload"]["metadata"]["handoff_id"])
        self.assertEqual("claude", next_session["execution_payload"]["model"]["provider_family"])
        self.assertEqual(1, len(project.list_handoffs()))
        source_role_session = project.list_role_sessions(role_id="product_manager")[0]
        self.assertIn(handoff["handoff_id"], source_role_session["produced_handoff_packet_ids"])

    def test_prepare_next_role_session_prefers_artifact_override_over_handoff_recommendation(self) -> None:
        self._update_model_config(
            lambda data: data.update(
                {
                    "artifact_overrides": {
                        "ART-PRD-0001": {
                            "model": {
                                "provider_family": "gpt-5",
                                "model_tier": "light",
                                "model_alias": "gpt-5-mini",
                            }
                        }
                    }
                }
            )
        )
        project = AgentTeamProject(self.fixture_root)
        prepared = project.prepare_role_session(
            "看看当前PRD的进展",
            actor="test_host",
            artifact_ids=["ART-PRD-0001"],
        )
        handoff = project.create_handoff_packet(
            workflow_id=prepared["workflow"]["workflow_id"],
            from_role="product_manager",
            to_role="system_architect",
            from_role_session_id=prepared["role_session"]["role_session_id"],
            intent="draft_for_review",
            content_markdown="请从架构角度评审该需求。",
            actor="test_host",
            recommended_model={
                "provider_family": "claude",
                "model_tier": "deep-reasoning",
                "model_alias": "claude",
            },
        )

        next_session = project.prepare_next_role_session(handoff["handoff_id"], actor="test_host")

        self.assertEqual("artifact_override", next_session["execution_payload"]["metadata"]["selected_model_source"])
        self.assertEqual("gpt-5-mini", next_session["execution_payload"]["model"]["model_alias"])
        self.assertEqual(["ART-PRD-0001"], next_session["execution_payload"]["metadata"]["artifact_ids"])

    def test_execute_prepared_payload_records_execution_run(self) -> None:
        project = AgentTeamProject(self.fixture_root)
        prepared = project.prepare_role_session("看看当前PRD的进展", actor="test_host")
        result = project.execute_prepared_payload(prepared["execution_payload"], adapter="mock")
        role_session_id = prepared["role_session"]["role_session_id"]
        role_session = project.list_role_sessions(status="completed")[0]

        self.assertIn("execution_run", result)
        self.assertTrue(result["execution_run"]["execution_run_id"].startswith("ER-"))
        self.assertEqual(role_session_id, result["execution_run"]["role_session_id"])
        self.assertEqual("mock", result["result"]["adapter"])
        self.assertEqual("completed", role_session["status"])
        self.assertEqual(result["execution_run"]["execution_run_id"], role_session["last_execution_run_id"])

    def test_simulate_role_execution_returns_mock_result(self) -> None:
        project = AgentTeamProject(self.fixture_root)
        simulated = project.simulate_role_execution("看看当前PRD的进展", actor="test_host")

        self.assertEqual("mock", simulated["result"]["adapter"])
        self.assertEqual("product_manager", simulated["payload"]["role_id"])
        self.assertIn("建议宿主使用模型", simulated["result"]["simulated_response"])

    def test_simulate_role_execution_supports_codebuddy_adapter(self) -> None:
        project = AgentTeamProject(self.fixture_root)
        simulated = project.simulate_role_execution(
            "看看当前PRD的进展",
            actor="test_host",
            adapter="codebuddy",
        )

        self.assertEqual("codebuddy", simulated["result"]["adapter"])
        self.assertEqual("host_handoff", simulated["result"]["codebuddy"]["execution_kind"])
        self.assertIn("prompt_markdown", simulated["result"]["codebuddy"])

    def test_orchestrate_change_flow(self) -> None:
        project = AgentTeamProject(self.fixture_root)
        result = project.orchestrate_change_flow(
            user_input="修改PRD中搜索功能的需求描述",
            requested_by="product_manager",
            target_artifacts=["ART-PRD-0001"],
            change_type="content_update",
            justification="测试变更流程",
            affected_roles=["product_manager", "frontend_engineer"],
            affected_artifacts=["ART-PRD-0001"],
            transition_after_assessment="scoped",
            task_id="TASK-CHANGE-SEARCH",
        )

        self.assertEqual("change", result["route"]["mode"])
        self.assertTrue(result["change_request"]["cr_id"].startswith("CR-"))
        self.assertTrue(result["impact_assessment"]["ia_id"].startswith("IA-"))
        self.assertEqual("scoped", result["project_state"]["current_state"])
        self.assertEqual(3, len(result["transitions"]))
        self.assertEqual("product_manager", result["role_bundle"]["role_id"])
        self.assertEqual("change", result["execution_payload"]["mode"])
        self.assertTrue(result["workflow"]["workflow_id"].startswith("WF-"))
        self.assertEqual(result["change_request"]["cr_id"], result["workflow"]["change_request_id"])
        self.assertEqual(result["impact_assessment"]["ia_id"], result["workflow"]["impact_assessment_id"])
        self.assertEqual("TASK-CHANGE-SEARCH", result["execution_payload"]["metadata"]["task_id"])
        self.assertIn("ART-PRD-0001", result["execution_payload"]["metadata"]["artifact_ids"])

    def test_sync_master_preferences_and_payload_metadata(self) -> None:
        shared_dir = Path(self._tempdir.name) / "shared-preferences"
        record_master_preference(
            summary="默认先给结论，再展开细节",
            source_project="fixture-project",
            shared_preferences_dir=shared_dir,
        )
        sync_project_master_preferences(self.fixture_root, shared_preferences_dir=shared_dir)

        project = AgentTeamProject(self.fixture_root)
        session = project.prepare_role_session("看看当前PRD的进展", actor="test_host")
        system_prompt = session["execution_payload"]["messages"][0]["content"]
        metadata = session["execution_payload"]["metadata"]

        self.assertIn("Master 偏好上下文", system_prompt)
        self.assertIn("默认先给结论，再展开细节", system_prompt)
        self.assertTrue(metadata["master_preferences_applied"])
        self.assertTrue(metadata["master_preference_sources"])

    def test_initialize_project_from_template_creates_clean_runtime_state(self) -> None:
        workspace_root = Path(self._tempdir.name) / "workspace-init"
        shared_dir = Path(self._tempdir.name) / "shared-preferences"
        record_master_preference(
            summary="上线前优先列回滚条件",
            shared_preferences_dir=shared_dir,
        )

        with patch("agent_team_core.scaffold._create_virtualenv", return_value={"installed": True, "python": "/tmp/python", "pip": "/tmp/pip"}):
            result = initialize_project_from_template(
                template_root=self.source_root,
                workspace_root=workspace_root,
                shared_preferences_dir=shared_dir,
                install_venv=True,
            )

        project_root = Path(result["project_root"])
        registry = json.loads((project_root / "artifacts" / "registry" / "artifact-registry.v1.json").read_text(encoding="utf-8"))
        baseline = json.loads((project_root / "configs" / "baselines" / "baseline.current.v1.json").read_text(encoding="utf-8"))
        state = json.loads((project_root / "state" / "project-state.v1.json").read_text(encoding="utf-8"))
        snapshot = (project_root / "knowledge" / "master-preferences" / "master-preferences.snapshot.md").read_text(encoding="utf-8")

        self.assertEqual([], registry["artifacts"])
        self.assertIsNone(baseline["baseline_tag"])
        self.assertEqual("intake", state["current_state"])
        self.assertIn("上线前优先列回滚条件", snapshot)
        self.assertTrue(result["virtualenv"]["installed"])


if __name__ == "__main__":
    unittest.main()
