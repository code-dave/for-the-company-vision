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

is_port_busy() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi
  nc -z 127.0.0.1 "$port" >/dev/null 2>&1
}

find_free_port() {
  local port="$1"
  while is_port_busy "$port"; do
    port=$((port + 1))
  done
  printf '%s\n' "$port"
}

if ! command -v go >/dev/null 2>&1; then
  echo "Go is required. Install Go, then rerun ./start.sh." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required for the visualization UI." >&2
  exit 1
fi

if [[ ! -d frontend/node_modules ]]; then
  echo "Installing frontend dependencies..."
  if [[ -f frontend/package-lock.json ]]; then
    npm --prefix frontend ci || {
      echo "npm install failed. If your VPN blocks public registries or breaks TLS, disconnect and rerun ./start.sh." >&2
      exit 1
    }
  else
    npm --prefix frontend install || {
      echo "npm install failed. If your VPN blocks public registries or breaks TLS, disconnect and rerun ./start.sh." >&2
      exit 1
    }
  fi
fi

VISION_PORT="$(find_free_port "$VISION_PORT")"
VISION_FRONTEND_PORT="$(find_free_port "$VISION_FRONTEND_PORT")"
export VISION_PORT
export VISION_FRONTEND_PORT
export VITE_API_BASE_URL="http://127.0.0.1:${VISION_PORT}"

cleanup() {
  if [[ -n "${BACKEND_PID:-}" ]]; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

go run ./cmd/vision serve &
BACKEND_PID=$!

for _ in {1..80}; do
  if curl -fsS "http://127.0.0.1:${VISION_PORT}/api/health" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    echo "Backend failed to start." >&2
    exit 1
  fi
  sleep 0.25
done

echo "Backend:  http://127.0.0.1:${VISION_PORT}"
echo "Frontend: http://127.0.0.1:${VISION_FRONTEND_PORT}"
echo "Use the Setup tab to configure Jira and Codex."

npm --prefix frontend run dev -- --host 127.0.0.1 --port "$VISION_FRONTEND_PORT" --open /
