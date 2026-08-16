#!/usr/bin/env bash
# =============================================================================
# reset.sh — tear the local stack down, including its data volumes.
#
#   ./infra/scripts/reset.sh              # ask first, then down -v
#   ./infra/scripts/reset.sh --yes        # no prompt (CI / scripted)
#   ./infra/scripts/reset.sh --yes --certs --images
#
# Destroys: containers, networks and the postgres/mongo/redis/elasticsearch
# volumes. Never touches .env unless you pass --env.
# =============================================================================
set -euo pipefail

# shellcheck source=lib/common.sh
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

ASSUME_YES=0
DROP_CERTS=0
DROP_IMAGES=0
DROP_ENV=0

usage() {
  cat <<EOF
${C_BOLD}reset.sh${C_RESET} — destroy the local stack and its data.

Usage: ./infra/scripts/reset.sh [options]

Options:
  -y, --yes      Do not prompt for confirmation
      --certs    Also delete infra/nginx/certs/localhost.{crt,key}
      --images   Also remove the images built by this project
      --env      Also delete .env  (secrets are regenerated on next bootstrap)
  -h, --help     Show this help

Rebuild afterwards with:  ./infra/scripts/bootstrap.sh
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -y|--yes) ASSUME_YES=1; shift ;;
    --certs)  DROP_CERTS=1; shift ;;
    --images) DROP_IMAGES=1; shift ;;
    --env)    DROP_ENV=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) err "Unknown option: $1"; usage; exit 1 ;;
  esac
done

detect_compose

# ------------------------------------------------------------- what dies -----
log ""
log "${C_RED}${C_BOLD}This will permanently delete:${C_RESET}"
log "  - every nawy-clone container and its network"
log "  - the ${C_BOLD}postgres${C_RESET} volume  (users, developers, compounds, leads, RAG vectors)"
log "  - the ${C_BOLD}mongo${C_RESET} volume     (property documents, views, activity)"
log "  - the ${C_BOLD}redis${C_RESET} volume     (cache, sessions, refresh tokens)"
log "  - the ${C_BOLD}elasticsearch${C_RESET} volume (search index)"
[[ "$DROP_CERTS"  -eq 1 ]] && log "  - the self-signed TLS certificate"
[[ "$DROP_IMAGES" -eq 1 ]] && log "  - the locally built service images"
[[ "$DROP_ENV"    -eq 1 ]] && log "  - your ${C_BOLD}.env${C_RESET} file (including generated secrets)"
log ""

if [[ "$ASSUME_YES" -eq 0 ]]; then
  if [[ ! -t 0 ]]; then
    die "Refusing to reset non-interactively without --yes."
  fi
  read -r -p "Type ${C_BOLD}reset${C_RESET} to confirm: " answer
  [[ "$answer" == "reset" ]] || { info "Aborted — nothing was deleted."; exit 0; }
fi

# ---------------------------------------------------------------- tear down --
step "Stopping containers and removing volumes"
dc down --volumes --remove-orphans --timeout 20 || warn "compose down reported an error — continuing"
ok "containers, network and named volumes removed"

if [[ "$DROP_IMAGES" -eq 1 ]]; then
  step "Removing built images"
  dc down --rmi local --volumes --remove-orphans >/dev/null 2>&1 || true
  ok "project images removed"
fi

if [[ "$DROP_CERTS" -eq 1 ]]; then
  step "Removing the TLS certificate"
  rm -f "$CERT_CRT" "$CERT_KEY"
  ok "certificate deleted — regenerate with: make certs"
fi

if [[ "$DROP_ENV" -eq 1 ]]; then
  step "Removing .env"
  rm -f "$ENV_FILE"
  ok ".env deleted — bootstrap will recreate it from .env.example"
fi

rm -f "${REPO_ROOT}/.bootstrap.log"

log ""
ok "Reset complete."
log "  Start over with:  ${C_BOLD}./infra/scripts/bootstrap.sh${C_RESET}"
log ""
