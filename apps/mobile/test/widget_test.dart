import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:topchoice/src/l10n/strings.dart';
import 'package:topchoice/src/models/property.dart';
import 'package:topchoice/src/state/controllers.dart';
import 'package:topchoice/src/theme/theme.dart';
import 'package:topchoice/src/ui/widgets/instalment_ledger.dart';
import 'package:topchoice/src/ui/widgets/property_card.dart';

final Property _sample = Property.fromJson({
  'id': 'p1',
  'slug': 'sheraton-heights-2br-apartment-tc-1001',
  'title': {'en': '2 Bedroom Apartment in Sheraton Heights', 'ar': 'شقة غرفتين في شيراتون هايتس'},
  'propertyType': 'apartment',
  'price': {'amount': 7420000, 'currency': 'EGP'},
  'specs': {'bedrooms': 2, 'bathrooms': 2, 'areaSqm': 120},
  'paymentPlan': {
    'downPaymentPercent': 20,
    'installmentYears': 5,
    'monthlyInstallment': 98933,
    'deliveryDate': '2026-03-31',
  },
  'location': {'areaName': 'Heliopolis', 'city': 'Cairo'},
});

Future<Widget> _host(Widget child, {String locale = 'en'}) async {
  SharedPreferences.setMockInitialValues({});
  final prefs = await SharedPreferences.getInstance();

  return MultiProvider(
    providers: [
      ChangeNotifierProvider(create: (_) => FavoritesController(prefs)),
      ChangeNotifierProvider(create: (_) => LocaleController(prefs)),
    ],
    child: MaterialApp(
      theme: AppTheme.light(),
      locale: Locale(locale),
      supportedLocales: const [Locale('en'), Locale('ar')],
      // Same delegates as the app: without them Arabic falls back to LTR
      // and the test would be checking a configuration that never ships.
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      // Hosted in a scrollable, which is how every screen uses these
      // widgets. A bare Scaffold body would give the card the whole
      // viewport and misreport a natural-height widget as overflowing.
      home: Scaffold(
        body: ListView(padding: EdgeInsets.zero, children: [child]),
      ),
    ),
  );
}

void main() {
  testWidgets('a card leads with the price and carries the specs', (tester) async {
    await tester.pumpWidget(await _host(PropertyCard(property: _sample)));
    await tester.pump();

    expect(find.textContaining('7,420,000'), findsOneWidget);
    expect(find.textContaining('Sheraton Heights'), findsOneWidget);
    // Bedrooms, bathrooms and area all present.
    expect(find.text('2'), findsNWidgets(2));
    expect(find.textContaining('120'), findsWidgets);
  });

  testWidgets('the card shows the plan, because buyers shop on the monthly', (tester) async {
    await tester.pumpWidget(await _host(PropertyCard(property: _sample)));
    await tester.pump();

    expect(find.byType(InstalmentLedger), findsOneWidget);
    expect(find.textContaining('20% down'), findsOneWidget);
  });

  testWidgets('tapping the heart saves and un-saves', (tester) async {
    await tester.pumpWidget(await _host(PropertyCard(property: _sample)));
    await tester.pump();

    final context = tester.element(find.byType(PropertyCard));
    final favorites = Provider.of<FavoritesController>(context, listen: false);
    expect(favorites.contains('p1'), isFalse);

    await tester.tap(find.byIcon(Icons.favorite_border));
    await tester.pump();
    expect(favorites.contains('p1'), isTrue);

    await tester.tap(find.byIcon(Icons.favorite));
    await tester.pump();
    expect(favorites.contains('p1'), isFalse);
  });

  testWidgets('Arabic renders right to left', (tester) async {
    await tester.pumpWidget(await _host(PropertyCard(property: _sample), locale: 'ar'));
    await tester.pump();

    expect(find.textContaining('شقة غرفتين'), findsOneWidget);
    expect(Directionality.of(tester.element(find.byType(PropertyCard))), TextDirection.rtl);
  });

  testWidgets('the ledger draws a detailed breakdown on request', (tester) async {
    await tester.pumpWidget(
      await _host(InstalmentLedger(price: 7420000, plan: _sample.plan, detailed: true)),
    );
    await tester.pump();

    // Down / Monthly / Handover, uppercased as eyebrow labels.
    expect(find.text('DOWN PAYMENT'), findsOneWidget);
    expect(find.text('MONTHLY'), findsOneWidget);
    expect(find.text('HANDOVER'), findsOneWidget);
    expect(find.textContaining('Q1 2026'), findsOneWidget);
  });

  test('Strings picks the right language and reports direction', () {
    const en = Strings('en');
    const ar = Strings('ar');

    expect(en.pick('Search', 'ابحث'), 'Search');
    expect(ar.pick('Search', 'ابحث'), 'ابحث');
    expect(ar.isArabic, isTrue);
    expect(en.propertyTypeLabel('villa'), 'Villa');
    expect(ar.propertyTypeLabel('villa'), 'فيلا');
    // An unknown enum value falls through rather than rendering blank.
    expect(en.propertyTypeLabel('spaceship'), 'spaceship');
  });
}
