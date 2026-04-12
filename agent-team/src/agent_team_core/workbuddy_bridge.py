from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import yaml

REFERENCE_FILE_MAP = {
    "ux-governance-rules.v1.md": "ux-governance-rules.md",
    "ux-review-sop.v1.md": "ux-review-sop.md",
    "ux-review-templates.v1.md": "ux-review-templates.md",
    "ux-review-examples.v1.md": "ux-review-examples.md",
}

RUNTIME_REGISTRY_LAYOUT = {
    "workflows": "workflow-registry.v1.json",
    "role-sessions": "role-session-registry.v1.json",
    "handoffs": "handoff-registry.v1.json",
    "execution-runs": "execution-run-registry.v1.json",
}

STATE_ALIAS_GROUPS: tuple[tuple[str, ...], ...] = (
    ("ux_review", "experience_review"),
)

STAGE_ALIAS_GROUPS: tuple[tuple[str, ...], ...] = (
    ("ux_review", "experience_review"),
)

ARTIFACT_TYPE_ALIAS_GROUPS: tuple[tuple[str, ...], ...] = (
    ("UX_REVIEW_REPORT", "EXPERIENCE_REVIEW"),
    ("UX_ISSUE_LOG", "EXPERIENCE_REWORK_NOTE"),
    ("EXPERIENCE_ACCEPTANCE_NOTE", "EXPERIENCE_SIGN_OFF"),
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def infer_workbuddy_root(project_root: str | Path, workbuddy_root: str | Path | None = None) -> Path:
    if workbuddy_root:
        candidate = Path(workbuddy_root).expanduser()
    else:
        candidate = Path(project_root).resolve().parent / ".agent-team"
    candidate = candidate.resolve()
    if not candidate.exists():
        raise FileNotFoundError(f"WorkBuddy 真相层目录不存在：{candidate}")
    return candidate


def _write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _write_yaml(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data, allow_unicode=True, sort_keys=False), encoding="utf-8")


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    records: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        text = line.strip()
        if not text:
            continue
        records.append(json.loads(text))
    return records


def _hyphenate_role_folder(role_id: str) -> str:
    return role_id.replace("_", "-")


def _resolve_semantic_alias(
    value: str | None,
    known_values: Iterable[str] | None,
    alias_groups: tuple[tuple[str, ...], ...],
) -> str | None:
    if value is None:
        return None
    normalized = str(value)
    known = {str(item) for item in (known_values or []) if str(item).strip()}
    if not known or normalized in known:
        return normalized
    for group in alias_groups:
        if normalized not in group:
            continue
        for candidate in group:
            if candidate in known:
                return candidate
    return normalized


def _semantic_aliases_for_value(value: str | None, alias_groups: tuple[tuple[str, ...], ...]) -> list[str]:
    if value is None:
        return []
    normalized = str(value)
    for group in alias_groups:
        if normalized in group:
            return [candidate for candidate in group if candidate != normalized]
    return []


def resolve_state_alias(value: str | None, known_states: Iterable[str] | None = None) -> str | None:
    return _resolve_semantic_alias(value, known_states, STATE_ALIAS_GROUPS)


def resolve_stage_alias(value: str | None, known_stages: Iterable[str] | None = None) -> str | None:
    return _resolve_semantic_alias(value, known_stages, STAGE_ALIAS_GROUPS)


def resolve_artifact_type_alias(value: str | None, known_types: Iterable[str] | None = None) -> str | None:
    return _resolve_semantic_alias(value, known_types, ARTIFACT_TYPE_ALIAS_GROUPS)


def semantic_aliases_for_state(value: str | None) -> list[str]:
    return _semantic_aliases_for_value(value, STATE_ALIAS_GROUPS)


def semantic_aliases_for_stage(value: str | None) -> list[str]:
    return _semantic_aliases_for_value(value, STAGE_ALIAS_GROUPS)


def semantic_aliases_for_artifact_type(value: str | None) -> list[str]:
    return _semantic_aliases_for_value(value, ARTIFACT_TYPE_ALIAS_GROUPS)


def _load_workbuddy_roles(source_root: Path) -> dict[str, Any]:
    roles_path = source_root / "roles" / "roles.v1.yaml"
    if not roles_path.exists():
        raise FileNotFoundError(f"缺少 WorkBuddy 角色总表：{roles_path}")
    data = yaml.safe_load(roles_path.read_text(encoding="utf-8")) or {}
    roles = data.get("roles") or {}
    if not isinstance(roles, dict) or not roles:
        raise ValueError(f"WorkBuddy 角色总表为空或格式非法：{roles_path}")
    return roles


def sync_workbuddy_roles(project_root: str | Path, workbuddy_root: str | Path | None = None) -> dict[str, Any]:
    project_root_path = Path(project_root).resolve()
    source_root = infer_workbuddy_root(project_root_path, workbuddy_root)
    roles = _load_workbuddy_roles(source_root)

    written_roles: list[dict[str, str]] = []
    for role_id, spec in roles.items():
        role_dir = project_root_path / "roles" / _hyphenate_role_folder(role_id)
        role_dir.mkdir(parents=True, exist_ok=True)

        profile = {
            key: value
            for key, value in spec.items()
            if key not in {"permissions", "query_playbook", "system_prompt"}
        }
        profile["role_id"] = role_id

        _write_json(role_dir / "role.profile.json", profile)
        _write_yaml(role_dir / "permissions.yaml", spec.get("permissions") or {})
        _write_yaml(role_dir / "query-playbook.yaml", spec.get("query_playbook") or {})

        prompt_text = str(spec.get("system_prompt") or "").rstrip() + "\n"
        (role_dir / "prompt.system.md").write_text(prompt_text, encoding="utf-8")

        written_roles.append(
            {
                "role_id": role_id,
                "role_folder": role_dir.name,
                "profile": str(role_dir / "role.profile.json"),
                "permissions": str(role_dir / "permissions.yaml"),
                "query_playbook": str(role_dir / "query-playbook.yaml"),
                "prompt": str(role_dir / "prompt.system.md"),
            }
        )

    return {
        "source": str(source_root / "roles" / "roles.v1.yaml"),
        "synced_count": len(written_roles),
        "roles": written_roles,
    }


def sync_workbuddy_configs(project_root: str | Path, workbuddy_root: str | Path | None = None) -> dict[str, Any]:
    project_root_path = Path(project_root).resolve()
    source_root = infer_workbuddy_root(project_root_path, workbuddy_root)
    source_global = source_root / "configs" / "global"
    target_global = project_root_path / "configs" / "global"

    copied: list[dict[str, str]] = []
    for filename in ["router-config.v1.yaml", "state-machine.v1.yaml"]:
        source_path = source_global / filename
        if not source_path.exists():
            raise FileNotFoundError(f"缺少 WorkBuddy 全局配置：{source_path}")
        target_path = target_global / filename
        target_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_path, target_path)
        copied.append({"source": str(source_path), "target": str(target_path)})

    return {
        "copied_files": copied,
    }


def _ensure_runtime_registry(target_root: Path, directory_name: str, registry_name: str) -> dict[str, str]:
    registry_dir = target_root / "state" / directory_name
    by_id_dir = registry_dir / "by-id"
    by_id_dir.mkdir(parents=True, exist_ok=True)
    registry_path = registry_dir / registry_name
    if not registry_path.exists():
        _write_json(registry_path, {"schema_version": "1.0", "items": []})
    return {
        "registry": str(registry_path),
        "by_id_dir": str(by_id_dir),
    }


def sync_workbuddy_state(project_root: str | Path, workbuddy_root: str | Path | None = None) -> dict[str, Any]:
    project_root_path = Path(project_root).resolve()
    source_root = infer_workbuddy_root(project_root_path, workbuddy_root)
    source_path = source_root / "configs" / "global" / "project-state.v1.json"
    if not source_path.exists():
        raise FileNotFoundError(f"缺少 WorkBuddy 项目状态文件：{source_path}")

    source_state = _read_json(source_path)
    mirrored_state = {
        "schema_version": str(source_state.get("schema_version") or "1.0"),
        "current_state": source_state.get("current_state", "intake"),
        "baseline_tag": source_state.get("baseline_tag"),
        "history": source_state.get("history", []),
        "bridge_metadata": {
            "source_of_truth": str(source_path),
            "mirrored_at": _now_iso(),
        },
    }

    target_path = project_root_path / "state" / "project-state.v1.json"
    _write_json(target_path, mirrored_state)

    registries = {
        name: _ensure_runtime_registry(project_root_path, name, registry_name)
        for name, registry_name in RUNTIME_REGISTRY_LAYOUT.items()
    }

    return {
        "source": str(source_path),
        "target": str(target_path),
        "current_state": mirrored_state["current_state"],
        "baseline_tag": mirrored_state["baseline_tag"],
        "history_count": len(mirrored_state["history"]),
        "runtime_registries": registries,
    }


def _latest_artifacts_by_id(artifacts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    latest_by_id: dict[str, dict[str, Any]] = {}
    for item in artifacts:
        artifact_id = str(item.get("artifact_id") or "").strip()
        if not artifact_id:
            continue
        latest_by_id[artifact_id] = item
    return [latest_by_id[key] for key in sorted(latest_by_id)]


def _write_artifact_projection(
    project_root_path: Path,
    *,
    registry_source: Path,
    registry_target: Path,
    baseline_current_source: Path,
    baseline_current_target: Path,
    baseline_history_source: Path,
    baseline_history_target: Path,
) -> Path:
    registry_data = _read_json(registry_target)
    artifacts = list(registry_data.get("artifacts") or [])
    baseline_current = _read_json(baseline_current_target)
    baseline_history = _read_jsonl(baseline_history_target)
    latest_artifacts = _latest_artifacts_by_id(artifacts)

    projection = {
        "schema_version": "1.0",
        "generated_at": _now_iso(),
        "source_of_truth": {
            "registry": str(registry_source),
            "baseline_current": str(baseline_current_source),
            "baseline_history": str(baseline_history_source),
        },
        "mirrored_files": {
            "registry": str(registry_target),
            "baseline_current": str(baseline_current_target),
            "baseline_history": str(baseline_history_target),
        },
        "registry": {
            "artifact_count": len(artifacts),
            "artifact_types": sorted({str(item.get("artifact_type")) for item in artifacts if item.get("artifact_type")}),
            "owner_roles": sorted({str(item.get("owner_role")) for item in artifacts if item.get("owner_role")}),
            "stages": sorted({str(item.get("stage")) for item in artifacts if item.get("stage")}),
            "latest_by_artifact_id": latest_artifacts,
        },
        "baseline_current": baseline_current,
        "baseline_history_count": len(baseline_history),
        "semantic_aliases": {
            "states": {"ux_review": semantic_aliases_for_state("ux_review")},
            "artifact_types": {
                "UX_REVIEW_REPORT": semantic_aliases_for_artifact_type("UX_REVIEW_REPORT"),
                "UX_ISSUE_LOG": semantic_aliases_for_artifact_type("UX_ISSUE_LOG"),
                "EXPERIENCE_ACCEPTANCE_NOTE": semantic_aliases_for_artifact_type("EXPERIENCE_ACCEPTANCE_NOTE"),
            },
        },
    }
    projection_path = project_root_path / "state" / "workbuddy-bridge" / "artifact-projection.v1.json"
    _write_json(projection_path, projection)
    return projection_path


def sync_workbuddy_artifacts(project_root: str | Path, workbuddy_root: str | Path | None = None) -> dict[str, Any]:
    project_root_path = Path(project_root).resolve()
    source_root = infer_workbuddy_root(project_root_path, workbuddy_root)
    source_artifacts_root = source_root / "artifacts"
    source_registry = source_artifacts_root / "registry" / "artifact-registry.v1.json"
    if not source_registry.exists():
        raise FileNotFoundError(f"缺少 WorkBuddy artifact registry：{source_registry}")

    target_artifacts_root = project_root_path / "artifacts"
    copied_directories: list[dict[str, str]] = []
    for dirname in ["by-type", "by-role", "archive"]:
        source_dir = source_artifacts_root / dirname
        if not source_dir.exists():
            continue
        target_dir = target_artifacts_root / dirname
        target_dir.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(source_dir, target_dir, dirs_exist_ok=True)
        copied_directories.append({"source": str(source_dir), "target": str(target_dir)})

    target_registry = target_artifacts_root / "registry" / "artifact-registry.v1.json"
    target_registry.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_registry, target_registry)

    source_baselines_root = source_root / "configs" / "baselines"
    source_baseline_current = source_baselines_root / "baseline.current.v1.json"
    if not source_baseline_current.exists():
        raise FileNotFoundError(f"缺少 WorkBuddy baseline current：{source_baseline_current}")
    source_baseline_history = source_baselines_root / "baseline.history.v1.jsonl"

    target_baselines_root = project_root_path / "configs" / "baselines"
    target_baselines_root.mkdir(parents=True, exist_ok=True)
    target_baseline_current = target_baselines_root / "baseline.current.v1.json"
    target_baseline_history = target_baselines_root / "baseline.history.v1.jsonl"
    shutil.copy2(source_baseline_current, target_baseline_current)
    if source_baseline_history.exists():
        shutil.copy2(source_baseline_history, target_baseline_history)
    else:
        target_baseline_history.write_text("", encoding="utf-8")

    copied_views: list[dict[str, str]] = []
    source_views_root = source_root / "views"
    target_views_root = project_root_path / "views"
    if source_views_root.exists():
        shutil.copytree(source_views_root, target_views_root, dirs_exist_ok=True)
        for source_path in sorted(source_views_root.rglob("*")):
            if source_path.is_dir():
                continue
            copied_views.append(
                {
                    "source": str(source_path),
                    "target": str(target_views_root / source_path.relative_to(source_views_root)),
                }
            )

    projection_path = _write_artifact_projection(
        project_root_path,
        registry_source=source_registry,
        registry_target=target_registry,
        baseline_current_source=source_baseline_current,
        baseline_current_target=target_baseline_current,
        baseline_history_source=source_baseline_history,
        baseline_history_target=target_baseline_history,
    )

    registry_data = _read_json(target_registry)
    artifacts = list(registry_data.get("artifacts") or [])
    baseline_current = _read_json(target_baseline_current)

    return {
        "source": {
            "registry": str(source_registry),
            "baseline_current": str(source_baseline_current),
            "baseline_history": str(source_baseline_history),
        },
        "target": {
            "registry": str(target_registry),
            "baseline_current": str(target_baseline_current),
            "baseline_history": str(target_baseline_history),
        },
        "copied_directories": copied_directories,
        "copied_views": copied_views,
        "artifact_count": len(artifacts),
        "latest_artifact_count": len(_latest_artifacts_by_id(artifacts)),
        "artifact_types": sorted({str(item.get("artifact_type")) for item in artifacts if item.get("artifact_type")}),
        "baseline_tag": baseline_current.get("baseline_tag"),
        "projection_file": str(projection_path),
    }


def sync_workbuddy_references(project_root: str | Path, workbuddy_root: str | Path | None = None) -> dict[str, Any]:
    project_root_path = Path(project_root).resolve()
    source_root = infer_workbuddy_root(project_root_path, workbuddy_root)
    source_global = source_root / "configs" / "global"
    target_root = project_root_path / "references"

    copied: list[dict[str, str]] = []
    for source_name, target_name in REFERENCE_FILE_MAP.items():
        source_path = source_global / source_name
        if not source_path.exists():
            raise FileNotFoundError(f"缺少 WorkBuddy UX 参考文件：{source_path}")
        target_path = target_root / target_name
        target_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_path, target_path)
        copied.append({"source": str(source_path), "target": str(target_path)})

    return {
        "copied_files": copied,
    }


def sync_from_workbuddy(
    project_root: str | Path,
    *,
    workbuddy_root: str | Path | None = None,
    sync_roles: bool = True,
    sync_configs: bool = True,
    sync_state: bool = True,
    sync_artifacts: bool = True,
    sync_references: bool = True,
) -> dict[str, Any]:
    project_root_path = Path(project_root).resolve()
    source_root = infer_workbuddy_root(project_root_path, workbuddy_root)

    result: dict[str, Any] = {
        "project_root": str(project_root_path),
        "workbuddy_root": str(source_root),
        "synced_at": _now_iso(),
    }

    if sync_roles:
        result["roles"] = sync_workbuddy_roles(project_root_path, source_root)
    if sync_configs:
        result["configs"] = sync_workbuddy_configs(project_root_path, source_root)
    if sync_state:
        result["state"] = sync_workbuddy_state(project_root_path, source_root)
    if sync_artifacts:
        result["artifacts"] = sync_workbuddy_artifacts(project_root_path, source_root)
    if sync_references:
        result["references"] = sync_workbuddy_references(project_root_path, source_root)

    manifest_path = project_root_path / "state" / "workbuddy-bridge" / "last-sync-summary.v1.json"
    _write_json(manifest_path, result)
    result["manifest_file"] = str(manifest_path)
    return result
