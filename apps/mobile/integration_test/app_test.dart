import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:topchoice/main.dart' as app;
import 'package:topchoice/src/core/config.dart';
import 'package:topchoice/src/ui/catalog/compounds_screen.dart';
import 'package:topchoice/src/ui/home/home_screen.dart';
import 'package:topchoice/src/ui/search/search_screen.dart';
import 'package:topchoice/src/ui/widgets/property_card.dart';

/// End-to-end: the real app, against the real stack.
///
/// Nothing is stubbed. `app.main()` is the entrypoint a phone runs, the HTTP
/// goes to the running services, and the assertions are on what a person would
/// see. The unit suite proves the parsers can handle a payload; these prove the
/// payload the services actually send reaches the screen intact.
///
///   flutter test integration_test -d flutter-tester \
///     --dart-define=API_BASE=http://localhost
///
/// One trap worth knowing before reading the finders below: the shell is an
/// IndexedStack, so every tab stays mounted whether or not it is on screen. A
/// bare `find.byType(Card)` matches cards on tabs the user cannot see, and a
/// test written that way passes without ever switching tab. Everything here is
/// scoped with `find.descendant` to the screen under test.

/// Pump until the matcher finds something, or fail saying what was missing.
///
/// `pumpAndSettle` never returns while a spinner is animating, and returns too
/// early when a request has not started yet, so neither end of a real network
/// round trip is safe with it.
Future<void> waitFor(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 30),
  required String because,
}) async {
  final deadline = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(deadline)) {
    await tester.pump(const Duration(milliseconds: 250));
    if (finder.evaluate().isNotEmpty) return;
  }
  fail('timed out after ${timeout.inSeconds}s waiting for $because');
}

/// Tap a bottom-navigation destination by its icon and let the tab settle.
Future<void> openTab(WidgetTester tester, IconData icon) async {
  final destination = find.descendant(
    of: find.byType(NavigationBar),
    matching: find.byIcon(icon),
  );
  expect(destination, findsOneWidget, reason: 'no navigation destination with icon $icon');

  await tester.tap(destination);
  await tester.pump(const Duration(milliseconds: 600));
}

/// Refuse to run against a stack that is not there, and say which command fixes it.
Future<void> requireStack() async {
  final uri = Uri.parse('${AppConfig.apiCore}/properties?limit=1');
  final client = HttpClient()..connectionTimeout = const Duration(seconds: 10);
  try {
    final response = await (await client.getUrl(uri)).close();
    if (response.statusCode != 200) {
      fail('api-core answered ${response.statusCode} at $uri — is it seeded? Run `make seed`.');
    }
    await response.drain<void>();
  } on SocketException catch (error) {
    fail(
      'Could not reach $uri ($error).\n'
      'Start the stack with `make up`, then pass '
      '--dart-define=API_BASE=http://localhost',
    );
  } finally {
    client.close();
  }
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(requireStack);

  testWidgets('opens on the home tab with listings fetched from the API', (tester) async {
    await app.main();
    await tester.pump();

    // The first frame is a skeleton; the prices arrive over the network.
    await waitFor(
      tester,
      find.descendant(of: find.byType(HomeScreen), matching: find.textContaining('EGP')),
      because: 'a price from a real listing on the home feed',
    );

    expect(find.byType(NavigationBar), findsOneWidget);
  });

  testWidgets('search reports the full match count, not the size of one page', (tester) async {
    await app.main();
    await tester.pump();
    await waitFor(tester, find.byType(NavigationBar), because: 'the app shell');

    await openTab(tester, Icons.search);

    final header = find.descendant(
      of: find.byType(SearchScreen),
      matching: find.textContaining(RegExp(r'^\d+ results?$')),
    );
    await waitFor(tester, header, because: 'the "N results" header on the search tab');

    final label = tester.widget<Text>(header.first).data!;
    final total = int.parse(RegExp(r'^\d+').firstMatch(label)!.group(0)!);

    // The seeded catalogue is 180 listings and the first page is 20. Reading
    // the total out of `data` instead of `meta` yields the page size, which
    // also freezes infinite scroll — so a small number here is the symptom of
    // a real regression, not a thin fixture.
    expect(
      total,
      greaterThan(20),
      reason: 'an unfiltered search should report the whole catalogue, not one page',
    );
  });

  testWidgets('search returns cards for a typed query', (tester) async {
    await app.main();
    await tester.pump();
    await waitFor(tester, find.byType(NavigationBar), because: 'the app shell');

    await openTab(tester, Icons.search);

    final field = find.descendant(
      of: find.byType(SearchScreen),
      matching: find.byType(TextField),
    );
    await waitFor(tester, field, because: 'the search field');

    await tester.enterText(field.first, 'new cairo');
    await tester.testTextInput.receiveAction(TextInputAction.search);

    await waitFor(
      tester,
      find.descendant(of: find.byType(SearchScreen), matching: find.textContaining('EGP')),
      because: 'Elasticsearch results for "new cairo"',
    );
  });

  testWidgets('the compounds tab loads its own catalogue', (tester) async {
    await app.main();
    await tester.pump();
    await waitFor(tester, find.byType(NavigationBar), because: 'the app shell');

    await openTab(tester, Icons.location_city_outlined);

    // Scoped to CompoundsScreen: the home tab is still mounted behind it and
    // has cards of its own.
    await waitFor(
      tester,
      find.descendant(of: find.byType(CompoundsScreen), matching: find.byType(Card)),
      timeout: const Duration(seconds: 25),
      because: 'compound cards from /api/v1/compounds',
    );
  });

  testWidgets('a listing opens its detail screen and can be dismissed', (tester) async {
    await app.main();
    await tester.pump();

    final price = find.descendant(
      of: find.byType(HomeScreen),
      matching: find.textContaining('EGP'),
    );
    await waitFor(tester, price, because: 'the home feed to load');

    // Tap the card, not the price. PropertyCard puts its InkWell around the
    // whole tile, and the price Text is only painted inside it — tapping the
    // text lands on a widget with no gesture of its own.
    final card = find.ancestor(of: price.first, matching: find.byType(PropertyCard)).first;
    await tester.ensureVisible(card);
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(card);
    await tester.pump(const Duration(seconds: 2));

    // A pushed route means the shell's navigation bar is no longer on screen.
    await waitFor(
      tester,
      find.byType(BackButton),
      timeout: const Duration(seconds: 25),
      because: 'the property detail route to push',
    );

    await tester.tap(find.byType(BackButton).first);
    await tester.pump(const Duration(seconds: 1));

    expect(find.byType(NavigationBar), findsOneWidget, reason: 'back should return to the shell');
  });

  testWidgets('every tab stays alive across a switch', (tester) async {
    await app.main();
    await tester.pump();
    await waitFor(
      tester,
      find.descendant(of: find.byType(HomeScreen), matching: find.textContaining('EGP')),
      because: 'the home feed to load once',
    );

    await openTab(tester, Icons.favorite_border);
    await openTab(tester, Icons.home_outlined);

    // An IndexedStack keeps each tab mounted, so returning to a loaded feed
    // must not drop it back into a loading state.
    expect(
      find.descendant(of: find.byType(HomeScreen), matching: find.textContaining('EGP')),
      findsWidgets,
      reason: 'the home feed should still be populated after a round trip through another tab',
    );
  });
}
