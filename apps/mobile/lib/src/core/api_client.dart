import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'api_exception.dart';
import 'config.dart';

/// One page of a list endpoint, with the server's pagination meta.
class Paginated<T> {
  const Paginated(
      {required this.items, required this.page, required this.totalPages, required this.total,});

  final List<T> items;
  final int page;
  final int totalPages;
  final int total;

  bool get hasMore => page < totalPages;

  static Paginated<T> empty<T>() => Paginated<T>(items: const [], page: 1, totalPages: 0, total: 0);
}

/// Thin JSON client over the platform's response envelope.
///
/// Every service answers `{success, data, meta}` on success and
/// `{success: false, error: {...}}` on failure (CONTRACT §5), so unwrapping
/// belongs here rather than in each repository. Callers get the payload or an
/// [ApiException]; they never see the envelope.
class ApiClient {
  ApiClient({http.Client? client, this.authTokenProvider}) : _client = client ?? http.Client();

  final http.Client _client;

  /// Supplies the bearer token, when there is a signed-in user. A callback
  /// rather than a field so a refreshed token is picked up automatically.
  final String? Function()? authTokenProvider;

  void close() => _client.close();

  Map<String, String> _headers({bool json = false}) {
    final token = authTokenProvider?.call();
    return {
      'accept': 'application/json',
      if (json) 'content-type': 'application/json',
      if (token != null && token.isNotEmpty) 'authorization': 'Bearer $token',
    };
  }

  /// Query values arrive as strings, lists (repeated keys) or null (dropped).
  static Uri _uri(String base, String path, [Map<String, dynamic>? query]) {
    final normalised = path.isEmpty ? base : '$base${path.startsWith('/') ? '' : '/'}$path';
    final uri = Uri.parse(normalised);
    if (query == null || query.isEmpty) return uri;

    final params = <String, dynamic>{};
    query.forEach((key, value) {
      if (value == null) return;
      if (value is Iterable) {
        final values = value.map((v) => v.toString()).where((v) => v.isNotEmpty).toList();
        if (values.isNotEmpty) params[key] = values;
      } else {
        final text = value.toString();
        if (text.isNotEmpty) params[key] = text;
      }
    });

    return uri.replace(queryParameters: {...uri.queryParametersAll, ...params});
  }

  Future<dynamic> _send(
    String method,
    Uri uri, {
    Object? body,
  }) async {
    late http.Response response;
    try {
      final request = http.Request(method, uri)..headers.addAll(_headers(json: body != null));
      if (body != null) request.body = jsonEncode(body);

      final streamed = await _client.send(request).timeout(AppConfig.requestTimeout);
      response = await http.Response.fromStream(streamed);
    } on TimeoutException {
      throw const ApiException(message: 'The request timed out. Check your connection.');
    } catch (error) {
      throw ApiException(message: 'Could not reach the server. $error');
    }

    return _unwrap(response);
  }

  static dynamic _unwrap(http.Response response) {
    dynamic decoded;
    if (response.body.isNotEmpty) {
      try {
        decoded = jsonDecode(utf8.decode(response.bodyBytes));
      } on FormatException {
        // A non-JSON body from a proxy or an HTML error page.
        if (response.statusCode >= 400) {
          throw ApiException(
            message: 'Unexpected response from the server.',
            statusCode: response.statusCode,
          );
        }
        return null;
      }
    }

    if (decoded is Map<String, dynamic> && decoded['success'] == false) {
      final error = decoded['error'];
      final map = error is Map<String, dynamic> ? error : const <String, dynamic>{};
      throw ApiException(
        message: (map['message'] as String?) ?? 'Something went wrong.',
        code: map['code'] as String?,
        statusCode: response.statusCode,
        details: (map['details'] as List<dynamic>? ?? const [])
            .whereType<Map<String, dynamic>>()
            .toList(),
      );
    }

    if (response.statusCode >= 400) {
      throw ApiException(
        message: 'Request failed (${response.statusCode}).',
        statusCode: response.statusCode,
      );
    }

    if (decoded is Map<String, dynamic> && decoded.containsKey('data')) {
      return decoded['data'];
    }
    return decoded;
  }

  // ----------------------------------------------------------------- verbs --

  Future<T> get<T>(
    String base,
    String path, {
    Map<String, dynamic>? query,
    required T Function(dynamic json) parse,
  }) async {
    final json = await _send('GET', _uri(base, path, query));
    return parse(json);
  }

  Future<T> post<T>(
    String base,
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    required T Function(dynamic json) parse,
  }) async {
    final json = await _send('POST', _uri(base, path, query), body: body ?? const {});
    return parse(json);
  }

  Future<void> delete(String base, String path, {Map<String, dynamic>? query}) =>
      _send('DELETE', _uri(base, path, query));

  /// A list endpoint, returning items plus the pagination meta.
  ///
  /// The meta lives beside `data` in the envelope, so this re-reads the raw
  /// body rather than going through [_unwrap]'s data extraction.
  Future<Paginated<T>> list<T>(
    String base,
    String path, {
    Map<String, dynamic>? query,
    required T Function(Map<String, dynamic> json) parse,
  }) async {
    final uri = _uri(base, path, query);
    late http.Response response;
    try {
      final streamed = await _client
          .send(http.Request('GET', uri)..headers.addAll(_headers()))
          .timeout(AppConfig.requestTimeout);
      response = await http.Response.fromStream(streamed);
    } on TimeoutException {
      throw const ApiException(message: 'The request timed out. Check your connection.');
    } catch (error) {
      throw ApiException(message: 'Could not reach the server. $error');
    }

    _unwrap(response); // throws on an error envelope

    final body = jsonDecode(utf8.decode(response.bodyBytes));
    if (body is! Map<String, dynamic>) return Paginated.empty<T>();

    final data = body['data'];
    final items =
        (data is List ? data : const []).whereType<Map<String, dynamic>>().map(parse).toList();

    final meta = body['meta'];
    if (meta is! Map<String, dynamic>) {
      return Paginated<T>(
          items: items, page: 1, totalPages: items.isEmpty ? 0 : 1, total: items.length,);
    }

    return Paginated<T>(
      items: items,
      page: (meta['page'] as num?)?.toInt() ?? 1,
      totalPages: (meta['totalPages'] as num?)?.toInt() ?? 1,
      total: (meta['total'] as num?)?.toInt() ?? items.length,
    );
  }

  /// Server-sent events, used by the chat stream. Yields each `data:` payload.
  Stream<String> sse(String base, String path, {Map<String, dynamic>? query}) async* {
    final request = http.Request('GET', _uri(base, path, query))
      ..headers.addAll({..._headers(), 'accept': 'text/event-stream'});

    final response = await _client.send(request);
    if (response.statusCode >= 400) {
      throw ApiException(
        message: 'The assistant is unavailable right now.',
        statusCode: response.statusCode,
      );
    }

    // An SSE frame may be split across chunks, so lines are reassembled by the
    // decoder rather than assuming one chunk is one event.
    await for (final line
        in response.stream.transform(utf8.decoder).transform(const LineSplitter())) {
      if (line.startsWith('data:')) {
        yield line.substring(5).trim();
      }
    }
  }
}
