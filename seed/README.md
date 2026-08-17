# `seed/` — shared seed dataset

The single source of truth for demo data. **Every service seeds from these exact
files** so Postgres (`api-core`), MongoDB (`api-core`), Elasticsearch
(`search-svc`) and pgvector (`rag-svc`) all agree on the same identifiers.

The directory is mounted read-only into the containers that need it
(`./seed:/app/seed:ro` for `api-core`, `search-svc` and `rag-svc` — see
`docker-compose.yml`).

```
seed/
├── generate.mjs          # regenerates every .json below (zero dependencies)
├── verify.mjs            # asserts counts, enums, foreign keys and arithmetic
├── data/                 # hand-written source data (Arabic/English copy, tuning tables)
├── build/                # one builder per output file
├── lib/                  # deterministic ids, seeded PRNG, formatting, copy templates
├── amenities.json        # 24  records
├── areas.json            # 14  records
├── developers.json       # 12  records
├── compounds.json        # 30  records
├── properties.json       # 180 records
└── faq.json              # 40  records
```

---

## Regenerating

```bash
node seed/generate.mjs     # rewrites the six .json files
node seed/verify.mjs       # exits non-zero if anything is inconsistent
```

Both scripts are plain Node ESM with **no dependencies** (`node:crypto`,
`node:fs`, `node:path` only) and need no install step. Node 20+ is enough.

### Determinism

Output is **byte-identical on every run and every machine**:

* Ids are RFC 4122 **v5 UUIDs** (SHA-1 over a fixed namespace + a stable key such
  as `compound:mivida`) — never `crypto.randomUUID()`.
* All variation comes from a seeded mulberry32 PRNG keyed by a stable string
  (e.g. `topchoice-seed:property:TC-1042`).
* "Now" is pinned to the anchor constant `2026-08-14T00:00:00.000Z`
  (`ANCHOR_ISO` in `build/properties.mjs`), so timestamps never drift.
* Number formatting is hand-rolled rather than `Intl`, so it does not depend on
  the host ICU build.

Consequence: re-running the generator never changes an id, so re-seeding a
database is idempotent and cross-database references stay valid.

To change the dataset, edit the files in `data/` (or the tuning tables in
`data/property-mix.mjs`), re-run `generate.mjs`, then `verify.mjs`.

---

## File schemas

All ids are lowercase UUID v5 strings. All money is **EGP integers** (no
decimals). All bilingual fields are `{ "en": "…", "ar": "…" }`.

### `amenities.json` — 24 records

| field | type | notes |
|---|---|---|
| `id` | uuid | `uuidv5("amenity:<slug>")` |
| `slug` | string | the key stored in `properties[].amenities` |
| `nameEn`, `nameAr` | string | display labels |
| `icon` | string | lucide-react icon name, kebab-case |
| `category` | enum | `lifestyle` \| `security` \| `wellness` \| `family` \| `services` |

### `areas.json` — 14 records

| field | type | notes |
|---|---|---|
| `id` | uuid | `uuidv5("area:<slug>")` |
| `slug`, `nameEn`, `nameAr` | string | |
| `city`, `governorate` | string | e.g. `Cairo` / `Giza` / `Matrouh` / `Suez` |
| `description` | `{en,ar}` | 2–3 sentences |
| `geo` | `{lat,lng}` | real approximate WGS84 coordinates |
| `heroImage` | url | |
| `propertyCount` | int | **listings in `properties.json` for this area** (not a market-wide figure) |
| `avgPricePerMeter` | int | EGP/m² benchmark; drives listing prices |

Covered: New Cairo, Sheikh Zayed, North Coast (Sahel), New Administrative
Capital, 6th of October, Mostakbal City, Madinaty, El Shorouk, Ain Sokhna,
Maadi, Zamalek, New Zayed, Heliopolis, Ras El Hekma.

### `developers.json` — 12 records

| field | type | notes |
|---|---|---|
| `id` | uuid | `uuidv5("developer:<slug>")` |
| `slug`, `name`, `nameAr` | string | |
| `logoUrl`, `coverUrl` | url | |
| `description` | `{en,ar}` | |
| `foundedYear` | int | |
| `projectsCount` | int | **compounds in `compounds.json` for this developer** |
| `website` | url | |
| `phone` | string | Egyptian hotline-style placeholder, not a live line |

Palm Hills, SODIC, Emaar Misr, Talaat Moustafa Group, Mountain View, Ora
Developers, Hassan Allam Properties, Misr Italia, Tatweer Misr, Al Ahly Sabbour,
Madinet Masr, La Vista.

### `compounds.json` — 30 records

| field | type | notes |
|---|---|---|
| `id` | uuid | `uuidv5("compound:<slug>")` |
| `slug`, `name`, `nameAr` | string | |
| `developerId` | uuid | → `developers.json[].id` |
| `areaId` | uuid | → `areas.json[].id` |
| `description` | `{en,ar}` | |
| `startingPrice`, `maxPrice` | int EGP | min/max price of that compound's listings |
| `minAreaSqm`, `maxAreaSqm` | int | min/max area of that compound's listings |
| `deliveryYear` | int | 2025–2029 |
| `installmentYears` | int | 5–10 |
| `downPaymentPercent` | int | 5–25 |
| `amenityIds` | uuid[] | → `amenities.json[].id` |
| `images` | url[3] | |
| `geo` | `{lat,lng}` | |
| `masterPlanUrl` | url | |
| `unitTypes` | enum[] | subset of `propertyType`; a listing's type is always in this list |
| `isFeatured` | bool | |

Every area has at least one compound and every developer at least two.

### `properties.json` — 180 records

Exactly the Mongo `properties` document from `docs/CONTRACT.md` §3, with two
differences:

* `id` — a plain **string UUID** instead of `_id`. Use it for
  `property_index.id` in Postgres and for the `id` field of the Elasticsearch
  document.
* `mongoId` — an extra deterministic **24-hex ObjectId-compatible** string, so
  `api-core` can insert the document with `_id: new ObjectId(mongoId)` and store
  the same value in `property_index.mongo_id`.

Everything else matches the contract field for field:

```jsonc
{
  "id": "uuid", "mongoId": "24-hex", "slug": "…", "referenceNo": "TC-1042",
  "title": { "en": "…", "ar": "…" },
  "description": { "en": "…", "ar": "…" },
  "propertyType": "apartment",        // apartment|villa|townhouse|twinhouse|duplex|penthouse|studio|chalet|office|retail|clinic
  "saleType": "primary",              // primary|resale
  "status": "available",              // available|reserved|sold|off_plan|delivered
  "finishing": "semi_finished",       // core_shell|semi_finished|fully_finished|furnished
  "price": { "amount": 8500000, "currency": "EGP", "pricePerMeter": 47222 },
  "paymentPlan": { "downPaymentPercent": 10, "installmentYears": 8,
                   "monthlyInstallment": 88541, "deliveryDate": "2027-06-30" },
  "specs": { "bedrooms": 3, "bathrooms": 3, "areaSqm": 180,
             "gardenSqm": 0, "floor": 5, "parkingSpots": 1 },
  "location": { "areaId": "uuid", "areaName": "New Cairo", "city": "Cairo",
                "governorate": "Cairo", "address": "…",
                "geo": { "type": "Point", "coordinates": [31.4913, 30.0304] } },  // [lng, lat]
  "compound":  { "id": "uuid", "name": "…", "slug": "…" },
  "developer": { "id": "uuid", "name": "…", "slug": "…", "logoUrl": "…" },
  "amenities": ["pool", "gym", "security"],          // amenity SLUGS
  "media": { "images": [{ "url", "key", "width", "height", "isPrimary", "order" }],
             "floorPlans": [{ "url", "label" }], "videoUrl": null, "tourUrl": null },
  "stats": { "views": 0, "favorites": 0, "leads": 0 },
  "isFeatured": false,
  "publishedAt": "…", "createdAt": "…", "updatedAt": "…", "deletedAt": null
}
```

**Guaranteed invariants** (all asserted by `verify.mjs`):

* `slug` and `referenceNo` are unique; references run `TC-1001` … `TC-1180` in
  array order.
* `price.pricePerMeter === round(price.amount / specs.areaSqm)`.
* `paymentPlan.monthlyInstallment === round(price.amount * (1 - downPaymentPercent/100) / (installmentYears * 12))`.
* `2_000_000 ≤ price.amount ≤ 95_000_000`, correlated with `areaSqm`,
  `propertyType` and the area's `avgPricePerMeter`.
* `compound.id`, `developer.id`, `location.areaId` and every `amenities[]` slug
  resolve; the compound's `developerId` / `areaId` always match the listing's.
* `propertyType` is always listed in that compound's `unitTypes`; chalets only
  appear in coastal areas.
* `status` never contradicts `deliveryDate`: no `delivered` unit with a future
  handover, no `off_plan` unit whose handover has passed.
* Exactly one image has `isPrimary: true`; `order` is 0-based and sequential;
  4–8 images per listing.
* `publishedAt` is spread over the 18 months before the anchor date;
  `createdAt ≤ publishedAt ≤ updatedAt ≤ anchor`.
* Exactly 22 listings (~12%) have `isFeatured: true`.

**Type mix** (180 total): apartment 99 (55%), villa 27 (15%), townhouse 22
(12%), twinhouse 14 (8%), chalet 9 (5%), then duplex 2, penthouse 2, studio 2,
office 1, retail 1, clinic 1.

**No `rent` listings.** The contract's `saleType` enum includes `rent`, but every
seeded listing is a sale (`primary` / `resale`) so that all 180 prices stay in
the required 2M–95M EGP sale range. A rental price would be a monthly figure and
would break that invariant. Services must still support the `rent` value.

**Media** uses seeded `picsum.photos` URLs (`/seed/<key>/<w>/<h>`), which are
stable and need no API key. `media.images[].key` holds the S3-style object key
(`properties/<slug>/<n>.jpg`) that would live under `S3_PUBLIC_BASE_URL` in
production — swap the builders in `lib/media.mjs` to move to real assets.

### `faq.json` — 40 records

| field | type | notes |
|---|---|---|
| `id` | uuid | `uuidv5("faq:<key>")` |
| `category` | enum | see below — 4 entries each |
| `question` | `{en,ar}` | |
| `answer` | `{en,ar}` | 60–150 English words, substantive |
| `tags` | string[] | 3–5 retrieval tags |

Categories: `buying_process`, `payment_plans`, `mortgage`, `legal_documents`,
`delivery_handover`, `topchoice_services`, `resale`, `rental`, `fees_taxes`,
`account_support`.

Content covers Egyptian market specifics — the preliminary contract
(عقد ابتدائي), registration at the الشهر العقاري and its capped fee, the 8–10%
maintenance deposit, 5–15% down payments with 6–10 year developer instalments,
mortgages through Egyptian banks and the CBE subsidised programme, finishing
standards at handover, developer transfer fees on resale, the ~2–2.5% brokerage
commission, the annual real estate tax and the 2.5% disposal tax.

> These answers describe general market practice for a demo dataset. They are
> not legal, tax or financial advice, and figures such as fee caps, tax
> thresholds and subsidised mortgage terms change with legislation.

---

## How each service consumes the files

| service | uses |
|---|---|
| `api-core` | Postgres: `amenities`, `areas`, `developers`, `compounds`, `property_index` (`id` = `properties[].id`, `mongo_id` = `properties[].mongoId`). Mongo: the full `properties.json` documents. |
| `search-svc` | Builds the `properties_v1` Elasticsearch documents by flattening `properties.json` and joining names from the other files. `id` must stay the property UUID. |
| `rag-svc` | Ingests `faq.json` plus listing/compound/area copy into `rag_documents` / `rag_chunks`. |
| `reports-svc` | Reads the seeded rows through Postgres/Mongo; no direct file access. |

Seeders should be **idempotent upserts keyed on `id`** — because ids are stable,
re-running a seeder updates rather than duplicates.
