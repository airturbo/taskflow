from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from typing import Any, Callable


class AdapterExecutionError(RuntimeError):
    """Raised when an LLM adapter cannot build or execute a provider request."""


EventHandler = Callable[[dict[str, Any]], None]


@dataclass
class ModelSelection:
    provider_family: str
    model_tier: str
    model_alias: str
    execution_mode: str
    source: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ModelSelection":
        return cls(**data)


@dataclass
class ExecutionMessage:
    role: str
    content: str

    def to_dict(self) -> dict[str, str]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, str]) -> "ExecutionMessage":
        return cls(**data)


@dataclass
class RoleExecutionPayload:
    role_id: str
    role_display_name: str
    user_input: str
    mode: str
    current_state: str
    project_root: str
    model: ModelSelection
    metadata: dict[str, Any] = field(default_factory=dict)
    messages: list[ExecutionMessage] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["model"] = self.model.to_dict()
        payload["messages"] = [message.to_dict() for message in self.messages]
        return payload

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "RoleExecutionPayload":
        return cls(
            role_id=data["role_id"],
            role_display_name=data["role_display_name"],
            user_input=data["user_input"],
            mode=data["mode"],
            current_state=data["current_state"],
            project_root=data["project_root"],
            model=ModelSelection.from_dict(data["model"]),
            metadata=data.get("metadata", {}),
            messages=[ExecutionMessage.from_dict(item) for item in data.get("messages", [])],
        )


class BaseLLMAdapter(ABC):
    name: str = "base"

    def __init__(self, *, timeout_seconds: float = 60.0, dry_run: bool = False):
        self.timeout_seconds = timeout_seconds
        self.dry_run = dry_run

    def _dry_run_result(
        self,
        payload: RoleExecutionPayload,
        *,
        provider: str,
        request: dict[str, Any],
        missing_credentials: bool,
    ) -> dict[str, Any]:
        return {
            "adapter": self.name,
            "provider": provider,
            "dry_run": True,
            "missing_credentials": missing_credentials,
            "model": payload.model.to_dict(),
            "request": request,
        }

    def _emit_event(
        self,
        events: list[dict[str, Any]],
        event: dict[str, Any],
        *,
        on_event: EventHandler | None = None,
    ) -> None:
        events.append(event)
        if on_event is not None:
            on_event(event)

    def execute_stream(
        self,
        payload: RoleExecutionPayload,
        *,
        on_event: EventHandler | None = None,
    ) -> dict[str, Any]:
        events: list[dict[str, Any]] = []
        provider = self.name
        self._emit_event(
            events,
            {
                "event": "start",
                "adapter": self.name,
                "provider": provider,
                "model": payload.model.to_dict(),
                "dry_run": self.dry_run,
            },
            on_event=on_event,
        )
        result = self.execute(payload)
        provider = str(result.get("provider") or provider)
        text = str(result.get("response_text") or result.get("simulated_response") or "")
        if text:
            self._emit_event(
                events,
                {
                    "event": "delta",
                    "adapter": self.name,
                    "provider": provider,
                    "text": text,
                },
                on_event=on_event,
            )
        self._emit_event(
            events,
            {
                "event": "complete",
                "adapter": self.name,
                "provider": provider,
                "finish_reason": result.get("finish_reason") or result.get("stop_reason"),
                "usage": result.get("usage"),
                "attempts": result.get("attempts", 1),
                "dry_run": bool(result.get("dry_run", False)),
            },
            on_event=on_event,
        )
        return {
            **result,
            "stream": True,
            "events": events,
            "response_text": result.get("response_text") or result.get("simulated_response", ""),
        }

    @abstractmethod
    def execute(self, payload: RoleExecutionPayload) -> dict[str, Any]:
        raise NotImplementedError
