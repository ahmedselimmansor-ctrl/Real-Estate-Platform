# `apps/web` — Nawy clone storefront

Next.js 15 (App Router) + TypeScript + Tailwind CSS v4 + shadcn/ui (new-york, base
color slate). This is the UI, the SSR layer and the BFF proxy for the four backing
services described in [`docs/CONTRACT.md`](../../docs/CONTRACT.md).

| | |
|---|---|
| Port | `3000` (host) / `http://web:3000` (docker network) |
| Public entrypoint | `https://localhost` via nginx |
| Owns | UI, SSR, BFF proxy routes |
| Talks to | `api-core` `/api/v1`, `search-svc` `/api/search`, `rag-svc` `/api/chat`, `reports-svc` `/api/reports` |

---

## Running it

```bash
# from the repo root — the only supported way to run the whole system
cp .env.example .env
docker compose up --build web
```

`docker compose` builds the `development` target of the Dockerfile, runs
`next dev` on `0.0.0.0:3000` and bind-mounts `src/` and `public/` for hot reload.

Standalone (services already running on localhost):

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build (output: 'standalone')
npm run start
npm run lint
npm run typecheck
```

### How requests reach the services

`NEXT_PUBLIC_*` are **paths**, not origins (CONTRACT §7):

```
NEXT_PUBLIC_API_URL=/api/v1
NEXT_PUBLIC_SEARCH_URL=/api/search
NEXT_PUBLIC_CHAT_URL=/api/chat
NEXT_PUBLIC_REPORTS_URL=/api/reports
```

* **Browser** → relative path → nginx routes it to the right container.
* **Server components** → `src/lib/env.ts` prefixes the internal origin
  (`API_CORE_URL`, `SEARCH_SVC_URL`, …) onto the same path.
* **`next dev` without nginx** → `next.config.ts` rewrites `/api/v1/*`,
  `/api/search/*`, `/api/chat/*` and `/api/reports/*` to the internal URLs, so
  hitting `http://localhost:3000` directly works too.

---

## Layout of the source

```
src/
├── app/
│   ├── layout.tsx          root layout: fonts, providers, header/footer, Toaster
│   ├── providers.tsx       QueryClient + theme + direction + store hydration
│   ├── page.tsx            landing page (stage 2 replaces this)
│   ├── loading.tsx         route-transition skeleton
│   ├── error.tsx           route error boundary
│   ├── global-error.tsx    document-level error boundary
│   ├── not-found.tsx       404
│   └── globals.css         Tailwind v4 theme, tokens, product utilities
├── components/
│   ├── ui/                 hand-written shadcn/ui primitives
│   ├── layout/             header, footer, navs, omnibox, toggles
│   ├── providers/          theme, locale, store hydrator
│   └── chat/               chat widget mount point (stage 3)
├── hooks/                  use-i18n, use-mounted, use-media-query, use-debounced-value
├── lib/                    api client, react-query hooks, formatters, constants, routes
├── store/                  zustand stores (auth, filters, favorites, compare, chat, ui)
└── types/                  CONTRACT §3 domain types
```

---

## Design system

Tailwind v4, configured entirely in `src/app/globals.css` — there is no
`tailwind.config.js`.

* **Brand ramp** `--color-brand-50 … 950`, anchored on `#0075B0 → #00A3E0`.
* **Featured accent** a warm gold ramp (`--color-gold-*`), used only for
  "featured" surfaces so it keeps its meaning.
* **Semantic tokens** `background, foreground, card, popover, primary, secondary,
  muted, accent, featured, destructive, success, warning, info, border, input,
  ring, surface, overlay, chart-1…5` — defined as CSS vars for light **and**
  dark, and exposed to utilities through `@theme inline`.
* **Radius** `--radius: 0.75rem` with `sm/md/lg/xl/2xl` derived from it.
* **Product utilities** `container-page`, `card-elevated`, `glass`, `shimmer`,
  `brand-gradient`, `brand-text-gradient`, `flip-rtl`, `scrollbar-thin`,
  `line-clamp-safe-2`, plus the enter/exit keyframe utilities the Radix
  `data-[state]` attributes drive.
* **Type** Inter (latin) + Cairo (arabic) via `next/font`, swapped automatically
  when `lang="ar"` / `dir="rtl"`.

### RTL

Every primitive uses logical properties (`ps-*`, `me-*`, `start-*`, `end-*`,
`text-start`) instead of physical ones. Direction lives in `ui.store.ts`;
`LocaleScript` fixes `<html lang|dir>` before first paint and `LocaleSync` keeps
it in step afterwards. Radix gets the same value through `DirectionProvider`.
Directional glyphs mirror with the `flip-rtl` utility.

---

## Data layer

`src/lib/api.ts` is the only thing that talks HTTP.

* Unwraps the CONTRACT §4 envelope `{ success, data, meta }`.
* Throws a typed `ApiError { code, message, status, details, requestId }` for
  `{ success:false, error:{ code, message, details } }`.
* Attaches `Authorization: Bearer <accessToken>` from `auth.store`.
* On `401`, performs a **single-flight** `POST /auth/refresh` (httpOnly `nawy_rt`
  cookie) and replays the original request exactly once; if that fails it clears
  the session and emits a `nawy:auth-expired` event.
* Generates and propagates `X-Request-Id` on every call.
* Runs unchanged on the server (where it skips the browser-only auth path).

`src/lib/queries.ts` exposes typed react-query v5 hooks keyed through
`src/lib/query-keys.ts`: properties, compounds, developers, areas, amenities,
favorites, saved searches, leads, search / infinite search / facets /
autocomplete / map, auth + profile, and the reports-svc calculators.

---

## State (CONTRACT §8)

| Store | Persisted | Responsibility |
|---|---|---|
| `auth.store.ts` | ✅ | user, accessToken, expiry, login/logout/setUser, hydrate |
| `favorites.store.ts` | ✅ | optimistic toggle, guest saves, server reconciliation |
| `compare.store.ts` | ✅ | compare tray, hard cap of 4 |
| `chat.store.ts` | ✅ (threadId only) | messages, streaming, sources, tool calls, open state |
| `ui.store.ts` | ✅ | locale, dir, theme mirror, overlays |
| `filters.store.ts` | ❌ | search filters + draft; the URL is the source of truth |

All persisted stores use `skipHydration: true` and are rehydrated by
`<StoreHydrator />` after mount, which is what keeps the SSR HTML and the first
client render byte-identical (no hydration warnings).

`filters.store.ts` serialises to and from the exact query-string keys
`search-svc` accepts, so the browser URL, the API request and a saved search all
share one representation (`src/lib/filters.ts`).

---

## Conventions

* Prices render as `EGP 8,500,000` (`formatEGP`) or `EGP 8.5M`
  (`formatCompactEGP`); areas as `180 m²`; delivery as `Q2 2027`. Arabic-Indic
  numerals are available via `{ numerals: 'arab' }`.
* Enum strings are the CONTRACT §3 values verbatim — never localise them on the
  wire; use `PROPERTY_TYPE_OPTIONS` & friends for EN/AR labels and icons.
* Every internal link goes through `src/lib/routes.ts`.
* Toasts are sonner: `<Toaster richColors position="top-center" />` in the root
  layout.

---

## Stage map

1. **Stage 1 (this)** — scaffold, design system, primitives, state, data layer, shell.
2. **Stage 2** — pages: home, search + filters + map, property/compound/developer/area
   detail, favorites, compare, auth, account.
3. **Stage 3** — the RAG chat widget; replaces `components/chat/chat-widget-mount.tsx`.
4. **Stage 4** — admin dashboard, reports/charts, polish.
