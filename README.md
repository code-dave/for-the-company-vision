# Company Vision Studio

Company Vision Studio pulls Jira project data, normalizes it, and asks the local Codex installation to synthesize a portfolio view: big rocks, small rocks, outliers, risks, and next moves. The app keeps the Jira/API logic in Go and keeps visualization/reporting in a React/TypeScript frontend.

## Architecture

- `cmd/vision`: Go CLI and HTTP server.
- `internal/jira`: Jira REST API client and issue normalization.
- `internal/analysis`: Codex analyzer boundary. The first provider shells out to `codex exec` with a strict JSON schema.
- `internal/httpapi`: Local API used by the frontend.
- `frontend`: Vite + React + TypeScript visualization UI.
- `schemas/vision-analysis.schema.json`: Contract Codex must return for the board.

The app does not commit Jira credentials. Put local values in `.env.local`; that file is ignored by git.

## Local Setup

```bash
cp .env.example .env.local
# edit .env.local and set JIRA_TOKEN
./start.sh
```

Defaults:

- Jira endpoint: `https://jira.oci.oraclecorp.com/`
- Jira project: `OHAIFSRE`
- Backend: `http://127.0.0.1:8787`
- Frontend: `http://127.0.0.1:5173`

## Commands

```bash
make health       # verify local config and Codex CLI availability
make sync         # pull Jira into .vision-cache
make analyze      # run Codex analysis against cached Jira data
make test         # Go tests and frontend typecheck
make build        # production frontend build and Go binary
```

If npm fails with a corporate CA error, run the install step with a trusted internal CA configured. For this local machine, `NPM_CONFIG_STRICT_SSL=false npm --prefix frontend install` was required because Node could not verify the registry certificate chain.

## Desktop Packaging Path

The current app is split cleanly for Wails packaging: Go owns the app/service layer and React owns the UI. Run `scripts/install-desktop-tooling.sh` to install Wails. The next packaging step is to add a Wails desktop entrypoint that reuses the same Go services and frontend bundle for DMG/EXE output.
