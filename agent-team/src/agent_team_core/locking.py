from __future__ import annotations

import fcntl
import time
from contextlib import ExitStack, contextmanager
from pathlib import Path
from typing import Iterator


class FileLockManager:
    """Simple POSIX file-lock manager for project-scoped write serialization."""

    def __init__(
        self,
        project_root: str | Path,
        relative_dir: str = ".agent-team-locks",
        timeout_seconds: float = 10.0,
        poll_interval_seconds: float = 0.05,
    ):
        self.project_root = Path(project_root).resolve()
        self.locks_dir = self.project_root / relative_dir
        self.timeout_seconds = timeout_seconds
        self.poll_interval_seconds = poll_interval_seconds

    def _lock_path(self, name: str) -> Path:
        safe_name = name.replace("/", "-").replace(" ", "-")
        return self.locks_dir / f"{safe_name}.lock"

    @contextmanager
    def acquire(self, name: str) -> Iterator[Path]:
        self.locks_dir.mkdir(parents=True, exist_ok=True)
        lock_path = self._lock_path(name)
        started = time.monotonic()

        with open(lock_path, "a+", encoding="utf-8") as handle:
            while True:
                try:
                    fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    if time.monotonic() - started >= self.timeout_seconds:
                        raise TimeoutError(f"Timed out waiting for lock: {name}")
                    time.sleep(self.poll_interval_seconds)

            try:
                yield lock_path
            finally:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)

    @contextmanager
    def acquire_many(self, *names: str) -> Iterator[tuple[str, ...]]:
        ordered_names = tuple(sorted(set(names)))
        with ExitStack() as stack:
            for name in ordered_names:
                stack.enter_context(self.acquire(name))
            yield ordered_names
