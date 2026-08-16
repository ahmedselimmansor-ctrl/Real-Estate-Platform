#!/usr/bin/env bash
# =============================================================================
# infra/scripts/lib/common.sh — shared helpers for the Nawy Clone shell tooling.
#
# Sourced (never executed) by bootstrap.sh, health-check.sh, reset.sh and
# gen-certs.sh. Provides: colours, logging, repo-root discovery, docker/compose
# detection, .env access and a couple of small utilities.
# =============================================================================

# Guard against double-sourcing.
if [[ -n "${NAWY_COMMON_SH_LOADED:-}" ]]; then
  return 0 2>/dev/null || exit 0
fi
NAWY_COMMON_SH_LOADED=1

# ----------------------------------------------------------------- colours --
if [[ -t 1 && -z "${NO_COLOR:-}" && "${TERM:-dumb}" != "dumb" ]]; then
  C_RESET=$'\033[0m'
  C_BOLD=$'\033[1m'
  C_DIM=$'\033[2m'
  C_RED=$'\033[31m'
  C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'
  C_BLUE=$'\033[34m'
  C_CYAN=$'\033[36m'
else
  C_RESET='' C_BOLD='' C_DIM='' C_RED='' C_GREEN='' C_YELLOW='' C_BLUE='' C_CYAN=''
fi

# ----------------------------------------------------------------- logging --
log()      { printf '%s\n' "$*"; }
info()     { printf '%s\n' "${C_BLUE}i${C_RESET} $*"; }
ok()       { printf '%s\n' "${C_GREEN}v${C_RESET} $*"; }
warn()     { printf '%s\n' "${C_YELLOW}!${C_RESET} $*" >&2; }
err()      { printf '%s\n' "${C_RED}x${C_RESET} $*" >&2; }
die()      { err "$*"; exit 1; }
hint()     { printf '%s\n' "  ${C_DIM}-> $*${C_RESET}" >&2; }

step_no=0
step() {
  step_no=$((step_no + 1))
  printf '\n%s\n' "${C_BOLD}${C_CYAN}[${step_no}] $*${C_RESET}"
}

banner() {
  printf '%s\n' "${C_CYAN}${C_BOLD}"
  cat <<'ASCII'
  _   _
 | \ | | __ _ __      __ _   _
 |  \| |/ _` |\ \ /\ / /| | | |
 | |\  | (_| | \ V  V / | |_| |
 |_| \_|\__,_|  \_/\_/   \__, |   clone - full stack
                         |___/
ASCII
  printf '%s' "${C_RESET}"
}

rule() { printf '%s\n' "${C_DIM}$(printf '%.0s-' $(seq 1 72))${C_RESET}"; }

# ------------------------------------------------------------- repo layout --
# Absolute path of infra/scripts, regardless of how the script was invoked.
NAWY_SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd -- "${NAWY_SCRIPT_DIR}/../.." && pwd)"
export NAWY_SCRIPT_DIR REPO_ROOT

ENV_FILE="${REPO_ROOT}/.env"
ENV_EXAMPLE="${REPO_ROOT}/.env.example"
CERT_DIR="${REPO_ROOT}/infra/nginx/certs"
CERT_CRT="${CERT_DIR}/localhost.crt"
CERT_KEY="${CERT_DIR}/localhost.key"
export ENV_FILE ENV_EXAMPLE CERT_DIR CERT_CRT CERT_KEY

# ---------------------------------------------------------------- commands --
have() { command -v "$1" >/dev/null 2>&1; }

require_cmd() {
  local cmd="$1" install_hint="${2:-}"
  if ! have "$cmd"; then
    err "Required command not found: ${C_BOLD}${cmd}${C_RESET}"
    [[ -n "$install_hint" ]] && hint "$install_hint"
    exit 1
  fi
}

# Populates the global COMPOSE array, e.g. COMPOSE=(docker compose).
detect_compose() {
  require_cmd docker "Install Docker Engine: https://docs.docker.com/engine/install/"

  if ! docker info >/dev/null 2>&1; then
    err "Docker is installed but the daemon is not reachable."
    hint "Start it:  sudo systemctl start docker   (Linux)"
    hint "           open -a Docker                (macOS)"
    hint "Or add yourself to the docker group:  sudo usermod -aG docker \$USER"
    exit 1
  fi

  if docker compose version >/dev/null 2>&1; then
    COMPOSE=(docker compose)
  elif have docker-compose; then
    COMPOSE=(docker-compose)
    warn "Using legacy docker-compose v1. Compose v2 is recommended."
  else
    err "Docker Compose is not available."
    hint "Install the Compose plugin: https://docs.docker.com/compose/install/"
    exit 1
  fi
  export COMPOSE_FILE="${REPO_ROOT}/docker-compose.yml"
}

# Run a compose subcommand from the repo root.
dc() {
  ( cd "$REPO_ROOT" && "${COMPOSE[@]}" "$@" )
}

# ------------------------------------------------------------------- .env ---
# env_get KEY [default] — read a value from .env without sourcing it (values
# may contain characters that break `source`).
env_get() {
  local key="$1" default="${2:-}" line value
  [[ -f "$ENV_FILE" ]] || { printf '%s' "$default"; return 0; }
  line="$(grep -E "^[[:space:]]*${key}=" "$ENV_FILE" | tail -n 1 || true)"
  [[ -n "$line" ]] || { printf '%s' "$default"; return 0; }
  value="${line#*=}"
  # strip surrounding quotes and trailing whitespace/CR
  value="${value%$'\r'}"
  value="${value%\"}"; value="${value#\"}"
  value="${value%\'}"; value="${value#\'}"
  [[ -n "$value" ]] || { printf '%s' "$default"; return 0; }
  printf '%s' "$value"
}

# env_set KEY VALUE — replace (or append) a key in .env, portably and in place.
env_set() {
  local key="$1" value="$2" tmp
  [[ -f "$ENV_FILE" ]] || die ".env not found at ${ENV_FILE}"
  tmp="$(mktemp "${ENV_FILE}.XXXXXX")"
  KEY="$key" VALUE="$value" awk '
    BEGIN { key = ENVIRON["KEY"]; value = ENVIRON["VALUE"]; done = 0 }
    {
      if ($0 ~ "^[[:space:]]*" key "=") { print key "=" value; done = 1 }
      else { print }
    }
    END { if (!done) print key "=" value }
  ' "$ENV_FILE" >"$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$ENV_FILE"
}

# A cryptographically strong, shell-safe secret (hex — no quoting hazards).
random_secret() {
  local bytes="${1:-32}"
  if have openssl; then
    openssl rand -hex "$bytes"
  elif [[ -r /dev/urandom ]]; then
    LC_ALL=C tr -dc 'a-f0-9' </dev/urandom | head -c $((bytes * 2))
  else
    die "Cannot generate a random secret: neither openssl nor /dev/urandom is available."
  fi
}

# ------------------------------------------------------------------ misc ----
# confirm "question" — returns 0 on an explicit yes.
confirm() {
  local prompt="$1" reply
  if [[ ! -t 0 ]]; then
    return 1
  fi
  read -r -p "${prompt} [y/N] " reply
  [[ "$reply" =~ ^([yY]|[yY][eE][sS])$ ]]
}

# Pretty fixed-width table row: row_fmt "col1" "col2" "col3"
table_rule() { printf '%s\n' "${C_DIM}+----------------------+------------------------------------------+----------+${C_RESET}"; }
table_row()  { printf '| %-20s | %-40s | %s%-8s%s |\n' "$1" "$2" "${4:-}" "$3" "${C_RESET}"; }

# Seconds since the epoch (portable).
now() { date +%s; }
