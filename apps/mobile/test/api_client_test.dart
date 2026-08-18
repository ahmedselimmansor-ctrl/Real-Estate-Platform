import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:topchoice/src/core/api_client.dart';
import 'package:topchoice/src/core/api_exception.dart';
import 'package:topchoice/src/models/property.dart';

http.Response _json(Object body, {int status = 200}) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

void main() {
  group('envelope handling', () {
    test('unwraps data so callers never see the envelope', () async {
      final client = ApiClient(
        client: MockClient((_) async => _json({
              'success': true,
              'data': {'id': 'p1', 'slug': 'a-unit'},
            }),),
      );

      final property = await client.get<Property>(
        'http://x',
        '/properties/a-unit',
        parse: (json) => Property.fromJson(json as Map<String, dynamic>),
      );

      expect(property.id, 'p1');
    });

    test('turns an error envelope into an ApiException with its code', () async {
      final client = ApiClient(
        client: MockClient((_) async => _json({
              'success': false,
              'error': {
                'code': 'VALIDATION_ERROR',
                'message': 'Request validation failed',
                'details': [
                  {'field': 'phone', 'message': 'Phone must be a valid number'},
                ],
              },
            }, status: 422,),),
      );

      await expectLater(
        client.post<void>('http://x', '/leads', parse: (_) {}),
        throwsA(
          isA<ApiException>()
              .having((e) => e.code, 'code', 'VALIDATION_ERROR')
              .having((e) => e.statusCode, 'status', 422)
              .having((e) => e.firstFieldError, 'field error', 'Phone must be a valid number'),
        ),
      );
    });

    test('a 500 with no envelope still raises rather than returning null', () async {
      final client = ApiClient(
        client: MockClient((_) async => http.Response('<html>oops</html>', 500)),
      );

      await expectLater(
        client.get<void>('http://x', '/anything', parse: (_) {}),
        throwsA(isA<ApiException>().having((e) => e.isTransient, 'transient', isTrue)),
      );
    });

    test('401 is reported as unauthorized so the UI can react to it', () async {
      final client = ApiClient(
        client: MockClient((_) async => _json({
              'success': false,
              'error': {'code': 'UNAUTHORIZED', 'message': 'Sign in required'},
            }, status: 401,),),
      );

      await expectLater(
        client.get<void>('http://x', '/favorites', parse: (_) {}),
        throwsA(isA<ApiException>().having((e) => e.isUnauthorized, 'unauthorized', isTrue)),
      );
    });
  });

  group('query building', () {
    test('repeats a key for list values and drops empties', () async {
      late Uri captured;
      final client = ApiClient(
        client: MockClient((request) async {
          captured = request.url;
          return _json({'success': true, 'data': <dynamic>[]});
        }),
      );

      await client.get<void>(
        'http://x/api/search',
        '',
        query: {
          'propertyType': ['villa', 'townhouse'],
          'bedrooms': <String>[],
          'q': '',
          'page': 2,
          'sort': null,
        },
        parse: (_) {},
      );

      expect(captured.queryParametersAll['propertyType'], ['villa', 'townhouse']);
      expect(captured.queryParameters.containsKey('bedrooms'), isFalse);
      expect(captured.queryParameters.containsKey('q'), isFalse);
      expect(captured.queryParameters.containsKey('sort'), isFalse);
      expect(captured.queryParameters['page'], '2');
    });

    test('sends the bearer token when one is available', () async {
      String? seen;
      final client = ApiClient(
        authTokenProvider: () => 'token-123',
        client: MockClient((request) async {
          seen = request.headers['authorization'];
          return _json({'success': true, 'data': <dynamic>[]});
        }),
      );

      await client.get<void>('http://x', '/favorites', parse: (_) {});
      expect(seen, 'Bearer token-123');
    });
  });

  group('list()', () {
    test('carries the pagination meta beside the items', () async {
      final client = ApiClient(
        client: MockClient((_) async => _json({
              'success': true,
              'data': [
                {'id': 'p1'},
                {'id': 'p2'},
              ],
              'meta': {'page': 2, 'limit': 20, 'total': 45, 'totalPages': 3},
            }),),
      );

      final page = await client.list<Property>(
        'http://x',
        '/properties',
        parse: Property.fromJson,
      );

      expect(page.items, hasLength(2));
      expect(page.page, 2);
      expect(page.total, 45);
      expect(page.hasMore, isTrue, reason: 'page 2 of 3 has more');
    });

    test('a response with no meta is treated as a single complete page', () async {
      final client = ApiClient(
        client: MockClient((_) async => _json({
              'success': true,
              'data': [
                {'id': 'p1'},
              ],
            }),),
      );

      final page = await client.list<Property>('http://x', '/areas', parse: Property.fromJson);
      expect(page.hasMore, isFalse);
      expect(page.total, 1);
    });
  });
}
