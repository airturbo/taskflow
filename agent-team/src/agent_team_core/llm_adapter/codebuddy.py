from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .base import BaseLLMAdapter, RoleExecutionPayload

CODEBUDDY_AGENT_NAME = "agent-team-orchestrator"
CODEBUDDY_AGENT_FILENAME = f"{CODEBUDDY_AGENT_NAME}.md"
CODEBUDDY_ROLE_AGENT_PREFIX = "agent-team-role"
CODEBUDDY_ORCHESTRATOR_ROLE_ID = "project_manager_orchestrator"


def codebuddy_template_path(project_root: Path) -> Path:
    return project_root / "templates" / "hosts" / "codebuddy" / "agent-team-orchestrator.prompt.md"


def codebuddy_agents_dir(workspace_root: Path) -> Path:
    return workspace_root / ".codebuddy" / "agents"


def codebuddy_agent_path(workspace_root: Path) -> Path:
    return codebuddy_agents_dir(workspace_root) / CODEBUDDY_AGENT_FILENAME


def codebuddy_role_agent_name(role_folder: str) -> str:
    return f"{CODEBUDDY_ROLE_AGENT_PREFIX}-{role_folder}"


def codebuddy_role_agent_filename(role_folder: str) -> str:
    return f"{codebuddy_role_agent_name(role_folder)}.md"


def codebuddy_role_agent_path(workspace_root: Path, role_folder: str) -> Path:
    return codebuddy_agents_dir(workspace_root) / codebuddy_role_agent_filename(role_folder)


def codebuddy_mcp_server_name(project_root: Path) -> str:
    return project_root.name or "agent-team"


def _codebuddy_template_display_path(project_root: Path) -> str:
    template_path = codebuddy_template_path(project_root)
    try:
        return str(template_path.relative_to(project_root))
    except ValueError:
        return str(template_path)


def _venv_python_path(project_root: Path) -> Path:
    return project_root / ".venv" / "bin" / "python"


def _venv_agent_entry_path(project_root: Path) -> Path:
    return project_root / ".venv" / "bin" / "agent-team"


def codebuddy_mcp_command(project_root: Path) -> str:
    venv_python = _venv_python_path(project_root)
    if venv_python.exists():
        return str(venv_python)

    venv_entry = _venv_agent_entry_path(project_root)
    if venv_entry.exists():
        return str(venv_entry)

    return "agent-team"


def codebuddy_mcp_args(project_root: Path) -> list[str]:
    base_args = [
        "--project-root",
        str(project_root),
        "serve-mcp",
        "--transport",
        "stdio",
    ]
    if _venv_python_path(project_root).exists():
        return ["-m", "agent_team_cli", *base_args]
    return base_args


def build_codebuddy_mcp_config(project_root: Path) -> dict[str, Any]:
    server_name = codebuddy_mcp_server_name(project_root)
    return {
        "mcpServers": {
            server_name: {
                "type": "stdio",
                "command": codebuddy_mcp_command(project_root),
                "args": codebuddy_mcp_args(project_root),
                "description": "Agent Team governance kernel for CodeBuddy",
            }
        }
    }


def _yaml_scalar(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def _codebuddy_runtime_binding(project_root: Path) -> tuple[str, str]:
    resolved_root = str(project_root.resolve())
    return resolved_root, codebuddy_mcp_server_name(project_root)


def _codebuddy_runtime_context_markdown(project_root: Path) -> str:
    resolved_root, server_name = _codebuddy_runtime_binding(project_root)
    return "\n".join(
        [
            "## 当前接入绑定",
            f"- MCP server 名称: `{server_name}`",
            f"- `project_root` 固定值: `{resolved_root}`",
            "- 重要：所有 `agent-team` MCP tools 的 `project_root` 都必须传上面的 `agent-team` 工程根目录，不能误传为 CodeBuddy 工作区根目录。",
        ]
    )


def _normalize_codebuddy_model_alias(alias: str | None) -> str | None:
    if not alias:
        return None
    normalized = str(alias).strip().strip('"').strip("'")
    if not normalized:
        return None
    legacy_alias_map = {
        "gpt-5-mini": "gpt-5.4",
        "gpt-5": "gpt-5.4",
        "gemini-pro": "gemini-3.0-pro",
        "claude-sonnet": "claude-4.5",
        "claude": "claude-4.5",
    }
    return legacy_alias_map.get(normalized, normalized)


def _build_frontmatter(
    *,
    name: str,
    description: str,
    agent_mode: str,
    model: str | None = None,
    enabled_auto_run: bool = True,
) -> str:
    normalized_name = str(name).strip().strip('"').strip("'")
    normalized_model = _normalize_codebuddy_model_alias(model)
    lines = [
        "---",
        f"name: {normalized_name}",
        f"description: {_yaml_scalar(description)}",
    ]
    if normalized_model:
        lines.append(f"model: {normalized_model}")
    lines.extend(
        [
            f"agentMode: {agent_mode}",
            "enabled: true",
            f"enabledAutoRun: {'true' if enabled_auto_run else 'false'}",
            "---",
            "",
        ]
    )
    return "\n".join(lines)


def _list_text(values: list[str]) -> str:
    cleaned = [str(item).strip() for item in values if str(item).strip()]
    return "、".join(cleaned) if cleaned else "未声明"


def _model_alias(profile: dict[str, Any]) -> str | None:
    default_model = profile.get("default_model") or {}
    alias = default_model.get("model_alias")
    return _normalize_codebuddy_model_alias(str(alias) if alias else None)


def build_codebuddy_agent_markdown(project_root: Path, orchestrator_role_bundle: dict[str, Any] | None = None) -> str:
    template_body = codebuddy_template_path(project_root).read_text(encoding="utf-8").strip()
    profile = (orchestrator_role_bundle or {}).get("profile") or {}
    frontmatter = _build_frontmatter(
        name=CODEBUDDY_AGENT_NAME,
        description="使用 agent-team MCP 进行项目治理、角色编排、制品流转与正式变更编排。",
        agent_mode="manual",
        model=_model_alias(profile),
        enabled_auto_run=True,
    )
    runtime_context = _codebuddy_runtime_context_markdown(project_root)
    return frontmatter + runtime_context + "\n\n" + template_body + "\n"


def _role_agent_description(
    *,
    display_name: str,
    role_id: str,
    supported_topics: list[str],
    owned_artifacts: list[str],
    model_alias: str,
) -> str:
    topic_text = _list_text(supported_topics)
    artifact_text = _list_text(owned_artifacts)
    return (
        f"当 `agent-team` 路由或 handoff 指向角色 {display_name}（{role_id}），或任务涉及 {topic_text}，"
        f"或需要创建/评审 {artifact_text} 时使用该 Subagent。"
        f"它应通过 agent-team MCP 承接该角色工作、推动制品与交接流转，并把结果回传给总入口 Agent。"
        f"推荐宿主模型：{model_alias}。"
    )


def build_codebuddy_role_agent_markdown(project_root: Path, role_bundle: dict[str, Any]) -> str:
    profile = role_bundle["profile"]
    role_id = role_bundle["role_id"]
    role_folder = role_bundle["role_folder"]
    display_name = profile.get("display_name", role_id)
    default_model = profile.get("default_model") or {}
    primary_stages = profile.get("primary_stages") or []
    owned_artifacts = profile.get("owned_artifacts") or []
    query_playbook = role_bundle.get("query_playbook") or {}
    prompt_system = str(role_bundle.get("prompt_system") or "").strip()
    supported_topics = query_playbook.get("supported_topics") or []
    response_style = query_playbook.get("response_style") or "未声明"
    agent_name = codebuddy_role_agent_name(role_folder)
    model_alias = _normalize_codebuddy_model_alias(str(default_model.get("model_alias") or "unknown")) or "unknown"
    resolved_project_root, mcp_server_name = _codebuddy_runtime_binding(project_root)
    frontmatter = _build_frontmatter(
        name=agent_name,
        description=_role_agent_description(
            display_name=str(display_name),
            role_id=role_id,
            supported_topics=list(supported_topics),
            owned_artifacts=list(owned_artifacts),
            model_alias=model_alias,
        ),
        agent_mode="agentic",
        model=model_alias if model_alias != "unknown" else None,
        enabled_auto_run=True,
    )
    stage_text = _list_text(list(primary_stages))
    artifact_text = _list_text(list(owned_artifacts))
    topic_text = _list_text(list(supported_topics))
    prompt_block = prompt_system or "（角色 prompt 暂未声明）"
    body = "\n".join(
        [
            f"# Agent-Team Role Subagent · {display_name}",
            "",
            "你是被 `agent-team-orchestrator` 自动卷入的 `agentic` 角色 Subagent。",
            "你的职责是在 CodeBuddy 中承接 `agent-team` 为当前 workflow 指定给该角色的工作，并把结果回传给总入口 Agent。",
            "",
            "## 角色快照",
            f"- role_id: `{role_id}`",
            f"- role_folder: `{role_folder}`",
            f"- 显示名: `{display_name}`",
            f"- 当前 Agent frontmatter 模型: `{model_alias}`",
            f"- agent-team 推荐 provider_family: `{default_model.get('provider_family', 'unknown')}`",
            f"- agent-team 推荐 model_tier: `{default_model.get('model_tier', 'unknown')}`",
            f"- MCP server 名称: `{mcp_server_name}`",
            f"- 固定 `project_root`: `{resolved_project_root}`",
            "- 说明：当前 Agent frontmatter 已尽量对齐角色默认模型；若某次 `execution_payload.model` 因 task/artifact override 发生变化，应显式向总入口 Agent 报告差异。",
            f"- 主要阶段: {stage_text}",
            f"- 主要产物: {artifact_text}",
            f"- supported_topics: {topic_text}",
            f"- response_style: {response_style}",
            "",
            "## 协作约定",
            "1. 如果上游已提供 `workflow`、`role_session`、`handoff`、`role_bundle` 或 `execution_payload`，这些对象就是本轮最高优先级上下文，不要重新路由到其他角色。",
            f"2. 如果当前上下文只有任务描述，且尚未提供角色会话，优先调用 `prepare_role_session_for_role(project_root=\"{resolved_project_root}\", role_id=\"{role_id}\", user_input, actor)`；不要把 `project_root` 误传成 CodeBuddy 工作区根目录。",
            "3. 如果当前上下文已经给出 `handoff_id`、上游产物或明确说明是承接上一角色交接，优先调用 `prepare_next_role_session(handoff_id, actor)`，不要新开平行 workflow。",
            "4. 使用 `execution_payload.messages` 作为本轮主要执行上下文，并将 `execution_payload.model` 视为来自 `agent-team` 的模型/审计语义。",
            "5. 若需要产出、交接或推进制品流转，必须通过 `create_handoff_packet`、`prepare_next_role_session`、`list_artifacts`、`approve_artifact` 等 MCP tools 完成，不得只在聊天里口头交接。",
            "6. 完成后向总入口 Agent 返回：当前结论、已产出的制品/交接、仍需谁继续处理、剩余风险。",
            "",
            "## 角色 Prompt 真源（来自 prompt.system.md）",
            prompt_block,
            "",
            "## 行为边界",
            "- 不要把 CodeBuddy 当前聊天临时记忆当作正式项目状态。",
            "- 正式项目状态以 `get_project_state`、`workflow`、`role_session`、`handoff` 与产物持久化文件为准。",
            "- 若用户要求突破权限、跳过 CR/IA、直接发版或直接覆盖基线，必须拒绝并说明治理路径。",
            "",
            f"## 项目模板参考\n- Orchestrator 模板文件: `{_codebuddy_template_display_path(project_root)}`",
        ]
    )
    return frontmatter + body + "\n"


class CodeBuddyHostAdapter(BaseLLMAdapter):
    name = "codebuddy"
    host_name = "CodeBuddy"
    handoff_version = "1.0"

    def _template_path(self, project_root: Path) -> Path:
        return codebuddy_template_path(project_root)

    def _mcp_server_name(self, project_root: Path) -> str:
        return codebuddy_mcp_server_name(project_root)

    def _mcp_config(self, project_root: Path) -> dict[str, Any]:
        return build_codebuddy_mcp_config(project_root)

    def _prompt_markdown(self, payload: RoleExecutionPayload) -> str:
        resolved_project_root, server_name = _codebuddy_runtime_binding(Path(payload.project_root).resolve())
        sections = [
            "# Agent-Team CodeBuddy Handoff",
            "",
            "你正在 CodeBuddy 中承接一次 `agent-team` 的宿主执行请求。",
            "请优先通过已接入的 `agent-team` MCP Server 遵守治理流程，不要绕过状态机、CR/IA 与基线规则。",
            "",
            "## 执行摘要",
            f"- 角色: `{payload.role_display_name}` (`{payload.role_id}`)",
            f"- 模式: `{payload.mode}`",
            f"- 当前阶段: `{payload.current_state}`",
            f"- 推荐模型: `{payload.model.model_alias}`",
            f"- provider_family: `{payload.model.provider_family}`",
            f"- execution_mode: `{payload.model.execution_mode}`",
            f"- MCP server 名称: `{server_name}`",
            f"- `project_root` 固定值: `{resolved_project_root}`",
            "- 注意：所有 `agent-team` MCP tools 的 `project_root` 都必须使用上面的 `agent-team` 工程根目录。",
            "",
            "## CodeBuddy 执行要求",
            "1. 若用户请求是查询，优先基于下方消息直接生成答复。",
            "2. 若用户请求涉及正式变更，必须继续使用 `agent-team` MCP tools 推进治理动作。",
            "3. 若需要更多上下文，请优先读取 `execution_payload.metadata`、`project_state` 或 `role_bundle`，不要自造项目状态。",
            "",
            "## 标准消息",
        ]
        for message in payload.messages:
            sections.extend(
                [
                    f"### {message.role}",
                    message.content.strip(),
                    "",
                ]
            )
        return "\n".join(sections).strip()

    def _summary_text(self, payload: RoleExecutionPayload, project_root: Path) -> str:
        return (
            f"已生成 CodeBuddy handoff：角色={payload.role_display_name}，模式={payload.mode}，"
            f"推荐模型={payload.model.model_alias}。\n"
            "下一步：1) 把返回的 mcp_config 接到 CodeBuddy MCP；"
            " 2) 把 prompt_markdown 或 messages 交给自定义 Agent / Craft Agent；"
            f" 3) 参考模板 `{_codebuddy_template_display_path(project_root)}`。"
        )

    def execute(self, payload: RoleExecutionPayload) -> dict[str, Any]:
        project_root = Path(payload.project_root).resolve()
        template_path = self._template_path(project_root)
        prompt_markdown = self._prompt_markdown(payload)
        conversation = [message.to_dict() for message in payload.messages]
        mcp_config = self._mcp_config(project_root)
        server_name = self._mcp_server_name(project_root)
        response_text = self._summary_text(payload, project_root)

        return {
            "adapter": self.name,
            "provider": self.name,
            "host": self.host_name,
            "handoff_version": self.handoff_version,
            "dry_run": self.dry_run,
            "missing_credentials": False,
            "model": payload.model.to_dict(),
            "response_text": response_text,
            "request": {
                "execution_kind": "host_handoff",
                "template_path": str(template_path),
                "project_root": str(project_root),
                "mcp_server_name": server_name,
            },
            "codebuddy": {
                "execution_kind": "host_handoff",
                "host": self.host_name,
                "project_root": str(project_root),
                "template_path": str(template_path),
                "mcp_server_name": server_name,
                "mcp_config": mcp_config,
                "messages": conversation,
                "prompt_markdown": prompt_markdown,
                "model_context": payload.model.to_dict(),
                "metadata": payload.metadata,
                "next_steps": [
                    "在 CodeBuddy MCP 配置中添加返回的 mcp_config。",
                    f"将 `{_codebuddy_template_display_path(project_root)}` 作为自定义 Agent 提示词底稿。",
                    "优先使用 prompt_markdown 或 messages 驱动 CodeBuddy 宿主模型。",
                ],
            },
        }
