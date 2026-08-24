import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:topchoice/src/core/api_client.dart';
import 'package:topchoice/src/data/repositories.dart';
import 'package:topchoice/src/models/search.dart';

/// The repository layer is where a request is shaped and a response is trusted.
/// These assert both halves: that the query the app sends is the one the API
/// documents, and that a response it did not expect degrades instead of
/// throwing somewhere far away.

http.Response _json(Object body, {int status = 200}) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

/// Envelope with pagination meta, the shape every list endpoint returns.
Object _page(List<Object> items, {int page = 1, int limit = 100, int? total}) => {
      'success': true,
      'data': items,
      'meta': {
        'page': page,
        'limit': limit,
        'total': total ?? items.length,
        'totalPages': ((total ?? items.length) / limit).ceil(),
      },
    };

Object _property(String id, {String slug = 'a-unit'}) => {
      'propertyId': id,
      'slug': slug,
      'referenceNo': 'TC-1000',
      'title': {'en': 'A unit', 'ar': 'وحدة'},
      'price': {'amount': 5000000, 'currency': 'EGP', 'pricePerMeter': 40000},
      'specs': {'bedrooms': 3, 'bathrooms': 2, 'areaSqm': 125},
      'location': {'areaId': 'a1', 'areaName': 'New Cairo'},
      'media': {'images': <Object>[]},
    };

/// Records every request so a test can assert on the URL that was built.
class _Recorder {
  final List<Uri> urls = [];
  final List<String> methods = [];
  final List<String?> bodies = [];

  ApiClient client(http.Response Function(http.Request) respond) => ApiClient(
        client: MockClient((request) async {
          urls.add(request.url);
          methods.add(request.method);
          bodies.add(request.body.isEmpty ? null : request.body);
          return respond(request);
        }),
      );

  Uri get lastUrl => urls.last;
  Map<String, String> get lastQuery => lastUrl.queryParameters;
}

void main() {
  group('PropertiesRepository', () {
    test('asks for the page and limit it was given', () async {
      final recorder = _Recorder();
      final repo = PropertiesRepository(recorder.client((_) => _json(_page([_property('p1')]))));

      await repo.list(page: 3, limit: 24);

      expect(recorder.lastQuery['page'], '3');
      expect(recorder.lastQuery['limit'], '24');
    });

    test('narrows to featured listings only when asked', () async {
      final recorder = _Recorder();
      final repo = PropertiesRepository(recorder.client((_) => _json(_page([]))));

      await repo.list(featuredOnly: true);
      expect(recorder.lastQuery['isFeatured'], 'true');

      await repo.list();
      expect(recorder.lastQuery.containsKey('isFeatured'), isFalse);
    });

    test('carries the total through from meta, not from the page length', () async {
      final recorder = _Recorder();
      final repo = PropertiesRepository(
        recorder.client((_) => _json(_page([_property('p1')], limit: 1, total: 180))),
      );

      final result = await repo.list(limit: 1);

      expect(result.items, hasLength(1));
      expect(result.total, 180);
      expect(result.hasMore, isTrue);
    });

    test('resolves a listing by slug and by id through the same path', () async {
      final recorder = _Recorder();
      final repo = PropertiesRepository(
        recorder.client((_) => _json({'success': true, 'data': _property('p1', slug: 'the-slug')})),
      );

      await repo.byIdOrSlug('the-slug');
      expect(recorder.lastUrl.path, endsWith('/properties/the-slug'));

      await repo.byIdOrSlug('c7a1dd15-0227-5e53-abaf-b311d2904dd5');
      expect(recorder.lastUrl.path, endsWith('/properties/c7a1dd15-0227-5e53-abaf-b311d2904dd5'));
    });

    test('reads similar listings from the nested route', () async {
      final recorder = _Recorder();
      final repo = PropertiesRepository(
        recorder.client(
          (_) => _json({
            'success': true,
            'data': [_property('p2')],
          }),
        ),
      );

      final similar = await repo.similar('p1');

      expect(recorder.lastUrl.path, endsWith('/properties/p1/similar'));
      expect(similar, hasLength(1));
    });

    test('a failed view ping is swallowed — analytics must not break a screen', () async {
      final recorder = _Recorder();
      final repo = PropertiesRepository(
        recorder.client(
          (_) => _json(
            {
              'success': false,
              'error': {'code': 'BOOM', 'message': 'no'},
            },
            status: 500,
          ),
        ),
      );

      // The property page fires this on open; an exception here would surface
      // as a broken screen for a metric nobody is waiting on.
      await expectLater(repo.recordView('p1'), completes);
    });
  });

  group('SearchRepository', () {
    test('takes the match count from meta, not from the page it is holding', () async {
      final recorder = _Recorder();
      final repo = SearchRepository(
        recorder.client(
          (_) => _json({
            'success': true,
            // search-svc puts results under data and the count in meta. `data`
            // deliberately carries no `total` here, because the real service
            // does not send one — reading it from data silently yields the page
            // size, which is the bug this pins.
            'data': {
              'results': [
                {..._property('p1') as Map<String, dynamic>, 'id': 'p1', 'price': 5000000},
              ],
              'facets': null,
              'took': 3,
            },
            'meta': {'page': 1, 'limit': 20, 'total': 180, 'totalPages': 9},
          }),
        ),
      );

      final result = await repo.search(const SearchFilters());

      expect(result.results, hasLength(1));
      expect(result.total, 180, reason: 'one result on the page, 180 matches overall');
    });

    test('falls back to the page length only when meta carries no total', () async {
      final repo = SearchRepository(
        _Recorder().client(
          (_) => _json({
            'success': true,
            'data': {
              'results': [
                {..._property('p1') as Map<String, dynamic>, 'id': 'p1', 'price': 5000000},
              ],
            },
          }),
        ),
      );

      final result = await repo.search(const SearchFilters());

      expect(result.total, 1);
    });

    test('sends the filters it was given as query parameters', () async {
      final recorder = _Recorder();
      final repo = SearchRepository(
        recorder.client(
          (_) => _json({
            'success': true,
            'data': {'results': <Object>[]},
          }),
        ),
      );

      await repo.search(
        const SearchFilters(q: 'zayed', bedrooms: [3], sort: 'price_asc'),
        page: 2,
        limit: 24,
      );

      expect(recorder.lastQuery['q'], 'zayed');
      expect(recorder.lastQuery['page'], '2');
      expect(recorder.lastQuery['limit'], '24');
      expect(recorder.lastQuery['sort'], 'price_asc');
    });

    test('survives a response with no results key at all', () async {
      final recorder = _Recorder();
      final repo = SearchRepository(
        recorder.client((_) => _json({'success': true, 'data': <String, dynamic>{}})),
      );

      final result = await repo.search(const SearchFilters());

      expect(result.results, isEmpty);
      expect(result.total, 0);
    });

    test('survives data being a list instead of an object', () async {
      final recorder = _Recorder();
      final repo = SearchRepository(
        recorder.client((_) => _json({'success': true, 'data': <Object>[]})),
      );

      await expectLater(repo.search(const SearchFilters()), completes);
    });

    test('accepts autocomplete as a bare list or under a suggestions key', () async {
      final asMap = SearchRepository(
        _Recorder().client(
          (_) => _json({
            'success': true,
            'data': {
              'suggestions': ['new cairo', 'new giza'],
            },
          }),
        ),
      );
      expect(await asMap.autocomplete('new'), ['new cairo', 'new giza']);

      final asList = SearchRepository(
        _Recorder().client(
          (_) => _json({
            'success': true,
            'data': ['zayed'],
          }),
        ),
      );
      expect(await asList.autocomplete('z'), ['zayed']);
    });
  });

  group('CatalogRepository pages through a capped endpoint', () {
    test('keeps requesting while the server reports more', () async {
      final recorder = _Recorder();
      var call = 0;
      final repo = CatalogRepository(
        recorder.client((_) {
          call++;
          // 100 on the first page then 20 on the second: total 120, so the
          // first response must not be mistaken for the whole catalogue.
          final items = List<Object>.generate(
            call == 1 ? 100 : 20,
            (i) => {'id': 'a$call-$i', 'slug': 's$call-$i', 'nameEn': 'Area', 'nameAr': 'منطقة'},
          );
          return _json(_page(items, page: call, total: 120));
        }),
      );

      final areas = await repo.areas();

      expect(call, 2, reason: 'a 100-item first page must not be treated as the end');
      expect(areas, hasLength(120));
      expect(recorder.urls.first.queryParameters['page'], '1');
      expect(recorder.urls.last.queryParameters['page'], '2');
    });

    test('stops on an empty page rather than looping to the cap', () async {
      final recorder = _Recorder();
      var call = 0;
      final repo = CatalogRepository(
        recorder.client((_) {
          call++;
          // Claims more but returns nothing — a server bug that would otherwise
          // spin until the 300 cap.
          return _json(_page(<Object>[], page: call, total: 999));
        }),
      );

      await repo.areas();

      expect(call, 1);
    });

    test('requests the sort the list is displayed in', () async {
      final recorder = _Recorder();
      final repo = CatalogRepository(recorder.client((_) => _json(_page([]))));

      await repo.areas();
      expect(recorder.lastQuery['sort'], 'nameEn');

      await repo.developers();
      expect(recorder.lastQuery['sort'], 'name');
    });

    test('passes a compound search term through and omits it when blank', () async {
      final recorder = _Recorder();
      final repo = CatalogRepository(recorder.client((_) => _json(_page([]))));

      await repo.compounds(q: 'palm');
      expect(recorder.lastQuery['q'], 'palm');

      await repo.compounds(q: '');
      expect(recorder.lastQuery.containsKey('q'), isFalse);

      await repo.compounds();
      expect(recorder.lastQuery.containsKey('q'), isFalse);
    });
  });

  group('LeadsRepository', () {
    test('posts the enquiry as JSON to /leads', () async {
      final recorder = _Recorder();
      final repo = LeadsRepository(
        recorder.client(
          (_) => _json(
            {
              'success': true,
              'data': {'id': 'l1'},
            },
            status: 201,
          ),
        ),
      );

      await repo.create(
        name: 'Sara',
        email: 'sara@example.com',
        phone: '+201000000000',
        message: 'Interested',
        propertyId: 'p1',
        source: 'mobile',
      );

      expect(recorder.methods.last, 'POST');
      expect(recorder.lastUrl.path, endsWith('/leads'));

      final sent = jsonDecode(recorder.bodies.last!) as Map<String, dynamic>;
      expect(sent['name'], 'Sara');
      expect(sent['email'], 'sara@example.com');
      expect(sent['propertyId'], 'p1');
      expect(sent['source'], 'mobile');
    });

    test('lets a validation failure reach the caller so the form can show it', () async {
      final recorder = _Recorder();
      final repo = LeadsRepository(
        recorder.client(
          (_) => _json(
            {
              'success': false,
              'error': {'code': 'VALIDATION_ERROR', 'message': 'bad', 'details': <Object>[]},
            },
            status: 422,
          ),
        ),
      );

      await expectLater(
        repo.create(name: '', email: 'nope', phone: '', message: '', source: 'mobile'),
        throwsA(isA<Exception>()),
      );
    });
  });

  group('ReportsRepository', () {
    test('sends the loan terms and reads the quote back', () async {
      final recorder = _Recorder();
      final repo = ReportsRepository(
        recorder.client(
          (_) => _json({
            'success': true,
            'data': {
              'summary': {
                'monthlyPayment': 134928.08,
                'totalInterest': 4133959.2,
                'principal': 7200000,
                'totalPaid': 11333959.2,
              },
            },
          }),
        ),
      );

      final quote = await repo.mortgage(
        price: 8000000,
        downPaymentPercent: 10,
        years: 7,
        annualRatePercent: 14,
      );

      final sent = jsonDecode(recorder.bodies.last!) as Map<String, dynamic>;
      expect(sent['price'], 8000000);
      expect(sent['downPaymentPercent'], 10);
      expect(sent['years'], 7);
      expect(sent['annualRatePercent'], 14);

      expect(quote.monthlyPayment, closeTo(134928.08, 0.01));
    });
  });
}
