#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

export JIRA_BASE_URL="${JIRA_BASE_URL:-}"
export JIRA_PROJECT="${JIRA_PROJECT:-}"
export VISION_PORT="${VISION_PORT:-8787}"
export VISION_FRONTEND_PORT="${VISION_FRONTEND_PORT:-5173}"

if ! command -v go >/dev/null 2>&1; then
  echo "Go is required. Install Go, then rerun ./start.sh." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required for the visualization UI." >&2
  exit 1
fi

if [[ ! -d frontend/node_modules ]]; then
  npm --prefix frontend install
fi

cleanup() {
  if [[ -n "${BACKEND_PID:-}" ]]; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

go run ./cmd/vision serve &
BACKEND_PID=$!

echo "Backend:  http://127.0.0.1:${VISION_PORT}"
echo "Frontend: http://127.0.0.1:${VISION_FRONTEND_PORT}"

npm --prefix frontend run dev -- --host 127.0.0.1 --port "$VISION_FRONTEND_PORT"
