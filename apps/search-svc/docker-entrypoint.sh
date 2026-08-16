#!/bin/sh
# ---------------------------------------------------------------------------
# search-svc entrypoint.
# Starts uvicorn on 0.0.0.0:${PORT:-8000}; enables --reload in development so
# the ./apps/search-svc/app bind mount gives live reload inside docker compose.
# ---------------------------------------------------------------------------
set -eu

PORT="${PORT:-8000}"
APP_ENV="${APP_ENV:-development}"
LOG_LEVEL_UVICORN="$(printf '%s' "${LOG_LEVEL:-info}" | tr '[:upper:]' '[:lower:]')"

# Anything passed to `docker run` / `command:` wins over the default server.
if [ "$#" -gt 0 ]; then
  exec "$@"
fi

set -- uvicorn app.main:app \
  --host 0.0.0.0 \
  --port "$PORT" \
  --proxy-headers \
  --forwarded-allow-ips='*' \
  --no-server-header \
  --log-level "$LOG_LEVEL_UVICORN" \
  --timeout-graceful-shutdown 20

if [ "$APP_ENV" = "development" ] || [ "$APP_ENV" = "dev" ] || [ "$APP_ENV" = "local" ]; then
  set -- "$@" --reload --reload-dir /app/app
fi

echo "[search-svc] APP_ENV=${APP_ENV} starting: $*" >&2
exec "$@"
