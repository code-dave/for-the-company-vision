# Packaging

The Company Vision currently supports two distribution tracks:

1. Local web app distribution: build the Go binary plus static frontend, then run one command.
2. Native desktop distribution: package the same Go/frontend app with Wails for macOS and Windows.

## Local Web App

Build:

```bash
make build
```

Run:

```bash
./bin/company-vision serve
```

Open:

```text
http://127.0.0.1:8787
```

This is the simplest internal distribution today: ship `bin/company-vision`, `frontend/dist`, `schemas`, and `start.sh`.

## Desktop Packaging

Install desktop tooling:

```bash
./scripts/install-desktop-tooling.sh
```

Build production frontend and backend:

```bash
make build
```

Build a native desktop app:

```bash
./scripts/package-desktop.sh
```

Platform notes:

- macOS app bundles must be built on macOS.
- Windows EXE/MSI-style installers should be built on Windows for the cleanest result.
- If building Windows installers with Wails, install NSIS on the Windows build host.
- Code signing and notarization are separate release steps. Unsigned builds are fine for beta testing but may trigger OS warnings.

## Configuration

Runtime configuration is saved locally, not committed:

```text
.vision-cache/config.env
```

The Setup tab can update:

- Jira endpoint
- Jira project
- Jira API token
- Codex binary path
- Codex model override
- Backend port
- Cache directory

The API token is never returned to the frontend after save.
