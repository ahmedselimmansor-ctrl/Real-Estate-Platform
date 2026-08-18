import 'dart:convert';

import '../core/api_client.dart';
import '../core/config.dart';

/// One turn in the conversation.
class ChatMessage {
  ChatMessage({
    required this.role,
    required this.content,
    this.sources = const [],
    this.isStreaming = false,
  });

  final String role; // 'user' | 'assistant'
  String content;
  List<ChatSource> sources;
  bool isStreaming;

  bool get isUser => role == 'user';
}

class ChatSource {
  const ChatSource({required this.title, this.url, this.slug});

  final String title;
  final String? url;
  final String? slug;

  factory ChatSource.fromJson(Map<String, dynamic> json) => ChatSource(
        title: (json['title'] as String?) ?? (json['text'] as String?) ?? '',
        url: json['url'] as String?,
        slug: json['slug'] as String?,
      );
}

/// A conversation with the RAG support agent (rag-svc).
///
/// A thread is created once and its guest token kept for the session: the
/// service authorises reads of an anonymous conversation with that token, so
/// losing it means losing the history.
class ChatRepository {
  ChatRepository(this._api);

  final ApiClient _api;

  String? _threadId;
  String? _guestToken;

  String? get threadId => _threadId;

  Future<void> _ensureThread(String locale) async {
    if (_threadId != null) return;
    final created = await _api.post<Map<String, dynamic>>(
      AppConfig.chat,
      '/threads',
      body: {'locale': locale},
      parse: (json) => (json as Map<String, dynamic>?) ?? const {},
    );
    _threadId = created['threadId'] as String?;
    _guestToken = created['guestToken'] as String?;
  }

  /// Send a message and get the whole answer at once.
  ///
  /// The service also exposes an SSE stream, but a single POST is the right
  /// default on mobile: it survives the app being backgrounded mid-answer,
  /// where a dropped socket would lose the turn entirely.
  Future<ChatMessage> send(String message, {String locale = 'en'}) async {
    await _ensureThread(locale);

    final response = await _api.post<Map<String, dynamic>>(
      AppConfig.chat,
      '/message',
      body: {
        'threadId': _threadId,
        if (_guestToken != null) 'guestToken': _guestToken,
        'message': message,
        'locale': locale,
      },
      parse: (json) => (json as Map<String, dynamic>?) ?? const {},
    );

    return ChatMessage(
      role: 'assistant',
      content: (response['answer'] as String?) ?? '',
      sources: (response['sources'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(ChatSource.fromJson)
          .where((s) => s.title.isNotEmpty)
          .toList(),
    );
  }

  /// Token-by-token delivery, for when the UI wants to show the answer as it
  /// is written. Yields the accumulated text.
  Stream<String> stream(String message, {String locale = 'en'}) async* {
    await _ensureThread(locale);

    final buffer = StringBuffer();
    await for (final frame in _api.sse(
      AppConfig.chat,
      '/stream/$_threadId',
      query: {
        'message': message,
        'locale': locale,
        if (_guestToken != null) 'guestToken': _guestToken,
      },
    )) {
      if (frame.isEmpty || frame == '[DONE]') continue;
      try {
        final decoded = jsonDecode(frame);
        if (decoded is Map<String, dynamic>) {
          final delta = decoded['delta'] ?? decoded['token'] ?? decoded['text'];
          if (delta is String) {
            buffer.write(delta);
            yield buffer.toString();
          }
        }
      } on FormatException {
        // A plain-text frame; treat it as the delta itself.
        buffer.write(frame);
        yield buffer.toString();
      }
    }
  }
}
