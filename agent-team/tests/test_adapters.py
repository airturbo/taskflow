from __future__ import annotations

import io
import json
import os
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError

from agent_team_core import AgentTeamProject
from agent_team_core.llm_adapter import (
    AdapterExecutionError,
    CodeBuddyHostAdapter,
    RoleExecutionPayload,
    build_adapter,
    infer_provider_name,
)


class FakeJSONResponse:
    def __init__(self, body: bytes, headers: dict[str, str] | None = None):
        self._body = body
        self.headers = headers or {}

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self):
        return self._body


class FakeSSEStreamResponse:
    def __init__(self, lines: list[bytes], headers: dict[str, str] | None = None):
        self._lines = lines
        self.headers = headers or {}

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def __iter__(self):
        return iter(self._lines)


class LLMAdapterSmokeTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tempdir = tempfile.TemporaryDirectory()
        self.fixture_root = Path(self._tempdir.name) / "agent-team-fixture"
        source_root = Path(__file__).resolve().parents[1]

        for name in [
            "artifacts",
            "configs",
            "logs",
            "roles",
            "runtime",
            "state",
        ]:
            shutil.copytree(source_root / name, self.fixture_root / name)

        for name in ["README.md", "bootstrap-manifest.v1.json"]:
            shutil.copy2(source_root / name, self.fixture_root / name)

        self.project = AgentTeamProject(self.fixture_root)
        self.payload = RoleExecutionPayload.from_dict(
            self.project.build_execution_payload("看看当前PRD的进展", actor="test_host")
        )

    def tearDown(self) -> None:
        self._tempdir.cleanup()

    def test_infer_provider_name(self) -> None:
        self.assertEqual("gemini", infer_provider_name("gemini-pro", "gemini-pro"))
        self.assertEqual("openai", infer_provider_name("gpt-5", "gpt-5-mini"))
        self.assertEqual("anthropic", infer_provider_name("claude-4", "claude-4-sonnet"))
        self.assertEqual("codebuddy", infer_provider_name("codebuddy-host", "codebuddy"))

    def test_build_adapter_uses_payload_provider(self) -> None:
        adapter = build_adapter(payload=self.payload, dry_run=True)
        self.assertEqual("gemini", adapter.name)

    def test_build_adapter_supports_codebuddy_host(self) -> None:
        adapter = build_adapter(payload=self.payload, adapter_name="codebuddy")
        self.assertIsInstance(adapter, CodeBuddyHostAdapter)

    def test_build_adapter_rejects_non_single_execution_mode(self) -> None:
        payload = RoleExecutionPayload.from_dict(
            {
                **self.payload.to_dict(),
                "model": {
                    **self.payload.model.to_dict(),
                    "execution_mode": "fallback",
                },
            }
        )
        with self.assertRaises(AdapterExecutionError):
            build_adapter(payload=payload, adapter_name="mock")

    def test_execute_role_with_provider_dry_run(self) -> None:
        result = self.project.execute_role_with_provider(
            "看看当前PRD的进展",
            actor="test_host",
            dry_run=True,
        )
        self.assertEqual("gemini", result["result"]["provider"])
        self.assertTrue(result["result"]["dry_run"])
        self.assertEqual("product_manager", result["payload"]["role_id"])

    def test_execute_prepared_payload_dry_run(self) -> None:
        prepared = self.project.prepare_role_session("看看当前PRD的进展", actor="test_host")
        result = self.project.execute_prepared_payload(prepared["execution_payload"], dry_run=True)
        self.assertEqual("product_manager", result["payload"]["role_id"])
        self.assertTrue(result["result"]["dry_run"])

    def test_execute_prepared_payload_stream_with_mock_adapter(self) -> None:
        prepared = self.project.prepare_role_session("看看当前PRD的进展", actor="test_host")
        result = self.project.execute_prepared_payload(
            prepared["execution_payload"],
            adapter="mock",
            stream=True,
        )
        self.assertTrue(result["result"]["stream"])
        self.assertGreaterEqual(len(result["result"]["events"]), 3)
        self.assertEqual("start", result["result"]["events"][0]["event"])
        self.assertEqual("delta", result["result"]["events"][1]["event"])
        self.assertIn("建议宿主使用模型", result["result"]["response_text"])

    @patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}, clear=False)
    def test_openai_adapter_parses_response(self) -> None:
        payload = RoleExecutionPayload.from_dict(
            {
                **self.payload.to_dict(),
                "model": {
                    **self.payload.model.to_dict(),
                    "provider_family": "gpt-5",
                    "model_alias": "gpt-5-mini",
                },
            }
        )
        adapter = build_adapter(payload=payload, adapter_name="openai")
        response_body = json.dumps(
            {
                "choices": [
                    {
                        "message": {"content": "done"},
                        "finish_reason": "stop",
                    }
                ],
                "usage": {"total_tokens": 12},
            }
        ).encode("utf-8")

        with patch(
            "agent_team_core.llm_adapter.providers.request.urlopen",
            return_value=FakeJSONResponse(response_body, {"x-request-id": "req-1"}),
        ):
            result = adapter.execute(payload)

        self.assertEqual("done", result["response_text"])
        self.assertEqual("stop", result["finish_reason"])
        self.assertEqual(1, result["attempts"])

    @patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}, clear=False)
    def test_openai_adapter_stream_parses_sse(self) -> None:
        payload = RoleExecutionPayload.from_dict(
            {
                **self.payload.to_dict(),
                "model": {
                    **self.payload.model.to_dict(),
                    "provider_family": "gpt-5",
                    "model_alias": "gpt-5-mini",
                },
            }
        )
        adapter = build_adapter(payload=payload, adapter_name="openai")
        sse_lines = [
            b'data: {"choices":[{"delta":{"content":"hel"},"finish_reason":null}]}\n',
            b'\n',
            b'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}],"usage":{"total_tokens":9}}\n',
            b'\n',
            b'data: [DONE]\n',
            b'\n',
        ]

        with patch(
            "agent_team_core.llm_adapter.providers.request.urlopen",
            return_value=FakeSSEStreamResponse(sse_lines, {"x-request-id": "req-stream"}),
        ):
            result = adapter.execute_stream(payload)

        self.assertTrue(result["stream"])
        self.assertEqual("hello", result["response_text"])
        self.assertEqual("stop", result["finish_reason"])
        self.assertEqual(4, len(result["events"]))
        self.assertEqual("delta", result["events"][1]["event"])
        self.assertEqual("hel", result["events"][1]["text"])
        self.assertEqual("complete", result["events"][-1]["event"])

    @patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}, clear=False)
    def test_openai_adapter_retries_then_succeeds(self) -> None:
        payload = RoleExecutionPayload.from_dict(
            {
                **self.payload.to_dict(),
                "model": {
                    **self.payload.model.to_dict(),
                    "provider_family": "gpt-5",
                    "model_alias": "gpt-5-mini",
                },
            }
        )
        adapter = build_adapter(
            payload=payload,
            adapter_name="openai",
            max_retries=2,
            initial_backoff_seconds=0.01,
            max_backoff_seconds=0.01,
        )
        response_body = json.dumps(
            {
                "choices": [
                    {
                        "message": {"content": "recovered"},
                        "finish_reason": "stop",
                    }
                ],
                "usage": {"total_tokens": 18},
            }
        ).encode("utf-8")

        body_fp = io.BytesIO(b'{"error":"rate limited"}')
        rate_limited = HTTPError(
            url="https://api.openai.com/v1/chat/completions",
            code=429,
            msg="Too Many Requests",
            hdrs={"Retry-After": "0"},
            fp=body_fp,
        )

        with patch(
            "agent_team_core.llm_adapter.providers.request.urlopen",
            side_effect=[rate_limited, FakeJSONResponse(response_body, {"x-request-id": "req-2"})],
        ), patch("agent_team_core.llm_adapter.providers.time.sleep") as sleep_mock:
            result = adapter.execute(payload)

        rate_limited.close()
        body_fp.close()
        self.assertEqual("recovered", result["response_text"])
        self.assertEqual(2, result["attempts"])
        sleep_mock.assert_called_once()

    def test_adapter_status_reports_env_file_and_defaults(self) -> None:
        with open(self.fixture_root / ".env", "w", encoding="utf-8") as f:
            f.write("GOOGLE_API_KEY=abc\nAGENT_TEAM_LLM_MAX_RETRIES=5\n")
        project = AgentTeamProject(self.fixture_root)
        status = project.get_llm_adapter_status()
        gemini = next(item for item in status["providers"] if item["name"] == "gemini")
        self.assertTrue(gemini["configured"])
        self.assertEqual("GOOGLE_API_KEY", gemini["configured_key"])
        self.assertTrue(gemini["streaming_supported"])
        self.assertEqual(5, status["runtime_defaults"]["max_retries"])
        self.assertTrue(status["env_file"]["exists"])


if __name__ == "__main__":
    unittest.main()
