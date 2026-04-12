from __future__ import annotations

from typing import Any

from .base import BaseLLMAdapter, RoleExecutionPayload


class MockLLMAdapter(BaseLLMAdapter):
    name = "mock"

    def execute(self, payload: RoleExecutionPayload) -> dict[str, Any]:
        system_preview = payload.messages[0].content[:240] if payload.messages else ""
        return {
            "adapter": self.name,
            "role_id": payload.role_id,
            "role_display_name": payload.role_display_name,
            "mode": payload.mode,
            "model": payload.model.to_dict(),
            "message_count": len(payload.messages),
            "system_prompt_preview": system_preview,
            "simulated_response": (
                f"[{payload.role_display_name}] 已收到请求，当前模式={payload.mode}，"
                f"阶段={payload.current_state}，建议宿主使用模型 {payload.model.model_alias} 执行。"
            ),
        }
