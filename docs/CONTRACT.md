# TopChoice — Cross-Service Contract (SINGLE SOURCE OF TRUTH)

> Every service builder MUST conform to this file. Do not invent alternative port
> numbers, env var names, route prefixes, or field names. If something is missing,
> follow the closest existing convention here rather than inventing a new one.

---

## 1. Services, ports, ownership

| Service        | Dir                | Stack                        | Host port | Internal URL (docker) | Owns |
|----------------|--------------------|------------------------------|-----------|-----------------------|------|
| `web`          | `apps/web`         | Next.js 15 App Router, TS    | 3000      | `http://web:3000`         | UI, SSR, BFF proxy routes |
| `api-core`     | `apps/api-core`    | NestJS 11, TS                | 4000      | `http://api-core:4000`    | Auth/JWT/OAuth, users, developers, compounds, areas, properties (write), favorites, leads, uploads (S3), admin |
| `search-svc`   | `apps/search-svc`  | Python 3.12 FastAPI          | 8000      | `http://search-svc:8000`  | Elasticsearch index mgmt, search, filters, autocomplete, geo, aggregations, recommendations |
| `rag-svc`      | `apps/rag-svc`     | Python 3.12 FastAPI+LangGraph| 8001      | `http://rag-svc:8001`     | Chatbot RAG, pgvector, embeddings, rerank, generation, chat memory, tools |
| `reports-svc`  | `apps/reports-svc` | Ruby 3.3 Sinatra             | 4567      | `http://reports-svc:4567` | Analytics rollups, PDF/CSV brochures & reports, mortgage/installment calc engine, scheduled digests |
| `postgres`     | —                  | Postgres 16 + pgvector       | 5432      | `postgres:5432`           | relational + vector |
| `mongo`        | —                  | MongoDB 7                    | 27017     | `mongo:27017`             | listing documents |
| `redis`        | —                  | Redis 7                      | 6379      | `redis:6379`              | cache, rate limit, refresh-token denylist, queues |
| `elasticsearch`| —                  | Elasticsearch 8.15           | 9200      | `http://elasticsearch:9200` | search index |
| `nginx`        | `infra/nginx`      | nginx + self-signed TLS      | 80/443    | `nginx:443`               | TLS termination, routing |

**All public traffic goes through nginx.** Path routing:
- `/` → `web`
- `/api/v1/*` → `api-core`
- `/api/search/*` → `search-svc`
- `/api/chat/*` → `rag-svc`
- `/api/reports/*` → `reports-svc`

---

## 2. Database ownership (do NOT cross these lines)

### PostgreSQL — database `topchoice`, owned by **api-core** (Prisma)
Relational, transactional, identity. Tables:
`users`, `accounts` (oauth), `refresh_tokens`, `developers`, `compounds`, `areas`,
`amenities`, `payment_plans`, `favorites`, `saved_searches`, `leads`, `reviews`,
`audit_logs`, `property_index` (thin mirror: `id`, `mongo_id`, `slug`, `compound_id`,
`developer_id`, `area_id`, `price_min`, `status`, `created_at` — used for FK integrity
and joins only).

### PostgreSQL — database `topchoice_rag`, owned by **rag-svc** (SQLAlchemy + pgvector)
`rag_documents`, `rag_chunks` (with `embedding vector(1024)`), `chat_threads`,
`chat_messages`, `chat_summaries`, `tool_calls`, `ingestion_runs`.

### MongoDB — database `topchoice`, owned by **api-core** (Mongoose)
Rich, schema-flexible listing documents. Collections:
`properties` (the canonical full listing document), `property_views`, `chat_transcripts_archive`, `activity_events`.

**Rule:** the *canonical* property document lives in Mongo. Postgres holds `property_index`
for referential integrity. Elasticsearch holds the denormalized search doc.
`search-svc` and `rag-svc` **read** Mongo/Postgres but never write business data there.

### Redis key namespaces
```
cache:prop:{id}                 TTL 300s
cache:list:{hash}               TTL 120s
cache:search:{hash}             TTL 60s
ratelimit:{scope}:{ip|userId}   TTL window
auth:denylist:{jti}             TTL = refresh token remaining life
auth:refresh:{userId}:{jti}     TTL 30d
chat:stream:{threadId}          TTL 3600s
lock:{resource}                 TTL 30s
```

---

## 3. Canonical domain model

### Property (Mongo `properties` — the full document)
```jsonc
{
  "_id": "ObjectId",
  "slug": "palm-hills-new-cairo-3br-apartment-a12",         // unique
  "referenceNo": "TC-1042",
  "title": { "en": "3 Bedroom Apartment in Palm Hills", "ar": "شقة 3 غرف في بالم هيلز" },
  "description": { "en": "...", "ar": "..." },
  "propertyType": "apartment",       // apartment|villa|townhouse|twinhouse|duplex|penthouse|studio|chalet|office|retail|clinic
  "saleType": "primary",             // primary|resale|rent
  "status": "available",             // available|reserved|sold|off_plan|delivered
  "finishing": "semi_finished",      // core_shell|semi_finished|fully_finished|furnished
  "price": { "amount": 8500000, "currency": "EGP", "pricePerMeter": 47222 },
  "paymentPlan": {
    "downPaymentPercent": 10,
    "installmentYears": 8,
    "monthlyInstallment": 88541,
    "deliveryDate": "2027-06-30"
  },
  "specs": { "bedrooms": 3, "bathrooms": 3, "areaSqm": 180, "gardenSqm": 0, "floor": 5, "parkingSpots": 1 },
  "location": {
    "areaId": "uuid",  "areaName": "New Cairo", "city": "Cairo", "governorate": "Cairo",
    "address": "90th North St.",
    "geo": { "type": "Point", "coordinates": [31.4913, 30.0304] }   // [lng, lat] GeoJSON
  },
  "compound":  { "id": "uuid", "name": "Palm Hills New Cairo", "slug": "palm-hills-new-cairo" },
  "developer": { "id": "uuid", "name": "Palm Hills Developments", "slug": "palm-hills", "logoUrl": "..." },
  "amenities": ["pool", "gym", "security", "clubhouse"],
  "media": {
    "images": [{ "url": "...", "key": "properties/xx.jpg", "width": 1600, "height": 900, "isPrimary": true, "order": 0 }],
    "floorPlans": [{ "url": "...", "label": "Type A" }],
    "videoUrl": null, "tourUrl": null
  },
  "stats": { "views": 0, "favorites": 0, "leads": 0 },
  "isFeatured": false,
  "publishedAt": "2026-01-10T00:00:00.000Z",
  "createdAt": "...", "updatedAt": "...", "deletedAt": null
}
```

### Elasticsearch index `properties_v1` (alias `properties`)
Flattened from the Mongo doc. Required fields: `id, slug, title_en, title_ar,
description_en, description_ar, propertyType, saleType, status, finishing,
price, pricePerMeter, downPaymentPercent, installmentYears, deliveryDate,
bedrooms, bathrooms, areaSqm, areaId, areaName, city, compoundId, compoundName,
developerId, developerName, amenities, geo (geo_point {lat,lon}), isFeatured,
publishedAt, primaryImage, suggest (completion)`.
Analyzers: `arabic` + `english` multi-fields (`title_en.std`, `title_ar.ar`), plus
an `edge_ngram` autocomplete analyzer.

### Enums (use these exact strings everywhere — TS, Python, Ruby, ES, UI)
```
propertyType: apartment villa townhouse twinhouse duplex penthouse studio chalet office retail clinic
saleType:     primary resale rent
status:       available reserved sold off_plan delivered
finishing:    core_shell semi_finished fully_finished furnished
userRole:     user agent admin superadmin
leadStatus:   new contacted qualified viewing negotiating won lost
```

---

## 4. HTTP conventions

**Success**
```json
{ "success": true, "data": <payload>, "meta": { "page": 1, "limit": 20, "total": 134, "totalPages": 7 } }
```
`meta` present only on paginated endpoints.

**Error** (every service, including Python and Ruby)
```json
{ "success": false, "error": { "code": "PROPERTY_NOT_FOUND", "message": "Human readable", "details": [] } }
```
`code` is SCREAMING_SNAKE. HTTP status set correctly (400/401/403/404/409/422/429/500).

**Pagination query params:** `page` (1-based, default 1), `limit` (default 20, max 100),
`sort` (e.g. `-price`, `createdAt`).

**Correlation:** every service reads/propagates `X-Request-Id` (generate a UUID if absent)
and logs it.

**Health:** every service exposes `GET /health` → `{"status":"ok","service":"<name>","version":"1.0.0","deps":{...}}`
and `GET /health/ready`.

---

## 5. Authentication (issued by api-core, verified by ALL services)

- **Access token**: JWT, `HS256`, secret `JWT_ACCESS_SECRET`, TTL 15m.
- **Refresh token**: JWT, `HS256`, secret `JWT_REFRESH_SECRET`, TTL 30d, rotated on use,
  `jti` tracked in Redis (`auth:refresh:*`), old jti added to `auth:denylist:*`.
- Access token sent as `Authorization: Bearer <token>`.
- Refresh token stored in `httpOnly; Secure; SameSite=Lax` cookie named `topchoice_rt`.

**Access token claims (exact):**
```json
{ "sub": "<userId uuid>", "email": "a@b.com", "role": "user", "name": "Ahmed",
  "jti": "<uuid>", "iss": "topchoice-api", "aud": "topchoice-clients", "iat": 0, "exp": 0 }
```

`search-svc`, `rag-svc`, `reports-svc` verify the SAME `JWT_ACCESS_SECRET` locally
(no network call), checking `iss=topchoice-api` and `aud=topchoice-clients`. Shared helper
must be implemented in each language.

**Google OAuth 2.0**: `GET /api/v1/auth/google` → redirect;
`GET /api/v1/auth/google/callback` → sets `topchoice_rt` cookie and 302s to
`${FRONTEND_URL}/auth/callback#accessToken=...`.

**Service-to-service**: header `X-Service-Token: ${INTERNAL_SERVICE_TOKEN}` for
internal-only endpoints (e.g. search reindex hooks).

---

## 6. Endpoint map (implement exactly these paths)

### api-core — prefix `/api/v1`
```
POST   /auth/register            {name,email,password,phone?}
POST   /auth/login               {email,password}
POST   /auth/refresh             (cookie)
POST   /auth/logout
GET    /auth/me
GET    /auth/google
GET    /auth/google/callback
POST   /auth/forgot-password
POST   /auth/reset-password

GET    /properties               list (paginated, basic filters; heavy search → search-svc)
GET    /properties/:idOrSlug
POST   /properties               [agent|admin]
PATCH  /properties/:id           [agent|admin]
DELETE /properties/:id           [admin]
POST   /properties/:id/view      (fire & forget, increments stats)
GET    /properties/:id/similar

GET    /compounds                GET /compounds/:idOrSlug   POST/PATCH/DELETE [admin]
GET    /developers               GET /developers/:idOrSlug  POST/PATCH/DELETE [admin]
GET    /areas                    GET /areas/:idOrSlug       POST/PATCH/DELETE [admin]
GET    /amenities

GET    /favorites                POST /favorites/:propertyId    DELETE /favorites/:propertyId
GET    /saved-searches           POST /saved-searches           DELETE /saved-searches/:id

POST   /leads                    {propertyId?,areaId?,compoundId?,propertyType?,name,phone,email,message,source}
GET    /leads                    [agent|admin]  ?status&propertyId&compoundId&assignedToId&source&q&from&to
PATCH  /leads/:id                [agent|admin]

GET    /users/me                 PATCH /users/me
GET    /users                    [admin]   PATCH /users/:id [admin]  DELETE /users/:id [admin]

POST   /uploads/presign          [agent|admin]  {filename,contentType,folder} → {uploadUrl,key,publicUrl}
DELETE /uploads                  [admin] {key}

GET    /admin/stats              [admin]  dashboard KPIs
GET    /admin/activity           [admin]
```

### search-svc — prefix `/api/search`
```
GET  /                 q, propertyType[], saleType, minPrice, maxPrice, bedrooms[], bathrooms[],
                       minArea, maxArea, areaId[], compoundId[], developerId[], amenities[],
                       finishing[], status, deliveryBefore, maxDownPayment, minInstallmentYears,
                       lat, lng, radiusKm, sort(relevance|price_asc|price_desc|newest|area_desc),
                       page, limit
GET  /autocomplete     q, limit          → {suggestions:[{text,type,id,slug}]}
GET  /facets           same filters      → aggregation buckets for the filter sidebar
GET  /similar/:id
GET  /map              bbox=minLng,minLat,maxLng,maxLat → clustered geo results
POST /reindex          [X-Service-Token] full or {ids:[...]}
POST /index/:id        [X-Service-Token] upsert one
DELETE /index/:id      [X-Service-Token]
```

### rag-svc — prefix `/api/chat`
```
POST /threads                       → {threadId}
GET  /threads/:id/messages
POST /message                       {threadId?, message, stream?} → SSE or JSON
GET  /stream/:threadId              SSE (text/event-stream)
POST /feedback                      {messageId, rating, comment?}
POST /ingest                        [X-Service-Token] {source:"properties"|"faq"|"url", ...}
GET  /ingest/status/:runId
GET  /health
```
SSE event names: `token`, `tool_start`, `tool_end`, `sources`, `done`, `error`.

### reports-svc — prefix `/api/reports`
```
GET  /property/:id/brochure.pdf
GET  /market/summary?areaId=&from=&to=
POST /mortgage/calculate     {price, downPaymentPercent, years, annualRatePercent}
POST /installment/schedule   {price, downPaymentPercent, years, deliveryDate}
GET  /admin/export/leads.csv     [admin]
GET  /admin/export/properties.csv[admin]
GET  /health
```

---

## 7. Environment variables (exact names — used by docker-compose and every service)

```bash
# --- shared ---
NODE_ENV=development
APP_ENV=development
FRONTEND_URL=https://localhost
PUBLIC_API_URL=https://localhost/api/v1
INTERNAL_SERVICE_TOKEN=change-me-internal-token

# --- auth ---
JWT_ACCESS_SECRET=change-me-access-secret-min-32-chars-long
JWT_REFRESH_SECRET=change-me-refresh-secret-min-32-chars-long
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d
JWT_ISSUER=topchoice-api
JWT_AUDIENCE=topchoice-clients
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=https://localhost/api/v1/auth/google/callback

# --- postgres ---
POSTGRES_USER=topchoice
POSTGRES_PASSWORD=topchoice_password
POSTGRES_DB=topchoice
DATABASE_URL=postgresql://topchoice:topchoice_password@postgres:5432/topchoice?schema=public
RAG_DATABASE_URL=postgresql+asyncpg://topchoice:topchoice_password@postgres:5432/topchoice_rag
RAG_DATABASE_URL_SYNC=postgresql://topchoice:topchoice_password@postgres:5432/topchoice_rag

# --- mongo ---
MONGO_URI=mongodb://mongo:27017/topchoice

# --- redis ---
REDIS_URL=redis://redis:6379
REDIS_TTL_DEFAULT=300

# --- elasticsearch ---
ELASTICSEARCH_URL=http://elasticsearch:9200
ES_INDEX=properties
ES_INDEX_VERSION=properties_v1

# --- aws / s3 ---
AWS_REGION=eu-central-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_BUCKET=topchoice-media
S3_PUBLIC_BASE_URL=https://topchoice-media.s3.eu-central-1.amazonaws.com
CLOUDFRONT_DOMAIN=

# --- RAG: Alibaba Cloud Model Studio (DashScope, OpenAI-compatible) ---
DASHSCOPE_API_KEY=
DASHSCOPE_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
DASHSCOPE_NATIVE_BASE_URL=https://dashscope-intl.aliyuncs.com/api/v1
EMBEDDING_MODEL=tongyi-embedding-vision-flash
EMBEDDING_DIM=1024
RERANK_MODEL=qwen3-rerank

# --- RAG: OpenAI generation + web search ---
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
GENERATION_MODEL=gpt-5.6-luna
RAG_TOP_K=20
RAG_RERANK_TOP_N=6
RAG_MAX_CONTEXT_TOKENS=6000
RAG_MEMORY_WINDOW=10

# --- service urls (internal) ---
API_CORE_URL=http://api-core:4000
SEARCH_SVC_URL=http://search-svc:8000
RAG_SVC_URL=http://rag-svc:8001
REPORTS_SVC_URL=http://reports-svc:4567

# --- next.js public ---
NEXT_PUBLIC_API_URL=/api/v1
NEXT_PUBLIC_SEARCH_URL=/api/search
NEXT_PUBLIC_CHAT_URL=/api/chat
NEXT_PUBLIC_REPORTS_URL=/api/reports
NEXT_PUBLIC_SITE_URL=https://localhost
NEXT_PUBLIC_MAPBOX_TOKEN=
```

---

## 8. Frontend conventions (apps/web)

- Next.js 15, App Router, TypeScript strict, `src/` dir, path alias `@/*`.
- Tailwind CSS v4 + shadcn/ui (new-york style, base color slate). Components in
  `src/components/ui/*` — write them by hand (no network CLI calls).
- Toasts: **sonner** (`<Toaster richColors position="top-center" />` in root layout).
- State: **Zustand** stores in `src/store/` — `auth.store.ts`, `filters.store.ts`,
  `favorites.store.ts`, `compare.store.ts`, `chat.store.ts`, `ui.store.ts`.
  Use `persist` middleware for auth/favorites/compare.
- Data fetching: `@tanstack/react-query` v5 + a typed `fetcher` in `src/lib/api.ts`
  that attaches the access token and auto-refreshes on 401.
- Brand: primary `#00A3E0`-family blue. Define CSS vars in `globals.css`; RTL-ready
  (`dir` switch for Arabic), currency formatted as `EGP 8,500,000`.
- The chatbot widget is **fixed bottom-right**, `z-[60]`, collapsible bubble → panel,
  rendered globally from the root layout on every page.

---

## 9. Seed data

`seed/` holds shared JSON used by all seeders so the three databases agree:
`developers.json`, `areas.json`, `compounds.json`, `properties.json`, `amenities.json`, `faq.json`.
IDs are **fixed UUIDs** in the JSON so Postgres/Mongo/ES/pgvector cross-reference correctly.
api-core owns generating/loading them; search-svc and rag-svc read the same files.

---

## 10. Non-negotiables

1. No secrets committed. Every service reads config from env with a typed/validated schema.
2. Every service: Dockerfile (multi-stage, non-root user) + `.dockerignore`.
3. Input validation everywhere (class-validator / Pydantic v2 / dry-schema or manual).
4. Rate limiting on auth + chat + search endpoints.
5. Helmet/CORS/compression on HTTP services. CORS origin = `FRONTEND_URL`.
6. Structured JSON logging with `X-Request-Id`.
7. Graceful shutdown handlers.
8. Tests: at least unit tests for core logic in each service.
9. Code must be runnable via `docker compose up` with zero manual edits beyond `.env`.
