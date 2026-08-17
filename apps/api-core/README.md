# api-core — TopChoice core API

NestJS 11 + TypeScript service that owns authentication, the property catalogue
write side, favorites, leads, uploads and admin endpoints.

| | |
|---|---|
| Internal URL | `http://api-core:4000` |
| Host port | `4000` |
| Public prefix | `/api/v1` (through nginx) |
| Docs | `GET /api/v1/docs` (Swagger UI) |
| Probes | `GET /health`, `GET /health/ready` (**not** under the prefix) |
| Databases | PostgreSQL `topchoice` (Prisma) · MongoDB `topchoice` (Mongoose) · Redis |

Everything here follows [`docs/CONTRACT.md`](../../docs/CONTRACT.md). Ports, env
var names, route paths, response envelopes and enums come from that file — never
from local preference.

---

## Stage 1 scope (this drop)

Scaffold, configuration, persistence and health:

- typed + zod-validated configuration for every CONTRACT §7 variable this
  service reads, failing fast with a single readable error;
- global HTTP plumbing: `X-Request-Id`, CORS, helmet, compression,
  cookie-parser, validation, response envelope, error envelope, throttling,
  structured logging;
- Prisma schema + offline initial migration for the full relational model;
- Mongoose schemas for `properties`, `property_views`, `activity_events`;
- Redis client + cache service honouring the contract key namespaces;
- Terminus health probes for Postgres, Mongo and Redis;
- an idempotent seeder for the shared `seed/` dataset.

Feature modules (`auth`, `properties`, `leads`, …) plug into the clearly marked
slot in [`src/app.module.ts`](src/app.module.ts).

---

## Running

The service is designed to run from the repository root:

```bash
cp .env.example .env      # once
docker compose up api-core
```

`docker-compose.yml` builds the `development` target, mounts `src/`, `prisma/`
and the read-only `seed/` directory, and waits for Postgres, Mongo and Redis to
report healthy. The container entrypoint runs `prisma generate` and
`prisma migrate deploy` (retrying while the database boots) before starting
`npm run start:dev`.

Locally, without docker:

```bash
npm install
npm run prisma:generate
npm run prisma:deploy
npm run start:dev
```

### Scripts

| script | purpose |
|---|---|
| `npm run build` | compile to `dist/` |
| `npm run start:dev` | watch mode |
| `npm run start:prod` | run the compiled server |
| `npm run lint` / `lint:fix` | ESLint (flat config) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` / `test:watch` / `test:cov` | Jest unit tests |
| `npm run prisma:generate` | regenerate the Prisma client |
| `npm run prisma:migrate` | create a new migration (dev) |
| `npm run prisma:deploy` | apply migrations (used by the entrypoint) |
| `npm run seed` | load `seed/*.json` into Postgres + Mongo |

---

## Seeding

```bash
docker compose exec api-core npm run seed
```

The seeder is **idempotent** — every row is upserted on the stable seed id:

- Postgres: `amenities` (24), `areas` (14), `developers` (12), `compounds` (30)
  with their `compound_amenities` and a default `payment_plans` row, and
  `property_index` (180) mirroring `id` / `mongo_id` / `slug` / FKs /
  `price_min` / `status` / `published_at`;
- Mongo: the 180 canonical listing documents, inserted with
  `_id = ObjectId(properties[].mongoId)` and `propertyId = properties[].id`
  (the same UUID Postgres and Elasticsearch use);
- three development accounts, all with the password `TopChoice@Demo123`:
  `admin@topchoice.local` (admin), `agent@topchoice.local` (agent),
  `buyer@topchoice.local` (user). Development convenience only — never ship them.

---

## HTTP conventions (CONTRACT §4)

Success, wrapped by `TransformInterceptor`:

```json
{ "success": true, "data": { "id": "…" } }
```

Paginated handlers return `{ data, meta }`, which becomes:

```json
{ "success": true, "data": [], "meta": { "page": 1, "limit": 20, "total": 134, "totalPages": 7 } }
```

Errors, rendered by `HttpExceptionFilter` for **every** thrown value:

```json
{ "success": false, "error": { "code": "PROPERTY_NOT_FOUND", "message": "Property not found", "details": [] } }
```

Status codes: `400` malformed request · `401` unauthenticated · `403` forbidden
· `404` missing · `409` conflict/duplicate · `422` validation (DTO failures,
matching the FastAPI services) · `429` throttled · `500` unexpected.

Prisma (`P2002`, `P2025`, `P2003`, …), Mongo (`11000`), Mongoose validation and
cast errors, Zod issues and JWT errors are all mapped to shared error codes in
[`src/common/filters/error-normalizer.ts`](src/common/filters/error-normalizer.ts).

Pagination query params: `page` (1-based, default 1), `limit` (default 20,
max 100), `sort` (`-price`, `createdAt`). Use `PaginationQueryDto` plus the
helpers in `src/common/utils/pagination.ts`.

Every request carries `X-Request-Id` (generated when absent, echoed on the
response, attached to every log line).

---

## Health

```bash
curl -s http://localhost:4000/health
```

```json
{
  "status": "ok",
  "service": "api-core",
  "version": "1.0.0",
  "deps": { "postgres": "up", "mongo": "up", "redis": "up" }
}
```

- `GET /health` — liveness. Always `200` while the process serves traffic; the
  `deps` map still reports each dependency. This is what the docker healthcheck
  calls.
- `GET /health/ready` — readiness. `503` with `"status": "error"` if any
  dependency is down.

---

## Layout

```
src/
├── main.ts                    bootstrap: helmet, CORS, prefix, pipes, swagger
├── app.module.ts              config, logger, throttler, schedule, persistence
├── swagger.ts                 OpenAPI document
├── config/                    zod env schema → typed AppConfigService
├── common/
│   ├── constants.ts enums.ts  CONTRACT §3 enums as unions + const arrays
│   ├── decorators/            @CurrentUser @Roles @Public @SkipResponseTransform
│   ├── dto/                   PaginationQueryDto
│   ├── errors/                AppException + SCREAMING_SNAKE error codes
│   ├── filters/               global exception filter + error normalizer
│   ├── interceptors/          response envelope + request timing
│   ├── middleware/            X-Request-Id
│   ├── pipes/                 global ValidationPipe factory
│   ├── types/                 envelopes, JWT claims, express augmentation
│   └── utils/                 pagination helpers, timeouts
├── prisma/                    PrismaService (connect on boot, drain on exit)
├── mongo/                     Mongoose connection + document schemas
├── redis/                     ioredis provider, CacheService, key namespaces
└── health/                    terminus controller + indicators
prisma/
├── schema.prisma              full relational model (CONTRACT §2)
├── migrations/                offline initial migration for `migrate deploy`
├── seed.ts seed-data.ts       shared-dataset seeder
```

### Redis keys (CONTRACT §2)

`cacheKeys` in [`src/redis/cache-keys.ts`](src/redis/cache-keys.ts) is the only
place keys are built: `cache:prop:{id}` (300s), `cache:list:{hash}` (120s),
`cache:search:{hash}` (60s), `ratelimit:{scope}:{id}`, `auth:denylist:{jti}`,
`auth:refresh:{userId}:{jti}` (30d), `chat:stream:{threadId}`, `lock:{resource}`.
`CacheService.delByPattern` uses `SCAN` + `UNLINK` — never `KEYS`.

### Data ownership

The canonical listing document lives in **MongoDB**. Postgres keeps
`property_index` for referential integrity (favorites, leads and reviews point
at it) and joins. Elasticsearch holds the denormalised search document, written
by `search-svc`. Never write business data into another service's store.

---

## Tests

```bash
npm test
```

Unit tests cover the environment schema, pagination helpers, the error
normalizer and the response envelope — the pieces every feature module depends
on.
