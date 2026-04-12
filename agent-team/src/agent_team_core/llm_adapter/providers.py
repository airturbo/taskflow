from __future__ import annotations

import json
import os
import time
from typing import Any, Iterable, Type
from urllib import error, parse, request

from .base import AdapterExecutionError, BaseLLMAdapter, EventHandler, ExecutionMessage, RoleExecutionPayload
from .codebuddy import CodeBuddyHostAdapter
from .mock import MockLLMAdapter

_PROVIDER_ENV_KEYS = {
    "openai": ["OPENAI_API_KEY", "AGENT_TEAM_OPENAI_API_KEY"],
    "anthropic": ["ANTHROPIC_API_KEY", "AGENT_TEAM_ANTHROPIC_API_KEY"],
    "gemini": ["GEMINI_API_KEY", "GOOGLE_API_KEY", "AGENT_TEAM_GEMINI_API_KEY"],
    "codebuddy": [],
}
_STREAMING_SUPPORTED = {
    "mock": True,
    "openai": True,
    "anthropic": True,
    "gemini": True,
    "codebuddy": False,
}
_DEFAULT_RETRY_STATUS_CODES = (408, 409, 429, 500, 502, 503, 504)


def _env_float(name: str, default: float) -> float:
    value = os.environ.get(name)
    return float(value) if value is not None else default


def _env_int(name: str, default: int) -> int:
    value = os.environ.get(name)
    return int(value) if value is not None else default


def _env_retry_status_codes(default: tuple[int, ...] = _DEFAULT_RETRY_STATUS_CODES) -> tuple[int, ...]:
    raw = os.environ.get("AGENT_TEAM_LLM_RETRY_STATUS_CODES")
    if not raw:
        return default
    values: list[int] = []
    for chunk in raw.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        values.append(int(chunk))
    return tuple(values) if values else default


def _coalesce_system_prompt(messages: Iterable[ExecutionMessage]) -> str:
    parts = [message.content.strip() for message in messages if message.role in {"system", "developer"} and message.content.strip()]
    return "\n\n".join(parts)


def _conversation_messages(messages: Iterable[ExecutionMessage]) -> list[ExecutionMessage]:
    return [message for message in messages if message.role in {"user", "assistant"}]


def _stringify_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        chunks: list[str] = []
        for item in content:
            if isinstance(item, str):
                chunks.append(item)
            elif isinstance(item, dict):
                text = item.get("text") or item.get("content")
                if isinstance(text, str):
                    chunks.append(text)
        return "\n".join(chunk for chunk in chunks if chunk)
    if isinstance(content, dict):
        text = content.get("text") or content.get("content")
        if isinstance(text, str):
            return text
    return json.dumps(content, ensure_ascii=False)


class HTTPJSONAdapter(BaseLLMAdapter):
    provider_name = "generic"

    def __init__(
        self,
        *,
        timeout_seconds: float = 60.0,
        dry_run: bool = False,
        max_retries: int = 2,
        initial_backoff_seconds: float = 1.0,
        max_backoff_seconds: float = 8.0,
        retry_status_codes: Iterable[int] | None = None,
    ):
        super().__init__(timeout_seconds=timeout_seconds, dry_run=dry_run)
        self.max_retries = max_retries
        self.initial_backoff_seconds = initial_backoff_seconds
        self.max_backoff_seconds = max_backoff_seconds
        self.retry_status_codes = tuple(retry_status_codes or _DEFAULT_RETRY_STATUS_CODES)

    def _sanitize_headers(self, headers: dict[str, str]) -> dict[str, str]:
        sanitized: dict[str, str] = {}
        for key, value in headers.items():
            lowered = key.lower()
            sanitized[key] = "***" if lowered in {"authorization", "x-api-key"} else value
        return sanitized

    def _retry_delay(self, attempt_index: int, retry_after_seconds: float | None = None) -> float:
        exponential = min(self.max_backoff_seconds, self.initial_backoff_seconds * (2 ** max(0, attempt_index - 1)))
        if retry_after_seconds is None:
            return exponential
        return min(self.max_backoff_seconds, max(exponential, retry_after_seconds))

    def _parse_retry_after(self, exc: error.HTTPError) -> float | None:
        value = exc.headers.get("Retry-After") if exc.headers else None
        if value is None:
            return None
        try:
            return float(value)
        except ValueError:
            return None

    def _sleep_for_retry(self, seconds: float) -> None:
        time.sleep(seconds)

    def _can_retry(self, status_code: int | None, attempt_index: int) -> bool:
        if attempt_index > self.max_retries:
            return False
        if status_code is None:
            return True
        return status_code in self.retry_status_codes

    def _http_json(self, url: str, headers: dict[str, str], body: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
        payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
        attempt_index = 0

        while True:
            attempt_index += 1
            req = request.Request(url=url, data=payload, headers=headers, method="POST")
            try:
                with request.urlopen(req, timeout=self.timeout_seconds) as response:
                    content = response.read().decode("utf-8")
                    response_headers = dict(response.headers.items())
                try:
                    parsed = json.loads(content)
                except json.JSONDecodeError as exc:
                    raise AdapterExecutionError(f"{self.provider_name} 返回了非 JSON 响应") from exc
                return parsed, {
                    "attempts": attempt_index,
                    "response_headers": response_headers,
                }
            except error.HTTPError as exc:
                detail = exc.read().decode("utf-8", errors="replace")
                if self._can_retry(exc.code, attempt_index):
                    delay = self._retry_delay(attempt_index, self._parse_retry_after(exc))
                    self._sleep_for_retry(delay)
                    continue
                raise AdapterExecutionError(
                    f"{self.provider_name} 请求失败: HTTP {exc.code} - {detail} (attempts={attempt_index})"
                ) from exc
            except error.URLError as exc:
                if self._can_retry(None, attempt_index):
                    delay = self._retry_delay(attempt_index)
                    self._sleep_for_retry(delay)
                    continue
                raise AdapterExecutionError(
                    f"{self.provider_name} 网络请求失败: {exc.reason} (attempts={attempt_index})"
                ) from exc

    def _iter_sse_records(self, response: Any) -> Iterable[tuple[str, str]]:
        event_name = "message"
        data_lines: list[str] = []

        for raw_line in response:
            line = raw_line.decode("utf-8") if isinstance(raw_line, bytes) else str(raw_line)
            line = line.rstrip("\r\n")
            if not line:
                if data_lines:
                    yield event_name, "\n".join(data_lines)
                event_name = "message"
                data_lines = []
                continue
            if line.startswith(":"):
                continue
            if line.startswith("event:"):
                event_name = line.partition(":")[2].strip() or "message"
                continue
            if line.startswith("data:"):
                data_lines.append(line.partition(":")[2].lstrip())

        if data_lines:
            yield event_name, "\n".join(data_lines)

    def _http_sse(
        self,
        url: str,
        headers: dict[str, str],
        body: dict[str, Any],
        consumer: callable,
    ) -> dict[str, Any]:
        payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
        attempt_index = 0

        while True:
            attempt_index += 1
            emitted_any = False
            req = request.Request(url=url, data=payload, headers=headers, method="POST")
            try:
                with request.urlopen(req, timeout=self.timeout_seconds) as response:
                    response_headers = dict(response.headers.items())
                    for event_name, data in self._iter_sse_records(response):
                        emitted_any = True
                        consumer(event_name, data)
                return {
                    "attempts": attempt_index,
                    "response_headers": response_headers,
                }
            except error.HTTPError as exc:
                detail = exc.read().decode("utf-8", errors="replace")
                if not emitted_any and self._can_retry(exc.code, attempt_index):
                    delay = self._retry_delay(attempt_index, self._parse_retry_after(exc))
                    self._sleep_for_retry(delay)
                    continue
                raise AdapterExecutionError(
                    f"{self.provider_name} 流式请求失败: HTTP {exc.code} - {detail} (attempts={attempt_index})"
                ) from exc
            except error.URLError as exc:
                if not emitted_any and self._can_retry(None, attempt_index):
                    delay = self._retry_delay(attempt_index)
                    self._sleep_for_retry(delay)
                    continue
                raise AdapterExecutionError(
                    f"{self.provider_name} 流式网络请求失败: {exc.reason} (attempts={attempt_index})"
                ) from exc

    def _resolve_env(self, provider: str) -> tuple[str | None, list[str]]:
        env_keys = _PROVIDER_ENV_KEYS[provider]
        for key in env_keys:
            value = os.environ.get(key)
            if value:
                return value, env_keys
        return None, env_keys

    def _request_envelope(self, *, url: str, headers: dict[str, str], body: dict[str, Any]) -> dict[str, Any]:
        return {
            "url": url,
            "headers": self._sanitize_headers(headers),
            "body": body,
            "timeout_seconds": self.timeout_seconds,
            "retry_policy": {
                "max_retries": self.max_retries,
                "initial_backoff_seconds": self.initial_backoff_seconds,
                "max_backoff_seconds": self.max_backoff_seconds,
                "retry_status_codes": list(self.retry_status_codes),
            },
        }

    def _start_stream(
        self,
        payload: RoleExecutionPayload,
        provider: str,
        events: list[dict[str, Any]],
        *,
        on_event: EventHandler | None = None,
    ) -> None:
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

    def _delta_event(
        self,
        provider: str,
        text: str,
        events: list[dict[str, Any]],
        *,
        on_event: EventHandler | None = None,
        source_event: str | None = None,
    ) -> None:
        event = {
            "event": "delta",
            "adapter": self.name,
            "provider": provider,
            "text": text,
        }
        if source_event is not None:
            event["source_event"] = source_event
        self._emit_event(events, event, on_event=on_event)

    def _complete_stream(
        self,
        provider: str,
        events: list[dict[str, Any]],
        *,
        attempts: int,
        dry_run: bool,
        on_event: EventHandler | None = None,
        finish_reason: str | None = None,
        usage: Any = None,
    ) -> None:
        self._emit_event(
            events,
            {
                "event": "complete",
                "adapter": self.name,
                "provider": provider,
                "finish_reason": finish_reason,
                "usage": usage,
                "attempts": attempts,
                "dry_run": dry_run,
            },
            on_event=on_event,
        )


class OpenAIChatAdapter(HTTPJSONAdapter):
    name = "openai"
    provider_name = "openai"

    def _messages(self, payload: RoleExecutionPayload) -> list[dict[str, str]]:
        system_prompt = _coalesce_system_prompt(payload.messages)
        messages: list[dict[str, str]] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        for message in _conversation_messages(payload.messages):
            messages.append({"role": message.role, "content": message.content})
        if not messages or messages[-1]["role"] != "user":
            messages.append({"role": "user", "content": payload.user_input})
        return messages

    def execute(self, payload: RoleExecutionPayload) -> dict[str, Any]:
        api_key, env_keys = self._resolve_env("openai")
        base_url = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
        url = f"{base_url}/chat/completions"
        body = {
            "model": payload.model.model_alias,
            "messages": self._messages(payload),
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key or '${OPENAI_API_KEY}'}",
        }
        request_preview = self._request_envelope(url=url, headers=headers, body=body)
        if self.dry_run:
            return self._dry_run_result(
                payload,
                provider="openai",
                request={**request_preview, "env_keys": env_keys},
                missing_credentials=api_key is None,
            )
        if api_key is None:
            raise AdapterExecutionError(f"openai 缺少凭证，请设置 {env_keys}")

        response, response_meta = self._http_json(url, headers, body)
        choice = (response.get("choices") or [{}])[0]
        message = choice.get("message", {})
        return {
            "adapter": self.name,
            "provider": "openai",
            "model": payload.model.to_dict(),
            "response_text": _stringify_content(message.get("content", "")),
            "finish_reason": choice.get("finish_reason"),
            "usage": response.get("usage"),
            "attempts": response_meta["attempts"],
            "response_headers": response_meta["response_headers"],
            "request": request_preview,
        }

    def execute_stream(
        self,
        payload: RoleExecutionPayload,
        *,
        on_event: EventHandler | None = None,
    ) -> dict[str, Any]:
        api_key, env_keys = self._resolve_env("openai")
        base_url = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
        url = f"{base_url}/chat/completions"
        body = {
            "model": payload.model.model_alias,
            "messages": self._messages(payload),
            "stream": True,
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key or '${OPENAI_API_KEY}'}",
            "Accept": "text/event-stream",
        }
        request_preview = self._request_envelope(url=url, headers=headers, body=body)
        events: list[dict[str, Any]] = []
        self._start_stream(payload, "openai", events, on_event=on_event)
        if self.dry_run:
            self._complete_stream("openai", events, attempts=0, dry_run=True, on_event=on_event)
            result = self._dry_run_result(
                payload,
                provider="openai",
                request={**request_preview, "env_keys": env_keys},
                missing_credentials=api_key is None,
            )
            return {
                **result,
                "stream": True,
                "events": events,
            }
        if api_key is None:
            raise AdapterExecutionError(f"openai 缺少凭证，请设置 {env_keys}")

        text_chunks: list[str] = []
        finish_reason: str | None = None
        usage: Any = None

        def consume(event_name: str, data: str) -> None:
            nonlocal finish_reason, usage
            if data.strip() == "[DONE]":
                return
            try:
                response = json.loads(data)
            except json.JSONDecodeError as exc:
                raise AdapterExecutionError("openai 流式返回了非法 JSON 事件") from exc
            usage = response.get("usage") or usage
            choice = (response.get("choices") or [{}])[0]
            delta = choice.get("delta") or {}
            text = _stringify_content(delta.get("content", ""))
            if text:
                text_chunks.append(text)
                self._delta_event("openai", text, events, on_event=on_event, source_event=event_name)
            finish_reason = choice.get("finish_reason") or finish_reason

        response_meta = self._http_sse(url, headers, body, consume)
        self._complete_stream(
            "openai",
            events,
            attempts=response_meta["attempts"],
            dry_run=False,
            on_event=on_event,
            finish_reason=finish_reason,
            usage=usage,
        )
        return {
            "adapter": self.name,
            "provider": "openai",
            "model": payload.model.to_dict(),
            "stream": True,
            "events": events,
            "response_text": "".join(text_chunks),
            "finish_reason": finish_reason,
            "usage": usage,
            "attempts": response_meta["attempts"],
            "response_headers": response_meta["response_headers"],
            "request": request_preview,
        }


class AnthropicMessagesAdapter(HTTPJSONAdapter):
    name = "anthropic"
    provider_name = "anthropic"

    def _messages(self, payload: RoleExecutionPayload) -> list[dict[str, Any]]:
        messages: list[dict[str, Any]] = []
        for message in _conversation_messages(payload.messages):
            messages.append(
                {
                    "role": message.role,
                    "content": [{"type": "text", "text": message.content}],
                }
            )
        if not messages:
            messages.append({"role": "user", "content": [{"type": "text", "text": payload.user_input}]})
        return messages

    def execute(self, payload: RoleExecutionPayload) -> dict[str, Any]:
        api_key, env_keys = self._resolve_env("anthropic")
        base_url = os.environ.get("ANTHROPIC_BASE_URL", "https://api.anthropic.com").rstrip("/")
        url = f"{base_url}/v1/messages"
        body = {
            "model": payload.model.model_alias,
            "system": _coalesce_system_prompt(payload.messages),
            "max_tokens": int(os.environ.get("AGENT_TEAM_ANTHROPIC_MAX_TOKENS", "4096")),
            "messages": self._messages(payload),
        }
        headers = {
            "Content-Type": "application/json",
            "x-api-key": api_key or "${ANTHROPIC_API_KEY}",
            "anthropic-version": os.environ.get("ANTHROPIC_VERSION", "2023-06-01"),
        }
        request_preview = self._request_envelope(url=url, headers=headers, body=body)
        if self.dry_run:
            return self._dry_run_result(
                payload,
                provider="anthropic",
                request={**request_preview, "env_keys": env_keys},
                missing_credentials=api_key is None,
            )
        if api_key is None:
            raise AdapterExecutionError(f"anthropic 缺少凭证，请设置 {env_keys}")

        response, response_meta = self._http_json(url, headers, body)
        content = response.get("content") or []
        text = "\n".join(item.get("text", "") for item in content if isinstance(item, dict))
        return {
            "adapter": self.name,
            "provider": "anthropic",
            "model": payload.model.to_dict(),
            "response_text": text,
            "stop_reason": response.get("stop_reason"),
            "usage": response.get("usage"),
            "attempts": response_meta["attempts"],
            "response_headers": response_meta["response_headers"],
            "request": request_preview,
        }

    def execute_stream(
        self,
        payload: RoleExecutionPayload,
        *,
        on_event: EventHandler | None = None,
    ) -> dict[str, Any]:
        api_key, env_keys = self._resolve_env("anthropic")
        base_url = os.environ.get("ANTHROPIC_BASE_URL", "https://api.anthropic.com").rstrip("/")
        url = f"{base_url}/v1/messages"
        body = {
            "model": payload.model.model_alias,
            "system": _coalesce_system_prompt(payload.messages),
            "max_tokens": int(os.environ.get("AGENT_TEAM_ANTHROPIC_MAX_TOKENS", "4096")),
            "messages": self._messages(payload),
            "stream": True,
        }
        headers = {
            "Content-Type": "application/json",
            "x-api-key": api_key or "${ANTHROPIC_API_KEY}",
            "anthropic-version": os.environ.get("ANTHROPIC_VERSION", "2023-06-01"),
            "Accept": "text/event-stream",
        }
        request_preview = self._request_envelope(url=url, headers=headers, body=body)
        events: list[dict[str, Any]] = []
        self._start_stream(payload, "anthropic", events, on_event=on_event)
        if self.dry_run:
            self._complete_stream("anthropic", events, attempts=0, dry_run=True, on_event=on_event)
            result = self._dry_run_result(
                payload,
                provider="anthropic",
                request={**request_preview, "env_keys": env_keys},
                missing_credentials=api_key is None,
            )
            return {
                **result,
                "stream": True,
                "events": events,
            }
        if api_key is None:
            raise AdapterExecutionError(f"anthropic 缺少凭证，请设置 {env_keys}")

        text_chunks: list[str] = []
        stop_reason: str | None = None
        usage: Any = None

        def consume(event_name: str, data: str) -> None:
            nonlocal stop_reason, usage
            if event_name == "ping":
                return
            try:
                response = json.loads(data)
            except json.JSONDecodeError as exc:
                raise AdapterExecutionError("anthropic 流式返回了非法 JSON 事件") from exc
            if event_name == "error":
                raise AdapterExecutionError(f"anthropic 流式返回错误: {_stringify_content(response.get('error') or response)}")
            if event_name == "message_start":
                usage = ((response.get("message") or {}).get("usage")) or usage
                return
            if event_name == "content_block_delta":
                delta = response.get("delta") or {}
                if delta.get("type") == "text_delta":
                    text = delta.get("text", "")
                    if text:
                        text_chunks.append(text)
                        self._delta_event("anthropic", text, events, on_event=on_event, source_event=event_name)
                return
            if event_name == "message_delta":
                delta = response.get("delta") or {}
                stop_reason = delta.get("stop_reason") or response.get("stop_reason") or stop_reason
                usage = response.get("usage") or usage

        response_meta = self._http_sse(url, headers, body, consume)
        self._complete_stream(
            "anthropic",
            events,
            attempts=response_meta["attempts"],
            dry_run=False,
            on_event=on_event,
            finish_reason=stop_reason,
            usage=usage,
        )
        return {
            "adapter": self.name,
            "provider": "anthropic",
            "model": payload.model.to_dict(),
            "stream": True,
            "events": events,
            "response_text": "".join(text_chunks),
            "stop_reason": stop_reason,
            "usage": usage,
            "attempts": response_meta["attempts"],
            "response_headers": response_meta["response_headers"],
            "request": request_preview,
        }


class GeminiGenerateContentAdapter(HTTPJSONAdapter):
    name = "gemini"
    provider_name = "gemini"

    def _contents(self, payload: RoleExecutionPayload) -> list[dict[str, Any]]:
        contents: list[dict[str, Any]] = []
        for message in _conversation_messages(payload.messages):
            role = "model" if message.role == "assistant" else "user"
            contents.append({"role": role, "parts": [{"text": message.content}]})
        if not contents:
            contents.append({"role": "user", "parts": [{"text": payload.user_input}]})
        return contents

    def execute(self, payload: RoleExecutionPayload) -> dict[str, Any]:
        api_key, env_keys = self._resolve_env("gemini")
        base_url = os.environ.get("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta").rstrip("/")
        model_name = parse.quote(payload.model.model_alias, safe="")
        key_value = api_key or "${GEMINI_API_KEY}"
        url = f"{base_url}/models/{model_name}:generateContent?key={key_value}"
        body: dict[str, Any] = {
            "contents": self._contents(payload),
        }
        system_prompt = _coalesce_system_prompt(payload.messages)
        if system_prompt:
            body["systemInstruction"] = {"parts": [{"text": system_prompt}]}
        request_preview = self._request_envelope(url=url, headers={"Content-Type": "application/json"}, body=body)
        if self.dry_run:
            return self._dry_run_result(
                payload,
                provider="gemini",
                request={**request_preview, "env_keys": env_keys},
                missing_credentials=api_key is None,
            )
        if api_key is None:
            raise AdapterExecutionError(f"gemini 缺少凭证，请设置 {env_keys}")

        response, response_meta = self._http_json(url, {"Content-Type": "application/json"}, body)
        candidates = response.get("candidates") or [{}]
        candidate = candidates[0]
        parts = (((candidate.get("content") or {}).get("parts")) or [])
        text = "\n".join(part.get("text", "") for part in parts if isinstance(part, dict))
        return {
            "adapter": self.name,
            "provider": "gemini",
            "model": payload.model.to_dict(),
            "response_text": text,
            "finish_reason": candidate.get("finishReason"),
            "usage": response.get("usageMetadata"),
            "attempts": response_meta["attempts"],
            "response_headers": response_meta["response_headers"],
            "request": request_preview,
        }

    def execute_stream(
        self,
        payload: RoleExecutionPayload,
        *,
        on_event: EventHandler | None = None,
    ) -> dict[str, Any]:
        api_key, env_keys = self._resolve_env("gemini")
        base_url = os.environ.get("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta").rstrip("/")
        model_name = parse.quote(payload.model.model_alias, safe="")
        key_value = api_key or "${GEMINI_API_KEY}"
        url = f"{base_url}/models/{model_name}:streamGenerateContent?alt=sse&key={key_value}"
        body: dict[str, Any] = {
            "contents": self._contents(payload),
        }
        system_prompt = _coalesce_system_prompt(payload.messages)
        if system_prompt:
            body["systemInstruction"] = {"parts": [{"text": system_prompt}]}
        headers = {
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
        }
        request_preview = self._request_envelope(url=url, headers=headers, body=body)
        events: list[dict[str, Any]] = []
        self._start_stream(payload, "gemini", events, on_event=on_event)
        if self.dry_run:
            self._complete_stream("gemini", events, attempts=0, dry_run=True, on_event=on_event)
            result = self._dry_run_result(
                payload,
                provider="gemini",
                request={**request_preview, "env_keys": env_keys},
                missing_credentials=api_key is None,
            )
            return {
                **result,
                "stream": True,
                "events": events,
            }
        if api_key is None:
            raise AdapterExecutionError(f"gemini 缺少凭证，请设置 {env_keys}")

        text_chunks: list[str] = []
        finish_reason: str | None = None
        usage: Any = None

        def consume(event_name: str, data: str) -> None:
            nonlocal finish_reason, usage
            try:
                response = json.loads(data)
            except json.JSONDecodeError as exc:
                raise AdapterExecutionError("gemini 流式返回了非法 JSON 事件") from exc
            candidate = (response.get("candidates") or [{}])[0]
            parts = (((candidate.get("content") or {}).get("parts")) or [])
            text = "".join(part.get("text", "") for part in parts if isinstance(part, dict))
            if text:
                text_chunks.append(text)
                self._delta_event("gemini", text, events, on_event=on_event, source_event=event_name)
            finish_reason = candidate.get("finishReason") or finish_reason
            usage = response.get("usageMetadata") or usage

        response_meta = self._http_sse(url, headers, body, consume)
        self._complete_stream(
            "gemini",
            events,
            attempts=response_meta["attempts"],
            dry_run=False,
            on_event=on_event,
            finish_reason=finish_reason,
            usage=usage,
        )
        return {
            "adapter": self.name,
            "provider": "gemini",
            "model": payload.model.to_dict(),
            "stream": True,
            "events": events,
            "response_text": "".join(text_chunks),
            "finish_reason": finish_reason,
            "usage": usage,
            "attempts": response_meta["attempts"],
            "response_headers": response_meta["response_headers"],
            "request": request_preview,
        }


_ADAPTER_REGISTRY: dict[str, Type[BaseLLMAdapter]] = {
    "mock": MockLLMAdapter,
    "codebuddy": CodeBuddyHostAdapter,
    "openai": OpenAIChatAdapter,
    "anthropic": AnthropicMessagesAdapter,
    "gemini": GeminiGenerateContentAdapter,
}


def infer_provider_name(provider_family: str, model_alias: str) -> str:
    haystack = f"{provider_family} {model_alias}".lower()
    if any(token in haystack for token in ["codebuddy"]):
        return "codebuddy"
    if any(token in haystack for token in ["gpt", "openai", "o1", "o3", "o4"]):
        return "openai"
    if any(token in haystack for token in ["claude", "anthropic"]):
        return "anthropic"
    if any(token in haystack for token in ["gemini", "google"]):
        return "gemini"
    raise AdapterExecutionError(
        f"无法根据 provider_family={provider_family!r}, model_alias={model_alias!r} 推断 provider"
    )


def build_adapter(
    *,
    payload: RoleExecutionPayload,
    adapter_name: str | None = None,
    timeout_seconds: float | None = None,
    dry_run: bool = False,
    max_retries: int | None = None,
    initial_backoff_seconds: float | None = None,
    max_backoff_seconds: float | None = None,
    retry_status_codes: Iterable[int] | None = None,
) -> BaseLLMAdapter:
    if payload.model.execution_mode != "single":
        raise AdapterExecutionError(
            f"当前仅支持 execution_mode='single'，收到 {payload.model.execution_mode!r}。"
            "fallback / parallel_compare / compare_and_merge 仍为预留能力，尚未实现。"
        )
    resolved_name = adapter_name or infer_provider_name(payload.model.provider_family, payload.model.model_alias)
    adapter_cls = _ADAPTER_REGISTRY.get(resolved_name)
    if adapter_cls is None:
        raise AdapterExecutionError(f"不支持的 llm adapter: {resolved_name}")
    if resolved_name in {"mock", "codebuddy"}:
        return adapter_cls(timeout_seconds=timeout_seconds or _env_float("AGENT_TEAM_LLM_TIMEOUT_SECONDS", 60.0), dry_run=dry_run)
    return adapter_cls(
        timeout_seconds=timeout_seconds or _env_float("AGENT_TEAM_LLM_TIMEOUT_SECONDS", 60.0),
        dry_run=dry_run,
        max_retries=max_retries if max_retries is not None else _env_int("AGENT_TEAM_LLM_MAX_RETRIES", 2),
        initial_backoff_seconds=(
            initial_backoff_seconds
            if initial_backoff_seconds is not None
            else _env_float("AGENT_TEAM_LLM_INITIAL_BACKOFF_SECONDS", 1.0)
        ),
        max_backoff_seconds=(
            max_backoff_seconds
            if max_backoff_seconds is not None
            else _env_float("AGENT_TEAM_LLM_MAX_BACKOFF_SECONDS", 8.0)
        ),
        retry_status_codes=retry_status_codes or _env_retry_status_codes(),
    )


def describe_adapter_support() -> dict[str, Any]:
    providers = []
    for name, env_keys in _PROVIDER_ENV_KEYS.items():
        configured_key = next((key for key in env_keys if os.environ.get(key)), None) if env_keys else None
        providers.append(
            {
                "name": name,
                "env_keys": env_keys,
                "configured": configured_key is not None or not env_keys,
                "configured_key": configured_key,
                "streaming_supported": _STREAMING_SUPPORTED.get(name, False),
            }
        )
    providers.append(
        {
            "name": "mock",
            "env_keys": [],
            "configured": True,
            "configured_key": None,
            "streaming_supported": _STREAMING_SUPPORTED["mock"],
        }
    )
    return {
        "providers": providers,
        "runtime_defaults": {
            "timeout_seconds": _env_float("AGENT_TEAM_LLM_TIMEOUT_SECONDS", 60.0),
            "max_retries": _env_int("AGENT_TEAM_LLM_MAX_RETRIES", 2),
            "initial_backoff_seconds": _env_float("AGENT_TEAM_LLM_INITIAL_BACKOFF_SECONDS", 1.0),
            "max_backoff_seconds": _env_float("AGENT_TEAM_LLM_MAX_BACKOFF_SECONDS", 8.0),
            "retry_status_codes": list(_env_retry_status_codes()),
        },
    }
