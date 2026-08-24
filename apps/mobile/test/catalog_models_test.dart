import 'package:flutter_test/flutter_test.dart';
import 'package:topchoice/src/models/catalog.dart';
import 'package:topchoice/src/models/mortgage.dart';

/// The catalogue parsers read field names out of a payload, and a name that no
/// longer matches does not throw — every field here has a `?? ''` or `?? 0`
/// behind it, so a rename turns into blank cards and zeroed counts rather than
/// an error anyone would notice.
///
/// The fixtures below are trimmed from real responses (`/api/v1/areas`,
/// `/developers`, `/compounds` against a seeded stack), so they encode the
/// contract as deployed rather than as remembered.

void main() {
  group('Area', () {
    const payload = {
      'id': '1e6b9f34-0a2c-5d51-9f2e-6a1b0c4d8e73',
      'slug': 'new-cairo',
      'nameEn': 'New Cairo',
      'nameAr': 'القاهرة الجديدة',
      'city': 'Cairo',
      'governorate': 'Cairo',
      'heroImage': '/areas/new-cairo.jpg',
      'propertyCount': 42,
      'avgPricePerMeter': 61900,
      'isActive': true,
    };

    test('reads both languages', () {
      final area = Area.fromJson(payload);

      expect(area.name.en, 'New Cairo');
      expect(area.name.ar, 'القاهرة الجديدة');
    });

    test('reads the identity and the counts', () {
      final area = Area.fromJson(payload);

      expect(area.id, isNotEmpty);
      expect(area.slug, 'new-cairo');
      expect(area.city, 'Cairo');
      expect(area.propertyCount, 42);
      expect(area.avgPricePerMeter, 61900);
    });

    test('resolves a relative hero image against the media origin', () {
      final area = Area.fromJson(payload);

      expect(area.heroImage, isNotNull);
      expect(area.heroImage, contains('/areas/new-cairo.jpg'));
      expect(area.heroImage, startsWith('http'));
    });

    test('leaves the hero image null when the field is absent', () {
      final area = Area.fromJson({...payload}..remove('heroImage'));

      expect(area.heroImage, isNull);
    });

    test('degrades to empty rather than throwing on a stripped payload', () {
      final area = Area.fromJson(const {});

      expect(area.id, '');
      expect(area.name.en, '');
      expect(area.propertyCount, 0);
      expect(area.avgPricePerMeter, isNull);
    });
  });

  group('Developer', () {
    const payload = {
      'id': 'fbbdfc50-271a-535e-814b-30585c974062',
      'slug': 'palm-hills',
      'name': 'Palm Hills Developments',
      'nameAr': 'بالم هيلز للتطوير',
      'logoUrl': '/developers/palm-hills.png',
      'foundedYear': 2005,
      'projectsCount': 9,
      'isFeatured': true,
    };

    test('reads the name in both languages', () {
      final developer = Developer.fromJson(payload);

      expect(developer.name.en, 'Palm Hills Developments');
      expect(developer.name.ar, 'بالم هيلز للتطوير');
    });

    test('reads the identity', () {
      final developer = Developer.fromJson(payload);

      expect(developer.id, isNotEmpty);
      expect(developer.slug, 'palm-hills');
    });

    test('survives a payload with nothing in it', () {
      expect(() => Developer.fromJson(const {}), returnsNormally);
    });
  });

  group('Compound', () {
    const payload = {
      'id': 'ab8b1f21-4d0e-5a77-b0c9-1f2e3d4c5b6a',
      'slug': 'palm-hills-new-cairo',
      'name': 'Palm Hills New Cairo',
      'nameAr': 'بالم هيلز نيو كايرو',
      'areaId': '1e6b9f34-0a2c-5d51-9f2e-6a1b0c4d8e73',
      // Both nested objects are present on the real endpoint, and the card
      // renders their names, so the shapes matter as much as the ids.
      'area': {
        'id': '1e6b9f34-0a2c-5d51-9f2e-6a1b0c4d8e73',
        'slug': 'new-cairo',
        'nameEn': 'New Cairo',
        'nameAr': 'القاهرة الجديدة',
        'city': 'Cairo',
      },
      'developer': {
        'id': 'fbbdfc50-271a-535e-814b-30585c974062',
        'slug': 'palm-hills',
        'name': 'Palm Hills Developments',
        'nameAr': 'بالم هيلز للتطوير',
        'logoUrl': '/developers/palm-hills.png',
      },
      'startingPrice': 9140000,
      'deliveryYear': 2026,
      'downPaymentPercent': 10,
      'installmentYears': 8,
      'images': ['/compounds/php-1.jpg', '/compounds/php-2.jpg'],
      'isFeatured': true,
    };

    test('reads the nested area name, which the card shows under the title', () {
      final compound = Compound.fromJson(payload);

      expect(compound.areaName?.en, 'New Cairo');
      expect(compound.areaName?.ar, 'القاهرة الجديدة');
    });

    test('reads the nested developer name', () {
      final compound = Compound.fromJson(payload);

      expect(compound.developerName?.en, 'Palm Hills Developments');
      expect(compound.developerName?.ar, 'بالم هيلز للتطوير');
    });

    test('leaves the nested names null when the endpoint omits them', () {
      final compound = Compound.fromJson(
        {...payload}
          ..remove('area')
          ..remove('developer'),
      );

      expect(compound.areaName, isNull);
      expect(compound.developerName, isNull);
      // The flat id survives, so the card can still link through.
      expect(compound.areaId, isNotNull);
    });

    test('reads the payment terms a buyer compares on', () {
      final compound = Compound.fromJson(payload);

      expect(compound.startingPrice, 9140000);
      expect(compound.deliveryYear, 2026);
      expect(compound.downPaymentPercent, 10);
      expect(compound.installmentYears, 8);
    });

    test('resolves every image against the media origin', () {
      final compound = Compound.fromJson(payload);

      expect(compound.images, hasLength(2));
      for (final url in compound.images) {
        expect(url, startsWith('http'));
      }
    });

    test('drops non-string entries from the image list', () {
      final compound = Compound.fromJson({
        ...payload,
        'images': [
          '/ok.jpg',
          42,
          null,
          {'nested': true},
        ],
      });

      expect(compound.images, hasLength(1));
    });

    test('degrades to empty rather than throwing on a stripped payload', () {
      final compound = Compound.fromJson(const {});

      expect(compound.id, '');
      expect(compound.images, isEmpty);
      expect(compound.isFeatured, isFalse);
    });
  });

  group('MortgageQuote', () {
    test('reads the summary the calculator screen renders', () {
      final quote = MortgageQuote.fromJson(const {
        'summary': {
          'monthlyPayment': 134928.08,
          'totalInterest': 4133959.2,
          'principal': 7200000,
          'totalPaid': 11333959.2,
          'downPayment': 800000,
        },
      });

      expect(quote.monthlyPayment, closeTo(134928.08, 0.01));
      expect(quote.totalInterest, closeTo(4133959.2, 0.1));
    });

    test('reads zeroes rather than throwing when the summary is missing', () {
      final quote = MortgageQuote.fromJson(const {});

      expect(quote.monthlyPayment, 0);
    });
  });
}
