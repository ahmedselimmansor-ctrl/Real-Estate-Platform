# Nawy Clone — full-stack Egyptian real-estate marketplace

![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-Python%203.12-009688?logo=fastapi&logoColor=white)
![Sinatra](https://img.shields.io/badge/Sinatra-Ruby%203.3-CC342D?logo=ruby&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%20%2B%20pgvector-4169E1?logo=postgresql&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-7-47A248?logo=mongodb&logoColor=white)
![Elasticsearch](https://img.shields.io/badge/Elasticsearch-8.15-005571?logo=elasticsearch&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-compose-2496ED?logo=docker&logoColor=white)
![nginx](https://img.shields.io/badge/nginx-TLS%20edge-009639?logo=nginx&logoColor=white)
![LangGraph](https://img.shields.io/badge/RAG-LangGraph-1C3C3C)

<!--
  After pushing to GitHub, swap these in for live status badges:
  ![CI](https://github.com/<owner>/<repo>/actions/workflows/ci.yml/badge.svg)
  ![Security](https://github.com/<owner>/<repo>/actions/workflows/security.yml/badge.svg)
-->

A production-shaped clone of [nawy.com](https://www.nawy.com) — Egypt's property
marketplace — built as a polyglot monorepo you can run end to end with one
command. Browse 180 seeded listings across New Cairo, Sheikh Zayed, the North
Coast, the New Administrative Capital, 6th of October and Mostakbal City from
developers like Palm Hills, SODIC, Emaar Misr, Talaat Moustafa Group, Mountain
View, Ora Developers and Hassan Allam; filter them through a real Elasticsearch
index with Arabic + English analyzers; price them with a mortgage and
installment engine that emits PDF brochures; and ask a streaming, retrieval-
augmented chatbot "what's a 3-bedroom in Sheikh Zayed under 12M EGP with an 8
year plan?" — every request arriving over TLS through a single nginx edge.

```bash
git clone <this-repo> && cd Nawy-clone-full-stack
./infra/scripts/bootstrap.sh        # ~5-10 min on a cold cache
open https://localhost              # accept the self-signed certificate once
```

---

## Table of contents

- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Demo credentials](#demo-credentials)
- [Services and ports](#services-and-ports)
- [Configuration](#configuration)
- [Repository layout](#repository-layout)
- [How the RAG chatbot works](#how-the-rag-chatbot-works)
- [API overview](#api-overview)
- [Testing](#testing)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

---

## Architecture

Everything public enters through nginx on `:443`. nginx terminates TLS, applies
security headers and rate limits, mints an `X-Request-Id` when the caller has
not, and routes by path prefix. No backend is meant to be reached directly in
production; the published host ports exist only to make local debugging easy.

```
                         ┌───────────────────────┐
                         │  Browser (RTL/LTR UI) │
                         └───────────┬───────────┘
                                     │  https://localhost   (TLS 1.2 / 1.3)
                                     ▼
        ┌────────────────────────────────────────────────────────────┐
        │  nginx  :80 → 301 → :443                                   │
        │  self-signed cert · HSTS · CSP · gzip · rate limits         │
        │  X-Request-Id · WebSocket upgrade · SSE passthrough         │
        └───┬───────────┬─────────────┬─────────────┬────────────────┘
            │ /         │ /api/v1/    │ /api/search/│ /api/chat/   │ /api/reports/
            ▼           ▼             ▼             ▼              ▼
    ┌──────────────┐ ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌─────────────┐
    │ web          │ │ api-core │ │ search-svc│ │ rag-svc  │ │ reports-svc │
    │ Next.js 15   │ │ NestJS11 │ │ FastAPI   │ │ FastAPI  │ │ Sinatra     │
    │ App Router   │ │ Prisma + │ │ + ES DSL  │ │ LangGraph│ │ Prawn/CSV   │
    │ SSR + BFF    │ │ Mongoose │ │           │ │ pgvector │ │ calculators │
    │ :3000        │ │ :4000    │ │ :8000     │ │ :8001    │ │ :4567       │
    └──────┬───────┘ └────┬─────┘ └─────┬─────┘ └────┬─────┘ └──────┬──────┘
           │              │             │            │              │
           │              │             │            │              │
           │   ┌──────────┴─────────────┴────────────┴──────────────┴────┐
           │   │                     data plane                          │
           │   ├──────────────┬──────────────┬───────────┬───────────────┤
           └──▶│ PostgreSQL16 │  MongoDB 7   │  Redis 7  │ Elasticsearch │
               │ + pgvector   │              │           │     8.15      │
               │              │              │           │               │
               │ nawy:        │ nawy:        │ cache     │ properties_v1 │
               │  users       │  properties  │ ratelimit │  (alias       │
               │  developers  │  property_   │ denylist  │   properties) │
               │  compounds   │   views      │ queues    │  ar + en      │
               │  areas       │  activity_   │           │  analyzers    │
               │  leads       │   events     │           │  edge_ngram   │
               │  favorites   │              │           │  geo_point    │
               │ nawy_rag:    │              │           │               │
               │  rag_chunks  │              │           │               │
               │  (vector1024)│              │           │               │
               │  chat_*      │              │           │               │
               └──────┬───────┴──────────────┴───────────┴───────────────┘
                      │
                      │  media                       ┌──────────────────────┐
                      └─────────────────────────────▶│ AWS S3 + CloudFront  │
                                                     │ presigned uploads    │
                                                     └──────────────────────┘

    rag-svc also talks out to the model providers (both need API keys):

        ┌──────────────────────────────┐        ┌──────────────────────────┐
        │ Alibaba Cloud Model Studio   │        │ OpenAI                   │
        │ (DashScope, OpenAI-compat)   │        │                          │
        │  · tongyi-embedding-vision-  │        │  · gpt-5.6-luna          │
        │    flash  → 1024-d vectors   │        │    generation + tools    │
        │  · qwen3-rerank → top-N      │        │  · web search tool       │
        └──────────────────────────────┘        └──────────────────────────┘
```

**Data ownership is strict** (see [`docs/CONTRACT.md`](docs/CONTRACT.md) §2): the
canonical property document lives in MongoDB, PostgreSQL holds the relational
truth plus a thin `property_index` mirror for foreign keys, and Elasticsearch
holds the denormalized search document. `search-svc` and `rag-svc` read from
Mongo/Postgres but never write business data there.

---

## Tech stack

| Layer | Technology | Where it lives |
|---|---|---|
| Frontend | Next.js 15 (App Router, RSC, TypeScript strict) | `apps/web` |
| UI | Tailwind CSS v4 + shadcn/ui (new-york, slate), sonner toasts | `apps/web/src/components` |
| Client state | Zustand (`persist` for auth/favorites/compare) | `apps/web/src/store` |
| Server state | TanStack Query v5 + typed fetcher with 401 auto-refresh | `apps/web/src/lib/api.ts` |
| Core API | NestJS 11, class-validator, Swagger | `apps/api-core` |
| ORM | Prisma (PostgreSQL) + Mongoose (MongoDB) | `apps/api-core/prisma`, `apps/api-core/src` |
| AuthN/Z | JWT HS256 access (15m) + rotating refresh (30d), Google OAuth 2.0, RBAC | `apps/api-core/src/auth` |
| Search | Elasticsearch 8.15 — Arabic + English analyzers, edge-ngram autocomplete, geo, facets | `apps/search-svc` |
| Search API | Python 3.12 + FastAPI + Pydantic v2 | `apps/search-svc/app` |
| RAG chatbot | LangGraph state machine, pgvector, DashScope embeddings, qwen3 rerank, GPT-5.6-Luna | `apps/rag-svc/app` |
| Reports | Ruby 3.3 + Sinatra — PDF brochures, CSV exports, mortgage/installment engine | `apps/reports-svc` |
| Relational + vectors | PostgreSQL 16 with `pgvector`, `pg_trgm`, `uuid-ossp` | `postgres` service, `infra/scripts/init-postgres.sql` |
| Documents | MongoDB 7 | `mongo` service |
| Cache / rate limit / queues | Redis 7 (AOF, `allkeys-lru`, 512 MB cap) | `redis` service |
| Object storage | AWS S3 presigned uploads (+ optional CloudFront) — **needs AWS keys** | `apps/api-core/src/uploads` |
| Edge | nginx 1.27 — TLS, HSTS, CSP, gzip, rate limiting, SSE, WebSocket | `infra/nginx` |
| Local runtime | Docker Compose (10 services, healthchecks, named volumes) | `docker-compose.yml` |
| Automation | Bash scripts + a self-documenting Makefile | `infra/scripts`, `Makefile` |
| CI | GitHub Actions — path-filtered matrices, image builds, compose smoke test | `.github/workflows/ci.yml` |
| Security scanning | Trivy, Gitleaks, npm audit, pip-audit, bundler-audit, Dependabot | `.github/workflows/security.yml` |
| Cloud (optional) | Terraform | `infra/terraform` |

---

## Quick start

**Prerequisites:** Docker Engine 24+ with the Compose v2 plugin, `openssl`,
`curl`, and roughly 6 GB of free RAM (Elasticsearch alone reserves 1 GB of heap).

```bash
./infra/scripts/bootstrap.sh
```

That single command is idempotent and does all of this:

| # | Step | Detail |
|---|---|---|
| 1 | Preflight | docker, compose, openssl, curl, Dockerfiles, host ports |
| 2 | `.env` | copies `.env.example`, then mints `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` and `INTERNAL_SERVICE_TOKEN` with `openssl rand` (never overwrites values you customised) |
| 3 | TLS | `gen-certs.sh` → `infra/nginx/certs/localhost.{crt,key}` |
| 4 | Build | `docker compose build` |
| 5 | Up | `docker compose up -d` |
| 6 | Wait | live per-service health display with a timeout and actionable failures |
| 7 | Schema + seed | `prisma migrate deploy`, then the api-core seeder loads `seed/*.json` into Postgres and Mongo |
| 8 | Index | `POST /api/search/reindex` builds `properties_v1` |
| 9 | RAG | `POST /api/chat/ingest` for `properties` and `faq` — **skipped automatically when `DASHSCOPE_API_KEY` is empty** |
| 10 | Summary | URL table, direct ports and demo credentials |

Useful flags: `--skip-build`, `--skip-seed`, `--skip-reindex`, `--skip-ingest`,
`--force-certs`, `--timeout 900`. Run `./infra/scripts/bootstrap.sh --help` for
the full list.

Then open **<https://localhost>** and accept the certificate once (or trust it
permanently — `./infra/scripts/gen-certs.sh` prints the Linux and macOS
commands).

<details>
<summary><b>Everyday commands (<code>make help</code>)</b></summary>

```bash
make bootstrap        # first run (wrapper around infra/scripts/bootstrap.sh)
make up               # start everything
make down             # stop, keep the data
make restart          # bounce containers (also re-resolves backend DNS in nginx)
make ps               # status + health + ports
make health           # pass/fail table, direct and through nginx (exit 1 on failure)
make logs             # follow everything
make logs-rag-svc     # follow one service
make shell-api-core   # shell inside one container
make migrate          # prisma migrate deploy
make seed             # reload seed/*.json
make reindex          # rebuild the Elasticsearch index
make ingest           # re-ingest the RAG corpus (needs DASHSCOPE_API_KEY)
make test             # every service's suite
make lint             # eslint + ruff + rubocop (exits 1 if any linter fails)
make lint-nginx       # nginx -t in a throwaway container — no stack needed
make certs            # regenerate the TLS certificate
make clean            # drop build artefacts and caches (keeps volumes)
make reset            # DESTRUCTIVE: containers + volumes, with a confirmation
```

</details>

---

## Demo credentials

Created by the api-core seeder. **Development data only** — these accounts exist
purely so you can log in on a fresh install.

| Role | Email | Password |
|---|---|---|
| `admin` — admin dashboard | `admin@nawy.local` | `Nawy@Demo123` |
| `agent` — can publish listings | `agent@nawy.local` | `Nawy@Demo123` |
| `user` — favorites, leads | `buyer@nawy.local` | `Nawy@Demo123` |

Admin dashboard: <https://localhost/admin>

These come from the `DEMO_USERS` array in
[`apps/api-core/prisma/seed.ts`](apps/api-core/prisma/seed.ts) — change them
there and re-run `make seed`.

---

## Services and ports

| Service | Public path (through nginx) | Direct URL | Container | Health |
|---|---|---|---|---|
| `web` | `/` | <http://localhost:3000> | `nawy-web` | `https://localhost/__health/web` |
| `api-core` | `/api/v1/*` | <http://localhost:4000> | `nawy-api-core` | `/health`, `/health/ready` |
| `search-svc` | `/api/search/*` | <http://localhost:8000> | `nawy-search-svc` | `/health` |
| `rag-svc` | `/api/chat/*` | <http://localhost:8001> | `nawy-rag-svc` | `/health` |
| `reports-svc` | `/api/reports/*` | <http://localhost:4567> | `nawy-reports-svc` | `/health` |
| `postgres` | — | `localhost:5432` | `nawy-postgres` | `pg_isready` |
| `mongo` | — | `localhost:27017` | `nawy-mongo` | `db.adminCommand('ping')` |
| `redis` | — | `localhost:6379` | `nawy-redis` | `redis-cli ping` |
| `elasticsearch` | — | <http://localhost:9200> | `nawy-elasticsearch` | `_cluster/health` |
| `nginx` | `:80` → `:443` | <https://localhost> | `nawy-nginx` | `https://localhost/__health/nginx` |

The `/__health/<service>` routes are edge-only aliases added by
`infra/nginx/conf.d/nawy.conf` so `make health` can probe each backend *through*
TLS without colliding with any application route.

<details>
<summary><b>What the nginx edge actually does</b></summary>

- **TLS 1.2 + 1.3 only**, modern ECDHE/AES-GCM/CHACHA20 cipher list, shared
  session cache, session tickets off, OCSP stapling explicitly off (a
  self-signed cert has no responder).
- **HSTS** (`max-age=31536000; includeSubDomains`, no `preload` for localhost),
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, and a
  CSP that still allows Next.js dev (`'unsafe-inline'`/`'unsafe-eval'`) plus the
  Unsplash/Picsum/S3/CloudFront/Mapbox image hosts.
- **Correlation**: honours an inbound `X-Request-Id`, otherwise generates one
  from `$request_id`; forwards it upstream and echoes it back to the client.
- **SSE**: `/api/chat/` runs with `proxy_buffering off`, `proxy_cache off`,
  `chunked_transfer_encoding on`, `X-Accel-Buffering: no` and a 600 s read
  timeout, so chat tokens arrive one at a time instead of in one lump.
- **WebSockets**: `/` and `/_next/` pass `Upgrade`/`Connection` through for Next.js
  Fast Refresh. The `$connection_upgrade` map resolves to an *empty* string (not
  the usual `close`) for ordinary requests, so nginx omits the header and the
  upstream keepalive pools stay usable while upgrades still work.
- **Rate limits**: 20 req/min on `/api/v1/auth/` (burst 10), 60 req/min on
  `/api/chat/`, 20 req/s on `/api/search/`, 30 req/s elsewhere, plus a 128
  concurrent-connection cap per IP — all returning the contract's JSON error
  envelope with `code: "RATE_LIMITED"` and a `Retry-After` header rather than an
  HTML page. `413`, `502/503` and `504` get the same treatment
  (`PAYLOAD_TOO_LARGE`, `SERVICE_UNAVAILABLE`, `GATEWAY_TIMEOUT`), so a client
  never has to parse HTML to find out what went wrong.
- **Bodies** capped at 25 MB; gzip for text, JSON, SVG and friends (and
  explicitly *off* on the SSE route, where compression would coalesce frames).
- **Upstreams** are keep-alive pools with `max_fails`/`fail_timeout`, and Docker's
  embedded DNS (`127.0.0.11`) is configured as the resolver. nginx resolves
  upstream names at start/reload — after recreating a backend container, run
  `make restart` if its IP changed.

</details>

---

## Configuration

Every value lives in `.env`, created from [`.env.example`](.env.example) by
`bootstrap.sh`. Names are contractual — see
[`docs/CONTRACT.md`](docs/CONTRACT.md) §7 — do not rename them.

| Variable | Default | Purpose |
|---|---|---|
| `FRONTEND_URL` | `https://localhost` | CORS origin, OAuth redirects |
| `JWT_ACCESS_SECRET` | *generated* | HS256 access token signing (15 min TTL) |
| `JWT_REFRESH_SECRET` | *generated* | HS256 refresh token signing (30 day TTL, rotated) |
| `JWT_ISSUER` / `JWT_AUDIENCE` | `nawy-api` / `nawy-clients` | verified by all four backends |
| `INTERNAL_SERVICE_TOKEN` | *generated* | `X-Service-Token` for reindex/ingest endpoints |
| `DATABASE_URL` | `postgresql://nawy:…@postgres:5432/nawy` | api-core (Prisma) |
| `RAG_DATABASE_URL` | `postgresql+asyncpg://…/nawy_rag` | rag-svc (SQLAlchemy async) |
| `MONGO_URI` | `mongodb://mongo:27017/nawy` | canonical property documents |
| `REDIS_URL` | `redis://redis:6379` | cache, rate limits, refresh-token denylist |
| `ELASTICSEARCH_URL` | `http://elasticsearch:9200` | search index |
| `ES_INDEX` / `ES_INDEX_VERSION` | `properties` / `properties_v1` | alias and concrete index |
| `GOOGLE_CLIENT_ID` / `_SECRET` | *empty* | **optional** — Google sign-in stays disabled until set |
| `AWS_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY` | *empty* | **optional** — S3 uploads need real keys |
| `DASHSCOPE_API_KEY` | *empty* | **required for RAG ingest/retrieval** (embeddings + rerank) |
| `EMBEDDING_MODEL` / `EMBEDDING_DIM` | `tongyi-embedding-vision-flash` / `1024` | must match the `vector(1024)` column |
| `RERANK_MODEL` | `qwen3-rerank` | cross-encoder rerank of the candidate set |
| `OPENAI_API_KEY` | *empty* | **required for chat answers** (generation + web search) |
| `GENERATION_MODEL` | `gpt-5.6-luna` | answer synthesis |
| `RAG_TOP_K` / `RAG_RERANK_TOP_N` | `20` / `6` | retrieve 20 chunks, keep the best 6 |
| `RAG_MEMORY_WINDOW` | `10` | conversation turns kept verbatim before summarising |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | *empty* | **optional** — map view falls back gracefully |

> **No key, no problem.** The marketplace, search, favorites, leads, reports and
> calculators all work with zero third-party keys. Only the chatbot (DashScope +
> OpenAI), Google sign-in, S3 uploads and Mapbox tiles require credentials, and
> each degrades with a clear message instead of crashing.

---

## Repository layout

```
Nawy-clone-full-stack/
├── apps/
│   ├── web/                  Next.js 15 storefront + admin dashboard
│   ├── api-core/             NestJS 11 — auth, catalogue, leads, uploads, admin
│   ├── search-svc/           FastAPI — Elasticsearch indexing, search, facets, geo
│   ├── rag-svc/              FastAPI + LangGraph — chatbot, pgvector, ingestion
│   └── reports-svc/          Sinatra — PDF/CSV, mortgage & installment engine
├── seed/                     shared demo dataset (fixed UUIDs, byte-deterministic)
│   ├── generate.mjs          regenerates every .json below
│   ├── verify.mjs            asserts counts, enums, foreign keys, arithmetic
│   ├── developers.json       12 developers   (Palm Hills, SODIC, Emaar Misr, TMG …)
│   ├── areas.json            14 areas        (New Cairo, Sheikh Zayed, Sahel …)
│   ├── compounds.json        30 compounds
│   ├── properties.json       180 listings    (canonical Mongo documents)
│   ├── amenities.json        24 amenities
│   └── faq.json              40 Q&A pairs    (RAG corpus)
├── infra/
│   ├── nginx/
│   │   ├── nginx.conf        TLS, gzip, logging, rate-limit zones, maps
│   │   ├── conf.d/nawy.conf  upstreams, :80 redirect, :443 routing
│   │   ├── conf.d/snippets/  proxy-common, proxy-sse, security-headers, errors
│   │   └── certs/            generated by gen-certs.sh, git-ignored
│   ├── scripts/
│   │   ├── bootstrap.sh      one-command first run
│   │   ├── gen-certs.sh      self-signed localhost certificate
│   │   ├── health-check.sh   pass/fail table, exit 1 on failure
│   │   ├── reset.sh          destructive teardown with confirmation
│   │   ├── init-postgres.sql creates nawy_rag + vector/trgm/uuid extensions
│   │   └── lib/common.sh     shared shell helpers
│   └── terraform/            cloud deployment (see Deployment)
├── docs/CONTRACT.md          THE cross-service contract — single source of truth
├── docker-compose.yml        10 services, healthchecks, named volumes
├── .env.example              every environment variable, documented
├── .github/workflows/        ci.yml + security.yml
└── Makefile                  self-documenting task runner
```

---

## How the RAG chatbot works

The assistant lives bottom-right on every page, streams its answer token by
token over SSE, and cites the listings it used. It is a **LangGraph** state
machine in `apps/rag-svc`, not a single prompt.

```
  POST /api/chat/message  {threadId?, message, stream:true}
            │
            ▼
   ┌────────────────┐   load thread + last RAG_MEMORY_WINDOW turns from
   │  load_memory   │   chat_messages; older turns come back as a rolling
   └────────┬───────┘   summary row in chat_summaries
            ▼
   ┌────────────────┐   rewrite the question standalone ("what about 4 beds?"
   │  rewrite_query │   → "4 bedroom apartments in Sheikh Zayed under 12M EGP")
   └────────┬───────┘   and extract filters: area, price band, bedrooms, type
            ▼
   ┌────────────────┐   needs listings / needs FAQ / needs fresh web data /
   │      route     │   pure chit-chat  → decides which of the next nodes run
   └───┬────────┬───┘
       │        └─────────────────────────────┐
       ▼                                      ▼
   ┌────────────────┐                  ┌──────────────────┐
   │    retrieve    │ pgvector ANN     │   tools          │
   │  rag_chunks    │ cosine over      │  · search_properties → search-svc
   │  vector(1024)  │ 1024-d embeddings│  · web_search        → OpenAI tool
   │  + metadata    │ top RAG_TOP_K=20 │  · calc_installments → reports-svc
   └────────┬───────┘                  └────────┬─────────┘
            ▼                                   │  tool_start / tool_end
   ┌────────────────┐                           │  events stream to the client
   │     rerank     │ qwen3-rerank cross-encoder │
   │                │ 20 → RAG_RERANK_TOP_N = 6  │
   └────────┬───────┘                           │
            ▼                                   │
   ┌────────────────────────────────────────────┴─────┐
   │  generate — gpt-5.6-luna, grounded, bilingual     │
   │  context capped at RAG_MAX_CONTEXT_TOKENS (6000)  │
   │  streams `token` events, then `sources`, `done`   │
   └────────┬──────────────────────────────────────────┘
            ▼
   ┌────────────────┐   persist the turn, refresh the rolling summary,
   │  save_memory   │   archive to Mongo `chat_transcripts_archive`
   └────────────────┘
```

**Embeddings and storage.** Ingestion (`POST /api/chat/ingest`, protected by
`X-Service-Token`) chunks the 180 property documents and the 40-entry FAQ,
embeds each chunk with Alibaba Cloud Model Studio's
`tongyi-embedding-vision-flash` (1024 dimensions) and writes them to
`rag_chunks.embedding vector(1024)` in the `nawy_rag` database, with an
`ingestion_runs` row you can poll at `GET /api/chat/ingest/status/:runId`.
Retrieval is a pgvector nearest-neighbour query filtered by the metadata the
rewrite step extracted.

**Reranking.** Vector similarity alone over-retrieves; `qwen3-rerank` scores the
20 candidates against the rewritten question and only the best 6 reach the
prompt, which keeps the context inside `RAG_MAX_CONTEXT_TOKENS`.

**Generation.** `gpt-5.6-luna` answers strictly from the retrieved context plus
tool output, in the language of the question (Arabic or English), and returns
the `sources` event so the UI can render listing cards under the answer.

**Tools.** The graph can call `search_properties` (delegating structured filters
to `search-svc`), `web_search` (for things the index cannot know — new launches,
market news) and the reports-svc installment calculator.

**Memory.** The last `RAG_MEMORY_WINDOW` (10) turns are replayed verbatim;
everything older is compacted into a running summary so long conversations stay
inside the context budget.

**SSE event names** (contract §6): `token`, `tool_start`, `tool_end`, `sources`,
`done`, `error`.

> ⚠️ The chatbot needs both `DASHSCOPE_API_KEY` (embeddings + rerank) and
> `OPENAI_API_KEY` (generation + web search). Without them, `bootstrap.sh` skips
> ingestion and the widget reports that the assistant is unavailable — the rest
> of the site is unaffected.

---

## API overview

Every service returns the same envelope (contract §4):

```jsonc
// success
{ "success": true, "data": { }, "meta": { "page": 1, "limit": 20, "total": 134, "totalPages": 7 } }
// error
{ "success": false, "error": { "code": "PROPERTY_NOT_FOUND", "message": "…", "details": [] } }
```

**Swagger / OpenAPI:** <https://localhost/api/v1/docs> — served by api-core
(`SWAGGER_PATH = api/v1/docs`), also reachable directly at
<http://localhost:4000/api/v1/docs>. The edge keeps <https://localhost/docs> as a
301 shortcut to it. `search-svc` publishes its own generated schema at
<https://localhost/api/search/docs> (`/api/search/openapi.json`).

<details>
<summary><b>Endpoint map</b></summary>

**api-core — `/api/v1`**

```
POST   /auth/register            POST /auth/login          POST /auth/refresh
POST   /auth/logout              GET  /auth/me             GET  /auth/google
GET    /auth/google/callback     POST /auth/forgot-password POST /auth/reset-password

GET    /properties               GET  /properties/:idOrSlug
POST   /properties [agent|admin] PATCH /properties/:id     DELETE /properties/:id [admin]
POST   /properties/:id/view      GET  /properties/:id/similar

GET    /compounds  /developers  /areas  /amenities   (+ admin write routes)
GET    /favorites                POST /favorites/:propertyId   DELETE /favorites/:propertyId
GET    /saved-searches           POST /saved-searches          DELETE /saved-searches/:id
POST   /leads                    GET  /leads [agent|admin]     PATCH /leads/:id
GET    /users/me                 PATCH /users/me               GET /users [admin]
POST   /uploads/presign          DELETE /uploads [admin]
GET    /admin/stats              GET  /admin/activity
```

**search-svc — `/api/search`**

```
GET  /            q, propertyType[], saleType, minPrice, maxPrice, bedrooms[],
                  minArea, maxArea, areaId[], compoundId[], developerId[],
                  amenities[], finishing[], deliveryBefore, maxDownPayment,
                  lat/lng/radiusKm, sort, page, limit
GET  /autocomplete    GET /facets    GET /similar/:id    GET /map?bbox=…
POST /reindex [X-Service-Token]   POST /index/:id   DELETE /index/:id
```

**rag-svc — `/api/chat`**

```
POST /threads     GET /threads/:id/messages    POST /message   GET /stream/:threadId
POST /feedback    POST /ingest [X-Service-Token]   GET /ingest/status/:runId
```

**reports-svc — `/api/reports`**

```
GET  /property/:id/brochure.pdf      GET  /market/summary?areaId=&from=&to=
POST /mortgage/calculate             POST /installment/schedule
GET  /admin/export/leads.csv [admin] GET  /admin/export/properties.csv [admin]
```

</details>

<details>
<summary><b>Try it from the shell</b></summary>

```bash
# search (public)
curl -sk "https://localhost/api/search?q=villa&areaId=&minPrice=5000000&limit=3" | jq

# register + login
curl -sk -X POST https://localhost/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"buyer@nawy.local","password":"Nawy@Demo123"}' | jq

# mortgage calculator (EGP)
curl -sk -X POST https://localhost/api/reports/mortgage/calculate \
  -H 'Content-Type: application/json' \
  -d '{"price":8500000,"downPaymentPercent":10,"years":8,"annualRatePercent":18.5}' | jq

# stream a chat answer (needs the model keys)
curl -skN -X POST https://localhost/api/chat/message \
  -H 'Content-Type: application/json' \
  -d '{"message":"3 bedroom apartment in New Cairo under 10M EGP","stream":true}'
```

</details>

---

## Testing

```bash
make test            # everything, inside the running containers
make test-api        # api-core   — Jest (unit + e2e)
make test-search     # search-svc — pytest
make test-rag        # rag-svc    — pytest
make test-reports    # reports-svc — RSpec
make lint            # eslint + ruff + rubocop, plus `nginx -t`
make health          # black-box: every /health, direct and through nginx
```

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs the same work on
every push and pull request:

| Job | What it does |
|---|---|
| `changes` | path filters; pull requests build only what moved, `main` always runs everything |
| `api-core` | `npm ci` → lint → `tsc --noEmit` → `prisma migrate deploy` → Jest, against real Postgres/Mongo/Redis service containers |
| `web` | `npm ci` → lint → typecheck → `next build` |
| `python` (matrix) | `search-svc` and `rag-svc`: pip install → ruff → mypy → pytest (Elasticsearch and Mongo booted for search) |
| `reports-svc` | `bundle install` → RuboCop → RSpec |
| `infra` | ShellCheck, `docker compose config`, `nginx -t` against the real config, `make help` |
| `docker-build` (matrix) | builds all five images with BuildKit + GitHub Actions cache |
| `compose-smoke` | boots the entire stack and runs `infra/scripts/health-check.sh`, then asserts the `:80 → :443` redirect and the four edge routes |
| `ci-success` | single required check for branch protection |

[`security.yml`](.github/workflows/security.yml) adds Trivy (vulnerabilities,
secrets, IaC misconfiguration, SARIF uploaded to code scanning), Gitleaks over
the full history and the working tree, `npm audit`, `pip-audit` and
`bundler-audit`, on every push plus a weekly schedule. Dependabot keeps npm, pip,
bundler, Docker and Actions up to date.

---

## Deployment

Local development is Docker Compose, and it is **the only path this repository
actually implements today**. `bootstrap.sh` never touches a cloud account.

> ⚠️ [`infra/terraform`](infra/terraform) is a **reserved, currently empty
> directory** — the placeholder for a future cloud stack, not working code.
> Nothing in this repo provisions cloud infrastructure, and no script here will
> ever call `terraform`. Treat the shape below as the intended design, not as
> something you can `terraform apply`.

The intended target when that directory is filled in: VPC, ECS Fargate services
behind an ALB, RDS PostgreSQL with `pgvector`, DocumentDB or MongoDB Atlas,
ElastiCache, an OpenSearch domain, S3 + CloudFront for media, ACM for real
certificates and Secrets Manager for the JWT and provider keys.

Production checklist if you take this further:

- Replace the self-signed certificate with ACM/Let's Encrypt — the `:80` server
  already serves `/.well-known/acme-challenge/` for a webroot challenge.
- Tighten the CSP: drop `'unsafe-eval'`/`'unsafe-inline'` once Next.js runs in
  production mode with nonces.
- Move `JWT_*`, `INTERNAL_SERVICE_TOKEN`, `DASHSCOPE_API_KEY` and
  `OPENAI_API_KEY` into a secrets manager; rotate them on a schedule.
- Enable Elasticsearch security (`xpack.security.enabled=true`) and authenticated
  Redis; both run open here because they are on a private compose network.
- Point the compose `target: development` builds at the production stage and
  drop the source bind mounts.

---

## Troubleshooting

<details>
<summary><b>The browser says the certificate is not trusted</b></summary>

Expected — it is self-signed. Click through once, or trust it permanently:

```bash
# Debian/Ubuntu
sudo cp infra/nginx/certs/localhost.crt /usr/local/share/ca-certificates/nawy-localhost.crt
sudo update-ca-certificates

# Fedora/RHEL
sudo cp infra/nginx/certs/localhost.crt /etc/pki/ca-trust/source/anchors/nawy-localhost.crt
sudo update-ca-trust extract

# macOS
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain \
  infra/nginx/certs/localhost.crt
```

Firefox keeps its own store: *Settings → Privacy & Security → Certificates →
View Certificates → Authorities → Import*. Restart the browser afterwards.
`curl` users can pass `-k` (every example above does).

</details>

<details>
<summary><b>A port is already in use / nginx will not start</b></summary>

`bootstrap.sh` warns about this before starting. Find the owner and stop it:

```bash
sudo ss -lptn 'sport = :443'
sudo ss -lptn 'sport = :5432'    # a local Postgres is the usual culprit
```

Apache, another nginx, a system Postgres/Redis or a previous run of this stack
are the common conflicts. `make down` clears the last one.

</details>

<details>
<summary><b>Elasticsearch keeps restarting or exits with code 78</b></summary>

Raise the kernel map limit (it resets on reboot unless persisted):

```bash
sudo sysctl -w vm.max_map_count=262144
echo 'vm.max_map_count=262144' | sudo tee /etc/sysctl.d/99-elasticsearch.conf
```

On Docker Desktop, give the VM at least 6 GB of RAM. Check with
`make logs-elasticsearch`.

</details>

<details>
<summary><b>I edited <code>infra/nginx/*.conf</code> and nothing changed</b></summary>

`nginx.conf` is bind-mounted as a **single file**, so the container holds the
original inode. Most editors write a temp file and rename it, which gives the
host a new inode the container never sees — `nginx -s reload` then happily
reloads the *old* config.

```bash
docker compose restart nginx     # or: make restart
make lint-nginx                  # syntax-check the files on disk, no stack needed
```

`make lint-nginx` runs `nginx -t` in a throwaway container against the real
config plus the generated certificate, so you can validate a change before
restarting anything.

</details>

<details>
<summary><b>A backend returns 502/503/504 through nginx but works on its direct port</b></summary>

nginx resolves upstream names at start/reload. If you recreated a container it
may now have a different IP:

```bash
make restart              # or: docker compose restart nginx
make health               # confirm
```

What the status code tells you:

| Code | Envelope `code` | Usually means |
|---|---|---|
| `502` | `SERVICE_UNAVAILABLE` | the container is up but nothing is listening on the port yet |
| `503` | `SERVICE_UNAVAILABLE` | every upstream in the pool is marked failed (`max_fails`) |
| `504` | `GATEWAY_TIMEOUT` | the container is stopped/unreachable, or the request genuinely ran long |

</details>

<details>
<summary><b>Search returns nothing</b></summary>

The index is built after seeding. Rebuild it:

```bash
make seed && make reindex
curl -s http://localhost:9200/_cat/indices?v      # properties_v1 should have 180 docs
```

</details>

<details>
<summary><b>The chatbot answers "unavailable" or ingestion was skipped</b></summary>

Both model keys must be present in `.env`:

```bash
grep -E '^(DASHSCOPE_API_KEY|OPENAI_API_KEY)=' .env
# fill them in, then
docker compose up -d rag-svc && make ingest
```

`GET /api/chat/ingest/status/:runId` reports progress; `make logs-rag-svc` shows
provider errors (quota, region, wrong base URL).

</details>

<details>
<summary><b>Chat replies arrive all at once instead of streaming</b></summary>

Something is buffering. Verify the edge is passing SSE through:

```bash
curl -skN https://localhost/api/chat/stream/<threadId> -D - | head
# expect: content-type: text/event-stream and x-accel-buffering: no
```

If the headers are missing, `docker compose exec nginx nginx -t` and confirm
`infra/nginx/conf.d/snippets/proxy-sse.inc` is included by the `/api/chat/`
location.

</details>

<details>
<summary><b>Migrations or the seeder fail</b></summary>

```bash
make logs-api-core
make shell-api-core
# inside the container:
npx prisma migrate deploy && npm run seed
```

A half-migrated database is fastest to fix with `make reset` followed by
`./infra/scripts/bootstrap.sh` (this deletes all local data).

</details>

<details>
<summary><b>Start over completely</b></summary>

```bash
make reset                    # containers + volumes, asks for confirmation
./infra/scripts/bootstrap.sh  # rebuild from zero
```

</details>

---

## Contributing notes

- [`docs/CONTRACT.md`](docs/CONTRACT.md) is binding: ports, routes, envelopes,
  enums, JWT claims and database ownership. Change it before changing code, not
  after.
- `seed/*.json` is generated — edit `seed/data/**` and run `node seed/generate.mjs`
  followed by `node seed/verify.mjs`.
- Secrets never get committed: `.env`, `*.key` and `*.pem` are git-ignored and
  Gitleaks runs in CI.

## License

No licence file has been added yet, so all rights are reserved by default — the
service manifests declare `UNLICENSED`. Add a `LICENSE` at the root before
publishing or reusing this code.

This is an educational clone: **not affiliated with, endorsed by, or connected
to Nawy**. Every developer name, compound, listing, price and image in `seed/` is
synthetic sample data generated by `seed/generate.mjs`, not real market data.
