# The Company Vision

The Company Vision pulls Jira project data, normalizes it, and asks the local Codex installation to synthesize a portfolio view: big rocks, small rocks, outliers, risks, and next moves. The app keeps the Jira/API logic in Go and keeps visualization/reporting in a React/TypeScript frontend.

## Architecture

- `cmd/vision`: Go CLI and HTTP server.
- `internal/jira`: Jira REST API client and issue normalization.
- `internal/analysis`: Codex analyzer boundary. The first provider shells out to `codex exec` with a strict JSON schema.
- `internal/httpapi`: Local API used by the frontend.
- `frontend`: Vite + React + TypeScript visualization UI.
- `schemas/vision-analysis.schema.json`: Contract Codex must return for the board.

The app does not commit Jira credentials. Put local values in `.env.local`; that file is ignored by git. First-time users can also save settings from the app's Setup tab.

## Local Setup

```bash
./start.sh
```

On first launch, open the Setup tab and save your Jira endpoint, project, API token, and Codex settings. The app writes those values to `.vision-cache/config.env`, which is ignored by git.

Local addresses:

- Backend: `http://127.0.0.1:8787`
- Frontend: `http://127.0.0.1:5173`

If either port is already in use, `start.sh` automatically chooses the next available port and prints it.

## Commands

```bash
make health       # verify local config and Codex CLI availability
make sync         # pull Jira into .vision-cache
make analyze      # run Codex analysis against cached Jira data
make test         # Go tests and frontend typecheck
make build        # production frontend build and Go binary
```

If npm fails with a corporate CA error, run the install step with a trusted internal CA configured. For this local machine, `NPM_CONFIG_STRICT_SSL=false npm --prefix frontend install` was required because Node could not verify the registry certificate chain.

Network notes:

- Connect to the network that can resolve your Jira endpoint before `make sync` or `make analyze`.
- If your VPN blocks public package registries or breaks certificate validation, disconnect before installing new npm packages.

## Desktop Packaging Path

See [docs/PACKAGING.md](docs/PACKAGING.md). The current app can be packaged as a local web app immediately with `make package-web`. The native DMG/EXE path is Wails; the next implementation step is adding a Wails desktop entrypoint over the existing Go services and React UI.
