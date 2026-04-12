#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PYTHON_BIN="${AGENT_TEAM_PYTHON:-$ROOT_DIR/.venv/bin/python}"
TRANSPORT="${AGENT_TEAM_MCP_TRANSPORT:-stdio}"

if [ ! -x "$PYTHON_BIN" ]; then
  echo "Python runtime not found: $PYTHON_BIN" >&2
  echo "Please create the virtualenv first, for example:" >&2
  echo "  /Users/turbo/.workbuddy/binaries/python/versions/3.14.3/bin/python3 -m venv $ROOT_DIR/.venv" >&2
  echo "  $ROOT_DIR/.venv/bin/python -m pip install --upgrade pip" >&2
  echo "  $ROOT_DIR/.venv/bin/python -m pip install ." >&2
  exit 1
fi

cd "$ROOT_DIR"
export AGENT_TEAM_MCP_TRANSPORT="$TRANSPORT"
exec "$PYTHON_BIN" -m agent_team_mcp.server
