# =============================================================================
# Nawy Clone — developer task runner
#
#   make            # this help
#   make bootstrap  # first run: env + certs + build + up + seed + index + RAG
#   make health     # pass/fail table for every service
#
# Every target is a thin, readable wrapper around docker compose or a script in
# infra/scripts. Nothing here is required to run the stack — it is all sugar.
# =============================================================================

COMPOSE        ?= docker compose
SCRIPTS        := ./infra/scripts
ENV_FILE       := .env
CURL           := curl -sk --fail-with-body
TAIL           ?= 200

# Read the service token straight out of .env so `make reindex` / `make ingest`
# work without exporting anything.
INTERNAL_TOKEN = $(shell sed -n 's/^[[:space:]]*INTERNAL_SERVICE_TOKEN=//p' $(ENV_FILE) 2>/dev/null | tail -n 1)

# Colours (disabled automatically when not a TTY, e.g. in CI logs).
ifneq ($(shell test -t 1 && echo tty),)
  C_CYAN  := \033[36m
  C_BOLD  := \033[1m
  C_DIM   := \033[2m
  C_RESET := \033[0m
else
  C_CYAN  :=
  C_BOLD  :=
  C_DIM   :=
  C_RESET :=
endif

.DEFAULT_GOAL := help

.PHONY: help bootstrap up down restart build rebuild logs ps health seed reindex \
        ingest migrate test test-api test-search test-rag test-reports lint \
        lint-nginx clean certs reset check-env check-up

##@ Getting started

help: ## Show this help
	@printf "\n$(C_BOLD)Nawy Clone$(C_RESET) — Egyptian real-estate marketplace, full stack.\n\n"
	@printf "Usage: $(C_BOLD)make$(C_RESET) $(C_CYAN)<target>$(C_RESET)\n"
	@awk 'BEGIN {FS = ":.*##"} \
		/^##@/ { printf "\n$(C_BOLD)%s$(C_RESET)\n", substr($$0, 5); next } \
		/^[a-zA-Z0-9_%-]+:.*##/ { printf "  $(C_CYAN)%-16s$(C_RESET) %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
	@printf "\n$(C_DIM)Pattern targets: make logs-<service>, make shell-<service>$(C_RESET)\n"
	@printf "$(C_DIM)Services: web api-core search-svc rag-svc reports-svc postgres mongo redis elasticsearch nginx$(C_RESET)\n\n"

bootstrap: ## First run: .env + certs + build + up + wait + seed + index + RAG ingest
	@$(SCRIPTS)/bootstrap.sh $(ARGS)

certs: ## Generate the self-signed localhost TLS certificate (idempotent)
	@$(SCRIPTS)/gen-certs.sh $(ARGS)

##@ Stack lifecycle

up: check-env ## Start every container in the background
	@$(COMPOSE) up -d --remove-orphans
	@$(MAKE) --no-print-directory ps

down: ## Stop and remove the containers (volumes are kept)
	@$(COMPOSE) down --remove-orphans

restart: ## Restart every container (re-resolves backend DNS in nginx)
	@$(COMPOSE) restart
	@$(MAKE) --no-print-directory ps

build: check-env ## Build all images (SERVICE=api-core to build just one)
	@$(COMPOSE) build $(SERVICE)

rebuild: check-env ## Rebuild from scratch, ignoring the layer cache
	@$(COMPOSE) build --no-cache --pull $(SERVICE)

ps: ## Show container status, health and published ports
	@$(COMPOSE) ps

logs: ## Follow the logs of every service
	@$(COMPOSE) logs -f --tail=$(TAIL)

logs-%: ## Follow one service's logs, e.g. make logs-api-core
	@$(COMPOSE) logs -f --tail=$(TAIL) $*

shell-%: ## Open a shell in one service, e.g. make shell-rag-svc
	@$(COMPOSE) exec $* sh -c 'command -v bash >/dev/null && exec bash || exec sh'

health: ## Probe every service directly and through nginx (exit 1 on failure)
	@$(SCRIPTS)/health-check.sh $(ARGS)

##@ Data

migrate: check-up ## Apply Prisma migrations to Postgres (api-core owns the schema)
	@$(COMPOSE) exec -T api-core sh -lc 'npx --yes prisma migrate deploy'

seed: check-up ## Load seed/*.json into Postgres + MongoDB via the api-core seeder
	@$(COMPOSE) exec -T api-core sh -lc 'npm run seed'

reindex: check-up ## Rebuild the Elasticsearch `properties` index from Mongo
	@test -n "$(INTERNAL_TOKEN)" || { echo "INTERNAL_SERVICE_TOKEN missing from $(ENV_FILE) — run make bootstrap"; exit 1; }
	@$(CURL) -X POST https://localhost/api/search/reindex \
		-H 'Content-Type: application/json' \
		-H 'X-Service-Token: $(INTERNAL_TOKEN)' \
		-d '{"full":true}' && echo

ingest: check-up ## Ingest properties + FAQ into pgvector for the RAG chatbot
	@test -n "$(INTERNAL_TOKEN)" || { echo "INTERNAL_SERVICE_TOKEN missing from $(ENV_FILE) — run make bootstrap"; exit 1; }
	@for src in properties faq; do \
		echo "-> ingesting $$src"; \
		$(CURL) -X POST https://localhost/api/chat/ingest \
			-H 'Content-Type: application/json' \
			-H 'X-Service-Token: $(INTERNAL_TOKEN)' \
			-d "{\"source\":\"$$src\"}" && echo; \
	done

##@ Quality

test: test-api test-search test-rag test-reports ## Run every service's test suite

test-api: check-up ## api-core — Jest unit + e2e tests
	@$(COMPOSE) exec -T api-core sh -lc 'npm test'

test-search: check-up ## search-svc — pytest
	@$(COMPOSE) exec -T search-svc sh -lc 'python -m pytest -q'

test-rag: check-up ## rag-svc — pytest
	@$(COMPOSE) exec -T rag-svc sh -lc 'python -m pytest -q'

test-reports: check-up ## reports-svc — RSpec
	@$(COMPOSE) exec -T reports-svc sh -lc 'bundle exec rspec --format progress'

# Every linter runs even when an earlier one fails; the target still exits 1 if
# any of them did, so `make lint` is usable as a gate and not just as output.
lint: lint-nginx ## Lint every service (eslint, ruff, rubocop) and validate the nginx config
	@failed=""; \
	run() { printf '\n-> %s\n' "$$1"; shift; \
	        if $(COMPOSE) exec -T $$1 sh -lc "$$2"; then :; else failed="$$failed $$1"; fi; }; \
	run "api-core (eslint)"     api-core    'npm run lint'; \
	run "web (eslint)"          web         'npm run lint'; \
	run "search-svc (ruff)"     search-svc  'python -m ruff check app'; \
	run "rag-svc (ruff)"        rag-svc     'python -m ruff check app'; \
	run "reports-svc (rubocop)" reports-svc 'bundle exec rubocop --format simple'; \
	if [ -n "$$failed" ]; then printf '\nlint failed for:%s\n' "$$failed"; exit 1; fi; \
	printf '\nall linters clean\n'

lint-nginx: ## Validate infra/nginx against a throwaway nginx container
	@echo "-> nginx config"
	@docker run --rm \
		--add-host web:127.0.0.1 --add-host api-core:127.0.0.1 \
		--add-host search-svc:127.0.0.1 --add-host rag-svc:127.0.0.1 \
		--add-host reports-svc:127.0.0.1 \
		-v "$(CURDIR)/infra/nginx/nginx.conf:/etc/nginx/nginx.conf:ro" \
		-v "$(CURDIR)/infra/nginx/conf.d:/etc/nginx/conf.d:ro" \
		-v "$(CURDIR)/infra/nginx/certs:/etc/nginx/certs:ro" \
		nginx:1.27-alpine nginx -t

##@ Housekeeping

clean: ## Remove build artefacts, caches and dangling images (keeps your data)
	@echo "-> stopping containers"
	@$(COMPOSE) down --remove-orphans || true
	@echo "-> removing local caches"
	@rm -rf apps/web/.next apps/web/out apps/api-core/dist .bootstrap.log
	@find apps -type d \( -name __pycache__ -o -name .pytest_cache -o -name .ruff_cache -o -name .mypy_cache \) -prune -exec rm -rf {} + 2>/dev/null || true
	@echo "-> pruning dangling images and build cache"
	@docker image prune -f >/dev/null 2>&1 || true
	@docker builder prune -f >/dev/null 2>&1 || true
	@echo "done — volumes untouched (use 'make reset' to wipe data)"

reset: ## DESTRUCTIVE — tear everything down including database volumes
	@$(SCRIPTS)/reset.sh $(ARGS)

##@ Internal

check-env: ## Fail early when .env is missing
	@test -f $(ENV_FILE) || { \
		echo "$(ENV_FILE) is missing. Run: ./infra/scripts/bootstrap.sh (or cp .env.example .env)"; \
		exit 1; }

check-up: ## Fail early when the stack is not running
	@test -n "$$($(COMPOSE) ps -q api-core 2>/dev/null)" || { \
		echo "The stack is not running. Start it with: make up"; \
		exit 1; }
