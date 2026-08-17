#!/usr/bin/env bash
# =============================================================================
# health-check.sh — probe every TopChoice service, directly and through nginx.
#
#   ./infra/scripts/health-check.sh            # everything
#   ./infra/scripts/health-check.sh --edge     # only through https://localhost
#   ./infra/scripts/health-check.sh --direct   # only the published host ports
#
# Exits 1 if any probe fails, so it doubles as a CI smoke test.
# =============================================================================
set -uo pipefail   # NOTE: no -e — a failing probe must be recorded, not fatal.

# shellcheck source=lib/common.sh
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

TIMEOUT=10
CHECK_DIRECT=1
CHECK_EDGE=1
CHECK_CONTAINERS=1
QUIET=0

usage() {
  cat <<EOF
${C_BOLD}health-check.sh${C_RESET} — pass/fail table for the whole stack.

Usage: ./infra/scripts/health-check.sh [options]

Options:
  --direct         Only probe the published host ports (skip nginx)
  --edge           Only probe through https://localhost (skip host ports)
  --no-containers  Skip the docker container health column
  --timeout <sec>  Per-request timeout (default: ${TIMEOUT})
  --quiet          Print only the summary line
  -h, --help       Show this help

Exit code: 0 when every probe passes, 1 otherwise.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --direct)        CHECK_EDGE=0; shift ;;
    --edge)          CHECK_DIRECT=0; shift ;;
    --no-containers) CHECK_CONTAINERS=0; shift ;;
    --timeout)       TIMEOUT="${2:?--timeout requires a value}"; shift 2 ;;
    --quiet)         QUIET=1; shift ;;
    -h|--help)       usage; exit 0 ;;
    *) err "Unknown option: $1"; usage; exit 1 ;;
  esac
done

require_cmd curl "sudo apt-get install curl | brew install curl"

PASS=0
FAIL=0
FAILED_ROWS=()

say() { [[ "$QUIET" -eq 1 ]] || printf '%s\n' "$*"; }

header() {
  say ""
  say "${C_BOLD}$1${C_RESET}"
  say "${C_DIM}$(printf '%.0s-' $(seq 1 92))${C_RESET}"
  say "$(printf '%-14s %-46s %-6s %9s  %s' 'SERVICE' 'ENDPOINT' 'CODE' 'TIME' 'RESULT')"
}

# check_http NAME URL [EXPECTED_REGEX]
check_http() {
  local name="$1" url="$2" expect="${3:-^(200|204)$}"
  local out code time_total result

  out="$(curl -sk -o /dev/null --max-time "$TIMEOUT" -w '%{http_code} %{time_total}' "$url" 2>/dev/null)"
  code="${out%% *}"
  time_total="${out##* }"
  [[ -n "$code" ]] || code="000"
  [[ "$time_total" =~ ^[0-9.]+$ ]] || time_total="0"

  if [[ "$code" =~ $expect ]]; then
    result="${C_GREEN}PASS${C_RESET}"
    PASS=$((PASS + 1))
  else
    result="${C_RED}FAIL${C_RESET}"
    FAIL=$((FAIL + 1))
    FAILED_ROWS+=("${name} -> ${url} (got HTTP ${code}, expected ${expect})")
  fi
  say "$(printf '%-14s %-46s %-6s %8ss  %b' "$name" "${url:0:46}" "$code" "$time_total" "$result")"
}

# check_container NAME COMPOSE_SERVICE
check_container() {
  local name="$1" svc="$2" cid state health result label
  cid="$(dc ps -q "$svc" 2>/dev/null | head -n 1)"
  if [[ -z "$cid" ]]; then
    FAIL=$((FAIL + 1))
    FAILED_ROWS+=("${name} container is not running")
    say "$(printf '%-14s %-46s %-6s %9s  %b' "$name" "container: (not created)" "-" "-" "${C_RED}FAIL${C_RESET}")"
    return
  fi
  state="$(docker inspect --format '{{.State.Status}}' "$cid" 2>/dev/null)"
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$cid" 2>/dev/null)"
  label="${state}/${health}"

  if [[ "$state" == "running" && ( "$health" == "healthy" || "$health" == "no-healthcheck" ) ]]; then
    result="${C_GREEN}PASS${C_RESET}"; PASS=$((PASS + 1))
  else
    result="${C_RED}FAIL${C_RESET}"; FAIL=$((FAIL + 1))
    FAILED_ROWS+=("${name} container state: ${label}")
  fi
  say "$(printf '%-14s %-46s %-6s %9s  %b' "$name" "container: ${label}" "-" "-" "$result")"
}

[[ "$QUIET" -eq 1 ]] || banner
say "${C_DIM}timeout ${TIMEOUT}s — $(date '+%Y-%m-%d %H:%M:%S')${C_RESET}"

# ----------------------------------------------------------- containers ------
if [[ "$CHECK_CONTAINERS" -eq 1 ]] && have docker && docker info >/dev/null 2>&1; then
  detect_compose
  header "Containers (docker compose)"
  check_container postgres      postgres
  check_container mongo         mongo
  check_container redis         redis
  check_container elasticsearch elasticsearch
  check_container api-core      api-core
  check_container search-svc    search-svc
  check_container rag-svc       rag-svc
  check_container reports-svc   reports-svc
  check_container web           web
  check_container nginx         nginx
elif [[ "$CHECK_CONTAINERS" -eq 1 ]]; then
  warn "docker is unavailable — skipping the container column"
fi

# --------------------------------------------------------------- direct ------
if [[ "$CHECK_DIRECT" -eq 1 ]]; then
  header "Direct (published host ports — bypasses nginx)"
  check_http api-core      "http://localhost:4000/health"
  check_http api-core      "http://localhost:4000/health/ready"
  check_http search-svc    "http://localhost:8000/health"
  check_http rag-svc       "http://localhost:8001/health"
  check_http reports-svc   "http://localhost:4567/health"
  check_http web           "http://localhost:3000/"                  '^(200|30[128])$'
  check_http elasticsearch "http://localhost:9200/_cluster/health"
fi

# ----------------------------------------------------------------- edge ------
if [[ "$CHECK_EDGE" -eq 1 ]]; then
  header "Through nginx (https://localhost — TLS terminated)"
  check_http nginx        "http://localhost/"                        '^301$'
  check_http nginx        "https://localhost/__health/nginx"
  check_http web          "https://localhost/__health/web"           '^(200|30[128])$'
  check_http api-core     "https://localhost/__health/api-core"
  check_http search-svc   "https://localhost/__health/search-svc"
  check_http rag-svc      "https://localhost/__health/rag-svc"
  check_http reports-svc  "https://localhost/__health/reports-svc"
  check_http rag-svc      "https://localhost/api/chat/health"
  check_http reports-svc  "https://localhost/api/reports/health"
  check_http web          "https://localhost/"                       '^(200|30[128])$'
fi

# -------------------------------------------------------------- summary ------
say ""
say "${C_DIM}$(printf '%.0s-' $(seq 1 92))${C_RESET}"
if [[ "$FAIL" -eq 0 ]]; then
  printf '%s\n' "${C_GREEN}${C_BOLD}ALL CHECKS PASSED${C_RESET} — ${PASS} probe(s) green."
  exit 0
fi

printf '%s\n' "${C_RED}${C_BOLD}${FAIL} CHECK(S) FAILED${C_RESET} (${PASS} passed)"
for row in "${FAILED_ROWS[@]}"; do
  printf '  %s%s%s\n' "${C_RED}" "$row" "${C_RESET}"
done
cat >&2 <<EOF

${C_BOLD}What to try:${C_RESET}
  make ps                 # is every container up?
  make logs-api-core      # (or logs-search-svc, logs-rag-svc, ...)
  make health             # re-run this script
  make restart            # bounce the stack
  ./infra/scripts/bootstrap.sh --skip-build
EOF
exit 1
