/// A failed request, carrying the server's error envelope when there was one.
///
/// The backend answers errors as `{success: false, error: {code, message,
/// details}}` (CONTRACT §5). Keeping `code` means the UI can react to
/// `VALIDATION_ERROR` differently from `UNAUTHORIZED` without string matching
/// on prose that changes with the locale.
class ApiException implements Exception {
  const ApiException({
    required this.message,
    this.code,
    this.statusCode,
    this.details = const [],
  });

  final String message;
  final String? code;
  final int? statusCode;
  final List<Map<String, dynamic>> details;

  /// True when retrying might plausibly help.
  bool get isTransient =>
      statusCode == null || statusCode! >= 500 || statusCode == 408 || statusCode == 429;

  bool get isUnauthorized => statusCode == 401 || code == 'UNAUTHORIZED';

  /// The first field-level message, which is what a form wants to show.
  String? get firstFieldError {
    for (final detail in details) {
      final message = detail['message'];
      if (message is String && message.isNotEmpty) return message;
    }
    return null;
  }

  @override
  String toString() => 'ApiException(${code ?? statusCode}): $message';
}
