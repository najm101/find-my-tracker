# syntax=docker/dockerfile:1

# ---- 1. Build the React app (static SPA). Node exists only in this stage. ----
FROM node:24-alpine AS web
WORKDIR /web
RUN npm install -g pnpm@12.4.2
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

# ---- 2. Python runtime ----
FROM python:3.14-slim AS runtime
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /usr/local/bin/uv

# git: FindMy.py is a pinned git dependency (fork) until it is released on PyPI.
RUN apt-get update \
 && apt-get install -y --no-install-recommends git \
 && rm -rf /var/lib/apt/lists/*

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app
COPY server/pyproject.toml server/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY server/ ./
RUN uv sync --frozen --no-dev

COPY --from=web /web/build/client ./static

RUN useradd --system --uid 10001 --home /app app \
 && mkdir -p /data && chown app /data
USER app

ENV DATA_DIR=/data \
    STATIC_DIR=/app/static \
    PORT=8080
EXPOSE 8080
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD python -c "import os,urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/api/health', timeout=4)"

CMD ["python", "-m", "find_my_tracker"]
