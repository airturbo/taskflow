from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

from .master_preferences import sync_project_master_preferences

ROOT_DIRS_TO_COPY = [
    "configs",
    "docs",
    "roles",
    "runtime",
    "scripts",
    "src",
    "templates",
    "tests",
]
ROOT_FILES_TO_COPY = [
    ".env.example",
    ".gitignore",
    "README.md",
    "bootstrap-manifest.v1.json",
    "pyproject.toml",
    "setup.py",
]
IGNORE_PATTERNS = shutil.ignore_patterns("__pycache__", "*.pyc", ".DS_Store", ".venv", "build", ".pytest_cache")


def _copy_template_items(template_root: Path, project_root: Path) -> list[str]:
    copied: list[str] = []
    for name in ROOT_DIRS_TO_COPY:
        source = template_root / name
        if not source.exists():
            continue
        shutil.copytree(source, project_root / name, ignore=IGNORE_PATTERNS)
        copied.append(name)

    for name in ROOT_FILES_TO_COPY:
        source = template_root / name
        if not source.exists():
            continue
        destination = project_root / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        copied.append(name)

    return copied


def _clean_project_root(project_root: Path) -> None:
    for name in ["artifacts", "logs", "state", ".codebuddy", "knowledge"]:
        target = project_root / name
        if target.exists():
            shutil.rmtree(target)


def _read_registry_template(template_root: Path) -> dict[str, Any]:
    registry_path = template_root / "artifacts" / "registry" / "artifact-registry.v1.json"
    if not registry_path.exists():
        return {
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
    data = json.loads(registry_path.read_text(encoding="utf-8"))
    return {
        "schema_version": data.get("schema_version", "1.0"),
        "registry_name": data.get("registry_name", "agent-team-artifact-registry"),
        "phase": data.get("phase", "phase1"),
        "governance": data.get("governance", {}),
        "artifacts": [],
    }


def _artifact_type_names(template_root: Path) -> list[str]:
    base_dir = template_root / "artifacts" / "by-type"
    if not base_dir.exists():
        return []
    return sorted(path.name for path in base_dir.iterdir() if path.is_dir())


def _role_folder_names(project_root: Path) -> list[str]:
    roles_dir = project_root / "roles"
    if not roles_dir.exists():
        return []
    return sorted(path.name for path in roles_dir.iterdir() if path.is_dir())


def _write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _write_json(path: Path, data: dict[str, Any]) -> None:
    _write_text(path, json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def _seed_runtime_state(template_root: Path, project_root: Path) -> dict[str, str]:
    artifacts_root = project_root / "artifacts"
    logs_root = project_root / "logs"
    state_root = project_root / "state"

    artifacts_root.mkdir(parents=True, exist_ok=True)
    logs_root.mkdir(parents=True, exist_ok=True)
    state_root.mkdir(parents=True, exist_ok=True)

    _write_json(artifacts_root / "registry" / "artifact-registry.v1.json", _read_registry_template(template_root))
    for artifact_type in _artifact_type_names(template_root):
        (artifacts_root / "by-type" / artifact_type).mkdir(parents=True, exist_ok=True)
    for role_folder in _role_folder_names(project_root):
        (artifacts_root / "by-role" / role_folder).mkdir(parents=True, exist_ok=True)
    (artifacts_root / "archive").mkdir(parents=True, exist_ok=True)

    logs_readme = template_root / "logs" / "README.md"
    if logs_readme.exists():
        shutil.copy2(logs_readme, logs_root / "README.md")
    for name in ["change-requests", "impact-assessments", "rollbacks", "audit"]:
        (logs_root / name).mkdir(parents=True, exist_ok=True)

    _write_json(
        project_root / "configs" / "baselines" / "baseline.current.v1.json",
        {
            "schema_version": "1.0",
            "baseline_tag": None,
            "frozen_at": None,
            "artifacts": [],
        },
    )
    _write_text(project_root / "configs" / "baselines" / "baseline.history.v1.jsonl", "")
    _write_json(
        state_root / "project-state.v1.json",
        {
            "schema_version": "1.0",
            "current_state": "intake",
            "baseline_tag": None,
            "history": [],
        },
    )

    return {
        "artifact_registry": str(artifacts_root / "registry" / "artifact-registry.v1.json"),
        "baseline_current": str(project_root / "configs" / "baselines" / "baseline.current.v1.json"),
        "baseline_history": str(project_root / "configs" / "baselines" / "baseline.history.v1.jsonl"),
        "project_state": str(state_root / "project-state.v1.json"),
    }


def _create_virtualenv(project_root: Path, python_bin: str | None = None) -> dict[str, Any]:
    chosen_python = str(Path(python_bin).expanduser()) if python_bin else sys.executable
    venv_python = project_root / ".venv" / "bin" / "python"
    pip_bin = project_root / ".venv" / "bin" / "pip"

    subprocess.run([chosen_python, "-m", "venv", str(project_root / ".venv")], check=True)
    subprocess.run([str(pip_bin), "install", "--upgrade", "pip"], check=True, cwd=str(project_root))
    subprocess.run([str(pip_bin), "install", "."], check=True, cwd=str(project_root))

    return {
        "python": str(venv_python),
        "pip": str(pip_bin),
        "installed": True,
    }


def initialize_project_from_template(
    *,
    template_root: str | Path,
    workspace_root: str | Path,
    project_dir_name: str = "agent-team",
    shared_preferences_dir: str | Path | None = None,
    owner_name: str = "Master",
    install_venv: bool = False,
    python_bin: str | None = None,
) -> dict[str, Any]:
    template_root_path = Path(template_root).resolve()
    workspace_root_path = Path(workspace_root).expanduser().resolve()
    workspace_root_path.mkdir(parents=True, exist_ok=True)

    project_root = workspace_root_path / project_dir_name
    if project_root.exists() and any(project_root.iterdir()):
        raise FileExistsError(f"目标目录已存在且非空：{project_root}")
    project_root.mkdir(parents=True, exist_ok=True)

    copied_items = _copy_template_items(template_root_path, project_root)
    _clean_project_root(project_root)
    seeded_files = _seed_runtime_state(template_root_path, project_root)
    preferences = sync_project_master_preferences(project_root, shared_preferences_dir, owner_name=owner_name)

    venv_result: dict[str, Any] = {"installed": False}
    if install_venv:
        venv_result = _create_virtualenv(project_root, python_bin=python_bin)

    return {
        "template_root": str(template_root_path),
        "workspace_root": str(workspace_root_path),
        "project_root": str(project_root),
        "project_dir_name": project_dir_name,
        "copied_items": copied_items,
        "seeded_files": seeded_files,
        "master_preferences": preferences,
        "virtualenv": venv_result,
    }
