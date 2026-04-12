from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

ACTIVE_START = "<!-- MASTER_PREFERENCES:ACTIVE:START -->"
ACTIVE_END = "<!-- MASTER_PREFERENCES:ACTIVE:END -->"
PLACEHOLDER_LINE = "- 暂无记录。建议从你在项目里多次强调的风格、边界、验收口径开始沉淀。"


def default_shared_preferences_dir() -> Path:
    return (Path.home() / ".codebuddy" / "agent-team" / "master-preferences").resolve()


def resolve_shared_preferences_dir(shared_preferences_dir: str | Path | None = None) -> Path:
    if shared_preferences_dir is None:
        return default_shared_preferences_dir()
    return Path(shared_preferences_dir).expanduser().resolve()


def shared_preferences_file(shared_dir: str | Path) -> Path:
    return Path(shared_dir).resolve() / "master-preferences.md"


def shared_preferences_readme(shared_dir: str | Path) -> Path:
    return Path(shared_dir).resolve() / "README.md"


def shared_preferences_records_dir(shared_dir: str | Path) -> Path:
    return Path(shared_dir).resolve() / "records"


def project_preferences_dir(project_root: str | Path) -> Path:
    return Path(project_root).resolve() / "knowledge" / "master-preferences"


def project_preferences_snapshot_path(project_root: str | Path) -> Path:
    return project_preferences_dir(project_root) / "master-preferences.snapshot.md"


def project_preferences_override_path(project_root: str | Path) -> Path:
    return project_preferences_dir(project_root) / "project-overrides.md"


def project_preferences_readme_path(project_root: str | Path) -> Path:
    return project_preferences_dir(project_root) / "README.md"


def _now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def _write_text_if_missing(path: Path, content: str) -> bool:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        return False
    path.write_text(content, encoding="utf-8")
    return True


def _shared_readme_content(owner_name: str) -> str:
    return f"""# Master Preferences Store

这是 `{owner_name}` 的跨项目偏好沉淀库。

## 目录说明

- `master-preferences.md`：面向新项目与角色执行的当前有效偏好摘要
- `records/`：每次新增偏好的原始记录，便于追溯来源与演进

## 推荐使用方式

1. 当你在某个项目里反复强调一类要求时，调用 `agent-team record-master-preference` 记录下来。
2. 新项目初始化时，`agent-team init-project` 会自动把当前共享偏好快照同步到项目内。
3. 如果共享偏好有更新，可在已有项目中执行 `agent-team sync-master-preferences` 刷新快照。

## 维护建议

- `master-preferences.md` 追求“稳定且高频”的偏好，不要把临时需求也塞进来。
- 具体项目的临时偏好，优先写在项目内的 `knowledge/master-preferences/project-overrides.md`。
- 若某些偏好已经过时，直接在 `master-preferences.md` 中整理或删除即可。
"""


def _shared_preferences_seed(owner_name: str) -> str:
    return f"""# {owner_name} Master Preferences

> 这是跨项目共享的偏好摘要。
> 当前项目没有明确覆盖时，团队应优先贴合这些偏好；若与本轮明确指令冲突，以本轮明确指令为准。

## Active Preferences
{ACTIVE_START}
{PLACEHOLDER_LINE}
{ACTIVE_END}

## Maintenance Notes

- 建议保留“长期有效、跨项目复用”的偏好
- 临时项目偏好请沉淀到各项目的 `project-overrides.md`
- 可定期手工整理本文件，把重复偏好合并为更高质量的原则表达
"""


def _project_preferences_readme(shared_dir: Path) -> str:
    return f"""# Master Preferences Knowledge

本目录用于把跨项目偏好引入当前项目，并补充当前项目的个性化偏好。

## 文件说明

- `master-preferences.snapshot.md`：从共享偏好库同步过来的快照
- `project-overrides.md`：当前项目额外补充的偏好与验收口径

## 当前共享来源

- `{shared_preferences_file(shared_dir)}`

## 运行方式

`agent-team` 在生成 `execution_payload` 时，会自动把上述两份文件注入角色上下文。
因此角色在回答和产出制品时，会优先参考这些偏好。
"""


def _project_overrides_seed() -> str:
    return """# Project Overrides

> 仅记录当前项目额外需要强调的偏好。
> 若与共享偏好冲突，以当前项目明确要求为准。

## 当前项目补充偏好

- 暂无。建议补充当前项目特有的输出格式、验收口径、沟通节奏、风险偏好等。
"""


def ensure_shared_preferences_store(
    shared_preferences_dir: str | Path | None = None,
    *,
    owner_name: str = "Master",
) -> dict[str, Any]:
    shared_dir = resolve_shared_preferences_dir(shared_preferences_dir)
    records_dir = shared_preferences_records_dir(shared_dir)
    records_dir.mkdir(parents=True, exist_ok=True)

    created_files: list[str] = []
    if _write_text_if_missing(shared_preferences_readme(shared_dir), _shared_readme_content(owner_name)):
        created_files.append(str(shared_preferences_readme(shared_dir)))
    if _write_text_if_missing(shared_preferences_file(shared_dir), _shared_preferences_seed(owner_name)):
        created_files.append(str(shared_preferences_file(shared_dir)))

    return {
        "shared_preferences_dir": str(shared_dir),
        "master_preferences_file": str(shared_preferences_file(shared_dir)),
        "records_dir": str(records_dir),
        "created_files": created_files,
    }


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9\u4e00-\u9fff]+", "-", value).strip("-").lower()
    return slug[:48] or "preference"


def _insert_preference_block(document: str, block: str) -> str:
    if ACTIVE_START not in document or ACTIVE_END not in document:
        suffix = document.rstrip() + "\n\n## Active Preferences\n"
        return f"{suffix}{ACTIVE_START}\n{block}\n{ACTIVE_END}\n"

    start_index = document.index(ACTIVE_START) + len(ACTIVE_START)
    end_index = document.index(ACTIVE_END)
    current = document[start_index:end_index].strip()

    if not current or current == PLACEHOLDER_LINE:
        replacement = f"\n{block}\n"
    else:
        replacement = f"\n{block}\n\n{current}\n"

    return document[:start_index] + replacement + document[end_index:]


def record_master_preference(
    *,
    summary: str,
    rationale: str = "",
    source_project: str = "",
    tags: Optional[list[str]] = None,
    importance: str = "medium",
    shared_preferences_dir: str | Path | None = None,
    owner_name: str = "Master",
) -> dict[str, Any]:
    normalized_summary = summary.strip()
    if not normalized_summary:
        raise ValueError("summary 不能为空")

    store = ensure_shared_preferences_store(shared_preferences_dir, owner_name=owner_name)
    shared_dir = resolve_shared_preferences_dir(shared_preferences_dir)
    tags = [str(tag).strip() for tag in (tags or []) if str(tag).strip()]
    importance_value = str(importance or "medium").strip().lower() or "medium"
    recorded_at = _now_iso()
    source_label = source_project.strip() or "未提供"
    rationale_text = rationale.strip() or "未补充"
    tag_text = "、".join(tags) if tags else "未标注"

    slug = _slugify(normalized_summary)
    base_name = f"{datetime.now().strftime('%Y%m%d%H%M%S')}-{slug}.md"
    record_path = shared_preferences_records_dir(shared_dir) / base_name
    counter = 2
    while record_path.exists():
        record_path = shared_preferences_records_dir(shared_dir) / f"{datetime.now().strftime('%Y%m%d%H%M%S')}-{slug}-{counter}.md"
        counter += 1

    record_body = f"""# Master Preference Record

- 摘要：{normalized_summary}
- 重要度：{importance_value}
- 来源项目：{source_label}
- 标签：{tag_text}
- 记录时间：{recorded_at}

## 背景 / 理由

{rationale_text}
"""
    record_path.write_text(record_body, encoding="utf-8")

    block = "\n".join(
        [
            f"- [{importance_value}] {normalized_summary}",
            f"  - 来源项目：`{source_label}`",
            f"  - 标签：{tag_text}",
            f"  - 记录时间：`{recorded_at}`",
            f"  - 详情：`records/{record_path.name}`",
        ]
    )

    master_file = shared_preferences_file(shared_dir)
    updated = _insert_preference_block(master_file.read_text(encoding="utf-8"), block)
    master_file.write_text(updated, encoding="utf-8")

    return {
        **store,
        "summary": normalized_summary,
        "importance": importance_value,
        "source_project": source_label,
        "tags": tags,
        "recorded_at": recorded_at,
        "record_file": str(record_path),
    }


def sync_project_master_preferences(
    project_root: str | Path,
    shared_preferences_dir: str | Path | None = None,
    *,
    owner_name: str = "Master",
) -> dict[str, Any]:
    project_root_path = Path(project_root).resolve()
    store = ensure_shared_preferences_store(shared_preferences_dir, owner_name=owner_name)
    shared_dir = resolve_shared_preferences_dir(shared_preferences_dir)
    preferences_dir = project_preferences_dir(project_root_path)
    preferences_dir.mkdir(parents=True, exist_ok=True)

    snapshot_path = project_preferences_snapshot_path(project_root_path)
    override_path = project_preferences_override_path(project_root_path)
    readme_path = project_preferences_readme_path(project_root_path)

    synced_at = _now_iso()
    shared_content = shared_preferences_file(shared_dir).read_text(encoding="utf-8").strip()
    snapshot_content = f"""# Shared Master Preferences Snapshot

> 自动同步自：`{shared_preferences_file(shared_dir)}`
> 同步时间：`{synced_at}`

---

{shared_content}
"""
    snapshot_path.write_text(snapshot_content + "\n", encoding="utf-8")
    _write_text_if_missing(override_path, _project_overrides_seed())
    _write_text_if_missing(readme_path, _project_preferences_readme(shared_dir))

    return {
        **store,
        "project_root": str(project_root_path),
        "preferences_dir": str(preferences_dir),
        "snapshot_file": str(snapshot_path),
        "project_override_file": str(override_path),
        "readme_file": str(readme_path),
        "synced_at": synced_at,
    }


def load_project_master_preferences(project_root: str | Path) -> dict[str, Any]:
    project_root_path = Path(project_root).resolve()
    snapshot_path = project_preferences_snapshot_path(project_root_path)
    override_path = project_preferences_override_path(project_root_path)

    sections: list[str] = []
    sources: list[str] = []

    if snapshot_path.exists():
        snapshot = snapshot_path.read_text(encoding="utf-8").strip()
        if snapshot:
            sections.append(f"### 跨项目长期偏好\n\n{snapshot}")
            sources.append(str(snapshot_path))

    if override_path.exists():
        overrides = override_path.read_text(encoding="utf-8").strip()
        if overrides:
            sections.append(f"### 当前项目补充偏好\n\n{overrides}")
            sources.append(str(override_path))

    return {
        "content": "\n\n".join(sections).strip(),
        "sources": sources,
    }
