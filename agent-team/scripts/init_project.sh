#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEFAULT_PYTHON="$(command -v python3 || true)"
PYTHON_BIN="${AGENT_TEAM_PYTHON:-$ROOT_DIR/.venv/bin/python}"

if [ ! -x "$PYTHON_BIN" ]; then
  PYTHON_BIN="$DEFAULT_PYTHON"
fi

if [ -z "$PYTHON_BIN" ] || [ ! -x "$PYTHON_BIN" ]; then
  echo "No usable python3 found. Please install Python 3.10+ first." >&2
  exit 1
fi

if [ $# -lt 1 ]; then
  cat >&2 <<'EOF'
Usage:
  ./scripts/init_project.sh <workspace-root> [--project-dir-name agent-team] [--shared-preferences-dir <dir>] [--skip-venv] [--skip-codebuddy-setup]

Example:
  ./scripts/init_project.sh /path/to/new-workspace --project-dir-name agent-team
EOF
  exit 1
fi

WORKSPACE_ROOT="$1"
shift

export PYTHONPATH="$ROOT_DIR/src${PYTHONPATH:+:$PYTHONPATH}"
exec "$PYTHON_BIN" -m agent_team_cli --project-root "$ROOT_DIR" init-project "$WORKSPACE_ROOT" "$@"
