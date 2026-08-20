# TopChoice

**Egypt's property marketplace, end to end.**

![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-Python%203.12-009688?logo=fastapi&logoColor=white)
![Sinatra](https://img.shields.io/badge/Sinatra-Ruby%203.3-CC342D?logo=ruby&logoColor=white)
![Flutter](https://img.shields.io/badge/Flutter-3.47-02569B?logo=flutter&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%20%2B%20pgvector-4169E1?logo=postgresql&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-7-47A248?logo=mongodb&logoColor=white)
![Elasticsearch](https://img.shields.io/badge/Elasticsearch-8.15-005571?logo=elasticsearch&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-compose-2496ED?logo=docker&logoColor=white)
![nginx](https://img.shields.io/badge/nginx-TLS%20edge-009639?logo=nginx&logoColor=white)
![LangGraph](https://img.shields.io/badge/RAG-LangGraph-1C3C3C)

A production-shaped property marketplace for the Egyptian primary and resale
market, built as a polyglot monorepo that runs end to end with one command.

Browse 180 seeded listings across New Cairo, Sheikh Zayed, the North Coast, the
New Administrative Capital, 6th of October and Mostakbal City from developers
like Palm Hills, SODIC, Emaar Misr, Talaat Moustafa Group, Mountain View, Ora
and Hassan Allam. Filter them through a real Elasticsearch index with Arabic and
English analyzers, price them with a mortgage engine that emits PDF brochures,
and ask a streaming retrieval-augmented chatbot *"what's a 3-bedroom in Sheikh
Zayed under 12M EGP with an 8 year plan?"* — every request arriving over TLS
through a single nginx edge.

```bash
git clone <this-repo> && cd Real-Estate-Platform
make bootstrap                      # ~5-10 min on a cold cache
open https://localhost              # accept the self-signed certificate once
```

---

## Table of contents

- [System architecture](#system-architecture)
- [Request routing](#request-routing)
- [Services](#services)
- [Data architecture](#data-architecture)
- [Database design](#database-design)
  - [PostgreSQL — the relational core](#postgresql--the-relational-core)
  - [MongoDB — the listing documents](#mongodb--the-listing-documents)
  - [Elasticsearch — the search index](#elasticsearch--the-search-index)
  - [pgvector — the RAG store](#pgvector--the-rag-store)
  - [Redis — ephemeral state](#redis--ephemeral-state)
- [Key flows](#key-flows)
- [Quick start](#quick-start)
- [Demo credentials](#demo-credentials)
- [Ports](#ports)
- [Configuration](#configuration)
- [Repository layout](#repository-layout)
- [Testing](#testing)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

---

## System architecture

Five application services behind one TLS edge, each owning its own data store.
Nothing shares a database: when one service needs another's data it asks over
HTTP, which is what keeps the boundaries honest.

```mermaid
flowchart TB
    subgraph clients["Clients"]
        browser["Web browser"]
        mobile["Flutter app<br/>Android"]
    end

    subgraph edge["Edge"]
        nginx["<b>nginx</b><br/>TLS 1.2/1.3 termination<br/>rate limiting, CSP, HSTS<br/>request-id correlation<br/>SSE pass-through"]
    end

    subgraph apps["Application services"]
        web["<b>web</b><br/>Next.js 15<br/>App Router, RSC<br/>:3000"]
        api["<b>api-core</b><br/>NestJS 11<br/>catalogue, auth, leads<br/>:4000"]
        search["<b>search-svc</b><br/>FastAPI<br/>query + index<br/>:8000"]
        rag["<b>rag-svc</b><br/>FastAPI + LangGraph<br/>streaming chat<br/>:8001"]
        reports["<b>reports-svc</b><br/>Sinatra + Prawn<br/>finance + PDF<br/>:4567"]
    end

    subgraph data["Data stores"]
        pg[("<b>PostgreSQL 16</b><br/>+ pgvector")]
        mongo[("<b>MongoDB 7</b>")]
        es[("<b>Elasticsearch</b><br/>8.15")]
        redis[("<b>Redis 7</b>")]
    end

    browser -->|HTTPS 443| nginx
    mobile -.->|"direct service ports<br/>(no edge)"| api
    mobile -.-> search
    mobile -.-> rag
    mobile -.-> reports

    nginx --> web
    nginx --> api
    nginx --> search
    nginx --> rag
    nginx --> reports

    web -->|SSR fetch| api
    web -->|SSR fetch| search

    api --> pg
    api --> mongo
    api --> redis

    search -->|read listings| mongo
    search --> es

    rag --> pg
    rag -->|"tool: search_listings"| search
    rag -->|"tool: get_property"| api

    reports --> mongo
    reports --> pg
    reports -->|PDF cache| redis

    classDef svc fill:#1f6feb22,stroke:#1f6feb,stroke-width:1px
    classDef store fill:#8957e522,stroke:#8957e5,stroke-width:1px
    classDef edgeC fill:#2ea04322,stroke:#2ea043,stroke-width:1px
    class web,api,search,rag,reports svc
    class pg,mongo,es,redis store
    class nginx edgeC
```

**Why the mobile app bypasses the edge.** The Flutter client talks to each
service on its own port rather than through nginx. On an emulator the host is
`10.0.2.2` and there is no trusted certificate for the self-signed edge, so
going direct avoids shipping a TLS exception in a debug build. Every base URL is
a `--dart-define`, so a real deployment points them all at the public edge.

---

## Request routing

nginx owns every public path. The prefixes are contractual — see
[`docs/CONTRACT.md`](docs/CONTRACT.md) §2 — and a service never sees a path
outside its own namespace.

```mermaid
flowchart LR
    R["https://localhost"]

    R --> A["/"]
    R --> B["/_next/*"]
    R --> C["/api/v1/auth/*"]
    R --> D["/api/v1/*"]
    R --> E["/api/search<br/>/api/search/*"]
    R --> F["/api/chat/*"]
    R --> G["/api/reports/*"]
    R --> H["/__health/*"]

    A --> WEB["web"]
    B --> WEB
    C --> API["api-core<br/><i>20 req/min, burst 10</i>"]
    D --> API2["api-core<br/><i>30 req/s</i>"]
    E --> SRCH["search-svc<br/><i>20 req/s</i>"]
    F --> RAG["rag-svc<br/><i>60 req/min, buffering off</i>"]
    G --> REP["reports-svc"]
    H --> ANY["edge-only probes"]
```

Auth gets its own tighter bucket because credential stuffing is the attack that
actually happens. `/api/chat/` runs with `proxy_buffering off`, `gzip off` and
`X-Accel-Buffering: no` so chat tokens arrive one at a time rather than in one
lump at the end. Every rate limit, `413`, `502/503` and `504` returns the
contract's JSON error envelope, not an HTML page — a client never has to parse
HTML to discover what went wrong.

---

## Services

| Service | Stack | Owns | Responsibility |
|---|---|---|---|
| **web** | Next.js 15, React 19, Tailwind | — | Storefront and admin. Server components fetch through the same envelope the public API uses. Bilingual EN/AR with RTL. |
| **api-core** | NestJS 11, Prisma, Mongoose | PostgreSQL `nawy`, MongoDB `nawy`, Redis | The catalogue and the system of record. Auth with refresh-token rotation, areas, developers, compounds, amenities, favourites, saved searches, leads, reviews, audit log. |
| **search-svc** | FastAPI, Python 3.12 | Elasticsearch | Query and index. Reads listings from Mongo, projects them into `properties_v1`, serves faceted search and autocomplete in both languages. |
| **rag-svc** | FastAPI, LangGraph | PostgreSQL `nawy_rag` (pgvector) | Retrieval-augmented chat over SSE. Owns threads, messages, summaries, the document/chunk store and its embeddings; calls the other services as tools. |
| **reports-svc** | Sinatra, Ruby 3.3, Prawn | — (reads Mongo + PG) | The finance engine: mortgage and installment maths, market aggregation, CSV exports and PDF brochures. Caches rendered PDFs in Redis. |

---

## Data architecture

Four stores, each chosen for what it is actually good at, and one clear owner
per store.

```mermaid
flowchart TB
    subgraph pgb["PostgreSQL 16 + pgvector"]
        direction TB
        db1[("<b>nawy</b><br/>relational catalogue<br/>15 tables")]
        db2[("<b>nawy_rag</b><br/>chat + embeddings<br/>7 tables")]
    end

    mg[("<b>MongoDB 7</b><br/>nawy<br/>properties, property_views<br/>activity_events")]
    esx[("<b>Elasticsearch 8.15</b><br/>properties_v1<br/>59 fields, 4 analyzers")]
    rd[("<b>Redis 7</b><br/>refresh tokens<br/>rate counters, PDF cache")]

    API["api-core"] --> db1
    API --> mg
    API --> rd
    RAG["rag-svc"] --> db2
    SRC["search-svc"] --> esx
    SRC -.->|"reindex reads"| mg
    REP["reports-svc"] -.->|"reads"| mg
    REP -.->|"reads"| db1
    REP --> rd

    classDef s fill:#1f6feb22,stroke:#1f6feb
    class API,RAG,SRC,REP s
```

**Why listings live in Mongo and everything else in Postgres.** A listing is a
deep, bilingual, irregularly-shaped document — nested price, specs, location,
media arrays, an embedded payment plan, denormalised compound and developer
stubs. Modelling that relationally means a dozen joins to render one card. The
catalogue around it — users, areas, developers, leads, favourites — is
genuinely relational and wants foreign keys and transactions, so it stays in
Postgres.

**The bridge between them** is `property_index`, a thin Postgres projection of
each listing carrying only what a foreign key needs to point at: the UUID, the
Mongo ObjectId, the slug, and the few columns other tables filter on. It is what
lets `favorites.property_id` and `leads.property_id` be real relational columns
without dragging the whole document into Postgres.

---

## Database design

### PostgreSQL — the relational core

Database `nawy`, owned by api-core, managed with Prisma migrations.

```mermaid
erDiagram
    users ||--o{ accounts : "oauth identities"
    users ||--o{ refresh_tokens : "rotating sessions"
    users ||--o{ favorites : saves
    users ||--o{ saved_searches : stores
    users ||--o{ reviews : writes
    users ||--o{ leads : "submits / is assigned"
    users ||--o{ audit_logs : "acts"

    developers ||--o{ compounds : builds
    areas ||--o{ compounds : "located in"
    compounds ||--o{ payment_plans : offers
    compounds }o--o{ amenities : "compound_amenities"

    areas ||--o{ property_index : "contains"
    compounds ||--o{ property_index : "contains"
    developers ||--o{ property_index : "built"

    property_index ||--o{ favorites : "saved as"
    property_index ||--o{ leads : "enquired about"
    property_index ||--o{ reviews : "reviewed"

    areas ||--o{ leads : "sell enquiry names"
    compounds ||--o{ leads : "sell enquiry names"

    users {
        uuid id PK
        varchar email UK
        varchar name
        text password_hash
        varchar phone
        user_role role "user|agent|admin"
        boolean is_verified
        boolean is_active
        varchar locale "en|ar"
        text reset_token_hash
        timestamp last_login_at
    }

    refresh_tokens {
        uuid id PK
        uuid user_id FK
        uuid jti UK "denylist key"
        text token_hash
        varchar ip_address
        timestamp expires_at
        timestamp revoked_at
        uuid replaced_by_jti "rotation chain"
    }

    accounts {
        uuid id PK
        uuid user_id FK
        varchar provider
        varchar provider_account_id
        text access_token
        timestamp expires_at
    }

    areas {
        uuid id PK
        varchar slug UK
        varchar name_en
        varchar name_ar
        varchar city
        varchar governorate
        double lat
        double lng
        integer property_count "denormalised"
        integer avg_price_per_meter "denormalised"
        boolean is_active
    }

    developers {
        uuid id PK
        varchar slug UK
        varchar name
        varchar name_ar
        text logo_url
        integer founded_year
        integer projects_count
        boolean is_featured
    }

    compounds {
        uuid id PK
        varchar slug UK
        varchar name
        varchar name_ar
        uuid developer_id FK
        uuid area_id FK
        integer starting_price
        integer max_price
        integer delivery_year
        integer installment_years
        integer down_payment_percent
        text_array images
        text_array unit_types
        boolean is_featured
    }

    amenities {
        uuid id PK
        varchar slug UK
        varchar name_en
        varchar name_ar
        varchar icon
        varchar category
    }

    payment_plans {
        uuid id PK
        uuid compound_id FK
        varchar name
        integer down_payment_percent
        integer installment_years
        integer monthly_installment
        date delivery_date
        boolean is_default
    }

    property_index {
        uuid id PK "= Mongo propertyId"
        varchar mongo_id "= Mongo _id"
        varchar slug UK
        uuid compound_id FK
        uuid developer_id FK
        uuid area_id FK
        integer price_min
        property_status status
        boolean is_featured
        timestamp published_at
        timestamp deleted_at "soft delete"
    }

    leads {
        uuid id PK
        uuid property_id FK "null for sell enquiries"
        uuid user_id FK
        uuid area_id FK
        uuid compound_id FK
        varchar name
        varchar phone
        varchar email
        text message
        varchar source
        lead_status status "new|contacted|qualified|viewing|negotiating|won|lost"
        uuid assigned_to_id FK
        timestamp contacted_at
    }

    favorites {
        uuid id PK
        uuid user_id FK
        uuid property_id FK
    }

    saved_searches {
        uuid id PK
        uuid user_id FK
        varchar name
        jsonb criteria "serialised filter set"
        boolean alert_enabled
        timestamp last_run_at
    }

    reviews {
        uuid id PK
        uuid user_id FK
        uuid property_id FK
        uuid compound_id FK
        integer rating
        varchar title
        text comment
        boolean is_approved "moderation gate"
    }

    audit_logs {
        uuid id PK
        uuid user_id FK
        varchar action
        varchar entity_type
        varchar entity_id
        jsonb metadata
        varchar ip_address
        varchar request_id "correlates with nginx"
    }
```

Three details worth calling out:

- **`refresh_tokens.replaced_by_jti`** makes rotation auditable. Each refresh
  mints a new token and points the old row at it, so replaying a spent token is
  detectable rather than merely rejected — the whole chain can be revoked.
- **`leads.property_id` is nullable.** A "sell my property" enquiry names an
  area, a compound and a property type instead of an existing listing, so those
  three columns carry it.
- **`property_index.deleted_at`** is the soft-delete tombstone every consumer
  filters on. A hard delete would orphan favourites and leads that legitimately
  reference a withdrawn listing.

### MongoDB — the listing documents

Database `nawy`, collection `properties`. One document is everything needed to
render a listing page without a join.

```mermaid
classDiagram
    class Property {
        ObjectId _id
        string propertyId "UUID, the public id"
        string slug
        string referenceNo "TC-1042"
        string propertyType
        string saleType "primary|resale"
        string status
        string finishing
        boolean isFeatured
        string[] amenities "slugs"
        Date publishedAt
        Date createdAt
        Date updatedAt
        Date deletedAt "soft delete"
    }
    class Title {
        string en
        string ar
    }
    class Price {
        number amount
        string currency "EGP"
        number pricePerMeter
    }
    class Specs {
        number bedrooms
        number bathrooms
        number areaSqm
        number gardenSqm
        number floor
        number parkingSpots
    }
    class Location {
        string areaId
        string areaName
        string city
        string governorate
        string address
        GeoJSON geo "Point"
    }
    class CompoundStub {
        string id
        string name
        string slug
    }
    class DeveloperStub {
        string id
        string name
        string slug
        string logoUrl
    }
    class Media {
        Image[] images
        Image[] floorPlans
        string videoUrl
        string tourUrl
    }
    class PaymentPlan {
        number downPaymentPercent
        number installmentYears
        number monthlyInstallment
        string deliveryDate
    }
    class Stats {
        number views
        number favorites
        number leads
    }

    Property *-- Title : title, description
    Property *-- Price : price
    Property *-- Specs : specs
    Property *-- Location : location
    Property *-- CompoundStub : compound
    Property *-- DeveloperStub : developer
    Property *-- Media : media
    Property *-- PaymentPlan : paymentPlan
    Property *-- Stats : stats
```

The `compound` and `developer` stubs are deliberately denormalised copies of the
Postgres rows. A listing card needs the compound name and the developer logo;
fetching those over HTTP per card would be absurd, and they change rarely enough
that a reindex is the right refresh mechanism.

`property_views` and `activity_events` sit alongside as append-only collections,
kept out of Postgres because they are high-write and nothing joins against them.

### Elasticsearch — the search index

Index `properties_v1` behind the alias `properties`, projected from Mongo. 59
fields, four custom analyzers.

```mermaid
flowchart LR
    subgraph an["Analyzers"]
        A1["<b>topchoice_english</b><br/>possessive stemmer, lowercase<br/>asciifolding, stopwords, stemmer"]
        A2["<b>topchoice_arabic</b><br/>lowercase, decimal_digit<br/>arabic_normalization<br/>arabic_stop, arabic_stemmer"]
        A3["<b>autocomplete</b><br/>edge n-grams over<br/>normalised Arabic + Latin"]
        A4["<b>autocomplete_search</b><br/>same, without n-grams"]
    end

    subgraph fl["Field groups"]
        F1["<b>full-text</b><br/>title_en/ar, description_en/ar<br/>all_en, all_ar, address"]
        F2["<b>filters — keyword</b><br/>propertyType, saleType, status<br/>finishing, amenities<br/>areaId, compoundId, developerId"]
        F3["<b>ranges — numeric</b><br/>price, pricePerMeter, areaSqm<br/>bedrooms, bathrooms<br/>deliveryYear, installmentYears"]
        F4["<b>geo + dates</b><br/>geo_point, deliveryDate<br/>publishedAt, createdAt"]
        F5["<b>suggest</b><br/>areaName, compoundName<br/>developerName + .autocomplete"]
    end

    A1 --> F1
    A2 --> F1
    A3 --> F5
    A4 --> F5
```

`all_en` and `all_ar` are copy-to catch-alls, so a single query string matches a
compound name, an area, a developer or the description without the caller
enumerating fields. The alias indirection is what makes a zero-downtime reindex
possible: build `properties_v2`, then flip the alias.

### pgvector — the RAG store

Database `nawy_rag`, owned by rag-svc. Conversation state and the embedded
corpus live together so a thread and its citations are one transaction.

```mermaid
erDiagram
    chat_threads ||--o{ chat_messages : contains
    chat_threads ||--o{ chat_summaries : "rolled up into"
    chat_threads ||--o{ tool_calls : "made during"
    chat_messages ||--o{ tool_calls : "triggered"
    rag_documents ||--o{ rag_chunks : "split into"

    chat_threads {
        uuid id PK
        uuid user_id "null for guests"
        text title
        varchar locale "en|ar"
        timestamptz last_message_at
        jsonb metadata
    }

    chat_messages {
        uuid id PK
        uuid thread_id FK
        varchar role "user|assistant|system|tool"
        text content
        jsonb sources "citations"
        jsonb tool_calls
        integer tokens
        integer latency_ms
        integer rating "thumbs up/down"
        text feedback
    }

    chat_summaries {
        uuid id PK
        uuid thread_id FK
        text summary
        uuid up_to_message_id "watermark"
    }

    tool_calls {
        uuid id PK
        uuid thread_id FK
        uuid message_id FK
        varchar name
        jsonb arguments
        jsonb result
        varchar status
        integer latency_ms
        text error
    }

    rag_documents {
        uuid id PK
        varchar source_type "property|compound|area|developer|faq|url"
        varchar source_id
        text uri
        text title
        varchar lang
        varchar checksum "skips unchanged re-embeds"
        jsonb metadata
    }

    rag_chunks {
        uuid id PK
        uuid document_id FK
        integer ordinal
        text content
        integer token_count
        jsonb metadata
        vector embedding "1024 dimensions"
    }

    ingestion_runs {
        uuid id PK
        varchar source
        varchar status
        jsonb stats
        text error
        timestamptz started_at
        timestamptz finished_at
    }
```

`rag_documents.checksum` is what makes re-ingestion cheap: a document whose
content hash has not moved is skipped rather than re-embedded. `chat_summaries`
carries a watermark so a long thread is compacted incrementally instead of being
re-summarised from the top every turn.

### Redis — ephemeral state

Nothing in Redis is a source of truth; it is all reconstructible.

| Namespace | Written by | Purpose |
|---|---|---|
| `auth:refresh:<jti>` | api-core | Refresh-token denylist. A rotated or revoked `jti` lands here until its natural expiry, so a stolen token dies before the JWT does. |
| `cache:prop:<id>:<v>` | reports-svc | Rendered PDF brochures, keyed by property and template version. |
| rate-limit counters | search-svc, reports-svc | Per-caller windows for the service-level limits that sit behind nginx's. |

---

## Key flows

### Search

```mermaid
sequenceDiagram
    participant B as Browser
    participant N as nginx
    participant S as search-svc
    participant E as Elasticsearch

    B->>N: GET /api/search?bedrooms=3&areaId=…&facets=true
    N->>S: proxy, adds X-Request-Id
    S->>S: validate + build the ES query
    S->>E: bool query + aggregations
    E-->>S: hits + facet buckets
    S-->>N: envelope with data, meta, facets
    N-->>B: JSON, request-id echoed back
```

Facets are opt-in (`facets=true`) so an ordinary results page does not pay for
fifteen aggregations it will not render.

### Indexing

```mermaid
sequenceDiagram
    participant Op as Operator
    participant S as search-svc
    participant M as MongoDB
    participant E as Elasticsearch

    Op->>S: POST /api/search/reindex {"full": true}
    S-->>Op: 202 with runId, work continues async
    loop batches
        S->>M: read published, non-deleted listings
        M-->>S: documents
        S->>S: project to the flat index shape
        S->>E: bulk index
    end
    S->>E: refresh + flip alias
    Note over S: run recorded, queryable at /index/health
```

### Retrieval-augmented chat

The LangGraph state machine behind `/api/chat/message`:

```mermaid
flowchart TB
    START([message in]) --> LM["load_memory<br/><i>thread history + summary</i>"]
    LM --> G["guard<br/><i>scope + safety</i>"]
    G -->|refused| GEN
    G --> C["classify<br/><i>smalltalk · knowledge · listing_search · web · handoff</i>"]

    C -->|smalltalk| GEN
    C -->|listing_search| TC["call_tools<br/><i>search_listings, get_property,<br/>calculate_mortgage</i>"]
    C -->|knowledge| RW["rewrite_query<br/><i>resolve pronouns from history</i>"]

    RW --> RET["retrieve<br/><i>hybrid: vector + keyword</i>"]
    RET --> GR["grade_context<br/><i>is this enough to answer?</i>"]
    GR -->|insufficient, retry| RW
    GR -->|sufficient| GEN
    TC --> GEN["generate<br/><i>stream tokens over SSE</i>"]
    GEN --> END([answer + citations])
```

`grade_context` is the loop that stops the model answering from thin retrieval:
if the chunks do not support an answer it rewrites the query and tries again, up
to a bounded number of iterations, rather than confabulating.

---

## Quick start

```bash
make bootstrap
```

That one command creates `.env` with freshly generated secrets, issues a
self-signed TLS certificate, builds every image, waits for health, seeds the
catalogue, builds the Elasticsearch index and ingests the RAG corpus.

Then:

```bash
make health      # probe every service through TLS
make ps          # container status
make logs        # tail everything
make down        # stop, keeping volumes
```

The chatbot answers from the knowledge base without any model key. Set
`OPENAI_API_KEY` (and optionally `DASHSCOPE_API_KEY` for embeddings) in `.env`
to get generated prose instead of rendered tool output.

---

## Demo credentials

| Role | Email | Password |
|---|---|---|
| admin | `admin@topchoice.local` | `TopChoice@Demo123` |
| agent | `agent@topchoice.local` | `TopChoice@Demo123` |
| user | `buyer@topchoice.local` | `TopChoice@Demo123` |

---

## Ports

Every published host port is overridable, because a machine that already runs
Postgres on 5432 should still be able to start this stack. Set any of these in
`.env`; the container-side ports and all service-to-service URLs are unaffected.

| Service | Public path | Host port | Override |
|---|---|---|---|
| nginx | `https://localhost` | 80, 443 | `HTTP_HOST_PORT`, `HTTPS_HOST_PORT` |
| web | `/` | 3000 | `WEB_HOST_PORT` |
| api-core | `/api/v1/*` | 4000 | `API_CORE_HOST_PORT` |
| search-svc | `/api/search*` | 8000 | `SEARCH_SVC_HOST_PORT` |
| rag-svc | `/api/chat/*` | 8001 | `RAG_SVC_HOST_PORT` |
| reports-svc | `/api/reports/*` | 4567 | `REPORTS_SVC_HOST_PORT` |
| postgres | — | 5432 | `POSTGRES_HOST_PORT` |
| mongo | — | 27017 | `MONGO_HOST_PORT` |
| redis | — | 6379 | `REDIS_HOST_PORT` |
| elasticsearch | — | 9200 | `ELASTIC_HOST_PORT` |

`https://localhost/__health/<service>` probes each backend *through* TLS without
colliding with any application route.

---

## Configuration

Every value lives in `.env`, created from [`.env.example`](.env.example) by
bootstrap. Names are contractual — see [`docs/CONTRACT.md`](docs/CONTRACT.md) §7
— so do not rename them.

| Group | Keys |
|---|---|
| Secrets | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `INTERNAL_SERVICE_TOKEN` |
| Datastores | `DATABASE_URL`, `MONGO_URL`, `REDIS_URL`, `ELASTICSEARCH_URL` |
| Service URLs | `API_CORE_URL`, `SEARCH_SVC_URL`, `RAG_SVC_URL`, `REPORTS_SVC_URL` |
| Models | `OPENAI_API_KEY`, `DASHSCOPE_API_KEY` |
| Public | `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_*_URL` |
| Host ports | `*_HOST_PORT` (see above) |

---

## Repository layout

```
.
├── apps/
│   ├── web/            Next.js 15 storefront and admin
│   ├── mobile/         Flutter client (Android)
│   ├── api-core/       NestJS: catalogue, auth, leads
│   ├── search-svc/     FastAPI: Elasticsearch query + index
│   ├── rag-svc/        FastAPI + LangGraph: streaming chat
│   └── reports-svc/    Sinatra: finance, CSV, PDF
├── infra/
│   ├── nginx/          TLS edge, routing, rate limits
│   ├── terraform/      AWS: VPC, ECS, RDS, DocumentDB, OpenSearch, CloudFront
│   └── scripts/        bootstrap, certs, health
├── seed/               The catalogue: 180 listings, compounds, areas, developers
├── docs/CONTRACT.md    The API contract every service is held to
└── docker-compose.yml
```

---

## Testing

```bash
make test              # every suite
```

| Component | Tests | Runner |
|---|---|---|
| api-core | 84 | Jest |
| web | 39 | Vitest |
| mobile | 33 | `flutter test` |
| search-svc | 90 | pytest |
| rag-svc | 197 | pytest |
| reports-svc | 199 | RSpec |

Static analysis runs alongside: ESLint and `tsc` for TypeScript, ruff and mypy
for Python, RuboCop for Ruby, `flutter analyze --fatal-infos` for Dart, and
`terraform fmt`/`validate` for the infrastructure.

Two workflows gate `main`: **CI** (lint, typecheck, test, image build, compose
smoke test) and **Security** (npm audit, pip-audit, bundler-audit, Gitleaks, and
Trivy across the filesystem, secrets and IaC).

---

## Deployment

`infra/terraform` provisions the AWS side: VPC with public/app/data tiers, ECS
Fargate services behind an ALB, RDS PostgreSQL, DocumentDB, ElastiCache,
OpenSearch, S3 plus CloudFront for media, Secrets Manager, and a customer-
managed KMS key per store.

```bash
cd infra/terraform/bootstrap && terraform init && terraform apply   # once per account
cd .. && terraform init -backend-config=environments/prod.backend.hcl
terraform plan
```

Release signing for the mobile app reads `apps/mobile/android/key.properties`,
which is gitignored — copy `key.properties.example` and generate a keystore.

---

## Troubleshooting

**The browser warns about the certificate.** It is self-signed. Accept it once,
or trust it system-wide with the instructions in
`infra/scripts/gen-certs.sh`.

**A port is already in use.** Set the matching `*_HOST_PORT` in `.env` and
`make up` again. Nothing internal depends on the host-side number.

**Search returns `SEARCH_BACKEND_ERROR`.** Check `make health` and then the
cluster: `curl localhost:9200/_cluster/health`. A red cluster on a full disk is
the usual cause — Elasticsearch stops allocating shards near its watermark. The
compose file already pushes those out for a single-node dev cluster; free some
disk and it recovers.

**The chatbot answers but never streams.** SSE needs buffering off end to end.
Confirm with `curl -skN https://localhost/api/chat/stream/<id>` and look for
`content-type: text/event-stream` and `x-accel-buffering: no`.

**nginx returns 502 after recreating a container.** nginx resolves upstream
names at start. Run `make restart` if a backend's IP changed.

---

## License

MIT.
