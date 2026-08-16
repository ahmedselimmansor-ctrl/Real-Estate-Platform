# reports-svc

Analytics, documents and the money maths for the Nawy clone.

**Ruby 3.3 · Sinatra 4 · Puma · Prawn · MongoDB + PostgreSQL + Redis (read-only)**
Mounted behind nginx at **`/api/reports`**, listening on **`0.0.0.0:4567`**
(`docs/CONTRACT.md` §1).

| | |
|---|---|
| Envelopes | CONTRACT §4 — `{"success":true,"data":…}` / `{"success":false,"error":{"code","message","details"}}` |
| Auth | CONTRACT §5 — HS256 access token verified locally against `JWT_ACCESS_SECRET`, checking `iss=nawy-api` / `aud=nawy-clients` |
| Correlation | reads and echoes `X-Request-Id`, generates a UUID when absent, logs it on every line |
| Data ownership | **reads** Mongo `properties` and the Postgres tables api-core owns; writes nothing but Redis cache keys |

---

## Endpoints

```
GET  /health                                  liveness  (also /api/reports/health)
GET  /health/ready                            readiness (also /api/reports/health/ready)
GET  /api/reports                             service descriptor

GET  /api/reports/property/:id/brochure.pdf   A4 PDF brochure         (public, 30 req/min)
GET  /api/reports/market/summary              area market snapshot    (public, 60 req/min)
POST /api/reports/mortgage/calculate          amortisation schedule   (public, 120 req/min)
POST /api/reports/installment/schedule        developer payment plan  (public, 120 req/min)
GET  /api/reports/admin/export/leads.csv      streaming CSV           [admin|superadmin]
GET  /api/reports/admin/export/properties.csv streaming CSV           [admin|superadmin]
```

`:id` on the brochure accepts the property **UUID**, its **Mongo ObjectId**, its
**slug** or its **reference number** (`NWY-1042`).

### Example calls

```bash
BASE=https://localhost/api/reports          # through nginx
# BASE=http://localhost:4567/api/reports    # straight at the container

# --- mortgage ------------------------------------------------------------
curl -sk -X POST "$BASE/mortgage/calculate" \
  -H 'content-type: application/json' \
  -H 'x-request-id: demo-1' \
  -d '{"price":5000000,"downPaymentPercent":20,"years":20,"annualRatePercent":18}' | jq '.data.summary'

# {
#   "principal": 4000000.0,
#   "monthlyPayment": 61732.46,
#   "totalInterest": 10815792.24,
#   "totalPaid": 14815792.24
# }

# skip the 240-row schedule
curl -sk -X POST "$BASE/mortgage/calculate" -H 'content-type: application/json' \
  -d '{"price":5000000,"downPaymentPercent":20,"years":20,"annualRatePercent":18,"includeSchedule":false}'

# --- developer instalment plan -------------------------------------------
curl -sk -X POST "$BASE/installment/schedule" \
  -H 'content-type: application/json' \
  -d '{"price":8500000,"downPaymentPercent":10,"years":8,"deliveryDate":"2027-06-30"}' \
  | jq '.data.summary'

# optional: "frequency":"monthly"|"quarterly"|"semi_annual"|"annual"  (default quarterly)
#           "startDate":"2026-08-14"   "maintenancePercent":10

# --- market summary -------------------------------------------------------
curl -sk "$BASE/market/summary?areaId=b47dcd29-cff0-5bd0-b7dd-03def1acf3b2&from=2025-01-01&to=2026-08-14" | jq '.data.price'

# --- brochure -------------------------------------------------------------
curl -sk -OJ "$BASE/property/NWY-1042/brochure.pdf"      # -> nawy-<slug>-nwy-1042.pdf
curl -skI "$BASE/property/NWY-1042/brochure.pdf" | grep -i -e content-disposition -e x-cache

# --- admin exports --------------------------------------------------------
TOKEN=<admin access token from POST /api/v1/auth/login>
curl -sk -H "authorization: Bearer $TOKEN" \
  "$BASE/admin/export/leads.csv?from=2026-01-01&to=2026-08-14&status=qualified" -o leads.csv
curl -sk -H "authorization: Bearer $TOKEN" \
  "$BASE/admin/export/properties.csv?areaId=b47dcd29-cff0-5bd0-b7dd-03def1acf3b2&status=available" -o properties.csv
```

### Query parameters

| endpoint | parameters |
|---|---|
| `market/summary` | `areaId` (uuid), `from`, `to` (ISO dates, inclusive), `refresh=true` to bypass the cache |
| `property/:id/brochure.pdf` | `refresh=true` to re-render |
| `admin/export/leads.csv` | `from`, `to`, `status` (`new…lost`), `areaId`, `propertyId` |
| `admin/export/properties.csv` | `from`, `to`, `status`, `areaId`, `propertyType`, `saleType`, `compoundId`, `developerId` |

### Error codes

`VALIDATION_ERROR` (422) · `INVALID_JSON` (400) · `BAD_REQUEST` (400) ·
`UNAUTHORIZED` / `TOKEN_EXPIRED` / `INVALID_TOKEN` (401) · `FORBIDDEN` (403) ·
`PROPERTY_NOT_FOUND` / `NOT_FOUND` (404) · `RATE_LIMITED` (429) ·
`SERVICE_UNAVAILABLE` (503) · `INTERNAL_ERROR` (500).

---

## The finance engine (`lib/finance.rb`)

Pure Ruby, no IO, `BigDecimal` throughout, every amount rounded **half-up to
piastres** (2 decimals). Bad input raises `Reports::Finance::CalculationError`,
which the app maps to **422 `VALIDATION_ERROR`** with a `details` array.

### 1. Mortgage — `POST /mortgage/calculate`

```
principal = price × (1 − downPaymentPercent / 100)
r         = annualRatePercent / 100 / 12          (monthly rate)
n         = years × 12                            (number of payments)

            ⎧ principal / n                                   if r = 0
payment  =  ⎨          r (1 + r)ⁿ
            ⎩ principal ───────────────                       otherwise
                        (1 + r)ⁿ − 1
```

Then, month by month:

```
interestₖ   = round(balanceₖ₋₁ × r)
principalₖ  = payment − interestₖ         (clamped to the remaining balance)
balanceₖ    = balanceₖ₋₁ − principalₖ
```

The **last payment absorbs the rounding**, so `balance` ends at exactly `0.00`,
`Σ principalₖ = principal` and `totalPaid = principal + totalInterest` exactly.

**Worked example** — EGP 125,000 unit, 20% down, 1 year, 12% p.a.

| | |
|---|---|
| down payment | 25,000.00 |
| principal | 100,000.00 |
| r | 0.01 &nbsp;(12% ÷ 12) |
| n | 12 |
| **monthly payment** | **8,884.88** |
| month 1 interest | 100,000 × 0.01 = 1,000.00 |
| month 1 principal | 8,884.88 − 1,000.00 = 7,884.88 |
| month 1 balance | 92,115.12 |
| final payment | 8,884.85 *(rounding absorbed)* |
| total interest | 6,618.53 |
| total paid | 106,618.53 |

**Zero-rate example** — EGP 1,200,000 over 10 years at 0%: `payment =
1,200,000 / 120 = 10,000.00`, total interest `0.00`. No division by zero.

**Long example** — EGP 5,000,000, 20% down, 20 years, 18% p.a. (a realistic
Egyptian bank rate): principal 4,000,000, **61,732.46 / month**, total interest
10,815,792.24 over 240 payments.

The response also carries a `yearly` rollup (payments, paid, interest,
principal, closing balance per year).

### 2. Developer instalment plan — `POST /installment/schedule`

The structure Egyptian primary sales actually use: a down payment at contract,
equal instalments (quarterly by default) and a maintenance deposit on handover.

```
downPayment = price × downPaymentPercent / 100         due at the contract date
remaining   = price − downPayment
count       = years × instalmentsPerYear               (quarterly ⇒ 4/yr)
instalment  = remaining / count                        (last one absorbs rounding)
maintenance = price × maintenancePercent / 100         due on deliveryDate (default 8%)
```

Instalment *k* falls due `startDate + k × (12 / instalmentsPerYear)` months.
`cumulativePercent` tracks the share of the **unit price** paid so far (it
reaches exactly 100%); `cumulativePaid` is the total cash out, including the
maintenance deposit.

**Worked example** — EGP 8,500,000, 10% down, 8 years quarterly, delivery
2027-06-30, contract date 2026-08-14:

| | |
|---|---|
| down payment | 850,000 (10%) — due 2026-08-14 |
| balance financed | 7,650,000 |
| instalments | 32 quarterly |
| **each instalment** | **239,062.50** — first due 2026-11-14 |
| monthly equivalent | 79,687.50 |
| maintenance deposit (8%) | 680,000 — due 2027-06-30 |
| last instalment | 2034-08-14 |
| total cash out | 9,180,000 |

Uneven division is handled: EGP 1,000,000 / 5% down / 1 year monthly gives
eleven instalments of 79,166.67 and a final one of **79,166.63**, summing to
exactly 950,000.

> The maintenance deposit (8–10% is market practice) is charged on handover and
> is **not** part of the unit price — which is why `totalPaid` exceeds `price`.

---

## Reports

### `GET /market/summary` (`lib/reports/market_report.rb`)

One MongoDB `$facet` aggregation over the canonical listing documents produces:

* `price` — avg / median / min / max, plus the same per m²
* `areaSqm` — avg / min / max built-up area and average bedrooms
* `paymentTerms` — average down-payment %, instalment years, monthly instalment
* `byPropertyType`, `byFinishing`, `bySaleType`, `byStatus`, `byBedrooms`, `byArea`
  (count, share %, avg/min/max price, avg price per m²)
* `supplyTrend` — listings published per `YYYY-MM`
* `topCompounds`, `topDevelopers`, `topAmenities`

`publishedAt` is passed through `$convert … to:"date"` before it is compared, so
the report works whether Mongoose stored ISO strings or BSON dates. `$median`
needs MongoDB 7 (which `docker-compose.yml` pins); on an older server the code
falls back to computing the median in Ruby.

Cached for **5 minutes** under `cache:list:{hash}` (CONTRACT §2).

### `GET /property/:id/brochure.pdf` (`lib/reports/brochure.rb`, `lib/pdf/`)

A4, branded, built with Prawn:

branded header band → hero image (downloaded with a 4s timeout, graceful
placeholder on any failure) → title and location → price / EGP per m² / payment
headline → two-column specifications table → amenities → payment plan and yearly
cash flow generated by `lib/finance.rb` → compound, developer and area blurbs →
location with coordinates → footer with the listing URL, generation timestamp
and page number on every page.

* `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="nawy-<slug>-<reference>.pdf"`
* rendered bytes cached for **10 minutes** under `cache:prop:{id}:brochure:v1`
* an `ETag` is set, so a repeat request can come back `304`
* **English only.** Prawn has no Arabic shaping or BiDi engine, so all text is
  folded to a WinAnsi-safe subset (`Formatting.pdf_safe`) — Arabic copy is
  dropped rather than rendered backwards. DejaVu Sans is used when the font is
  present in the image (it is, via `fonts-dejavu-core`), otherwise Helvetica.

### `GET /admin/export/*.csv` (`lib/reports/exports.rb`)

Admin only, rate limited to 10/min, and **streamed** — rows are written as they
are read (Postgres in keyset batches of 500, Mongo through an aggregation
cursor). Every file starts with a **UTF-8 BOM** so Excel renders the Arabic
columns correctly, and the row count is returned in `X-Total-Rows`.

Filter validation and a pre-flight `COUNT` run *before* the body starts, so a bad
filter or a downed database still produces a proper JSON error envelope.

---

## Configuration

All names come from `.env.example` / CONTRACT §7. Required: `JWT_ACCESS_SECRET`
(≥ 32 chars), `DATABASE_URL`, `MONGO_URI`, `REDIS_URL`, `FRONTEND_URL` — the
service refuses to boot without them.

| variable | default | used for |
|---|---|---|
| `PORT` | `4567` | Puma bind |
| `APP_ENV` | `development` | error verbosity |
| `FRONTEND_URL` | `https://localhost` | CORS origin + listing URLs in the PDF/CSV |
| `DATABASE_URL` | — | leads + reference tables (`?schema=…` is stripped for libpq and applied as `search_path`) |
| `MONGO_URI` | — | canonical listings |
| `REDIS_URL` | — | report/PDF cache + rate limiting |
| `JWT_ACCESS_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE` | — / `nawy-api` / `nawy-clients` | token verification |
| `INTERNAL_SERVICE_TOKEN` | — | `X-Service-Token` comparison helper |
| `S3_PUBLIC_BASE_URL` | — | hero image fallback when a media item only has an S3 key |

Service-local knobs (optional, all with defaults): `REPORTS_MARKET_CACHE_TTL`
(300), `REPORTS_BROCHURE_CACHE_TTL` (600), `REPORTS_MAINTENANCE_PERCENT` (8),
`REPORTS_EXPORT_MAX_ROWS` (100000), `REPORTS_EXPORT_BATCH_SIZE` (500),
`REPORTS_IMAGE_TIMEOUT` (4), `REPORTS_IMAGE_MAX_BYTES` (4194304),
`REPORTS_PG_POOL_SIZE` (5), `REPORTS_RATE_LIMIT_ENABLED` (true),
`REPORTS_EXTRA_CORS_ORIGINS`, `PUMA_MIN_THREADS`, `PUMA_MAX_THREADS`,
`WEB_CONCURRENCY`.

---

## Running

```bash
docker compose up reports-svc          # from the repo root, with .env in place
curl -s localhost:4567/health | jq
```

Locally, without Docker:

```bash
bundle install
bundle exec puma -C config/puma.rb config.ru     # reads ../../.env via dotenv
```

There is **no committed `Gemfile.lock`** — versions are pinned in the `Gemfile`
and the lock is generated inside the Docker builder stage, then copied into the
runtime image so nothing has to resolve (or write) at boot.

## Tests

```bash
bundle install
bundle exec rspec                 # everything
bundle exec rspec spec/finance_spec.rb -f doc
bundle exec rubocop
bundle exec rake check            # specs + lint
```

The suite never touches Postgres, Mongo, Redis or the network: `spec/spec_helper.rb`
stubs `Reports::DB` wholesale and the repositories are stubbed per example. It
covers the finance engine exhaustively (known-good amortisation numbers, the 0%
path, rounding, every validation error), the JWT helpers, the envelope and param
helpers, the rate limiter, and one rack-test request spec per route — including
a real Prawn render of the brochure.

## Layout

```
app.rb                     Sinatra app: middleware, helpers, error envelopes
config.ru / config/puma.rb rack + puma entry points
lib/
  config.rb                env loading + validation
  auth.rb                  CONTRACT §5 JWT verification
  db.rb                    pooled PG, Mongo and Redis clients + cache helpers
  finance.rb               mortgage + instalment engine (pure, unit tested)
  errors.rb                typed errors -> CONTRACT §4 error envelope
  json_codec.rb            camelCase serialiser + envelopes
  formatting.rb            EGP / m² / date / slug / PDF-safe text
  pg_introspect.rb         resolves api-core's table + column names at runtime
  postgres_url.rb          Prisma-style DATABASE_URL -> libpq options
  http_fetch.rb            timeout-bounded image download
  rate_limiter.rb          Redis fixed-window limiter (fails open)
  logging.rb               structured JSON logs
  middleware/              X-Request-Id + request logging
  helpers/                 responses, params, auth (Sinatra scope)
  repositories/            property (Mongo), lead + reference (Postgres)
  pdf/                     Prawn theme + brochure document
  reports/                 market_report, brochure, exports
routes/                    thin route definitions, all logic in lib/
spec/                      rspec
```
