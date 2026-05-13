#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

npm --prefix frontend install
npm --prefix frontend run build
go build -o bin/company-vision ./cmd/vision

echo "Built bin/company-vision and frontend/dist"

