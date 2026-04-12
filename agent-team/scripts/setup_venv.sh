#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PYTHON_BIN="${AGENT_TEAM_BOOTSTRAP_PYTHON:-/Users/turbo/.workbuddy/binaries/python/versions/3.14.3/bin/python3}"

if [ ! -x "$PYTHON_BIN" ]; then
  echo "Bootstrap Python not found: $PYTHON_BIN" >&2
  exit 1
fi

cd "$ROOT_DIR"
rm -rf .venv
"$PYTHON_BIN" -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install .

echo "agent-team virtualenv is ready at: $ROOT_DIR/.venv"
