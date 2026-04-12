from __future__ import annotations

import importlib
import sys
from contextlib import contextmanager
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from types import ModuleType
from typing import Iterator


@dataclass(frozen=True)
class LegacyRuntimeModules:
    bootstrap: ModuleType
    router: ModuleType
    state_machine: ModuleType
    artifact_service: ModuleType
    logger: ModuleType


@contextmanager
def _prepend_sys_path(path: Path) -> Iterator[None]:
    path_str = str(path)
    sys.path.insert(0, path_str)
    try:
        yield
    finally:
        try:
            sys.path.remove(path_str)
        except ValueError:
            pass


def _import_from_path(module_name: str, search_path: Path) -> ModuleType:
    if not search_path.exists():
        raise FileNotFoundError(f"Legacy runtime path not found: {search_path}")

    with _prepend_sys_path(search_path):
        if module_name in sys.modules:
            return importlib.reload(sys.modules[module_name])
        return importlib.import_module(module_name)


@lru_cache(maxsize=None)
def load_legacy_runtime(project_root_str: str) -> LegacyRuntimeModules:
    project_root = Path(project_root_str).resolve()
    runtime_root = project_root / "runtime"

    return LegacyRuntimeModules(
        bootstrap=_import_from_path("bootstrap", runtime_root),
        router=_import_from_path("router", runtime_root / "router"),
        state_machine=_import_from_path("state_machine", runtime_root / "state-machine"),
        artifact_service=_import_from_path("artifact_service", runtime_root / "artifact-service"),
        logger=_import_from_path("logger", runtime_root / "logger"),
    )
