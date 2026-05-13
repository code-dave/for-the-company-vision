#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v wails >/dev/null 2>&1; then
  echo "Wails is not installed. Run ./scripts/install-desktop-tooling.sh first." >&2
  exit 1
fi

echo "Desktop packaging is prepared for Wails, but the native shell entrypoint is not wired yet."
echo "Current distributable build is available through ./scripts/package-web.sh."
echo "Next implementation step: add a Wails app entrypoint that binds the Go API directly to the React UI."
exit 2

