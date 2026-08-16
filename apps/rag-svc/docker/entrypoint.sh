#!/usr/bin/env sh
# ---------------------------------------------------------------------------
# apps/rag-svc container entrypoint.
#
#   rag-entrypoint uvicorn         -> start the API (default)
#   rag-entrypoint migrate         -> run alembic upgrade head, then exit
#   rag-entrypoint init-db         -> idempotent schema bootstrap, then exit
#   rag-entrypoint <anything else> -> exec'd verbatim
# ---------------------------------------------------------------------------
set -eu

PORT="${PORT:-8001}"
APP_ENV="${APP_ENV:-development}"
RAG_LOG_LEVEL="${LOG_LEVEL:-info}"

case "${1:-uvicorn}" in
  migrate)
    exec alembic upgrade head
    ;;
  init-db)
    exec python -m app.db.init
    ;;
  uvicorn)
    set -- uvicorn app.main:app \
      --host 0.0.0.0 \
      --port "${PORT}" \
      --log-level "$(echo "${RAG_LOG_LEVEL}" | tr '[:upper:]' '[:lower:]')" \
      --no-access-log \
      --proxy-headers \
      --forwarded-allow-ips '*' \
      --timeout-graceful-shutdown 20
    if [ "${APP_ENV}" = "development" ] && [ "${RAG_RELOAD:-1}" = "1" ]; then
      set -- "$@" --reload --reload-dir /app/app
    fi
    exec "$@"
    ;;
  *)
    exec "$@"
    ;;
esac
