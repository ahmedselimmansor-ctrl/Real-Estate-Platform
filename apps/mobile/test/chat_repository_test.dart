import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:topchoice/src/core/api_client.dart';
import 'package:topchoice/src/data/chat_repository.dart';

/// The chat repository holds the only conversational state in the app: a thread
/// id and a guest token, both minted on first use. Getting that lifecycle wrong
/// means either a new thread per message (the assistant forgets everything) or
/// a request sent with no credentials at all.

http.Response _json(Object body, {int status = 200}) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

class _Chat {
  final List<Uri> urls = [];
  final List<Map<String, dynamic>> bodies = [];

  ApiClient client({
    String threadId = 't1',
    String guestToken = 'g1',
    Object? messageData,
    int messageStatus = 200,
  }) =>
      ApiClient(
        client: MockClient((request) async {
          urls.add(request.url);
          if (request.body.isNotEmpty) {
            bodies.add(jsonDecode(request.body) as Map<String, dynamic>);
          }

          if (request.url.path.endsWith('/threads')) {
            return _json(
              {
                'success': true,
                'data': {'threadId': threadId, 'guestToken': guestToken},
              },
              status: 201,
            );
          }

          return _json(
            messageData ??
                {
                  'success': true,
                  'data': {'answer': 'Here you go.', 'sources': <Object>[]},
                },
            status: messageStatus,
          );
        }),
      );

  int get threadCalls => urls.where((u) => u.path.endsWith('/threads')).length;
  int get messageCalls => urls.where((u) => u.path.endsWith('/message')).length;
}

void main() {
  group('thread lifecycle', () {
    test('opens a thread on the first message', () async {
      final harness = _Chat();
      final repo = ChatRepository(harness.client());

      await repo.send('hello');

      expect(harness.threadCalls, 1);
      expect(harness.messageCalls, 1);
      expect(repo.threadId, 't1');
    });

    test('reuses it for later messages, or the assistant loses the conversation', () async {
      final harness = _Chat();
      final repo = ChatRepository(harness.client());

      await repo.send('first');
      await repo.send('second');
      await repo.send('third');

      expect(harness.threadCalls, 1, reason: 'one thread for the whole conversation');
      expect(harness.messageCalls, 3);
    });

    test('sends the thread id and guest token with every message', () async {
      final harness = _Chat();
      final repo = ChatRepository(harness.client(threadId: 'thread-9', guestToken: 'guest-9'));

      await repo.send('hello');
      await repo.send('again');

      // bodies[0] is the thread creation; the rest are messages.
      final messages = harness.bodies.skip(1).toList();
      for (final body in messages) {
        expect(body['threadId'], 'thread-9');
        expect(body['guestToken'], 'guest-9');
      }
    });

    test('carries the locale through to both calls', () async {
      final harness = _Chat();
      final repo = ChatRepository(harness.client());

      await repo.send('مرحبا', locale: 'ar');

      expect(harness.bodies.first['locale'], 'ar');
      expect(harness.bodies.last['locale'], 'ar');
    });
  });

  group('the answer', () {
    test('is returned as an assistant message', () async {
      final harness = _Chat();
      final repo = ChatRepository(harness.client());

      final reply = await repo.send('hello');

      expect(reply.role, 'assistant');
      expect(reply.content, 'Here you go.');
    });

    test('carries its citations', () async {
      final harness = _Chat();
      final repo = ChatRepository(
        harness.client(
          messageData: {
            'success': true,
            'data': {
              'answer': 'Two options.',
              'sources': [
                {'title': 'Palm Hills New Cairo', 'slug': 'palm-hills-new-cairo'},
                {'title': 'Zed East', 'url': 'https://example.test/zed'},
              ],
            },
          },
        ),
      );

      final reply = await repo.send('show me something');

      expect(reply.sources, hasLength(2));
      expect(reply.sources.first.title, 'Palm Hills New Cairo');
      expect(reply.sources.first.slug, 'palm-hills-new-cairo');
      expect(reply.sources.last.url, 'https://example.test/zed');
    });

    test('drops a citation with no title rather than rendering a blank chip', () async {
      final harness = _Chat();
      final repo = ChatRepository(
        harness.client(
          messageData: {
            'success': true,
            'data': {
              'answer': 'Here.',
              'sources': [
                {'title': '', 'slug': 'nameless'},
                {'title': 'Real one', 'slug': 'real'},
              ],
            },
          },
        ),
      );

      final reply = await repo.send('hello');

      expect(reply.sources.map((s) => s.title), ['Real one']);
    });

    test('is empty rather than null when the service returns no answer', () async {
      final harness = _Chat();
      final repo = ChatRepository(
        harness.client(messageData: {'success': true, 'data': <String, dynamic>{}}),
      );

      final reply = await repo.send('hello');

      expect(reply.content, '');
      expect(reply.sources, isEmpty);
    });

    test('lets a service failure reach the screen so it can show an error', () async {
      final harness = _Chat();
      final repo = ChatRepository(
        harness.client(
          messageData: {
            'success': false,
            'error': {'code': 'RAG_UNAVAILABLE', 'message': 'The assistant is offline.'},
          },
          messageStatus: 503,
        ),
      );

      await expectLater(repo.send('hello'), throwsA(isA<Exception>()));
    });
  });
}
