from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from agent_team_core import AgentTeamProject
from agent_team_core.lightweight_eval import default_eval_output_dir, run_lightweight_evaluation
from agent_team_core.master_preferences import record_master_preference, sync_project_master_preferences
from agent_team_core.scaffold import initialize_project_from_template
from agent_team_core.workbuddy_bridge import sync_from_workbuddy
from agent_team_core.llm_adapter.codebuddy import (
    CODEBUDDY_AGENT_NAME,
    CODEBUDDY_ORCHESTRATOR_ROLE_ID,
    build_codebuddy_agent_markdown,
    build_codebuddy_mcp_config,
    build_codebuddy_role_agent_markdown,
    codebuddy_agent_path,
    codebuddy_role_agent_path,
)
from agent_team_mcp.server import main as mcp_main


def _project(args: argparse.Namespace) -> AgentTeamProject:
    return AgentTeamProject(args.project_root)


def _dump(data: Any) -> None:
    print(json.dumps(data, ensure_ascii=False, indent=2))


def _dump_jsonl(data: Any) -> None:
    print(json.dumps(data, ensure_ascii=False), flush=True)


def _write_json_file(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _write_text_file(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _display_path(path: Path, project_root: Path) -> str:
    try:
        return str(path.relative_to(project_root))
    except ValueError:
        return str(path)


def _parse_tags(raw_tags: str) -> list[str]:
    return [item.strip() for item in raw_tags.split(",") if item.strip()]


def _codebuddy_setup_readme(
    project_root: Path,
    workspace_root: Path,
    export_root: Path,
    agent_path: Path,
    role_agent_paths: list[Path],
) -> str:
    export_dir_label = _display_path(export_root, workspace_root)
    agent_label = _display_path(agent_path, workspace_root)
    role_agent_labels = [f"`{_display_path(path, workspace_root)}`" for path in role_agent_paths]
    project_label = _display_path(project_root, workspace_root)
    workspace_label = str(workspace_root)
    role_agent_block = "\n".join(f"- {label}" for label in role_agent_labels) or "- 无"
    fusion_note_block = ""
    truth_root = workspace_root / ".agent-team"
    if truth_root.exists() and truth_root.resolve() != project_root.resolve():
        truth_label = _display_path(truth_root, workspace_root)
        fusion_note_block = f"""

## 当前 WorkBuddy 融合状态

- 当前工作区检测到 `{truth_label}`，它仍是 WorkBuddy 历史真相层。
- 当前 `{project_label}` 目录仅作为 CodeBuddy 侧车运行时内核。
- 执行 `agent-team sync-workbuddy` 后，`agent-team/artifacts/` 与 `configs/baselines/` 会刷新为 WorkBuddy 制品 / 基线的镜像投影。
- 当前 `agent-team/state/` 与 `agent-team/logs/` 仍以侧车运行态为主，不等于 WorkBuddy 历史治理真相全集。
"""
    return f"""# Agent Team × CodeBuddy

已为当前项目生成 CodeBuddy 接入文件。

## 文件说明

- `{agent_label}`：项目级自定义 Agent（Manual 模式，负责总入口、角色编排、制品流转与治理编排）
- 角色级 Subagents（Agentic 模式，由总入口按需自动卷入）：
{role_agent_block}
- `{export_dir_label}/mcp.json`：用于导入到 CodeBuddy Settings → MCP → Add MCP 的 JSON（该文件本身不是 CodeBuddy 自动监听路径）
- `{export_dir_label}/README.md`：当前说明文件

## 使用步骤

1. 在 CodeBuddy 中打开当前工作区：`{workspace_label}`。
2. 打开 CodeBuddy Settings → MCP → Add MCP，并粘贴 `mcp.json` 内容；CodeBuddy 实际生效的配置位置由宿主管理，通常不是当前工作区下的该文件本身。
3. 打开 Agent 列表，优先选择项目级 Agent：`{CODEBUDDY_AGENT_NAME}` 作为总入口。
4. 正常在同一个对话中下达任务；总入口 Agent 应根据 `agent-team` 的路由、handoff 与产物状态，自动卷入对应角色 Subagents。
5. 默认交付链路中，项目团队完成一轮产品后应交给 `独立体验官` 复审；若体验官提出问题，再回流项目团队优化并继续复审。
6. 若你需要调试某个角色，可临时查看对应角色 Subagent 配置，但日常使用不建议手工切换。
7. 若想拿单次 handoff，也可以执行：
   - `.venv/bin/agent-team execute "看看当前PRD的进展" --adapter codebuddy`{fusion_note_block}

## 说明

- 当前 `agent-team` 项目根目录：`{project_label}`
- 所有 `agent-team` MCP tools 的 `project_root` 都应固定传这个路径，不能改成 CodeBuddy 工作区根目录。
- 项目级 Agent 与角色级 Subagent 文件遵循 CodeBuddy 官方约定，必须位于当前工作区根目录下的 `.codebuddy/agents/`。
- 角色 Subagent 中同步的是 `agent-team` 的角色 prompt 与默认模型；总入口 Agent 也会同步 Orchestrator 的默认模型。
- 当前项目如存在 `knowledge/master-preferences/`，其中的共享偏好快照与项目补充偏好会自动注入到角色执行上下文。
- 在仅走 CodeBuddy 宿主执行时，frontmatter 中的模型与 `execution_payload.model` 一起构成宿主侧模型选择依据；其中 `execution_payload.model` 仍是 `agent-team` 的审计与 override 真源，不代表平台一定百分百强绑定成功。
- 如果 `agent-team` 位于工作区子目录，可执行 `setup-codebuddy --workspace-root <工作区根目录>`。
- 一旦 MCP 接通，Agent 应优先通过 `agent-team` 的 MCP tools 推进查询和正式变更。
- `独立体验官` 默认是项目团队之外的高标准体验把关角色，不能被产品、设计、研发或测试自评替代。
"""


def _setup_codebuddy_assets(
    project_root: Path,
    output_dir: str | None = None,
    workspace_root: str | None = None,
) -> dict[str, Any]:
    workspace_root_path = Path(workspace_root).expanduser() if workspace_root else project_root
    if not workspace_root_path.is_absolute():
        workspace_root_path = project_root / workspace_root_path
    workspace_root_path = workspace_root_path.resolve()

    export_root = Path(output_dir).expanduser() if output_dir else workspace_root_path / ".codebuddy" / "agent-team"
    if not export_root.is_absolute():
        export_root = workspace_root_path / export_root
    export_root = export_root.resolve()

    project = AgentTeamProject(project_root)
    agent_path = codebuddy_agent_path(workspace_root_path)
    orchestrator_role_bundle = project.get_role_bundle(CODEBUDDY_ORCHESTRATOR_ROLE_ID)
    role_agent_paths: list[Path] = []
    for role in project.list_roles():
        role_id = role.get("role_id")
        if not role_id or role_id == CODEBUDDY_ORCHESTRATOR_ROLE_ID:
            continue
        role_bundle = project.get_role_bundle(role_id)
        role_agent_path = codebuddy_role_agent_path(workspace_root_path, role_bundle["role_folder"])
        _write_text_file(role_agent_path, build_codebuddy_role_agent_markdown(project_root, role_bundle))
        role_agent_paths.append(role_agent_path)

    agents_dir = agent_path.parent
    agents_dir.mkdir(parents=True, exist_ok=True)
    expected_role_agent_names = {path.name for path in role_agent_paths}
    for existing_path in agents_dir.glob("agent-team-role-*.md"):
        if existing_path.name not in expected_role_agent_names:
            existing_path.unlink()

    mcp_path = export_root / "mcp.json"
    readme_path = export_root / "README.md"

    _write_text_file(agent_path, build_codebuddy_agent_markdown(project_root, orchestrator_role_bundle))
    _write_json_file(mcp_path, build_codebuddy_mcp_config(project_root))
    _write_text_file(
        readme_path,
        _codebuddy_setup_readme(project_root, workspace_root_path, export_root, agent_path, role_agent_paths),
    )

    return {
        "project_root": str(project_root),
        "workspace_root": str(workspace_root_path),
        "agent_name": CODEBUDDY_AGENT_NAME,
        "role_agent_names": [path.stem for path in role_agent_paths],
        "files": {
            "agent": str(agent_path),
            "role_agents": [str(path) for path in role_agent_paths],
            "mcp": str(mcp_path),
            "readme": str(readme_path),
        },
        "next_steps": [
            "在 CodeBuddy Settings → MCP → Add MCP 中导入 mcp.json 内容（该文件本身不是宿主自动监听路径）。",
            f"在 Agent 列表中选择项目级 Agent：{CODEBUDDY_AGENT_NAME}。",
            "在同一对话中优先使用 agent-team-orchestrator，由其自动卷入对应角色 Subagents。",
            "如果需要单次宿主 handoff，可继续使用 --adapter codebuddy。",
        ],
    }


def _add_common_execution_flags(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--actor", default="cli_user")
    parser.add_argument("--adapter")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--timeout-seconds", type=float)
    parser.add_argument("--max-retries", type=int)
    parser.add_argument("--initial-backoff-seconds", type=float)
    parser.add_argument("--max-backoff-seconds", type=float)
    parser.add_argument("--stream", action="store_true", help="实时输出文本增量到 stdout")
    parser.add_argument("--stream-jsonl", action="store_true", help="以 JSONL 形式实时输出结构化事件")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Agent Team CLI")
    parser.add_argument("--project-root", default=".", help="agent-team 项目根目录，默认当前目录")

    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("healthcheck", help="查看项目健康状态")
    subparsers.add_parser("adapter-status", help="查看 provider 配置状态与默认重试策略")

    route_parser = subparsers.add_parser("route", help="只做路由判断")
    route_parser.add_argument("user_input")
    route_parser.add_argument("--actor", default="cli_user")

    payload_parser = subparsers.add_parser("payload", help="生成 execution_payload")
    payload_parser.add_argument("user_input")
    payload_parser.add_argument("--actor", default="cli_user")

    execute_parser = subparsers.add_parser("execute", help="从自然语言请求直接执行 provider")
    execute_parser.add_argument("user_input")
    _add_common_execution_flags(execute_parser)

    execute_payload_parser = subparsers.add_parser("execute-payload", help="执行已有 execution_payload JSON 文件")
    execute_payload_parser.add_argument("payload_file", help="payload JSON 文件路径")
    _add_common_execution_flags(execute_payload_parser)

    setup_codebuddy_parser = subparsers.add_parser("setup-codebuddy", help="生成 CodeBuddy 项目级 Agent 与 MCP 配置")
    setup_codebuddy_parser.add_argument("--workspace-root", help="CodeBuddy 当前工作区根目录；若 agent-team 位于子目录，建议显式传入")
    setup_codebuddy_parser.add_argument("--output-dir", help="导出的 CodeBuddy 配置目录，默认 <workspace-root>/.codebuddy/agent-team")

    init_project_parser = subparsers.add_parser("init-project", help="为新工作区初始化一套 agent-team 项目骨架")
    init_project_parser.add_argument("workspace_root", help="新项目工作区根目录")
    init_project_parser.add_argument("--project-dir-name", default="agent-team", help="工作区内 agent-team 目录名，默认 agent-team")
    init_project_parser.add_argument("--shared-preferences-dir", help="共享 master 偏好目录，默认 ~/.codebuddy/agent-team/master-preferences")
    init_project_parser.add_argument("--owner-name", default="Master", help="共享偏好库主人设名称，默认 Master")
    init_project_parser.add_argument("--skip-venv", action="store_true", help="只生成骨架，不创建 .venv")
    init_project_parser.add_argument("--skip-codebuddy-setup", action="store_true", help="只生成项目骨架，不自动生成 CodeBuddy 接入文件")
    init_project_parser.add_argument("--python-bin", help="创建新项目 .venv 时使用的 Python 可执行文件")

    record_preference_parser = subparsers.add_parser("record-master-preference", help="记录一条跨项目的 master 偏好")
    record_preference_parser.add_argument("--summary", required=True, help="偏好摘要，建议一句话描述")
    record_preference_parser.add_argument("--rationale", default="", help="记录偏好背后的原因或背景")
    record_preference_parser.add_argument("--source-project", default="", help="该偏好来自哪个项目")
    record_preference_parser.add_argument("--tags", default="", help="逗号分隔的标签，例如 输出风格,风险控制")
    record_preference_parser.add_argument("--importance", default="medium", choices=["low", "medium", "high"], help="偏好重要度")
    record_preference_parser.add_argument("--shared-preferences-dir", help="共享 master 偏好目录，默认 ~/.codebuddy/agent-team/master-preferences")
    record_preference_parser.add_argument("--owner-name", default="Master", help="共享偏好库主人设名称，默认 Master")

    sync_preferences_parser = subparsers.add_parser("sync-master-preferences", help="把共享 master 偏好同步到当前项目")
    sync_preferences_parser.add_argument("--shared-preferences-dir", help="共享 master 偏好目录，默认 ~/.codebuddy/agent-team/master-preferences")
    sync_preferences_parser.add_argument("--owner-name", default="Master", help="共享偏好库主人设名称，默认 Master")

    sync_workbuddy_parser = subparsers.add_parser("sync-workbuddy", help="把 WorkBuddy `.agent-team/` 真相层桥接到当前 sidecar `agent-team/`")
    sync_workbuddy_parser.add_argument("--workbuddy-root", help="WorkBuddy 真相层根目录，默认推断为 `<project-root>/../.agent-team`")
    sync_workbuddy_parser.add_argument("--workspace-root", help="刷新 `.codebuddy` 接线文件时使用的工作区根目录，默认推断为 `<project-root>/..`")
    sync_workbuddy_parser.add_argument("--skip-roles", action="store_true", help="跳过 roles materializer")
    sync_workbuddy_parser.add_argument("--skip-configs", action="store_true", help="跳过 router/state-machine 配置同步")
    sync_workbuddy_parser.add_argument("--skip-state", action="store_true", help="跳过 project-state 与 runtime registry 初始化")
    sync_workbuddy_parser.add_argument("--skip-artifacts", action="store_true", help="跳过 artifact registry / baselines / views 镜像投影")
    sync_workbuddy_parser.add_argument("--skip-references", action="store_true", help="跳过 UX references 兼容层复制")
    sync_workbuddy_parser.add_argument("--skip-codebuddy-setup", action="store_true", help="跳过重新生成 `.codebuddy/agents` 与 `.codebuddy/agent-team/mcp.json`")

    eval_parser = subparsers.add_parser("eval-lightweight", help="对两套 agent-team 项目执行轻量 A/B 测评并输出 scorecard")
    eval_parser.add_argument("--project-a", required=True, help="A 组 agent-team 项目根目录，通常是独立版基线")
    eval_parser.add_argument("--project-b", required=True, help="B 组 agent-team 项目根目录，通常是融合后项目")
    eval_parser.add_argument("--label-a", default="独立版", help="A 组展示名称，默认 独立版")
    eval_parser.add_argument("--label-b", default="融合版", help="B 组展示名称，默认 融合版")
    eval_parser.add_argument("--output-dir", help="输出目录，默认 `<project-root>/../docs/evals/<timestamp>`")

    serve_parser = subparsers.add_parser("serve-mcp", help="启动 MCP server")
    serve_parser.add_argument(
        "--transport",
        default=os.environ.get("AGENT_TEAM_MCP_TRANSPORT", "stdio"),
        choices=["stdio", "streamable-http", "sse"],
    )

    return parser


def _execute_kwargs(args: argparse.Namespace) -> dict[str, Any]:
    return {
        "adapter": args.adapter,
        "timeout_seconds": args.timeout_seconds,
        "dry_run": args.dry_run,
        "max_retries": args.max_retries,
        "initial_backoff_seconds": args.initial_backoff_seconds,
        "max_backoff_seconds": args.max_backoff_seconds,
        "stream": args.stream or args.stream_jsonl,
    }


def _stream_handler(args: argparse.Namespace):
    if getattr(args, "stream_jsonl", False):
        return _dump_jsonl
    if not getattr(args, "stream", False):
        return None

    def emit_text(event: dict[str, Any]) -> None:
        if event.get("event") == "delta" and event.get("text"):
            print(event["text"], end="", flush=True)

    return emit_text


def _finalize_stream_output(args: argparse.Namespace, data: dict[str, Any]) -> None:
    if getattr(args, "stream_jsonl", False):
        _dump_jsonl({"event": "result", **data})
        return
    if not getattr(args, "stream", False):
        _dump(data)
        return

    result = data.get("result", {})
    has_text = bool(result.get("response_text"))
    if has_text:
        print()
        return
    _dump(data)


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if getattr(args, "stream", False) and getattr(args, "stream_jsonl", False):
        parser.error("--stream 与 --stream-jsonl 不能同时使用")

    if args.command == "serve-mcp":
        os.environ["AGENT_TEAM_MCP_TRANSPORT"] = args.transport
        os.chdir(Path(args.project_root).resolve())
        mcp_main()
        return 0

    if args.command == "setup-codebuddy":
        _dump(_setup_codebuddy_assets(Path(args.project_root).resolve(), args.output_dir, args.workspace_root))
        return 0

    if args.command == "init-project":
        init_result = initialize_project_from_template(
            template_root=Path(args.project_root).resolve(),
            workspace_root=args.workspace_root,
            project_dir_name=args.project_dir_name,
            shared_preferences_dir=args.shared_preferences_dir,
            owner_name=args.owner_name,
            install_venv=not args.skip_venv,
            python_bin=args.python_bin,
        )
        codebuddy_result = None
        if not args.skip_codebuddy_setup:
            codebuddy_result = _setup_codebuddy_assets(
                Path(init_result["project_root"]),
                workspace_root=init_result["workspace_root"],
            )

        next_steps = []
        if args.skip_venv:
            next_steps.append(f"进入 `{init_result['project_root']}` 后执行 `./scripts/setup_venv.sh` 创建虚拟环境。")
            next_steps.append("若先生成了 CodeBuddy 接入文件，创建 .venv 后建议再执行一次 `agent-team setup-codebuddy --workspace-root <工作区根目录>`，让 mcp.json 指向项目内 .venv。")
        else:
            next_steps.append(f"进入 `{init_result['project_root']}` 后可直接使用 `.venv/bin/agent-team`。")
        if codebuddy_result:
            next_steps.append(f"在 CodeBuddy Settings → MCP → Add MCP 中粘贴 `{codebuddy_result['files']['mcp']}` 的内容。")
        else:
            next_steps.append("准备好后执行 `agent-team setup-codebuddy --workspace-root <工作区根目录>` 生成宿主接入文件。")
        next_steps.append("若后续沉淀了新的长期偏好，可执行 `agent-team record-master-preference --summary \"...\"` 追加到共享偏好库。")

        _dump({
            **init_result,
            "codebuddy": codebuddy_result,
            "next_steps": next_steps,
        })
        return 0

    if args.command == "record-master-preference":
        result = record_master_preference(
            summary=args.summary,
            rationale=args.rationale,
            source_project=args.source_project,
            tags=_parse_tags(args.tags),
            importance=args.importance,
            shared_preferences_dir=args.shared_preferences_dir,
            owner_name=args.owner_name,
        )
        result["next_steps"] = [
            "如需让某个已有项目使用最新偏好，可在该项目执行 `agent-team sync-master-preferences`。",
            "建议定期人工整理 `master-preferences.md`，把重复要求合并为更稳定的偏好原则。",
        ]
        _dump(result)
        return 0

    if args.command == "sync-master-preferences":
        result = sync_project_master_preferences(
            Path(args.project_root).resolve(),
            args.shared_preferences_dir,
            owner_name=args.owner_name,
        )
        result["next_steps"] = [
            "后续新的 role session 会自动读到最新偏好快照。",
            "如需补充当前项目独有偏好，可编辑 `project-overrides.md`。",
        ]
        _dump(result)
        return 0

    if args.command == "sync-workbuddy":
        project_root = Path(args.project_root).resolve()
        workspace_root = Path(args.workspace_root).expanduser().resolve() if args.workspace_root else project_root.parent
        result = sync_from_workbuddy(
            project_root,
            workbuddy_root=args.workbuddy_root,
            sync_roles=not args.skip_roles,
            sync_configs=not args.skip_configs,
            sync_state=not args.skip_state,
            sync_artifacts=not args.skip_artifacts,
            sync_references=not args.skip_references,
        )
        codebuddy_result = None
        if not args.skip_codebuddy_setup:
            codebuddy_result = _setup_codebuddy_assets(project_root, workspace_root=workspace_root)
        result["codebuddy"] = codebuddy_result
        result["next_steps"] = [
            "现在可以重新使用 `.codebuddy/agents/agent-team-orchestrator.md` 与角色 subagents。",
            "如已在 CodeBuddy 宿主中导入过旧版 mcp.json，建议重新粘贴最新 `.codebuddy/agent-team/mcp.json` 内容。",
            "若后续 WorkBuddy 真相层继续变化，可重复执行 `agent-team sync-workbuddy` 刷新侧车。",
        ]
        _dump(result)
        return 0

    if args.command == "eval-lightweight":
        output_dir = Path(args.output_dir).expanduser().resolve() if args.output_dir else default_eval_output_dir(args.project_root)
        result = run_lightweight_evaluation(
            project_a_root=args.project_a,
            project_b_root=args.project_b,
            output_dir=output_dir,
            label_a=args.label_a,
            label_b=args.label_b,
        )
        _dump(result)
        return 0

    project = _project(args)

    if args.command == "healthcheck":
        _dump(project.healthcheck())
        return 0

    if args.command == "adapter-status":
        _dump(project.get_llm_adapter_status())
        return 0

    if args.command == "route":
        _dump(project.route_request(args.user_input, actor=args.actor))
        return 0

    if args.command == "payload":
        _dump(project.build_execution_payload(args.user_input, actor=args.actor))
        return 0

    if args.command == "execute":
        result = project.execute_role_with_provider(
            args.user_input,
            actor=args.actor,
            event_handler=_stream_handler(args),
            **_execute_kwargs(args),
        )
        _finalize_stream_output(args, result)
        return 0

    if args.command == "execute-payload":
        with open(args.payload_file, "r", encoding="utf-8") as f:
            payload = json.load(f)
        result = project.execute_prepared_payload(payload, event_handler=_stream_handler(args), **_execute_kwargs(args))
        _finalize_stream_output(args, result)
        return 0

    parser.error(f"Unsupported command: {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
