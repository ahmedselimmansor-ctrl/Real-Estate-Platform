# TopChoice mobile

The Flutter client for the TopChoice marketplace. It talks to the same four
services the web app does (CONTRACT §1) and ships nothing of its own behind
them.

## What it does

| Screen        | Backed by                        |
|---------------|----------------------------------|
| Home          | `api-core` featured listings, areas, developers |
| Search        | `search-svc` with facets, filters and infinite scroll |
| Property      | `api-core` detail, similar units, view counter |
| Compounds     | `api-core` masterplans, searchable, tapping through to their units |
| Sell          | `api-core` leads, scoped to the real area/compound catalogue |
| Calculator    | `reports-svc`, the same finance engine behind the PDF brochures |
| Saved         | on-device, so it works offline and needs no account |
| Assistant     | `rag-svc` retrieval-augmented chat |

Arabic and English are both first class: choosing Arabic flips the layout to
RTL rather than only translating the copy.

## Running it

```bash
cd apps/mobile
flutter pub get
flutter run
```

The default host is `10.0.2.2`, the Android emulator's alias for your
machine's loopback. Point it somewhere else with `--dart-define`:

```bash
# a physical device on the same wifi
flutter run --dart-define=API_BASE=http://192.168.1.20

# a deployed environment
flutter run --dart-define=API_BASE=https://topchoice.example.com
```

`API_BASE` sets all four service URLs at once. Override one at a time with
`API_CORE_URL`, `SEARCH_URL`, `CHAT_URL`, `REPORTS_URL` or `MEDIA_ORIGIN` when
a service lives somewhere unusual.

Start the backend first, from the repo root:

```bash
docker compose -p topchoice up -d
```

## Building for Android

```bash
flutter build apk --release --split-per-abi   # one APK per ABI
flutter build appbundle --release             # for the Play Store
```

Release builds are signed from `android/key.properties`, which is gitignored.
Copy `android/key.properties.example`, generate a keystore, and fill it in.
Without that file the build falls back to the debug key so `flutter run
--release` still works — but such a build is not publishable.

Two things worth knowing:

- **R8 is on**, and `android/app/proguard-rules.pro` silences the Play Core
  deferred-component references the Flutter embedding carries. The app uses no
  deferred components, so pulling in a Play dependency to satisfy R8 would add
  weight for nothing.
- **Symbol stripping needs the NDK.** Without it the bundle still builds and
  uploads, just larger. Install the NDK through Android Studio to shrink it.

## Tests

```bash
flutter test        # unit + widget
flutter analyze     # static analysis, with strict casts
```

The tests run on the Dart VM and need no emulator, Android SDK or JDK.

## Layout

```
lib/
  main.dart               composition root; providers wired once
  src/
    core/                 config, HTTP client, envelope handling, formatting
    models/               the canonical documents, parsed tolerantly
    data/                 one repository per service
    state/                locale and favourites, both persisted
    l10n/strings.dart     every string in the app, in both languages
    theme/                the petrol-teal palette shared with the web build
    ui/                   one directory per screen, plus shared widgets
```

## Notes on a few decisions

**No code generation.** No freezed, json_serializable or build_runner. The
models are hand-written because they have to be tolerant: the same `Property`
is built from api-core's nested Mongo document *and* from search-svc's flatter
hit, and a generated parser would throw on the shape it was not told about.

**Favourites are local.** Saving is the first thing a browsing user does, and
requiring an account to do it loses the save. A snapshot of each listing is
stored alongside the id so the list renders with no network at all.

**Chat posts rather than streams.** `rag-svc` exposes SSE and the client
supports it, but the default is a single POST: it survives the app being
backgrounded mid-answer, where a dropped socket loses the turn.

**Money is compact by default.** Prices here run to eight digits. `EGP 7.42M`
is scannable in a card; `EGP 7,420,000` is not.
