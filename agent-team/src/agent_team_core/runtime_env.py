from __future__ import annotations

import os
from pathlib import Path
from typing import Any


def _strip_quotes(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
        return value[1:-1]
    return value


def load_project_env(
    project_root: str | Path,
    *,
    filename: str = ".env",
    override: bool = False,
) -> dict[str, Any]:
    env_path = Path(project_root).resolve() / filename
    loaded_keys: list[str] = []

    if not env_path.exists():
        return {
            "path": str(env_path),
            "exists": False,
            "loaded_keys": loaded_keys,
        }

    with open(env_path, "r", encoding="utf-8") as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                line = line[len("export ") :].strip()
            if "=" not in line:
                continue

            key, value = line.split("=", 1)
            key = key.strip()
            if not key:
                continue

            if not override and key in os.environ:
                continue

            os.environ[key] = _strip_quotes(value)
            loaded_keys.append(key)

    return {
        "path": str(env_path),
        "exists": True,
        "loaded_keys": loaded_keys,
    }
