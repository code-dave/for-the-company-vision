#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

./scripts/build.sh

PACKAGE_DIR="dist/company-vision-web"
rm -rf "$PACKAGE_DIR"
mkdir -p "$PACKAGE_DIR"

cp -R bin "$PACKAGE_DIR/"
mkdir -p "$PACKAGE_DIR/frontend"
cp -R frontend/dist "$PACKAGE_DIR/frontend/dist"
cp -R schemas "$PACKAGE_DIR/"
cp start.sh README.md "$PACKAGE_DIR/"

cat > "$PACKAGE_DIR/RUN.md" <<'EOF'
# Run The Company Vision

```bash
./bin/company-vision serve
```

Then open:

```text
http://127.0.0.1:8787
```

Use the Setup tab to configure Jira and Codex.
EOF

tar -czf dist/company-vision-web.tar.gz -C dist company-vision-web
echo "Packaged dist/company-vision-web.tar.gz"
