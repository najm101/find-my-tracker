# Development

Requirements: [uv](https://docs.astral.sh/uv/), Node ≥ 22.22, pnpm.

```bash
# API on :8080
cd server
uv sync
SECRET_KEY=$(openssl rand -base64 48) ADMIN_PASSWORD=devpassword DATA_DIR=../data/dev \
  DEMO_MODE=true uv run python -m find_my_tracker

# Web on :5173 (proxies /api to :8080)
cd web
pnpm install
pnpm dev
```

## Layout

```
server/   FastAPI + poller (Python 3.14, feature-first: src/find_my_tracker/features/*)
web/      React Router SPA + shadcn/ui (feature-first: app/features/*)
docs/     PLAN.md (the full design and milestone history) and screenshots
```

Node is only used at build time: the Docker image builds the web app in a first stage and the
Python server serves the static build.

## Checks

The same ones CI runs:

```bash
cd server && uv run ruff check . && uv run ruff format --check . && uv run basedpyright && uv run pytest
cd web && pnpm lint && pnpm format:check && pnpm typecheck && pnpm build
```

After changing the API, regenerate the schema and the web types, or CI will fail on a stale
`openapi.json` / `schema.d.ts`:

```bash
cd server && uv run python -m find_my_tracker.openapi > openapi.json
cd ../web && pnpm api:types
```

Tests never call Apple. They use a fake Apple client with known answers: the password `wrong` is
rejected, the two-factor code is `123456`, the passcode is `1234`. The same fake backs
`DEMO_MODE`.

Database migrations are hand-written in `server/src/find_my_tracker/migrations/versions/` and
applied automatically on startup. Never edit an old one; add a new one.

## Releasing

Releases are automatic. Every push to `main` runs the checks and publishes the `edge` image.
When the `version` in `server/pyproject.toml` has no matching `v<version>` tag yet, the same run
also publishes `<version>`, `<major>.<minor>` and `latest`, tags the commit, and creates the
GitHub Release. To ship a new version, bump that number (for example `0.3.0` → `0.3.1`) and push.
