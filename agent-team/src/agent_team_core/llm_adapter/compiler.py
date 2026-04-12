from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

from ..master_preferences import load_project_master_preferences
from .base import ExecutionMessage, ModelSelection, RoleExecutionPayload


class RoleExecutionPayloadCompiler:
    def __init__(self, project_root: str | Path, model_config: dict[str, Any]):
        self.project_root = Path(project_root).resolve()
        self.model_config = model_config

    @staticmethod
    def _normalize_selection_context(selection_context: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        context = dict(selection_context or {})
        task_id = context.get("task_id")
        artifact_ids = context.get("artifact_ids") or []
        normalized_artifact_ids: list[str] = []
        for artifact_id in artifact_ids:
            value = str(artifact_id).strip()
            if value and value not in normalized_artifact_ids:
                normalized_artifact_ids.append(value)
        return {
            "task_id": str(task_id).strip() if task_id else None,
            "artifact_ids": normalized_artifact_ids,
        }

    @staticmethod
    def _extract_model_config(candidate: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
        if not isinstance(candidate, dict):
            return None
        if isinstance(candidate.get("model"), dict):
            return dict(candidate["model"])
        if any(key in candidate for key in ("provider_family", "model_tier", "model_alias")):
            return {
                "provider_family": candidate.get("provider_family", "unknown"),
                "model_tier": candidate.get("model_tier", "unknown"),
                "model_alias": candidate.get("model_alias", "unknown"),
            }
        return None

    @staticmethod
    def _match_value(expected: Any, actual: Any) -> bool:
        if expected is None:
            return True
        if isinstance(expected, list):
            return any(RoleExecutionPayloadCompiler._match_value(item, actual) for item in expected)
        return expected == actual

    def _expand_override_rules(self, raw_rules: Any, *, default_match_field: str) -> list[dict[str, Any]]:
        if isinstance(raw_rules, list):
            iterable = [(None, item) for item in raw_rules]
        elif isinstance(raw_rules, dict):
            iterable = list(raw_rules.items())
        else:
            return []

        rules: list[dict[str, Any]] = []
        for key, value in iterable:
            if not isinstance(value, dict):
                continue
            rule = dict(value)
            match = dict(rule.get("match") or {})
            if key is not None and default_match_field not in match:
                match[default_match_field] = key
            rule["match"] = match
            rule.setdefault("rule_id", str(key) if key is not None else match.get(default_match_field) or "override_rule")
            rules.append(rule)
        return rules

    def _rule_matches(self, rule: dict[str, Any], *, role_id: str, selection_context: dict[str, Any]) -> bool:
        match = dict(rule.get("match") or {})
        task_id = selection_context.get("task_id")
        artifact_ids = selection_context.get("artifact_ids") or []

        expected_task_id = match.get("task_id")
        if expected_task_id is not None and not self._match_value(expected_task_id, task_id):
            return False

        expected_role = match.get("role_id", match.get("target_role"))
        if expected_role is not None and not self._match_value(expected_role, role_id):
            return False

        expected_artifact_id = match.get("artifact_id")
        if expected_artifact_id is not None and not any(
            self._match_value(expected_artifact_id, artifact_id) for artifact_id in artifact_ids
        ):
            return False

        return True

    def _match_override_rule(
        self,
        *,
        override_name: str,
        role_bundle: dict[str, Any],
        selection_context: dict[str, Any],
    ) -> Optional[dict[str, Any]]:
        if not self.model_config.get("global", {}).get("allow_override", True):
            return None
        raw_rules = self.model_config.get(f"{override_name}s", {})
        default_match_field = "artifact_id" if override_name == "artifact_override" else "task_id"
        rules = self._expand_override_rules(raw_rules, default_match_field=default_match_field)
        for rule in rules:
            if self._rule_matches(rule, role_id=role_bundle["role_id"], selection_context=selection_context):
                return rule
        return None

    def _source_order(self) -> list[str]:
        priority = list(
            self.model_config.get("global", {}).get(
                "override_priority",
                ["artifact_override", "task_override", "role_default", "global_default"],
            )
        )
        order: list[str] = []
        inserted_handoff = False
        for item in priority:
            if item == "role_default" and not inserted_handoff:
                order.append("handoff_recommendation")
                inserted_handoff = True
            order.append(item)
        if not inserted_handoff:
            order.append("handoff_recommendation")
        for item in ["artifact_override", "task_override", "role_default", "global_default"]:
            if item not in order:
                order.append(item)
        return order

    def _build_selection_layers(
        self,
        *,
        role_bundle: dict[str, Any],
        handoff: Optional[dict[str, Any]],
        selection_context: dict[str, Any],
    ) -> dict[str, dict[str, Any]]:
        profile = role_bundle["profile"]
        global_config = self.model_config.get("global", {})
        artifact_override = self._match_override_rule(
            override_name="artifact_override",
            role_bundle=role_bundle,
            selection_context=selection_context,
        )
        task_override = self._match_override_rule(
            override_name="task_override",
            role_bundle=role_bundle,
            selection_context=selection_context,
        )
        handoff_id = (handoff or {}).get("handoff_id", "unknown")
        artifact_label = selection_context.get("artifact_ids") or []
        task_id = selection_context.get("task_id")

        return {
            "artifact_override": {
                "source": "artifact_override",
                "model": self._extract_model_config(artifact_override),
                "execution_mode": (artifact_override or {}).get("execution_mode"),
                "model_reason": (
                    f"命中 artifact override `{(artifact_override or {}).get('rule_id', 'unknown')}`，"
                    f"对输入产物 {artifact_label} 使用模型 "
                    f"{self._extract_model_config(artifact_override).get('model_alias', 'unknown')}。"
                    if self._extract_model_config(artifact_override)
                    else ""
                ),
                "mode_reason": (
                    f"执行模式命中 artifact override `{(artifact_override or {}).get('rule_id', 'unknown')}`，"
                    f"使用 {(artifact_override or {}).get('execution_mode')}。"
                    if (artifact_override or {}).get("execution_mode")
                    else ""
                ),
            },
            "task_override": {
                "source": "task_override",
                "model": self._extract_model_config(task_override),
                "execution_mode": (task_override or {}).get("execution_mode"),
                "model_reason": (
                    f"命中 task override `{(task_override or {}).get('rule_id', 'unknown')}`，"
                    f"对任务 {task_id or 'unknown'} 使用模型 "
                    f"{self._extract_model_config(task_override).get('model_alias', 'unknown')}。"
                    if self._extract_model_config(task_override)
                    else ""
                ),
                "mode_reason": (
                    f"执行模式命中 task override `{(task_override or {}).get('rule_id', 'unknown')}`，"
                    f"使用 {(task_override or {}).get('execution_mode')}。"
                    if (task_override or {}).get("execution_mode")
                    else ""
                ),
            },
            "handoff_recommendation": {
                "source": "handoff_recommendation",
                "model": self._extract_model_config((handoff or {}).get("recommended_model")),
                "execution_mode": (handoff or {}).get("recommended_execution_mode"),
                "model_reason": (
                    f"未命中显式 override，沿用 handoff 推荐模型 "
                    f"{self._extract_model_config((handoff or {}).get('recommended_model')).get('model_alias', 'unknown')}，"
                    f"来源 {handoff_id}。"
                    if self._extract_model_config((handoff or {}).get("recommended_model"))
                    else ""
                ),
                "mode_reason": (
                    f"执行模式沿用 handoff 推荐 {(handoff or {}).get('recommended_execution_mode')}，来源 {handoff_id}。"
                    if (handoff or {}).get("recommended_execution_mode")
                    else ""
                ),
            },
            "role_default": {
                "source": "role_default",
                "model": self._extract_model_config(profile.get("default_model")),
                "execution_mode": profile.get("execution_mode"),
                "model_reason": (
                    f"使用角色默认模型 {self._extract_model_config(profile.get('default_model')).get('model_alias', 'unknown')}。"
                    if self._extract_model_config(profile.get("default_model"))
                    else ""
                ),
                "mode_reason": (
                    f"执行模式沿用角色默认配置 {profile.get('execution_mode')}。"
                    if profile.get("execution_mode")
                    else ""
                ),
            },
            "global_default": {
                "source": "global_default",
                "model": self._extract_model_config(global_config.get("global_default")),
                "execution_mode": global_config.get("execution_mode", "single"),
                "model_reason": (
                    f"角色未声明默认模型，回退到全局默认模型 "
                    f"{self._extract_model_config(global_config.get('global_default')).get('model_alias', 'unknown')}。"
                    if self._extract_model_config(global_config.get("global_default"))
                    else ""
                ),
                "mode_reason": f"执行模式回退到全局默认配置 {global_config.get('execution_mode', 'single')}。",
            },
        }

    def _resolve_model(
        self,
        role_bundle: dict[str, Any],
        handoff: Optional[dict[str, Any]] = None,
        selection_context: Optional[dict[str, Any]] = None,
    ) -> tuple[ModelSelection, str, str, str]:
        context = self._normalize_selection_context(selection_context)
        layers = self._build_selection_layers(role_bundle=role_bundle, handoff=handoff, selection_context=context)
        source_order = self._source_order()

        model_layer = next((layers[source] for source in source_order if layers.get(source, {}).get("model")), None)
        mode_layer = next((layers[source] for source in source_order if layers.get(source, {}).get("execution_mode")), None)

        if model_layer is None:
            model_layer = layers["global_default"]
        if mode_layer is None:
            mode_layer = layers["global_default"]

        selected_model = dict(model_layer["model"] or {})
        selected_mode = str(mode_layer.get("execution_mode") or self.model_config.get("global", {}).get("execution_mode", "single"))
        model_reason = str(model_layer.get("model_reason") or "")
        mode_reason = str(mode_layer.get("mode_reason") or "")

        combined_reason = model_reason
        if mode_reason and mode_reason not in combined_reason:
            combined_reason = f"{combined_reason} {mode_reason}".strip()

        return (
            ModelSelection(
                provider_family=selected_model.get("provider_family", "unknown"),
                model_tier=selected_model.get("model_tier", "unknown"),
                model_alias=selected_model.get("model_alias", "unknown"),
                execution_mode=selected_mode,
                source=model_layer.get("source", "unknown"),
            ),
            combined_reason,
            model_layer.get("source", "unknown"),
            mode_layer.get("source", "unknown"),
        )

    def _build_master_preferences_context(self) -> tuple[str, list[str]]:
        preference_bundle = load_project_master_preferences(self.project_root)
        content = str(preference_bundle.get("content") or "").strip()
        sources = [str(item) for item in preference_bundle.get("sources") or [] if str(item).strip()]
        if not content:
            return "", sources

        source_lines = "\n".join(f"- 偏好来源文件: `{source}`" for source in sources)
        header = (
            "## Master 偏好上下文\n"
            "- 以下内容来自用户跨项目沉淀的偏好；当本轮需求没有明确覆盖时，应优先贴合这些偏好。\n"
            "- 若与本轮明确指令冲突，以本轮明确指令为准。"
        )
        if source_lines:
            header = f"{header}\n{source_lines}"
        return f"{header}\n\n{content}", sources

    def _build_system_prompt(
        self,
        role_bundle: dict[str, Any],
        route: dict[str, Any],
        project_state: dict[str, Any],
        workflow: Optional[dict[str, Any]] = None,
        handoff: Optional[dict[str, Any]] = None,
    ) -> str:
        permissions = role_bundle["permissions"]
        query_playbook = role_bundle["query_playbook"]
        prompt_system = role_bundle["prompt_system"].strip()

        governance = {
            "route_mode": route["mode"],
            "current_state": project_state.get("current_state"),
            "available_transitions": project_state.get("available_transitions", []),
            "allowed_read": permissions.get("read", []),
            "allowed_write": permissions.get("write", []),
            "approvals": permissions.get("approve", []),
            "blocks": permissions.get("block", []),
            "forbidden": permissions.get("forbidden", []),
            "query_topics": query_playbook.get("supported_topics", []),
            "response_style": query_playbook.get("response_style"),
            "escalate_when": query_playbook.get("escalate_when", []),
            "query_forbidden_actions": query_playbook.get("forbidden_actions", []),
        }

        workflow_lines: list[str] = []
        if workflow:
            workflow_lines.extend(
                [
                    "## Workflow 上下文",
                    f"- workflow_id: {workflow.get('workflow_id')}",
                    f"- workflow_type: {workflow.get('workflow_type')}",
                    f"- workflow_status: {workflow.get('status')}",
                    f"- active_role_session_id: {workflow.get('active_role_session_id')}",
                ]
            )
        if handoff:
            workflow_lines.extend(
                [
                    "## Handoff 上下文",
                    f"- handoff_id: {handoff.get('handoff_id')}",
                    f"- from_role: {handoff.get('from_role')}",
                    f"- to_role: {handoff.get('to_role')}",
                    f"- handoff_intent: {handoff.get('intent')}",
                    f"- input_summary: {handoff.get('input_summary')}",
                ]
            )

        extra_context = "\n".join(workflow_lines)
        if extra_context:
            extra_context = f"\n\n{extra_context}"

        preferences_block, _ = self._build_master_preferences_context()
        if preferences_block:
            preferences_block = f"\n\n{preferences_block}"

        return (
            f"{prompt_system}\n\n"
            "## 治理上下文\n"
            f"- 当前模式: {route['mode']}\n"
            f"- 当前阶段: {project_state.get('current_state')}\n"
            f"- 匹配角色: {role_bundle['role_id']}\n"
            "- 以下 JSON 为本次执行必须遵守的权限与治理约束：\n"
            f"```json\n{json.dumps(governance, ensure_ascii=False, indent=2)}\n```"
            f"{extra_context}"
            f"{preferences_block}"
        )

    def _build_developer_message(
        self,
        role_bundle: dict[str, Any],
        route: dict[str, Any],
        project_state: dict[str, Any],
        workflow: Optional[dict[str, Any]] = None,
        handoff: Optional[dict[str, Any]] = None,
        selection_context: Optional[dict[str, Any]] = None,
    ) -> str:
        profile = role_bundle["profile"]
        context = self._normalize_selection_context(selection_context)
        lines = [
            "请严格按角色身份执行，并显式区分只读答复与正式变更。",
            f"- 角色显示名: {profile.get('display_name', role_bundle['role_id'])}",
            f"- 当前项目阶段: {project_state.get('current_state')}",
            f"- 本次路由意图: {route['intent']}",
            f"- 本次路由模式: {route['mode']}",
            f"- 匹配关键词: {route.get('matched_keywords', [])}",
        ]
        if context.get("task_id"):
            lines.append(f"- task_id: {context['task_id']}")
        if context.get("artifact_ids"):
            lines.append(f"- 输入产物: {context['artifact_ids']}")
        if workflow:
            lines.append(f"- 当前 workflow: {workflow.get('workflow_id')}")
        if handoff:
            lines.extend(
                [
                    f"- 上游 handoff: {handoff.get('handoff_id')}",
                    f"- handoff 来源角色: {handoff.get('from_role')}",
                    f"- handoff 关注点: {handoff.get('acceptance_focus', [])}",
                    f"- handoff 待回答问题: {handoff.get('questions_to_answer', [])}",
                ]
            )
        lines.append("- 若需要突破权限、改阶段、改基线或跳过影响评估，必须拒绝并提示走治理流程。")
        return "\n".join(lines)

    def compile(
        self,
        *,
        user_input: str,
        route: dict[str, Any],
        project_state: dict[str, Any],
        role_bundle: dict[str, Any],
        actor: str,
        workflow: Optional[dict[str, Any]] = None,
        handoff: Optional[dict[str, Any]] = None,
        selection_context: Optional[dict[str, Any]] = None,
    ) -> RoleExecutionPayload:
        profile = role_bundle["profile"]
        normalized_selection_context = self._normalize_selection_context(selection_context)
        model, model_reason, model_source, execution_mode_source = self._resolve_model(
            role_bundle,
            handoff=handoff,
            selection_context=normalized_selection_context,
        )
        _, preference_sources = self._build_master_preferences_context()
        messages = [
            ExecutionMessage(
                role="system",
                content=self._build_system_prompt(
                    role_bundle,
                    route,
                    project_state,
                    workflow=workflow,
                    handoff=handoff,
                ),
            ),
            ExecutionMessage(
                role="developer",
                content=self._build_developer_message(
                    role_bundle,
                    route,
                    project_state,
                    workflow=workflow,
                    handoff=handoff,
                    selection_context=normalized_selection_context,
                ),
            ),
            ExecutionMessage(role="user", content=user_input),
        ]

        metadata = {
            "actor": actor,
            "role_folder": role_bundle["role_folder"],
            "readonly_query_enabled": profile.get("readonly_query_enabled", False),
            "formal_change_requires_impact_assessment": profile.get(
                "formal_change_requires_impact_assessment",
                True,
            ),
            "primary_stages": profile.get("primary_stages", []),
            "owned_artifacts": profile.get("owned_artifacts", []),
            "selected_model_source": model_source,
            "selected_model_reason": model_reason,
            "selected_execution_mode_source": execution_mode_source,
            "master_preferences_applied": bool(preference_sources),
            "master_preference_sources": preference_sources,
        }
        if normalized_selection_context.get("task_id"):
            metadata["task_id"] = normalized_selection_context["task_id"]
        if normalized_selection_context.get("artifact_ids"):
            metadata["artifact_ids"] = normalized_selection_context["artifact_ids"]
        if workflow:
            metadata["workflow_id"] = workflow.get("workflow_id")
        if handoff:
            metadata["handoff_id"] = handoff.get("handoff_id")
            metadata["handoff_from_role"] = handoff.get("from_role")

        return RoleExecutionPayload(
            role_id=role_bundle["role_id"],
            role_display_name=profile.get("display_name", role_bundle["role_id"]),
            user_input=user_input,
            mode=route["mode"],
            current_state=project_state.get("current_state", "unknown"),
            project_root=str(self.project_root),
            model=model,
            metadata=metadata,
            messages=messages,
        )
