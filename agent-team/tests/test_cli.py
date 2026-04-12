from __future__ import annotations

import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

from agent_team_cli.main import main
from agent_team_core.project import AgentTeamProject
from agent_team_core.scaffold import initialize_project_from_template


class AgentTeamCLISmokeTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tempdir = tempfile.TemporaryDirectory()
        source_root = Path(__file__).resolve().parents[1]
        workspace_root = Path(self._tempdir.name) / "fixture-workspace"
        result = initialize_project_from_template(
            template_root=source_root,
            workspace_root=workspace_root,
            project_dir_name="agent-team-fixture",
            install_venv=False,
        )
        self.fixture_root = Path(result["project_root"])

    def tearDown(self) -> None:
        self._tempdir.cleanup()

    def _write_workbuddy_truth_layer(self) -> Path:
        workspace_root = self.fixture_root.parent
        truth_root = workspace_root / ".agent-team"
        (truth_root / "roles").mkdir(parents=True, exist_ok=True)
        (truth_root / "configs" / "global").mkdir(parents=True, exist_ok=True)
        (truth_root / "configs" / "baselines").mkdir(parents=True, exist_ok=True)
        (truth_root / "artifacts" / "registry").mkdir(parents=True, exist_ok=True)
        (truth_root / "artifacts" / "by-type" / "UX_REVIEW_REPORT").mkdir(parents=True, exist_ok=True)
        (truth_root / "artifacts" / "by-type" / "UX_ISSUE_LOG").mkdir(parents=True, exist_ok=True)
        (truth_root / "artifacts" / "by-type" / "EXPERIENCE_ACCEPTANCE_NOTE").mkdir(parents=True, exist_ok=True)

        (truth_root / "roles" / "roles.v1.yaml").write_text(
            """
roles:
  project_manager_orchestrator:
    display_name: \"项目经理 / Orchestrator\"
    enabled: true
    execution_mode: single
    default_model:
      provider_family: gpt-5
      model_tier: light
      model_alias: gpt-5-mini
    primary_stages: [intake, release_ready]
    owned_artifacts: [TASK_BRIEF]
    readonly_query_enabled: true
    formal_change_requires_impact_assessment: true
    permissions:
      read: [all_artifacts]
      write: [TASK_BRIEF]
      approve: [TASK_BRIEF]
      block: []
      forbidden: []
    query_playbook:
      supported_topics: [整体进展]
      response_style: 编排摘要
      escalate_when: [正式修改]
      forbidden_actions: [change_state]
    system_prompt: |
      你是项目经理 / Orchestrator。
      请按 WorkBuddy 真相层编排项目。
  user_experience_officer:
    display_name: \"用户体验官\"
    enabled: true
    execution_mode: single
    default_model:
      provider_family: claude
      model_tier: deep-reasoning
      model_alias: claude
    primary_stages: [testing, ux_review]
    owned_artifacts: [UX_REVIEW_REPORT]
    readonly_query_enabled: true
    formal_change_requires_impact_assessment: true
    permissions:
      read: [approved_baselines]
      write: [UX_REVIEW_REPORT]
      approve: [EXPERIENCE_ACCEPTANCE_NOTE]
      block: [release_if_critical_ux_issue_exists]
      forbidden: [direct_fix_execution]
    query_playbook:
      supported_topics: [体验评审]
      response_style: 独立苛刻终审
      escalate_when: [跳过体验评审]
      forbidden_actions: [change_state]
    system_prompt: |
      你是用户体验官。
      负责 UX 终审与复验。
""".lstrip(),
            encoding="utf-8",
        )
        (truth_root / "configs" / "global" / "router-config.v1.yaml").write_text(
            """
schema_version: \"1.0\"
defaults:
  fallback_owner: project_manager_orchestrator
intent_classifier:
  readonly_keywords: [\"看看\", \"体验\", \"评审\"]
  change_keywords: [\"修改\", \"更新\"]
""".lstrip(),
            encoding="utf-8",
        )
        (truth_root / "configs" / "global" / "state-machine.v1.yaml").write_text(
            """
schema_version: \"1.0\"
states:
  - intake
  - testing
  - ux_review
  - change_request_received
  - release_ready
rules:
  readonly_no_mutation: true
  change_request_requires_id: true
state_labels:
  ux_review: \"体验评审\"
transitions:
  intake: [testing]
  testing: [ux_review, change_request_received]
  ux_review: [release_ready, change_request_received]
  change_request_received: [testing]
  release_ready: []
guards:
  change_request_received:
    requires: change_request_id
    message: \"进入变更流程需要提供 change_request_id\"
""".lstrip(),
            encoding="utf-8",
        )
        (truth_root / "configs" / "global" / "project-state.v1.json").write_text(
            json.dumps(
                {
                    "schema_version": "1.0",
                    "current_state": "testing",
                    "baseline_tag": "WB-BL-001",
                    "history": [{"from": "intake", "to": "testing", "timestamp": "2026-04-08T12:00:00Z"}],
                },
                ensure_ascii=False,
                indent=2,
            ) + "\n",
            encoding="utf-8",
        )
        (truth_root / "artifacts" / "registry" / "artifact-registry.v1.json").write_text(
            json.dumps(
                {
                    "schema_version": "1.0",
                    "registry_name": "workbuddy-artifact-registry",
                    "artifacts": [
                        {
                            "artifact_id": "ART-UX_REVIEW_REPORT-0001",
                            "artifact_type": "UX_REVIEW_REPORT",
                            "owner_role": "user_experience_officer",
                            "stage": "ux_review",
                            "status": "approved",
                            "version": "v2.0.0",
                            "storage_path": "artifacts/by-type/UX_REVIEW_REPORT/UX_REVIEW_REPORT--ART-UX_REVIEW_REPORT-0001--v2.0.0.md",
                        },
                        {
                            "artifact_id": "ART-UX_ISSUE_LOG-0001",
                            "artifact_type": "UX_ISSUE_LOG",
                            "owner_role": "user_experience_officer",
                            "stage": "ux_review",
                            "status": "approved",
                            "version": "v2.0.0",
                            "storage_path": "artifacts/by-type/UX_ISSUE_LOG/UX_ISSUE_LOG--ART-UX_ISSUE_LOG-0001--v2.0.0.md",
                        },
                        {
                            "artifact_id": "ART-EAN-0001",
                            "artifact_type": "EXPERIENCE_ACCEPTANCE_NOTE",
                            "owner_role": "user_experience_officer",
                            "stage": "release_ready",
                            "status": "approved",
                            "version": "v1.0.0",
                            "storage_path": "artifacts/by-type/EXPERIENCE_ACCEPTANCE_NOTE/EXPERIENCE_ACCEPTANCE_NOTE--ART-EAN-0001--v1.0.0.md",
                        },
                    ],
                },
                ensure_ascii=False,
                indent=2,
            ) + "\n",
            encoding="utf-8",
        )
        (truth_root / "configs" / "baselines" / "baseline.current.v1.json").write_text(
            json.dumps(
                {
                    "schema_version": "1.0",
                    "baseline_tag": "WB-BL-001",
                    "frozen_at": "2026-04-08T12:30:00Z",
                    "artifacts": [
                        "ART-UX_REVIEW_REPORT-0001@v2.0.0",
                        "ART-UX_ISSUE_LOG-0001@v2.0.0",
                        "ART-EAN-0001@v1.0.0",
                    ],
                },
                ensure_ascii=False,
                indent=2,
            ) + "\n",
            encoding="utf-8",
        )
        (truth_root / "configs" / "baselines" / "baseline.history.v1.jsonl").write_text(
            json.dumps(
                {
                    "schema_version": "1.0",
                    "baseline_tag": "WB-BL-001",
                    "frozen_at": "2026-04-08T12:30:00Z",
                    "artifacts": [
                        "ART-UX_REVIEW_REPORT-0001@v2.0.0",
                        "ART-UX_ISSUE_LOG-0001@v2.0.0",
                        "ART-EAN-0001@v1.0.0",
                    ],
                },
                ensure_ascii=False,
            ) + "\n",
            encoding="utf-8",
        )
        (truth_root / "artifacts" / "by-type" / "UX_REVIEW_REPORT" / "UX_REVIEW_REPORT--ART-UX_REVIEW_REPORT-0001--v2.0.0.md").write_text(
            "# UX_REVIEW_REPORT\n", encoding="utf-8"
        )
        (truth_root / "artifacts" / "by-type" / "UX_ISSUE_LOG" / "UX_ISSUE_LOG--ART-UX_ISSUE_LOG-0001--v2.0.0.md").write_text(
            "# UX_ISSUE_LOG\n", encoding="utf-8"
        )
        (truth_root / "artifacts" / "by-type" / "EXPERIENCE_ACCEPTANCE_NOTE" / "EXPERIENCE_ACCEPTANCE_NOTE--ART-EAN-0001--v1.0.0.md").write_text(
            "# EXPERIENCE_ACCEPTANCE_NOTE\n", encoding="utf-8"
        )
        for name in [
            "ux-governance-rules.v1.md",
            "ux-review-sop.v1.md",
            "ux-review-templates.v1.md",
            "ux-review-examples.v1.md",
        ]:
            (truth_root / "configs" / "global" / name).write_text(f"# {name}\n", encoding="utf-8")
        return truth_root

    def test_healthcheck_command(self) -> None:
        stdout = io.StringIO()
        with redirect_stdout(stdout):
            exit_code = main(["--project-root", str(self.fixture_root), "healthcheck"])
        payload = json.loads(stdout.getvalue())
        self.assertEqual(0, exit_code)
        self.assertEqual(11, payload["roles_count"])

    def test_execute_dry_run_command(self) -> None:
        stdout = io.StringIO()
        with redirect_stdout(stdout):
            exit_code = main(
                [
                    "--project-root",
                    str(self.fixture_root),
                    "execute",
                    "看看当前PRD的进展",
                    "--dry-run",
                ]
            )
        payload = json.loads(stdout.getvalue())
        self.assertEqual(0, exit_code)
        self.assertEqual("product_manager", payload["payload"]["role_id"])
        self.assertTrue(payload["result"]["dry_run"])

    def test_execute_stream_command_with_mock_adapter_outputs_text(self) -> None:
        stdout = io.StringIO()
        with redirect_stdout(stdout):
            exit_code = main(
                [
                    "--project-root",
                    str(self.fixture_root),
                    "execute",
                    "看看当前PRD的进展",
                    "--adapter",
                    "mock",
                    "--stream",
                ]
            )
        output = stdout.getvalue()
        self.assertEqual(0, exit_code)
        self.assertIn("建议宿主使用模型", output)
        self.assertNotIn('"payload"', output)

    def test_execute_stream_jsonl_command_outputs_events(self) -> None:
        stdout = io.StringIO()
        with redirect_stdout(stdout):
            exit_code = main(
                [
                    "--project-root",
                    str(self.fixture_root),
                    "execute",
                    "看看当前PRD的进展",
                    "--adapter",
                    "mock",
                    "--stream-jsonl",
                ]
            )
        lines = [json.loads(line) for line in stdout.getvalue().splitlines() if line.strip()]
        self.assertEqual(0, exit_code)
        self.assertEqual("start", lines[0]["event"])
        self.assertTrue(any(item.get("event") == "delta" for item in lines))
        self.assertEqual("result", lines[-1]["event"])
        self.assertEqual("mock", lines[-1]["result"]["adapter"])

    def test_execute_codebuddy_adapter_returns_handoff_contract(self) -> None:
        stdout = io.StringIO()
        with redirect_stdout(stdout):
            exit_code = main(
                [
                    "--project-root",
                    str(self.fixture_root),
                    "execute",
                    "看看当前PRD的进展",
                    "--adapter",
                    "codebuddy",
                ]
            )
        payload = json.loads(stdout.getvalue())
        self.assertEqual(0, exit_code)
        self.assertEqual("codebuddy", payload["result"]["adapter"])
        self.assertEqual("host_handoff", payload["result"]["codebuddy"]["execution_kind"])
        self.assertTrue(payload["result"]["codebuddy"]["mcp_config"]["mcpServers"])

    def test_setup_codebuddy_command_writes_project_assets(self) -> None:
        stdout = io.StringIO()
        with redirect_stdout(stdout):
            exit_code = main(["--project-root", str(self.fixture_root), "setup-codebuddy"])
        payload = json.loads(stdout.getvalue())
        agent_file = Path(payload["files"]["agent"])
        role_agent_files = [Path(path) for path in payload["files"]["role_agents"]]
        mcp_file = Path(payload["files"]["mcp"])
        readme_file = Path(payload["files"]["readme"])

        self.assertEqual(0, exit_code)
        self.assertEqual(self.fixture_root.resolve(), Path(payload["workspace_root"]).resolve())
        self.assertTrue(agent_file.exists())
        self.assertTrue(role_agent_files)
        self.assertEqual(10, len(role_agent_files))
        self.assertTrue(all(path.exists() for path in role_agent_files))
        self.assertTrue(any(path.name == "agent-team-role-user-experience-officer.md" for path in role_agent_files))
        self.assertTrue(mcp_file.exists())
        self.assertTrue(readme_file.exists())
        self.assertIn("agentMode: manual", agent_file.read_text(encoding="utf-8"))
        self.assertIn("model: gpt-5.4", agent_file.read_text(encoding="utf-8"))
        self.assertIn("agentMode: agentic", role_agent_files[0].read_text(encoding="utf-8"))
        self.assertIn("prepare_role_session_for_role", role_agent_files[0].read_text(encoding="utf-8"))
        self.assertIn("当前 Agent frontmatter 模型", role_agent_files[0].read_text(encoding="utf-8"))
        self.assertIn("mcpServers", mcp_file.read_text(encoding="utf-8"))
        self.assertIn("角色级 Subagents", readme_file.read_text(encoding="utf-8"))

    def test_setup_codebuddy_command_supports_workspace_root(self) -> None:
        workspace_root = Path(self._tempdir.name) / "codebuddy-workspace"
        workspace_root.mkdir()

        stdout = io.StringIO()
        with redirect_stdout(stdout):
            exit_code = main(
                [
                    "--project-root",
                    str(self.fixture_root),
                    "setup-codebuddy",
                    "--workspace-root",
                    str(workspace_root),
                ]
            )
        payload = json.loads(stdout.getvalue())
        agent_file = Path(payload["files"]["agent"])
        role_agent_files = [Path(path) for path in payload["files"]["role_agents"]]
        mcp_file = Path(payload["files"]["mcp"])

        self.assertEqual(0, exit_code)
        self.assertEqual(workspace_root.resolve(), Path(payload["workspace_root"]).resolve())
        self.assertEqual((workspace_root / ".codebuddy" / "agents" / "agent-team-orchestrator.md").resolve(), agent_file.resolve())
        self.assertEqual((workspace_root / ".codebuddy" / "agent-team" / "mcp.json").resolve(), mcp_file.resolve())
        self.assertEqual(10, len(role_agent_files))
        self.assertTrue(all(path.exists() for path in role_agent_files))
        self.assertTrue(any(path.name == "agent-team-role-user-experience-officer.md" for path in role_agent_files))
        self.assertTrue(agent_file.exists())
        self.assertTrue(mcp_file.exists())
        self.assertIn("agentMode: manual", agent_file.read_text(encoding="utf-8"))
        self.assertIn("model: gpt-5.4", agent_file.read_text(encoding="utf-8"))
        self.assertIn(str(self.fixture_root), mcp_file.read_text(encoding="utf-8"))

    def test_setup_codebuddy_prefers_venv_python_over_stale_agent_entry(self) -> None:
        venv_bin = self.fixture_root / ".venv" / "bin"
        venv_bin.mkdir(parents=True, exist_ok=True)
        (venv_bin / "python").write_text("#!/usr/bin/env python3\n", encoding="utf-8")
        (venv_bin / "agent-team").write_text(
            "#!/Users/turbo/Projects/old-project/agent-team/.venv/bin/python\n",
            encoding="utf-8",
        )

        stdout = io.StringIO()
        with redirect_stdout(stdout):
            exit_code = main(["--project-root", str(self.fixture_root), "setup-codebuddy"])

        payload = json.loads(stdout.getvalue())
        mcp_file = Path(payload["files"]["mcp"])
        mcp_content = mcp_file.read_text(encoding="utf-8")

        self.assertEqual(0, exit_code)
        self.assertIn(str(venv_bin / "python"), mcp_content)
        self.assertIn('"-m"', mcp_content)
        self.assertIn('"agent_team_cli"', mcp_content)
        self.assertNotIn(str(venv_bin / "agent-team"), mcp_content)

    def test_record_master_preference_command_creates_shared_record(self) -> None:
        shared_dir = Path(self._tempdir.name) / "shared-preferences"
        stdout = io.StringIO()
        with redirect_stdout(stdout):
            exit_code = main(
                [
                    "--project-root",
                    str(self.fixture_root),
                    "record-master-preference",
                    "--summary",
                    "默认先给结论，再展开细节",
                    "--source-project",
                    "fixture-project",
                    "--tags",
                    "输出风格,沟通方式",
                    "--importance",
                    "high",
                    "--shared-preferences-dir",
                    str(shared_dir),
                ]
            )
        payload = json.loads(stdout.getvalue())
        master_file = shared_dir / "master-preferences.md"

        self.assertEqual(0, exit_code)
        self.assertTrue(master_file.exists())
        self.assertIn("默认先给结论，再展开细节", master_file.read_text(encoding="utf-8"))
        self.assertTrue(Path(payload["record_file"]).exists())

    def test_sync_master_preferences_command_creates_project_snapshot(self) -> None:
        shared_dir = Path(self._tempdir.name) / "shared-preferences"
        main(
            [
                "--project-root",
                str(self.fixture_root),
                "record-master-preference",
                "--summary",
                "上线前优先列回滚条件",
                "--shared-preferences-dir",
                str(shared_dir),
            ]
        )

        stdout = io.StringIO()
        with redirect_stdout(stdout):
            exit_code = main(
                [
                    "--project-root",
                    str(self.fixture_root),
                    "sync-master-preferences",
                    "--shared-preferences-dir",
                    str(shared_dir),
                ]
            )
        payload = json.loads(stdout.getvalue())
        snapshot_file = self.fixture_root / "knowledge" / "master-preferences" / "master-preferences.snapshot.md"
        override_file = self.fixture_root / "knowledge" / "master-preferences" / "project-overrides.md"

        self.assertEqual(0, exit_code)
        self.assertEqual(str(snapshot_file.resolve()), payload["snapshot_file"])
        self.assertTrue(snapshot_file.exists())
        self.assertTrue(override_file.exists())
        self.assertIn("上线前优先列回滚条件", snapshot_file.read_text(encoding="utf-8"))

    def test_sync_workbuddy_command_bridges_roles_state_and_codebuddy_assets(self) -> None:
        truth_root = self._write_workbuddy_truth_layer()

        stdout = io.StringIO()
        with redirect_stdout(stdout):
            exit_code = main(["--project-root", str(self.fixture_root), "sync-workbuddy"])
        payload = json.loads(stdout.getvalue())
        project = AgentTeamProject(self.fixture_root)

        synced_prompt = (self.fixture_root / "roles" / "project-manager-orchestrator" / "prompt.system.md").read_text(encoding="utf-8")
        synced_state_machine = (self.fixture_root / "configs" / "global" / "state-machine.v1.yaml").read_text(encoding="utf-8")
        synced_readme = (self.fixture_root.parent / ".codebuddy" / "agent-team" / "README.md").read_text(encoding="utf-8")
        synced_reference = (self.fixture_root / "references" / "ux-review-sop.md").read_text(encoding="utf-8")
        synced_registry = json.loads((self.fixture_root / "artifacts" / "registry" / "artifact-registry.v1.json").read_text(encoding="utf-8"))
        synced_baseline = json.loads((self.fixture_root / "configs" / "baselines" / "baseline.current.v1.json").read_text(encoding="utf-8"))
        artifact_projection = json.loads((self.fixture_root / "state" / "workbuddy-bridge" / "artifact-projection.v1.json").read_text(encoding="utf-8"))

        self.assertEqual(0, exit_code)
        self.assertEqual(str(truth_root.resolve()), payload["workbuddy_root"])
        self.assertEqual(2, payload["roles"]["synced_count"])
        self.assertEqual("testing", payload["state"]["current_state"])
        self.assertEqual(3, payload["artifacts"]["artifact_count"])
        self.assertEqual("WB-BL-001", payload["artifacts"]["baseline_tag"])
        self.assertIn("WorkBuddy 真相层", synced_prompt)
        self.assertIn("ux_review", synced_state_machine)
        self.assertIn("当前 WorkBuddy 融合状态", synced_readme)
        self.assertIn("sync-workbuddy", synced_readme)
        self.assertIn("ux-review-sop.v1.md", synced_reference)
        self.assertEqual("WB-BL-001", synced_baseline["baseline_tag"])
        self.assertEqual("UX_REVIEW_REPORT", synced_registry["artifacts"][0]["artifact_type"])
        self.assertEqual(3, artifact_projection["registry"]["artifact_count"])
        self.assertEqual("testing", project.get_project_state()["current_state"])

        bridged_artifacts = project.list_artifacts(
            artifact_type="EXPERIENCE_REVIEW",
            stage="experience_review",
            status="approved",
        )
        to_review = project.transition_state(
            to_state="experience_review",
            triggered_by="qa_engineer",
            reason="测试完成，进入体验评审",
        )
        current_state = project.get_project_state()
        to_change_without_cr = project.transition_state(
            to_state="change_request_received",
            triggered_by="user_experience_officer",
            reason="体验官要求返工",
        )

        self.assertEqual(1, len(bridged_artifacts))
        self.assertEqual("UX_REVIEW_REPORT", bridged_artifacts[0]["artifact_type"])
        self.assertIn("EXPERIENCE_REVIEW", bridged_artifacts[0]["semantic_artifact_type_aliases"])
        self.assertIn("experience_review", bridged_artifacts[0]["semantic_stage_aliases"])
        self.assertEqual("allowed", to_review["verdict"])
        self.assertEqual("ux_review", to_review["to_state"])
        self.assertEqual("experience_review", to_review["semantic_mapping"]["requested_to_state"])
        self.assertEqual("ux_review", to_review["semantic_mapping"]["resolved_to_state"])
        self.assertIn("experience_review", current_state["semantic_aliases"]["current_state"])
        self.assertEqual("requires_impact_assessment", to_change_without_cr["verdict"])
        self.assertIn("change_request_id", to_change_without_cr["message"])

    def test_eval_lightweight_command_writes_scorecard_outputs(self) -> None:
        self._write_workbuddy_truth_layer()
        main(["--project-root", str(self.fixture_root), "sync-workbuddy", "--skip-codebuddy-setup"])

        source_root = Path(__file__).resolve().parents[1]
        baseline_workspace = Path(self._tempdir.name) / "baseline-workspace"
        baseline_result = initialize_project_from_template(
            template_root=source_root,
            workspace_root=baseline_workspace,
            project_dir_name="agent-team-baseline",
            install_venv=False,
        )
        baseline_root = Path(baseline_result["project_root"])
        output_dir = Path(self._tempdir.name) / "eval-output"

        stdout = io.StringIO()
        with redirect_stdout(stdout):
            exit_code = main(
                [
                    "--project-root",
                    str(self.fixture_root),
                    "eval-lightweight",
                    "--project-a",
                    str(baseline_root),
                    "--project-b",
                    str(self.fixture_root),
                    "--label-a",
                    "独立版",
                    "--label-b",
                    "融合版",
                    "--output-dir",
                    str(output_dir),
                ]
            )
        payload = json.loads(stdout.getvalue())
        snapshot_a = json.loads((output_dir / "snapshot-a.json").read_text(encoding="utf-8"))
        snapshot_b = json.loads((output_dir / "snapshot-b.json").read_text(encoding="utf-8"))
        cases = [json.loads(line) for line in (output_dir / "cases.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
        scorecard = (output_dir / "scorecard.md").read_text(encoding="utf-8")

        self.assertEqual(0, exit_code)
        self.assertEqual("better", payload["comparison"]["verdict"])
        self.assertGreater(payload["groups"]["B"]["auto_score_total"], payload["groups"]["A"]["auto_score_total"])
        self.assertFalse(snapshot_a["artifact_projection"]["exists"])
        self.assertTrue(snapshot_b["artifact_projection"]["exists"])
        self.assertEqual("融合版", snapshot_b["label"])
        self.assertTrue(any(item["group"] == "B" and item["case_id"] == "GOV-2" for item in cases))
        self.assertIn("Golden Cases 对照", scorecard)
        self.assertIn("自动评分总览", scorecard)
        self.assertIn("融合版", scorecard)

    def test_init_project_command_bootstraps_new_workspace(self) -> None:
        workspace_root = Path(self._tempdir.name) / "new-workspace"
        shared_dir = Path(self._tempdir.name) / "shared-preferences"

        with patch("agent_team_core.scaffold._create_virtualenv", return_value={"installed": True, "python": "/tmp/python", "pip": "/tmp/pip"}):
            stdout = io.StringIO()
            with redirect_stdout(stdout):
                exit_code = main(
                    [
                        "--project-root",
                        str(self.fixture_root),
                        "init-project",
                        str(workspace_root),
                        "--shared-preferences-dir",
                        str(shared_dir),
                    ]
                )
        payload = json.loads(stdout.getvalue())
        project_root = workspace_root / "agent-team"
        snapshot_file = project_root / "knowledge" / "master-preferences" / "master-preferences.snapshot.md"
        registry_file = project_root / "artifacts" / "registry" / "artifact-registry.v1.json"
        codebuddy_mcp = workspace_root / ".codebuddy" / "agent-team" / "mcp.json"

        self.assertEqual(0, exit_code)
        self.assertEqual(str(project_root.resolve()), payload["project_root"])
        self.assertTrue(snapshot_file.exists())
        self.assertTrue(registry_file.exists())
        self.assertTrue(codebuddy_mcp.exists())
        self.assertEqual([], json.loads(registry_file.read_text(encoding="utf-8"))["artifacts"])


if __name__ == "__main__":
    unittest.main()
