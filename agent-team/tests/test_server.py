from __future__ import annotations

import unittest

import agent_team_mcp.server as server_module


class AgentTeamServerSmokeTest(unittest.TestCase):
    def test_build_server_symbol_exists(self) -> None:
        self.assertTrue(callable(server_module.build_server))

    def test_missing_sdk_error_message(self) -> None:
        try:
            server_module._load_fastmcp()
        except RuntimeError as exc:
            self.assertIn("./scripts/setup_venv.sh", str(exc))
        else:
            self.assertTrue(True)

    def test_new_tool_entrypoints_are_exposed_as_module_functions(self) -> None:
        self.assertTrue(callable(server_module.build_server))
        self.assertTrue(callable(server_module.main))


if __name__ == "__main__":
    unittest.main()
