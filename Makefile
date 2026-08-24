# =============================================================================
# TopChoice — developer task runner
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

# Published host ports, so `make test-e2e` reaches a stack whose ports were
# overridden to dodge a collision. `env_port` falls back to the compose default
# when the key is absent, which is the common case.
env_port = $(or $(shell sed -n 's/^[[:space:]]*$(1)=//p' $(ENV_FILE) 2>/dev/null | tail -n 1),$(2))

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
	@printf "\n$(C_BOLD)TopChoice$(C_RESET) — Egyptian real-estate marketplace, full stack.\n\n"
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

# No --remove-orphans on `up`. It deletes containers by project label, so a
# name collision with another compose project on the same machine turns a
# routine start into a silent teardown of that project. Teardown belongs in
# `down` and `reset`, where the operator asked for it.
up: check-env ## Start every container in the background
	@$(COMPOSE) up -d
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
	@$(COMPOSE) exec -T api-core sh -c 'npx --yes prisma migrate deploy'

seed: check-up ## Load seed/*.json into Postgres + MongoDB via the api-core seeder
	@$(COMPOSE) exec -T api-core sh -c 'npm run seed'

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

test: test-api test-web test-search test-rag test-reports ## Every unit suite (web + the four services)

test-all: test test-integration ## Every unit suite, then the black-box suite

test-api: check-up ## api-core — Jest unit + e2e tests
	@$(COMPOSE) exec -T api-core sh -c 'npm test'

test-web: ## web — Vitest (runs on the host; no container needed)
	@cd apps/web && npm test

# `sh -c`, never `sh -lc`. A login shell re-reads the profile and rebuilds PATH
# from scratch, dropping the /opt/venv/bin that the Python images put there via
# ENV. Under -lc these targets silently ran the *system* interpreter, so pytest
# was missing and installing it produced "No module named pydantic" — the app's
# dependencies live in the venv the login shell had just discarded.
# The runtime images are built without INSTALL_DEV and do not ship
# requirements-dev.txt, so a bare `python -m pytest` fails with "No module named
# pytest" — which reads like a broken suite rather than a missing dependency.
# Install the runner on demand, pinned to the same versions requirements-dev.txt
# uses. Build with INSTALL_DEV=true to bake it in and skip this.
# Run in a throwaway container off the service image with the source mounted,
# rather than `exec` into the running one.
#
# The production images deliberately do not ship `tests/` — rag-svc copies only
# app, alembic and seed — so exec'ing in gives "no tests ran" no matter what is
# installed. They also drop privileges, and their venv is root-owned, so an
# in-place `pip install` stops at "Permission denied: /opt/venv/.../pluggy".
# A disposable root container sidesteps both and leaves the running stack alone.
#
# $(1) service dir, $(2) image, $(3) pytest pins
define pytest_svc
	@docker run --rm -u root \
		-v "$(CURDIR)/apps/$(1)":/src -v "$(CURDIR)/seed":/seed:ro -w /src \
		-e SEED_DIR=/seed --entrypoint sh $(2) -c \
		'python -c "import pytest" 2>/dev/null || pip install -q $(3); python -m pytest tests -q'
endef

test-search: ## search-svc — pytest
	$(call pytest_svc,search-svc,topchoice-realestate-search-svc,pytest==8.3.4 pytest-asyncio==0.24.0)

test-rag: ## rag-svc — pytest
	$(call pytest_svc,rag-svc,topchoice-realestate-rag-svc,pytest==8.3.4 pytest-asyncio==0.25.0)

# Same reasoning as the Python suites, with one extra wrinkle. The runtime image
# sets BUNDLE_WITHOUT=development:test, so rspec is absent and exec'ing in gives
# "bundler: command not found: rspec". Reinstating the test group there fails
# too: bigdecimal needs a native build and the runtime image has no compiler.
#
# The Dockerfile's `builder` stage already carries build-essential, so the suite
# runs against that. The bundle lands in a named volume so the gems are compiled
# once rather than on every invocation.
REPORTS_TEST_IMAGE := topchoice-reports-svc-test

test-reports: ## reports-svc — RSpec
	@docker build --quiet --target builder -t $(REPORTS_TEST_IMAGE) apps/reports-svc >/dev/null
	@docker run --rm -u root \
		-v "$(CURDIR)/apps/reports-svc":/src -w /src \
		-v topchoice_reports_test_bundle:/bundle \
		-e BUNDLE_WITHOUT= -e BUNDLE_PATH=/bundle -e BUNDLE_APP_CONFIG=/bundle \
		--entrypoint sh $(REPORTS_TEST_IMAGE) -c \
		'bundle install --quiet && bundle exec rspec --format progress'

test-mobile: ## mobile — flutter analyze + test (needs the Flutter SDK on PATH)
	@cd apps/mobile && flutter analyze --fatal-infos && flutter test

# Drives the real app against the running stack. Runs on flutter-tester, the
# headless host VM, so no emulator is needed — but the device flag is required,
# because Flutter otherwise picks Chrome and refuses. The URLs are read from
# .env so a stack on overridden ports is still targeted correctly.
test-e2e: check-up ## mobile — end-to-end against the live stack
	@cd apps/mobile && flutter test integration_test -d flutter-tester \
		--dart-define=API_CORE_URL=http://localhost:$(call env_port,API_CORE_HOST_PORT,4000)/api/v1 \
		--dart-define=SEARCH_URL=http://localhost:$(call env_port,SEARCH_SVC_HOST_PORT,8000)/api/search \
		--dart-define=CHAT_URL=http://localhost:$(call env_port,RAG_SVC_HOST_PORT,8001)/api/chat \
		--dart-define=REPORTS_URL=http://localhost:$(call env_port,REPORTS_SVC_HOST_PORT,4567)/api/reports \
		--dart-define=MEDIA_ORIGIN=http://localhost:$(call env_port,WEB_HOST_PORT,3000)

# Black-box, against the running stack. Asserts its own preconditions and tells
# you which command to run when the catalogue or the index is empty.
test-integration: check-up ## Integration suite against the live, seeded stack
	@cd tests/integration && npm ci --silent --no-audit --no-fund && npm test

# Every linter runs even when an earlier one fails; the target still exits 1 if
# any of them did, so `make lint` is usable as a gate and not just as output.
lint: lint-nginx ## Lint every service (eslint, ruff, rubocop) and validate the nginx config
	@failed=""; \
	run() { printf '\n-> %s\n' "$$1"; shift; \
	        if $(COMPOSE) exec -T $$1 sh -c "$$2"; then :; else failed="$$failed $$1"; fi; }; \
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
