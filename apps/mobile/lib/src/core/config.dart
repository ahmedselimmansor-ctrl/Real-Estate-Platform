/// Where the backend lives.
///
/// Overridable at build time so one binary serves every environment:
///
///   flutter run --dart-define=API_BASE=https://topchoice.example.com
///
/// The default is the Android emulator's alias for the host machine's
/// loopback. `localhost` inside the emulator is the emulator itself, which is
/// the single most common reason a local build appears to have no backend.
class AppConfig {
  const AppConfig._();

  static const String _host = String.fromEnvironment(
    'API_BASE',
    defaultValue: 'http://10.0.2.2',
  );

  /// api-core (CONTRACT §1).
  static String get apiCore =>
      const String.fromEnvironment('API_CORE_URL', defaultValue: '$_host:4000/api/v1');

  /// search-svc.
  static String get search =>
      const String.fromEnvironment('SEARCH_URL', defaultValue: '$_host:8000/api/search');

  /// rag-svc, the support agent.
  static String get chat =>
      const String.fromEnvironment('CHAT_URL', defaultValue: '$_host:8001/api/chat');

  /// reports-svc.
  static String get reports =>
      const String.fromEnvironment('REPORTS_URL', defaultValue: '$_host:4567/api/reports');

  /// Images in the seed are served as site-relative paths (`/properties/x.jpg`),
  /// so they need an origin to be loadable from a phone.
  static String get mediaOrigin =>
      const String.fromEnvironment('MEDIA_ORIGIN', defaultValue: '$_host:3000');

  /// Resolve a possibly-relative media path to something `Image.network` can use.
  static String mediaUrl(String? path) {
    if (path == null || path.isEmpty) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return '$mediaOrigin${path.startsWith('/') ? '' : '/'}$path';
  }

  static const Duration requestTimeout = Duration(seconds: 20);
}
