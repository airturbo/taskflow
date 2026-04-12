from __future__ import annotations

import json
import shutil
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any

from .project import AgentTeamProject
from .scaffold import initialize_project_from_template
from .workbuddy_bridge import sync_from_workbuddy

SNAPSHOT_FILENAME_A = "snapshot-a.json"
SNAPSHOT_FILENAME_B = "snapshot-b.json"
CASES_FILENAME = "cases.jsonl"
SCORECARD_FILENAME = "scorecard.md"
MANUAL_REVIEW_MAX_SCORE = 20


def default_eval_output_dir(project_root: str | Path) -> Path:
    project_root_path = Path(project_root).expanduser().resolve()
    timestamp = datetime.now().strftime("%Y-%m-%d-%H%M%S")
    return project_root_path.parent / "docs" / "evals" / timestamp


def _template_project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _looks_like_agent_team_project(root: Path) -> bool:
    return (root / "runtime").exists() and (root / "src").exists() and (root / "configs").exists()


def _looks_like_workbuddy_truth_layer(root: Path) -> bool:
    return (root / "roles").exists() and (root / "configs").exists() and (root / "artifacts").exists()


def _materialize_eval_project(source_root: Path, destination_root: Path) -> tuple[Path, str]:
    if _looks_like_agent_team_project(source_root):
        _copy_project_tree(source_root, destination_root)
        return destination_root, "agent-team-project"

    if _looks_like_workbuddy_truth_layer(source_root):
        workspace_root = destination_root.parent / f"{destination_root.name}-workspace"
        result = initialize_project_from_template(
            template_root=_template_project_root(),
            workspace_root=workspace_root,
            project_dir_name=destination_root.name,
            install_venv=False,
        )
        project_root = Path(result["project_root"])
        try:
            sync_from_workbuddy(project_root, workbuddy_root=source_root)
            return project_root, "workbuddy-truth-layer"
        except Exception as exc:
            sync_from_workbuddy(project_root, workbuddy_root=source_root, sync_roles=False)
            return project_root, f"workbuddy-truth-layer-fallback(skip-roles:{exc.__class__.__name__})"

    raise FileNotFoundError(
        f"Unsupported evaluation root: {source_root}. Expected a full agent-team project root or a WorkBuddy `.agent-team` truth-layer root."
    )


def run_lightweight_evaluation(
    project_a_root: str | Path,
    project_b_root: str | Path,
    *,
    output_dir: str | Path,
    label_a: str = "A组",
    label_b: str = "B组",
) -> dict[str, Any]:
    original_a = Path(project_a_root).expanduser().resolve()
    original_b = Path(project_b_root).expanduser().resolve()
    output_root = Path(output_dir).expanduser().resolve()

    if not original_a.exists():
        raise FileNotFoundError(f"Project A root not found: {original_a}")
    if not original_b.exists():
        raise FileNotFoundError(f"Project B root not found: {original_b}")

    output_root.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="agent-team-lightweight-eval-") as tempdir:
        temp_root = Path(tempdir)
        sandbox_a, source_mode_a = _materialize_eval_project(original_a, temp_root / "project-a")
        sandbox_b, source_mode_b = _materialize_eval_project(original_b, temp_root / "project-b")

        snapshot_a, cases_a = _evaluate_project_group(original_a, sandbox_a, label_a)
        snapshot_b, cases_b = _evaluate_project_group(original_b, sandbox_b, label_b)
        snapshot_a["source_mode"] = source_mode_a
        snapshot_b["source_mode"] = source_mode_b

    snapshot_a_file = output_root / SNAPSHOT_FILENAME_A
    snapshot_b_file = output_root / SNAPSHOT_FILENAME_B
    cases_file = output_root / CASES_FILENAME
    scorecard_file = output_root / SCORECARD_FILENAME

    snapshot_a_file.write_text(json.dumps(snapshot_a, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    snapshot_b_file.write_text(json.dumps(snapshot_b, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    _write_jsonl(
        cases_file,
        [
            {"group": "A", **case} for case in cases_a
        ]
        + [
            {"group": "B", **case} for case in cases_b
        ],
    )

    group_a_summary = _build_group_summary(snapshot_a, cases_a)
    group_b_summary = _build_group_summary(snapshot_b, cases_b)
    comparison = _build_comparison(group_a_summary, group_b_summary)

    scorecard_file.write_text(
        _render_scorecard(
            snapshot_a=snapshot_a,
            snapshot_b=snapshot_b,
            cases_a=cases_a,
            cases_b=cases_b,
            group_a_summary=group_a_summary,
            group_b_summary=group_b_summary,
            comparison=comparison,
            output_root=output_root,
        ),
        encoding="utf-8",
    )

    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "output_dir": str(output_root),
        "files": {
            "snapshot_a": str(snapshot_a_file),
            "snapshot_b": str(snapshot_b_file),
            "cases": str(cases_file),
            "scorecard": str(scorecard_file),
        },
        "groups": {
            "A": group_a_summary,
            "B": group_b_summary,
        },
        "comparison": comparison,
        "next_steps": [
            f"阅读 `{scorecard_file.name}` 查看自动得分、case 对照和待补的人审项。",
            "如需补人工复核，可按 scorecard 里的 4 个问题给 A/B 两组各打 1~5 分。",
            "若要持续跟踪融合收益，建议固定同一批 project roots，按周重复跑这套轻量评测。",
        ],
    }


def _copy_project_tree(source_root: Path, destination_root: Path) -> None:
    shutil.copytree(
        source_root,
        destination_root,
        ignore=shutil.ignore_patterns(
            ".venv",
            "build",
            "__pycache__",
            "*.pyc",
            ".pytest_cache",
            ".mypy_cache",
            ".DS_Store",
        ),
    )


def _evaluate_project_group(original_root: Path, sandbox_root: Path, label: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    snapshot = _build_snapshot(original_root, sandbox_root, label)
    cases = [
        _run_case(
            case_id="FE-1",
            lane="frontend",
            title="前端只读理解链路",
            max_score=10,
            label=label,
            evaluator=lambda: _case_fe_readonly(sandbox_root),
        ),
        _run_case(
            case_id="FE-2",
            lane="frontend",
            title="前端体验闭环链路",
            max_score=10,
            label=label,
            evaluator=lambda: _case_fe_experience_alias(sandbox_root),
        ),
        _run_case(
            case_id="BE-1",
            lane="backend",
            title="后端只读理解链路",
            max_score=10,
            label=label,
            evaluator=lambda: _case_be_readonly(sandbox_root),
        ),
        _run_case(
            case_id="BE-2",
            lane="backend",
            title="后端治理守卫链路",
            max_score=10,
            label=label,
            evaluator=lambda: _case_be_guard(sandbox_root),
        ),
        _run_case(
            case_id="GOV-1",
            lane="shared",
            title="共享状态别名链路",
            max_score=12,
            label=label,
            evaluator=lambda: _case_governance_state_alias(sandbox_root),
        ),
        _run_case(
            case_id="GOV-2",
            lane="shared",
            title="共享真相层可见性链路",
            max_score=13,
            label=label,
            evaluator=lambda: _case_governance_truth_visibility(snapshot),
        ),
    ]
    return snapshot, cases


def _build_snapshot(original_root: Path, sandbox_root: Path, label: str) -> dict[str, Any]:
    project = AgentTeamProject(sandbox_root)
    health = project.healthcheck()
    state = project.get_project_state()
    alias_artifacts = project.list_artifacts(
        artifact_type="EXPERIENCE_REVIEW",
        stage="experience_review",
        status="approved",
    )
    artifact_projection_path = sandbox_root / "state" / "workbuddy-bridge" / "artifact-projection.v1.json"
    artifact_projection = _read_json_file(artifact_projection_path)

    snapshot = {
        "label": label,
        "original_project_root": str(original_root),
        "sandbox_project_root": str(sandbox_root),
        "healthcheck": health,
        "project_state": {
            "current_state": state.get("current_state"),
            "available_transitions": state.get("available_transitions", []),
            "baseline_tag": state.get("baseline_tag"),
            "semantic_aliases": state.get("semantic_aliases", {}),
        },
        "alias_query": {
            "artifact_type": "EXPERIENCE_REVIEW",
            "stage": "experience_review",
            "status": "approved",
            "count": len(alias_artifacts),
            "sample": alias_artifacts[:3],
        },
        "artifact_projection": {
            "exists": artifact_projection is not None,
            "registry": (artifact_projection or {}).get("registry", {}),
            "baseline": (artifact_projection or {}).get("baseline", {}),
            "semantic_aliases": (artifact_projection or {}).get("semantic_aliases", {}),
        },
    }
    snapshot["auto_structure_score"] = _structure_score(snapshot)
    return snapshot


def _read_json_file(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def _run_case(
    *,
    case_id: str,
    lane: str,
    title: str,
    max_score: int,
    label: str,
    evaluator,
) -> dict[str, Any]:
    try:
        data = evaluator()
        checks = data.pop("checks")
        score = _score_from_checks(checks, max_score=max_score)
        passed = all(checks.values())
        summary = data.pop("summary", _default_case_summary(checks))
        return {
            "label": label,
            "case_id": case_id,
            "lane": lane,
            "title": title,
            "passed": passed,
            "score": score,
            "max_score": max_score,
            "checks": checks,
            "summary": summary,
            "details": data,
        }
    except Exception as exc:  # pragma: no cover - 保护性分支
        return {
            "label": label,
            "case_id": case_id,
            "lane": lane,
            "title": title,
            "passed": False,
            "score": 0,
            "max_score": max_score,
            "checks": {},
            "summary": f"执行异常：{exc}",
            "details": {"error": repr(exc)},
        }


def _default_case_summary(checks: dict[str, bool]) -> str:
    if not checks:
        return "未返回检查项"
    passed_count = sum(1 for value in checks.values() if value)
    return f"{passed_count}/{len(checks)} 项检查通过"


def _score_from_checks(checks: dict[str, bool], *, max_score: int) -> int:
    if not checks:
        return 0
    passed_count = sum(1 for value in checks.values() if value)
    return round(max_score * passed_count / len(checks))


def _structure_score(snapshot: dict[str, Any]) -> int:
    health = snapshot.get("healthcheck", {})
    checks = {
        "roles_visible": int(health.get("roles_count", 0)) > 0,
        "current_state_visible": bool(snapshot.get("project_state", {}).get("current_state")),
        "artifacts_visible": int(health.get("artifacts_count", 0)) > 0,
        "baseline_visible": bool(health.get("baseline_tag")),
        "artifact_projection_visible": bool(snapshot.get("artifact_projection", {}).get("exists")),
    }
    return _score_from_checks(checks, max_score=15)


def _case_fe_readonly(project_root: Path) -> dict[str, Any]:
    project = AgentTeamProject(project_root)
    session = project.prepare_role_session_for_role(
        "frontend_engineer",
        "请前端评审当前关键页面的交互问题，并给出最小修复建议。",
        actor="lightweight_eval",
    )
    workflow = session.get("workflow", {})
    role_session = session.get("role_session", {})
    payload = session.get("execution_payload", {})
    checks = {
        "role_selected": payload.get("role_id") == "frontend_engineer",
        "workflow_created": str(workflow.get("workflow_id", "")).startswith("WF-"),
        "role_session_created": str(role_session.get("role_session_id", "")).startswith("RS-"),
        "project_state_injected": bool(session.get("project_state", {}).get("current_state")),
    }
    return {
        "checks": checks,
        "summary": "前端角色会话与执行 payload 可正常生成" if all(checks.values()) else "前端角色会话生成不完整",
        "workflow_id": workflow.get("workflow_id"),
        "role_session_id": role_session.get("role_session_id"),
        "mode": payload.get("mode"),
        "current_state": session.get("project_state", {}).get("current_state"),
    }


def _case_fe_experience_alias(project_root: Path) -> dict[str, Any]:
    project = AgentTeamProject(project_root)
    artifacts = project.list_artifacts(
        artifact_type="EXPERIENCE_REVIEW",
        stage="experience_review",
        status="approved",
    )
    first = artifacts[0] if artifacts else {}
    checks = {
        "alias_query_returns_results": len(artifacts) > 0,
        "artifact_type_hit": first.get("artifact_type") in {"UX_REVIEW_REPORT", "EXPERIENCE_REVIEW"},
        "artifact_alias_echoed": "EXPERIENCE_REVIEW" in first.get("semantic_artifact_type_aliases", []),
        "stage_alias_echoed": "experience_review" in first.get("semantic_stage_aliases", []),
    }
    return {
        "checks": checks,
        "summary": "体验词汇桥接对前端链路可见" if all(checks.values()) else "体验词汇桥接对前端链路不完整",
        "match_count": len(artifacts),
        "sample": artifacts[:2],
    }


def _case_be_readonly(project_root: Path) -> dict[str, Any]:
    project = AgentTeamProject(project_root)
    session = project.prepare_role_session_for_role(
        "backend_engineer",
        "请后端评审登录接口兼容性、异常码与数据契约风险。",
        actor="lightweight_eval",
    )
    workflow = session.get("workflow", {})
    role_session = session.get("role_session", {})
    payload = session.get("execution_payload", {})
    checks = {
        "role_selected": payload.get("role_id") == "backend_engineer",
        "workflow_created": str(workflow.get("workflow_id", "")).startswith("WF-"),
        "role_session_created": str(role_session.get("role_session_id", "")).startswith("RS-"),
        "project_state_injected": bool(session.get("project_state", {}).get("current_state")),
    }
    return {
        "checks": checks,
        "summary": "后端角色会话与执行 payload 可正常生成" if all(checks.values()) else "后端角色会话生成不完整",
        "workflow_id": workflow.get("workflow_id"),
        "role_session_id": role_session.get("role_session_id"),
        "mode": payload.get("mode"),
        "current_state": session.get("project_state", {}).get("current_state"),
    }


def _case_be_guard(project_root: Path) -> dict[str, Any]:
    project = AgentTeamProject(project_root)
    seeded_state = _seed_state(project, ["ux_review", "testing"])
    result = project.transition_state(
        to_state="change_request_received",
        triggered_by="backend_engineer",
        reason="轻量评测：验证变更守卫",
    )
    message = str(result.get("message", ""))
    checks = {
        "state_seeded": bool(seeded_state),
        "guard_blocks_without_cr": result.get("verdict") in {"requires_impact_assessment", "blocked"},
        "guard_reason_visible": "change_request_id" in message or "impact" in message.lower(),
    }
    return {
        "checks": checks,
        "summary": "后端治理守卫仍然生效" if all(checks.values()) else "后端治理守卫未完整体现",
        "seeded_state": seeded_state,
        "result": result,
    }


def _case_governance_state_alias(project_root: Path) -> dict[str, Any]:
    project = AgentTeamProject(project_root)
    seeded_state = _seed_state(project, ["testing"])
    result = project.transition_state(
        to_state="experience_review",
        triggered_by="qa_engineer",
        reason="轻量评测：验证体验阶段别名",
    )
    state = project.get_project_state()
    current_aliases = state.get("semantic_aliases", {}).get("current_state", [])
    checks = {
        "state_seeded": bool(seeded_state),
        "transition_allowed": result.get("verdict") == "allowed",
        "canonical_or_alias_state_reached": result.get("to_state") in {"ux_review", "experience_review"},
        "semantic_bridge_visible": bool(result.get("semantic_mapping")) or "experience_review" in current_aliases,
    }
    return {
        "checks": checks,
        "summary": "体验状态别名桥接可用" if all(checks.values()) else "体验状态别名桥接不完整",
        "seeded_state": seeded_state,
        "result": result,
        "state": {
            "current_state": state.get("current_state"),
            "semantic_aliases": state.get("semantic_aliases", {}),
        },
    }


def _case_governance_truth_visibility(snapshot: dict[str, Any]) -> dict[str, Any]:
    health = snapshot.get("healthcheck", {})
    artifact_projection = snapshot.get("artifact_projection", {})
    alias_query = snapshot.get("alias_query", {})
    checks = {
        "baseline_visible": bool(health.get("baseline_tag")),
        "artifact_projection_visible": bool(artifact_projection.get("exists")),
        "artifact_registry_non_empty": int(health.get("artifacts_count", 0)) > 0,
        "experience_alias_query_non_empty": int(alias_query.get("count", 0)) > 0,
    }
    return {
        "checks": checks,
        "summary": "共享真相层对 sidecar 已可见" if all(checks.values()) else "共享真相层可见性仍有缺口",
        "baseline_tag": health.get("baseline_tag"),
        "artifacts_count": health.get("artifacts_count"),
        "artifact_projection": artifact_projection,
    }


def _seed_state(project: AgentTeamProject, preferred_states: list[str]) -> str | None:
    known_states = project._known_state_names()
    selected = next((state for state in preferred_states if state in known_states), None)
    if not selected:
        return None
    project.state_machine.project_state.current_state = selected
    project._persist_state()
    return selected


def _build_group_summary(snapshot: dict[str, Any], cases: list[dict[str, Any]]) -> dict[str, Any]:
    case_map = {case["case_id"]: case for case in cases}
    frontend_score = sum(case_map[case_id]["score"] for case_id in ["FE-1", "FE-2"])
    backend_score = sum(case_map[case_id]["score"] for case_id in ["BE-1", "BE-2"])
    shared_governance_score = sum(case_map[case_id]["score"] for case_id in ["GOV-1", "GOV-2"])
    structure_score = int(snapshot.get("auto_structure_score", 0))
    auto_total = structure_score + frontend_score + backend_score + shared_governance_score
    hard_failures = _detect_hard_failures(snapshot, case_map)

    return {
        "label": snapshot["label"],
        "project_root": snapshot["original_project_root"],
        "auto_score_total": auto_total,
        "manual_review_pending": MANUAL_REVIEW_MAX_SCORE,
        "score_breakdown": {
            "structure": structure_score,
            "shared_governance": shared_governance_score,
            "frontend": frontend_score,
            "backend": backend_score,
            "manual_review_pending": MANUAL_REVIEW_MAX_SCORE,
        },
        "case_results": [
            {
                "case_id": case["case_id"],
                "score": case["score"],
                "max_score": case["max_score"],
                "passed": case["passed"],
                "summary": case["summary"],
            }
            for case in cases
        ],
        "hard_failures": hard_failures,
    }


def _detect_hard_failures(snapshot: dict[str, Any], case_map: dict[str, dict[str, Any]]) -> list[str]:
    failures: list[str] = []
    health = snapshot.get("healthcheck", {})
    if case_map.get("BE-2", {}).get("passed") is not True:
        failures.append("治理守卫链路未通过：缺少 change_request_id 时未稳定阻断")
    if int(health.get("artifacts_count", 0)) <= 0:
        failures.append("artifact registry 对运行时不可见")
    if case_map.get("GOV-1", {}).get("passed") is not True:
        failures.append("体验阶段 alias 桥接不完整")
    frontend_failed = sum(1 for case_id in ["FE-1", "FE-2"] if case_map.get(case_id, {}).get("passed") is not True)
    backend_failed = sum(1 for case_id in ["BE-1", "BE-2"] if case_map.get(case_id, {}).get("passed") is not True)
    if frontend_failed > 1:
        failures.append("前端关键 case 失败超过一半")
    if backend_failed > 1:
        failures.append("后端关键 case 失败超过一半")
    return failures


def _build_comparison(group_a: dict[str, Any], group_b: dict[str, Any]) -> dict[str, Any]:
    delta_total = group_b["auto_score_total"] - group_a["auto_score_total"]
    delta_frontend = group_b["score_breakdown"]["frontend"] - group_a["score_breakdown"]["frontend"]
    delta_backend = group_b["score_breakdown"]["backend"] - group_a["score_breakdown"]["backend"]
    if group_b["hard_failures"]:
        verdict = "blocked"
    elif (
        delta_total >= 8
        and delta_frontend >= 0
        and delta_backend >= 0
    ):
        verdict = "better"
    elif delta_total <= -8 and (delta_frontend < 0 or delta_backend < 0):
        verdict = "worse"
    else:
        verdict = "mixed"

    next_focus: list[str] = []
    if delta_frontend < 0:
        next_focus.append("优先补前端 lane：把 FE 角色上下文与 UX 产物桥接再做稳。")
    if delta_backend < 0:
        next_focus.append("优先补后端 lane：把 API / 数据契约 / CR-IA 只读链路再做稳。")
    if not next_focus and group_b["score_breakdown"]["shared_governance"] <= group_a["score_breakdown"]["shared_governance"]:
        next_focus.append("共享治理层收益不明显，建议继续补 CR / IA / audit logs 的只读 bridge。")
    if not next_focus:
        next_focus.append("当前自动评测已显示融合收益，下一步建议补 5 分钟人工复核，确认可理解 / 可追溯 / 可接力 / 可复盘。")

    return {
        "verdict": verdict,
        "auto_score_delta": delta_total,
        "frontend_delta": delta_frontend,
        "backend_delta": delta_backend,
        "hard_failures_in_b": group_b["hard_failures"],
        "next_focus": next_focus,
    }


def _render_scorecard(
    *,
    snapshot_a: dict[str, Any],
    snapshot_b: dict[str, Any],
    cases_a: list[dict[str, Any]],
    cases_b: list[dict[str, Any]],
    group_a_summary: dict[str, Any],
    group_b_summary: dict[str, Any],
    comparison: dict[str, Any],
    output_root: Path,
) -> str:
    case_map_a = {case["case_id"]: case for case in cases_a}
    case_map_b = {case["case_id"]: case for case in cases_b}
    all_case_ids = ["FE-1", "FE-2", "BE-1", "BE-2", "GOV-1", "GOV-2"]

    case_rows = "\n".join(
        "| {case_id} | {lane} | {score_a}/{max_a} | {score_b}/{max_b} | {delta:+d} | {summary_b} |".format(
            case_id=case_id,
            lane=case_map_b[case_id]["lane"],
            score_a=case_map_a[case_id]["score"],
            max_a=case_map_a[case_id]["max_score"],
            score_b=case_map_b[case_id]["score"],
            max_b=case_map_b[case_id]["max_score"],
            delta=case_map_b[case_id]["score"] - case_map_a[case_id]["score"],
            summary_b=case_map_b[case_id]["summary"],
        )
        for case_id in all_case_ids
    )

    next_focus_block = "\n".join(f"- {item}" for item in comparison["next_focus"])
    hard_failure_block = (
        "\n".join(f"- {item}" for item in comparison["hard_failures_in_b"]) if comparison["hard_failures_in_b"] else "- 无"
    )

    return f"""# Agent Team Lightweight Evaluation Scorecard

## 本次评测

- **A组**: {group_a_summary['label']}（`{group_a_summary['project_root']}`）
- **B组**: {group_b_summary['label']}（`{group_b_summary['project_root']}`）
- **输出目录**: `{output_root}`
- **自动结论**: **{comparison['verdict']}**
- **自动总分差值**: **{comparison['auto_score_delta']:+d}**

## 自动评分总览（满分 80，另有人审 20）

| 维度 | A组 | B组 | 差值 |
|---|---:|---:|---:|
| 结构快照 | {group_a_summary['score_breakdown']['structure']} | {group_b_summary['score_breakdown']['structure']} | {group_b_summary['score_breakdown']['structure'] - group_a_summary['score_breakdown']['structure']:+d} |
| 共享治理链路 | {group_a_summary['score_breakdown']['shared_governance']} | {group_b_summary['score_breakdown']['shared_governance']} | {group_b_summary['score_breakdown']['shared_governance'] - group_a_summary['score_breakdown']['shared_governance']:+d} |
| 前端 lane | {group_a_summary['score_breakdown']['frontend']} | {group_b_summary['score_breakdown']['frontend']} | {comparison['frontend_delta']:+d} |
| 后端 lane | {group_a_summary['score_breakdown']['backend']} | {group_b_summary['score_breakdown']['backend']} | {comparison['backend_delta']:+d} |
| **自动总分** | **{group_a_summary['auto_score_total']}** | **{group_b_summary['auto_score_total']}** | **{comparison['auto_score_delta']:+d}** |
| 人工复核（待补） | 20 | 20 | 0 |

## 结构快照对照

| 指标 | A组 | B组 |
|---|---|---|
| `roles_count` | {snapshot_a['healthcheck'].get('roles_count')} | {snapshot_b['healthcheck'].get('roles_count')} |
| `artifacts_count` | {snapshot_a['healthcheck'].get('artifacts_count')} | {snapshot_b['healthcheck'].get('artifacts_count')} |
| `current_state` | {snapshot_a['project_state'].get('current_state')} | {snapshot_b['project_state'].get('current_state')} |
| `baseline_tag` | {snapshot_a['healthcheck'].get('baseline_tag')} | {snapshot_b['healthcheck'].get('baseline_tag')} |
| `artifact_projection.exists` | {snapshot_a['artifact_projection'].get('exists')} | {snapshot_b['artifact_projection'].get('exists')} |
| `EXPERIENCE_REVIEW` 命中数 | {snapshot_a['alias_query'].get('count')} | {snapshot_b['alias_query'].get('count')} |

## Golden Cases 对照

| Case | Lane | A组 | B组 | 差值 | B组观察 |
|---|---|---:|---:|---:|---|
{case_rows}

## B组硬门槛风险

{hard_failure_block}

## 待补人工复核（20 分）

| 项目 | A组(1-5) | B组(1-5) | 备注 |
|---|---:|---:|---|
| 可理解：是否容易看懂当前状态与责任人 |  |  |  |
| 可追溯：是否容易追到 artifact / baseline / change 线索 |  |  |  |
| 可接力：前后端角色是否容易继续承接 |  |  |  |
| 可复盘：是否更容易解释为什么这样路由/推进 |  |  |  |

## 建议关注点

{next_focus_block}

## 产出文件

- `{SNAPSHOT_FILENAME_A}`
- `{SNAPSHOT_FILENAME_B}`
- `{CASES_FILENAME}`
- `{SCORECARD_FILENAME}`
"""
