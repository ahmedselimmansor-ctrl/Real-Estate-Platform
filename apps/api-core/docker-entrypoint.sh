#!/bin/sh
# ---------------------------------------------------------------------------
# api-core container entrypoint.
#
# Prepares Prisma (client + migrations) and then execs the container command,
# so node stays PID 1 and receives SIGTERM for graceful shutdown.
# A database that is still booting must not crash-loop the container: migration
# failures are retried and finally tolerated, letting /health report the state.
# ---------------------------------------------------------------------------
set -e

SCHEMA="prisma/schema.prisma"
MAX_ATTEMPTS=10
RETRY_DELAY=3

log() {
  echo "[api-core] $*"
}

if [ -z "${DATABASE_URL:-}" ]; then
  log "DATABASE_URL is not set — skipping the Prisma bootstrap"
else
  if [ "${NODE_ENV:-development}" != "production" ]; then
    log "generating the Prisma client"
    npx --no-install prisma generate --schema="${SCHEMA}" \
      || log "prisma generate failed — continuing with the existing client"
  fi

  attempt=1
  while true; do
    if npx --no-install prisma migrate deploy --schema="${SCHEMA}"; then
      log "migrations applied"
      break
    fi

    if [ "${attempt}" -ge "${MAX_ATTEMPTS}" ]; then
      log "migrate deploy still failing after ${MAX_ATTEMPTS} attempts — starting anyway"
      break
    fi

    log "database not ready (attempt ${attempt}/${MAX_ATTEMPTS}); retrying in ${RETRY_DELAY}s"
    attempt=$((attempt + 1))
    sleep "${RETRY_DELAY}"
  done
fi

log "starting: $*"
exec "$@"
