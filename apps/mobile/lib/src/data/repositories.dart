import '../core/api_client.dart';
import '../core/config.dart';
import '../models/catalog.dart';
import '../models/mortgage.dart';
import '../models/property.dart';
import '../models/search.dart';

/// Listings, from both sources that serve them.
///
/// api-core owns the canonical document and the detail view; search-svc owns
/// the filtered/faceted result set. Which one answers is an implementation
/// detail the UI should not have to know, so both land as [Property].
class PropertiesRepository {
  const PropertiesRepository(this._api);

  final ApiClient _api;

  Future<Paginated<Property>> list({int page = 1, int limit = 20, bool featuredOnly = false}) =>
      _api.list<Property>(
        AppConfig.apiCore,
        '/properties',
        query: {
          'page': page,
          'limit': limit,
          if (featuredOnly) 'isFeatured': 'true',
        },
        parse: Property.fromJson,
      );

  Future<Property> byIdOrSlug(String idOrSlug) => _api.get<Property>(
        AppConfig.apiCore,
        '/properties/$idOrSlug',
        parse: (json) => Property.fromJson(json as Map<String, dynamic>),
      );

  Future<List<Property>> similar(String id) => _api.get<List<Property>>(
        AppConfig.apiCore,
        '/properties/$id/similar',
        parse: (json) => (json as List<dynamic>? ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(Property.fromJson)
            .toList(),
      );

  /// Fire and forget: a failed view counter must never surface to the user.
  Future<void> recordView(String id) async {
    try {
      await _api.post<void>(AppConfig.apiCore, '/properties/$id/view', parse: (_) {});
    } catch (_) {
      // Intentionally swallowed.
    }
  }
}

class SearchRepository {
  const SearchRepository(this._api);

  final ApiClient _api;

  /// search-svc returns `{results, facets, total, took}` inside the envelope,
  /// which is not the `{data, meta}` list shape, so it is unwrapped by hand.
  Future<({List<Property> results, int total})> search(
    SearchFilters filters, {
    int page = 1,
    int limit = 20,
  }) =>
      _api.get<({List<Property> results, int total})>(
        AppConfig.search,
        '',
        query: filters.toQuery(page: page, limit: limit),
        parse: (json) {
          final map = json is Map<String, dynamic> ? json : const <String, dynamic>{};
          final results = (map['results'] as List<dynamic>? ?? const [])
              .whereType<Map<String, dynamic>>()
              .map(Property.fromJson)
              .toList();
          return (
            results: results,
            total: (map['total'] as num?)?.toInt() ?? results.length,
          );
        },
      );

  Future<List<String>> autocomplete(String term) => _api.get<List<String>>(
        AppConfig.search,
        '/autocomplete',
        query: {'q': term, 'limit': 8},
        parse: (json) {
          final list = json is Map<String, dynamic> ? json['suggestions'] : json;
          return (list as List<dynamic>? ?? const [])
              .map((s) => s is Map ? (s['text'] as String? ?? '') : s.toString())
              .where((s) => s.isNotEmpty)
              .toList();
        },
      );
}

class CatalogRepository {
  const CatalogRepository(this._api);

  final ApiClient _api;

  /// The list endpoints cap `limit` at 100, so a larger catalogue is paged
  /// rather than silently truncated.
  Future<List<T>> _all<T>(
    String path,
    T Function(Map<String, dynamic>) parse, {
    String? sort,
    int cap = 300,
  }) async {
    final collected = <T>[];
    var page = 1;
    while (collected.length < cap) {
      final result = await _api.list<T>(
        AppConfig.apiCore,
        path,
        query: {'page': page, 'limit': 100, if (sort != null) 'sort': sort},
        parse: parse,
      );
      collected.addAll(result.items);
      if (!result.hasMore || result.items.isEmpty) break;
      page++;
    }
    return collected;
  }

  Future<List<Area>> areas() => _all<Area>('/areas', Area.fromJson, sort: 'nameEn');

  Future<List<Developer>> developers() =>
      _all<Developer>('/developers', Developer.fromJson, sort: 'name');

  Future<List<Compound>> compounds({String? q}) => _api
      .list<Compound>(
        AppConfig.apiCore,
        '/compounds',
        query: {'limit': 100, 'sort': 'name', if (q != null && q.isNotEmpty) 'q': q},
        parse: Compound.fromJson,
      )
      .then((page) => page.items);

  Future<Compound> compound(String idOrSlug) => _api.get<Compound>(
        AppConfig.apiCore,
        '/compounds/$idOrSlug',
        parse: (json) => Compound.fromJson(json as Map<String, dynamic>),
      );
}

class LeadsRepository {
  const LeadsRepository(this._api);

  final ApiClient _api;

  /// Matches `POST /leads` (CONTRACT §6). `source` tells the sales team which
  /// surface the enquiry came from, which is why it is required here.
  Future<void> create({
    required String name,
    required String phone,
    required String source,
    String? email,
    String? message,
    String? propertyId,
    String? areaId,
    String? compoundId,
    String? propertyType,
  }) =>
      _api.post<void>(
        AppConfig.apiCore,
        '/leads',
        body: {
          'name': name,
          'phone': phone,
          'source': source,
          if (email != null && email.isNotEmpty) 'email': email,
          if (message != null && message.isNotEmpty) 'message': message,
          if (propertyId != null) 'propertyId': propertyId,
          if (areaId != null) 'areaId': areaId,
          if (compoundId != null) 'compoundId': compoundId,
          if (propertyType != null) 'propertyType': propertyType,
        },
        parse: (_) {},
      );
}

/// reports-svc: the finance engine behind the calculator and the brochures.
class ReportsRepository {
  const ReportsRepository(this._api);

  final ApiClient _api;

  /// `annualRatePercent: 0` is a developer instalment plan rather than a bank
  /// mortgage, which is how most primary stock here is actually sold.
  Future<MortgageQuote> mortgage({
    required int price,
    required double downPaymentPercent,
    required int years,
    double annualRatePercent = 0,
  }) =>
      _api.post<MortgageQuote>(
        AppConfig.reports,
        '/mortgage/calculate',
        body: {
          'price': price,
          'downPaymentPercent': downPaymentPercent,
          'years': years,
          'annualRatePercent': annualRatePercent,
        },
        parse: (json) => MortgageQuote.fromJson((json as Map<String, dynamic>?) ?? const {}),
      );
}
