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

if [ $# -lt 2 ]; then
  cat >&2 <<'EOF'
Usage:
  ./scripts/lightweight_eval.sh <project-a-root> <project-b-root> [--label-a 独立版] [--label-b 融合版] [--output-dir <dir>]

Example:
  ./scripts/lightweight_eval.sh /path/to/agent-team-baseline /path/to/fused-agent-team --output-dir /path/to/docs/evals/2026-04-08-run-001
EOF
  exit 1
fi

PROJECT_A_ROOT="$1"
PROJECT_B_ROOT="$2"
shift 2

export PYTHONPATH="$ROOT_DIR/src${PYTHONPATH:+:$PYTHONPATH}"
exec "$PYTHON_BIN" -m agent_team_cli --project-root "$ROOT_DIR" eval-lightweight --project-a "$PROJECT_A_ROOT" --project-b "$PROJECT_B_ROOT" "$@"
