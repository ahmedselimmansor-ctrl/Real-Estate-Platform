#!/usr/bin/env bash
# =============================================================================
# bootstrap.sh — one command, from a fresh clone to a running TopChoice.
#
#   ./infra/scripts/bootstrap.sh
#
# Steps (all idempotent — safe to re-run any number of times):
#   1. verify docker / compose / openssl / curl and the repo layout
#   2. create .env from .env.example and mint strong secrets in place
#   3. generate the self-signed TLS certificate for nginx
#   4. build images
#   5. start the stack
#   6. wait for every healthcheck with a live progress display
#   7. run Prisma migrations + the api-core seeder
#   8. build the Elasticsearch index (search-svc reindex)
#   9. ingest the RAG corpus (properties + FAQ) into pgvector
#  10. print the URL table and demo credentials
# =============================================================================
set -euo pipefail

# shellcheck source=lib/common.sh
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

# ------------------------------------------------------------------ options --
SKIP_BUILD=0
SKIP_SEED=0
SKIP_REINDEX=0
SKIP_INGEST=0
FORCE_CERTS=0
PULL=0
WAIT_TIMEOUT=600

usage() {
  cat <<EOF
${C_BOLD}bootstrap.sh${C_RESET} — boot the whole TopChoice stack.

Usage: ./infra/scripts/bootstrap.sh [options]

Options:
  --skip-build        Do not run \`docker compose build\` (use existing images)
  --skip-seed         Do not run migrations / the api-core seeder
  --skip-reindex      Do not rebuild the Elasticsearch index
  --skip-ingest       Do not ingest the RAG corpus into pgvector
  --force-certs       Regenerate the TLS certificate even if one exists
  --pull              Pull newer base images before building
  --timeout <sec>     Health wait budget per phase (default: ${WAIT_TIMEOUT})
  -h, --help          Show this help

Environment:
  NO_COLOR=1          Disable ANSI colours
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build)   SKIP_BUILD=1; shift ;;
    --skip-seed)    SKIP_SEED=1; shift ;;
    --skip-reindex) SKIP_REINDEX=1; shift ;;
    --skip-ingest)  SKIP_INGEST=1; shift ;;
    --force-certs)  FORCE_CERTS=1; shift ;;
    --pull)         PULL=1; shift ;;
    --timeout)      WAIT_TIMEOUT="${2:?--timeout requires a value}"; shift 2 ;;
    -h|--help)      usage; exit 0 ;;
    *) err "Unknown option: $1"; usage; exit 1 ;;
  esac
done

# Demo accounts created by the api-core seeder — keep in sync with the
# DEMO_USERS array in apps/api-core/prisma/seed.ts.
DEMO_PASSWORD="TopChoice@Demo123"
DEMO_ADMIN_EMAIL="admin@topchoice.local"
DEMO_AGENT_EMAIL="agent@topchoice.local"
DEMO_USER_EMAIL="buyer@topchoice.local"

# Compose services that must become healthy, in start order.
DATA_SERVICES=(postgres mongo redis elasticsearch)
APP_SERVICES=(api-core search-svc rag-svc reports-svc)
EDGE_SERVICES=(web nginx)

LOG_FILE="${REPO_ROOT}/.bootstrap.log"
: >"$LOG_FILE"

# Run a command, streaming to the log file, showing output only on failure.
run_logged() {
  local desc="$1"; shift
  printf '  %s%s%s ' "${C_DIM}" "$desc" "${C_RESET}"
  if "$@" >>"$LOG_FILE" 2>&1; then
    printf '%s\n' "${C_GREEN}ok${C_RESET}"
    return 0
  fi
  printf '%s\n' "${C_RED}failed${C_RESET}"
  return 1
}

tail_log() {
  err "Last 25 lines of ${LOG_FILE}:"
  tail -n 25 "$LOG_FILE" | sed 's/^/    /' >&2
}

# ============================================================ 1. prerequisites
step "Checking prerequisites"

require_cmd curl    "sudo apt-get install curl | brew install curl"
require_cmd openssl "sudo apt-get install openssl | brew install openssl"
detect_compose
ok "docker $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo '?') and $( "${COMPOSE[@]}" version --short 2>/dev/null || echo compose ) are available"

[[ -f "${REPO_ROOT}/docker-compose.yml" ]] || die "docker-compose.yml not found in ${REPO_ROOT}"
[[ -f "$ENV_EXAMPLE" ]] || die ".env.example not found in ${REPO_ROOT}"

missing_dockerfiles=()
for svc in api-core search-svc rag-svc reports-svc web; do
  [[ -f "${REPO_ROOT}/apps/${svc}/Dockerfile" ]] || missing_dockerfiles+=("apps/${svc}/Dockerfile")
done
if ((${#missing_dockerfiles[@]} > 0)); then
  err "These service Dockerfiles are missing, so the stack cannot be built:"
  for f in "${missing_dockerfiles[@]}"; do hint "$f"; done
  die "Finish (or pull) the missing service before bootstrapping."
fi
ok "all five service Dockerfiles are present"

# Port pre-flight — only when none of our containers are already up.
running_now="$(dc ps -q 2>/dev/null | wc -l | tr -d ' ')"
if [[ "$running_now" == "0" ]]; then
  port_in_use() { (exec 3<>"/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1 && exec 3<&- && return 0 || return 1; }
  busy=()
  for p in 80 443 3000 4000 4567 5432 6379 8000 8001 9200 27017; do
    port_in_use "$p" && busy+=("$p")
  done
  if ((${#busy[@]} > 0)); then
    warn "These host ports are already in use: ${busy[*]}"
    hint "Stop whatever owns them, or the affected containers will fail to start."
    hint "Find the owner with:  sudo ss -lptn 'sport = :${busy[0]}'"
  else
    ok "all required host ports are free"
  fi
fi

# ================================================================= 2. .env ====
step "Preparing .env"

if [[ -f "$ENV_FILE" ]]; then
  ok ".env already exists — keeping it (values are never overwritten)"
else
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  ok "created .env from .env.example"
fi

# Replace placeholder/empty secrets with real random ones — but never clobber a
# value the developer has already customised.
rotate_secret_if_placeholder() {
  local key="$1" bytes="${2:-32}" current
  current="$(env_get "$key" "")"
  if [[ -z "$current" || "$current" == change-me* ]]; then
    env_set "$key" "$(random_secret "$bytes")"
    ok "generated a fresh ${C_BOLD}${key}${C_RESET} (${bytes} random bytes, hex)"
  else
    info "${key} already set — left untouched"
  fi
}

rotate_secret_if_placeholder JWT_ACCESS_SECRET 32
rotate_secret_if_placeholder JWT_REFRESH_SECRET 32
rotate_secret_if_placeholder INTERNAL_SERVICE_TOKEN 24
chmod 600 "$ENV_FILE" 2>/dev/null || true

INTERNAL_TOKEN="$(env_get INTERNAL_SERVICE_TOKEN)"
DASHSCOPE_KEY="$(env_get DASHSCOPE_API_KEY "")"
OPENAI_KEY="$(env_get OPENAI_API_KEY "")"

[[ -n "$DASHSCOPE_KEY" ]] || warn "DASHSCOPE_API_KEY is empty — embeddings/rerank are unavailable (RAG ingest will be skipped)."
[[ -n "$OPENAI_KEY"    ]] || warn "OPENAI_API_KEY is empty — the chatbot cannot generate answers until you set it in .env."

# ================================================================= 3. certs ===
step "Generating the TLS certificate"

cert_args=()
[[ "$FORCE_CERTS" -eq 1 ]] && cert_args+=(--force)
"${TOPCHOICE_SCRIPT_DIR}/gen-certs.sh" --quiet "${cert_args[@]}" ||
  die "Certificate generation failed. Run ${TOPCHOICE_SCRIPT_DIR}/gen-certs.sh directly for details."
ok "certificate ready at infra/nginx/certs/localhost.crt"

# ================================================================= 4. build ===
if [[ "$SKIP_BUILD" -eq 1 ]]; then
  step "Building images (skipped)"
else
  step "Building images — first run takes a few minutes"
  if [[ "$PULL" -eq 1 ]]; then
    # Non-fatal on purpose: a stale-but-present base image still builds, and
    # `--ignore-buildable` only exists on Compose v2.15+.
    run_logged "docker compose pull" dc pull --ignore-buildable ||
      warn "pull failed — continuing with the images already on disk (see ${LOG_FILE})"
  fi
  if ! run_logged "docker compose build" dc build; then
    tail_log
    err "Image build failed."
    hint "Full log: ${LOG_FILE}"
    hint "Retry a single service with:  make build && docker compose build api-core"
    exit 1
  fi
fi

# ================================================================= 5. up ======
step "Starting the stack"

if ! run_logged "docker compose up -d" dc up -d --remove-orphans; then
  tail_log
  die "Could not start the containers. Check the log above and \`make ps\`."
fi

# ============================================================ 6. health wait ==
step "Waiting for services to become healthy"

container_id() { dc ps -q "$1" 2>/dev/null | head -n 1; }

# Prints one of: healthy | unhealthy | starting | running | missing
service_state() {
  local svc="$1" cid state health
  cid="$(container_id "$svc")"
  [[ -n "$cid" ]] || { printf 'missing'; return; }
  state="$(docker inspect --format '{{.State.Status}}' "$cid" 2>/dev/null || echo missing)"
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null || echo none)"
  if [[ "$state" != "running" ]]; then printf '%s' "$state"; return; fi
  case "$health" in
    healthy)   printf 'healthy' ;;
    unhealthy) printf 'unhealthy' ;;
    starting)  printf 'starting' ;;
    *)         printf 'running' ;;   # no healthcheck declared (web, nginx)
  esac
}

# web and nginx have no compose healthcheck — probe them over HTTP instead.
service_ready() {
  local svc="$1" state
  state="$(service_state "$svc")"
  case "$svc" in
    web)
      [[ "$state" == "running" || "$state" == "healthy" ]] || return 1
      curl -fsS -o /dev/null --max-time 5 "http://localhost:3000/" 2>/dev/null
      ;;
    nginx)
      [[ "$state" == "running" || "$state" == "healthy" ]] || return 1
      curl -fsSk -o /dev/null --max-time 5 "https://localhost/__health/nginx" 2>/dev/null
      ;;
    *)
      [[ "$state" == "healthy" ]]
      ;;
  esac
}

state_icon() {
  case "$1" in
    ready)     printf '%s' "${C_GREEN}ready   ${C_RESET}" ;;
    healthy)   printf '%s' "${C_GREEN}healthy ${C_RESET}" ;;
    starting)  printf '%s' "${C_YELLOW}starting${C_RESET}" ;;
    running)   printf '%s' "${C_YELLOW}booting ${C_RESET}" ;;
    unhealthy) printf '%s' "${C_RED}unhealthy${C_RESET}" ;;
    missing)   printf '%s' "${C_RED}missing ${C_RESET}" ;;
    *)         printf '%s' "${C_RED}${1}${C_RESET}" ;;
  esac
}

IS_TTY=0; [[ -t 1 ]] && IS_TTY=1
drawn_lines=0

wait_for_services() {
  local phase="$1"; shift
  local services=("$@")
  local deadline=$(( $(now) + WAIT_TIMEOUT ))
  local first=1 last_print=0

  info "${phase}: ${services[*]}"
  while :; do
    local all_ready=1 lines=() svc state label
    for svc in "${services[@]}"; do
      if service_ready "$svc"; then
        label="ready"
      else
        all_ready=0
        state="$(service_state "$svc")"
        label="$state"
        [[ "$state" == "healthy" ]] && label="running"   # ready-probe not passing yet
      fi
      lines+=("$(printf '    %-16s %s' "$svc" "$(state_icon "$label")")")
    done

    if [[ "$IS_TTY" -eq 1 ]]; then
      [[ "$first" -eq 0 ]] && printf '\033[%dA' "$drawn_lines"
      for l in "${lines[@]}"; do printf '\033[2K%s\n' "$l"; done
      drawn_lines=${#lines[@]}
    elif [[ $(( $(now) - last_print )) -ge 15 || "$first" -eq 1 ]]; then
      for l in "${lines[@]}"; do printf '%s\n' "$l"; done
      last_print=$(now)
    fi
    first=0

    [[ "$all_ready" -eq 1 ]] && { ok "${phase}: all ready"; return 0; }

    if [[ $(now) -ge $deadline ]]; then
      err "Timed out after ${WAIT_TIMEOUT}s waiting for: ${services[*]}"
      for svc in "${services[@]}"; do
        service_ready "$svc" || {
          err "  ${svc} -> $(service_state "$svc")"
          hint "logs: make logs-${svc}"
        }
      done
      hint "Raise the budget with:  ./infra/scripts/bootstrap.sh --timeout 900"
      return 1
    fi
    sleep 3
  done
}

wait_for_services "data stores"   "${DATA_SERVICES[@]}"  || exit 1
wait_for_services "backend services" "${APP_SERVICES[@]}" || exit 1
wait_for_services "edge"          "${EDGE_SERVICES[@]}"  || exit 1

# ============================================================== 7. migrate ====
exec_in() {
  local svc="$1"; shift
  dc exec -T "$svc" sh -lc "$*"
}

# Try a list of candidate commands until one succeeds.
try_in() {
  local svc="$1"; shift
  local cmd
  for cmd in "$@"; do
    printf '\n--- %s: %s\n' "$svc" "$cmd" >>"$LOG_FILE"
    if exec_in "$svc" "$cmd" >>"$LOG_FILE" 2>&1; then
      printf '  %s%s%s %s\n' "${C_DIM}" "$cmd" "${C_RESET}" "${C_GREEN}ok${C_RESET}"
      return 0
    fi
    printf '  %s%s%s %s\n' "${C_DIM}" "$cmd" "${C_RESET}" "${C_YELLOW}no${C_RESET}"
  done
  return 1
}

if [[ "$SKIP_SEED" -eq 1 ]]; then
  step "Migrations and seed (skipped)"
else
  step "Applying database migrations"
  if try_in api-core \
      'npx --yes prisma migrate deploy' \
      'npm run --silent migrate:deploy' \
      'npx --yes prisma db push --skip-generate'; then
    ok "Postgres schema is up to date"
  else
    tail_log
    err "Could not apply Prisma migrations inside the api-core container."
    hint "Try manually:  make shell-api-core  then  npx prisma migrate deploy"
    exit 1
  fi

  step "Seeding the demo dataset (seed/*.json -> Postgres + MongoDB)"
  if try_in api-core \
      'npm run --silent seed' \
      'npx --yes prisma db seed' \
      'npm run --silent seed:all'; then
    ok "developers, areas, compounds, properties, amenities and demo users are in place"
  else
    tail_log
    err "The api-core seeder failed."
    hint "Full log: ${LOG_FILE}"
    hint "Run it manually:  make seed"
    exit 1
  fi
fi

# ============================================================== 8. reindex ====
api_call() {
  # api_call METHOD PATH [JSON_BODY] -> echoes the response body, exits non-zero
  # on a non-2xx status.
  local method="$1" path="$2" body="${3:-}" out status
  local args=(-sk -X "$method" --max-time 600 -H "X-Service-Token: ${INTERNAL_TOKEN}" -H 'Accept: application/json' -w '\n%{http_code}')
  [[ -n "$body" ]] && args+=(-H 'Content-Type: application/json' -d "$body")
  out="$(curl "${args[@]}" "https://localhost${path}" 2>/dev/null || true)"
  status="${out##*$'\n'}"
  printf '%s' "${out%$'\n'*}"
  [[ "$status" =~ ^2 ]]
}

json_field() {
  # json_field KEY  (stdin) — tiny, dependency-free string-field extractor.
  local key="$1"
  sed -n "s/.*\"${key}\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" | head -n 1
}

if [[ "$SKIP_REINDEX" -eq 1 ]]; then
  step "Elasticsearch reindex (skipped)"
else
  step "Building the Elasticsearch index"
  attempt=1
  until [[ $attempt -gt 3 ]]; do
    if response="$(api_call POST /api/search/reindex '{"full":true}')"; then
      ok "search index rebuilt ${C_DIM}${response:0:160}${C_RESET}"
      break
    fi
    warn "reindex attempt ${attempt}/3 failed — retrying in $((attempt * 5))s"
    printf '%s\n' "$response" >>"$LOG_FILE"
    sleep $((attempt * 5))
    attempt=$((attempt + 1))
  done
  if [[ $attempt -gt 3 ]]; then
    err "search-svc could not build the index after 3 attempts."
    hint "Check:  make logs-search-svc   and   curl -sk https://localhost/__health/search-svc"
    hint "Retry:  make reindex"
    exit 1
  fi
fi

# =============================================================== 9. ingest ====
if [[ "$SKIP_INGEST" -eq 1 ]]; then
  step "RAG ingestion (skipped)"
elif [[ -z "$DASHSCOPE_KEY" ]]; then
  step "RAG ingestion (skipped — no DASHSCOPE_API_KEY)"
  warn "Embeddings need an Alibaba Cloud Model Studio key."
  hint "Add DASHSCOPE_API_KEY to .env, then run:  make ingest"
else
  step "Ingesting the RAG corpus into pgvector"
  for source in properties faq; do
    if response="$(api_call POST /api/chat/ingest "{\"source\":\"${source}\"}")"; then
      run_id="$(printf '%s' "$response" | json_field runId)"
      [[ -n "$run_id" ]] || run_id="$(printf '%s' "$response" | json_field run_id)"
      [[ -n "$run_id" ]] || run_id="$(printf '%s' "$response" | json_field id)"
      ok "ingest started for ${C_BOLD}${source}${C_RESET}${run_id:+ (run ${run_id})}"

      # Poll for completion — bounded, and never fatal.
      if [[ -n "$run_id" ]]; then
        deadline=$(( $(now) + WAIT_TIMEOUT ))
        while [[ $(now) -lt $deadline ]]; do
          status_body="$(api_call GET "/api/chat/ingest/status/${run_id}" || true)"
          st="$(printf '%s' "$status_body" | json_field status)"
          case "$st" in
            completed|succeeded|success|done|ok)
              ok "  ${source}: ${st}"; break ;;
            partial)
              warn "  ${source}: ${st} — some chunks failed to embed, see make logs-rag-svc"; break ;;
            failed|error)
              warn "  ${source}: ${st} — see make logs-rag-svc"; break ;;
            *)
              printf '\r  %swaiting for %s ingestion... %s%s' "${C_DIM}" "$source" "${st:-running}" "${C_RESET}"
              sleep 5 ;;
          esac
        done
        printf '\r\033[2K'
      fi
    else
      warn "ingest for ${source} was rejected: ${response:0:200}"
      hint "Retry later with:  make ingest"
    fi
  done
fi

# =============================================================== 10. summary ==
step "Ready"

rule
printf '%s\n' "${C_BOLD}  URL${C_RESET}"
rule
printf '  %-38s %s\n' "https://localhost"                       "TopChoice web app (Next.js)"
printf '  %-38s %s\n' "https://localhost/admin"                 "Admin dashboard (sign in as admin)"
printf '  %-38s %s\n' "https://localhost/api/v1/docs"           "api-core Swagger / OpenAPI UI (/docs redirects here)"
printf '  %-38s %s\n' "https://localhost/api/search/docs"       "search-svc OpenAPI UI"
printf '  %-38s %s\n' "https://localhost/api/v1/properties"     "REST API through the edge"
printf '  %-38s %s\n' "https://localhost/api/search?q=villa"    "Elasticsearch-backed search"
printf '  %-38s %s\n' "https://localhost/api/chat/threads"      "RAG chatbot (SSE streaming)"
printf '  %-38s %s\n' "https://localhost/api/reports/health"    "Reports & calculators service"
rule
printf '%s\n' "${C_BOLD}  Direct ports (bypass nginx)${C_RESET}"
rule
printf '  %-38s %s\n' "http://localhost:3000"  "web"
printf '  %-38s %s\n' "http://localhost:4000"  "api-core"
printf '  %-38s %s\n' "http://localhost:8000"  "search-svc"
printf '  %-38s %s\n' "http://localhost:8001"  "rag-svc"
printf '  %-38s %s\n' "http://localhost:4567"  "reports-svc"
printf '  %-38s %s\n' "http://localhost:9200"  "elasticsearch"
rule
printf '%s\n' "${C_BOLD}  Demo credentials${C_RESET} ${C_DIM}(created by the api-core seeder)${C_RESET}"
rule
printf '  %-10s %-24s %s\n' "admin"  "$DEMO_ADMIN_EMAIL" "$DEMO_PASSWORD"
printf '  %-10s %-24s %s\n' "agent"  "$DEMO_AGENT_EMAIL" "$DEMO_PASSWORD"
printf '  %-10s %-24s %s\n' "user"   "$DEMO_USER_EMAIL"  "$DEMO_PASSWORD"
rule
log ""
log "  ${C_YELLOW}The TLS certificate is self-signed${C_RESET} — your browser will warn once."
log "  Trust it system-wide with the instructions from: ${C_BOLD}./infra/scripts/gen-certs.sh${C_RESET}"
log ""
log "  Next:  ${C_BOLD}make health${C_RESET}   ${C_BOLD}make logs${C_RESET}   ${C_BOLD}make down${C_RESET}"
log "  Build log: ${C_DIM}${LOG_FILE}${C_RESET}"
log ""
