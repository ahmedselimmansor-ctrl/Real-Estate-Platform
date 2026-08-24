# End-to-end tests

The real app, driven against the real stack. `app.main()` is the same entrypoint
a phone runs; the HTTP goes to the running services; the assertions are on what
a person would see on screen.

```bash
make up && make health          # the stack must be green and seeded first
make test-e2e
```

## Why these exist alongside the unit tests

`test/` proves the parsers can handle a payload. These prove the payload the
services *actually send* reaches the screen intact — the gap where a field
rename produces blank cards rather than an error, and where a count read from
the wrong place silently freezes infinite scroll.

The search-count test is the clearest example. It reads the "N results" header
and asserts the number exceeds one page. Reading the total from `data` instead
of `meta` yields the page size, which also makes `_loadMore` return immediately
forever — so a small number there is a real regression with a user-visible
consequence, not a thin fixture.

## No emulator needed

These run on `flutter-tester`, the headless host VM:

```bash
flutter test integration_test -d flutter-tester --dart-define=...
```

`dart:io` is real there, so real HTTP works. Flutter will otherwise auto-select
Chrome and refuse — *"Web devices are not supported for integration tests yet"*
— so the device flag is not optional. An emulator works too, with `10.0.2.2`
in place of `localhost`.

## Two traps worth knowing before editing these

**The shell is an `IndexedStack`,** so every tab stays mounted whether or not it
is on screen, and each screen's `initState` runs at launch. A bare
`find.byType(Card)` matches cards on tabs the user cannot see, and a test
written that way passes without ever switching tab — one here did, until it was
scoped. Every finder is wrapped in `find.descendant(of: find.byType(TheScreen))`
for that reason.

**`pumpAndSettle` is wrong at both ends of a network round trip.** It never
returns while an indeterminate spinner animates, and returns immediately when
the request has not started yet. `waitFor` pumps until the matcher hits or the
budget runs out, and fails naming what never appeared.

## Configuration

Base URLs come from `--dart-define`, defaulting to the Android emulator's
`10.0.2.2`. `make test-e2e` reads the published ports out of `.env`, so a stack
running on overridden ports is targeted correctly without editing anything here.

| Define | Default |
|---|---|
| `API_CORE_URL` | `http://10.0.2.2:4000/api/v1` |
| `SEARCH_URL` | `http://10.0.2.2:8000/api/search` |
| `CHAT_URL` | `http://10.0.2.2:8001/api/chat` |
| `REPORTS_URL` | `http://10.0.2.2:4567/api/reports` |
| `MEDIA_ORIGIN` | `http://10.0.2.2:3000` |

`setUpAll` refuses to run against a stack it cannot reach and names the command
that fixes it, because a green run against nothing is worse than a red one.
