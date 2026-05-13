#!/usr/bin/env bash
set -euo pipefail

if ! command -v go >/dev/null 2>&1; then
  echo "Go is required before installing Wails." >&2
  exit 1
fi

go install github.com/wailsapp/wails/v2/cmd/wails@latest
echo "Wails installed. Desktop packaging integration will reuse the Go service and frontend."

