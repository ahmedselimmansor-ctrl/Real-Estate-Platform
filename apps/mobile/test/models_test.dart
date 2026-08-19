import 'package:flutter_test/flutter_test.dart';
import 'package:topchoice/src/core/formatting.dart';
import 'package:topchoice/src/models/property.dart';
import 'package:topchoice/src/models/search.dart';

void main() {
  group('Money', () {
    test('compacts millions the way a listing quotes them', () {
      expect(Money.compact(7420000), 'EGP 7.42M');
      expect(Money.compact(30410000), 'EGP 30.4M');
      expect(Money.compact(950000), 'EGP 950K');
    });

    test('drops a trailing zero decimal', () {
      // 7.40M reads worse than 7.4M.
      expect(Money.compact(7400000), 'EGP 7.4M');
      expect(Money.compact(8000000), 'EGP 8M');
    });

    test('puts the currency after the figure in Arabic', () {
      expect(Money.compact(7420000, locale: 'ar'), contains('ج.م'));
      expect(Money.compact(7420000, locale: 'ar').startsWith('7'), isTrue);
    });

    test('null is empty, not the string "null"', () {
      expect(Money.compact(null), '');
      expect(Money.full(null), '');
      expect(Money.perMonth(null), '');
    });
  });

  group('Figures.quarter', () {
    test('renders a handover date as the quarter it is quoted in', () {
      expect(Figures.quarter('2026-03-31'), 'Q1 2026');
      expect(Figures.quarter('2028-07-01'), 'Q3 2028');
      expect(Figures.quarter('2030-12-15'), 'Q4 2030');
    });

    test('survives a missing or malformed date', () {
      expect(Figures.quarter(null), '');
      expect(Figures.quarter(''), '');
      expect(Figures.quarter('not-a-date'), '');
    });
  });

  group('Localized', () {
    test('falls back to the other language rather than blanking the UI', () {
      const onlyEnglish = Localized(en: 'Apartment', ar: '');
      expect(onlyEnglish.pick('ar'), 'Apartment');

      const onlyArabic = Localized(en: '', ar: 'شقة');
      expect(onlyArabic.pick('en'), 'شقة');
    });

    test('accepts a bare string, which some endpoints return', () {
      final parsed = Localized.fromJson('Villa');
      expect(parsed.en, 'Villa');
      expect(parsed.ar, 'Villa');
    });
  });

  group('PaymentPlan', () {
    test('derives the monthly when the API did not supply one', () {
      const plan = PaymentPlan(downPaymentPercent: 20, installmentYears: 5);
      // 8M price, 20% down leaves 6.4M over 60 months.
      expect(plan.monthlyFor(8000000), 106667);
    });

    test('prefers the API figure over the derived one', () {
      const plan = PaymentPlan(
        downPaymentPercent: 20,
        installmentYears: 5,
        monthlyInstallment: 98933,
      );
      expect(plan.monthlyFor(7420000), 98933);
    });

    test('a ready unit has no instalment to divide by', () {
      const plan = PaymentPlan(downPaymentPercent: 0, installmentYears: 0);
      expect(plan.monthlyFor(5000000), 0);
      expect(plan.isReady, isTrue);
    });
  });

  group('Property.fromJson', () {
    test('reads the api-core document, ordering images by primary then order', () {
      final property = Property.fromJson({
        'id': 'p1',
        'slug': 'sheraton-heights-2br-apartment-tc-1001',
        'referenceNo': 'TC-1001',
        'title': {'en': '2 Bedroom Apartment', 'ar': 'شقة غرفتين'},
        'propertyType': 'apartment',
        'saleType': 'primary',
        'price': {'amount': 7420000, 'currency': 'EGP', 'pricePerMeter': 61833},
        'specs': {'bedrooms': 2, 'bathrooms': 2, 'areaSqm': 120},
        'paymentPlan': {'downPaymentPercent': 20, 'installmentYears': 5},
        'location': {'areaName': 'Heliopolis', 'city': 'Cairo'},
        'media': {
          'images': [
            {'url': '/b.jpg', 'isPrimary': false, 'order': 1},
            {'url': '/a.jpg', 'isPrimary': true, 'order': 0},
          ],
        },
        'compound': {'id': 'c1', 'name': 'Sheraton Heights', 'slug': 'sheraton-heights'},
      });

      expect(property.id, 'p1');
      expect(property.price.amount, 7420000);
      expect(property.specs.bedrooms, 2);
      expect(property.compound?.name, 'Sheraton Heights');
      expect(
        property.primaryImage.endsWith('/a.jpg'),
        isTrue,
        reason: 'the primary image must sort first',
      );
    });

    test('reads the flatter search-svc hit', () {
      final property = Property.fromJson({
        'id': 'p2',
        'slug': 'mivida-3br',
        'title': {'en': '3 Bedroom', 'ar': 'ثلاث غرف'},
        'price': 9200000,
        'specs': {'bedrooms': 3, 'bathrooms': 2, 'areaSqm': 180},
        'areaName': 'New Cairo',
        'city': 'Cairo',
        'compoundName': 'Mivida',
        'primaryImage': '/x.jpg',
      });

      expect(property.price.amount, 9200000);
      expect(property.location.areaName, 'New Cairo');
      expect(property.compound?.name, 'Mivida');
    });

    test('a sparse record degrades instead of throwing', () {
      // One malformed row must not take down a whole results page.
      final property = Property.fromJson({'id': 'p3'});
      expect(property.price.amount, 0);
      expect(property.specs.bedrooms, 0);
      expect(property.images, isEmpty);
      expect(property.compound, isNull);
    });

    test('reads GeoJSON coordinates in the order they are stored', () {
      final property = Property.fromJson({
        'id': 'p4',
        'location': {
          'areaName': 'Heliopolis',
          'city': 'Cairo',
          // GeoJSON is [lng, lat], the reverse of how it is spoken.
          'geo': {
            'type': 'Point',
            'coordinates': [31.360192, 30.092732],
          },
        },
      });

      expect(property.location.lng, closeTo(31.360192, 0.000001));
      expect(property.location.lat, closeTo(30.092732, 0.000001));
    });
  });

  group('SearchFilters', () {
    test('names only what the user actually chose', () {
      const filters = SearchFilters(q: 'zayed', bedrooms: [3]);
      final query = filters.toQuery();

      expect(query['q'], 'zayed');
      expect(query['bedrooms'], ['3']);
      expect(query.containsKey('minPrice'), isFalse);
      expect(query.containsKey('propertyType'), isFalse);
    });

    test('trims a whitespace-only query away entirely', () {
      const filters = SearchFilters(q: '   ');
      expect(filters.toQuery().containsKey('q'), isFalse);
      expect(filters.isEmpty, isTrue);
    });

    test('counts refinements for the filter badge', () {
      const filters = SearchFilters(
        propertyTypes: ['villa', 'townhouse'],
        bedrooms: [3, 4],
        minPrice: 5000000,
        saleType: 'primary',
      );
      // 2 types + 2 bedroom counts + 1 price range + 1 sale type
      expect(filters.activeCount, 6);
    });

    test('clearPrice removes both ends rather than only the one passed', () {
      const filters = SearchFilters(minPrice: 1000000, maxPrice: 5000000);
      final cleared = filters.copyWith(clearPrice: true);
      expect(cleared.minPrice, isNull);
      expect(cleared.maxPrice, isNull);
    });
  });
}
