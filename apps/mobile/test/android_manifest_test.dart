import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// `flutter create` declares `android.permission.INTERNET` only in the debug
/// and profile manifests. `flutter run` uses the debug one, so the app works
/// all through development and the release APK ships without the permission —
/// installing, launching, and then failing on every single screen, because
/// every screen in this app is network-bound.
///
/// That is exactly what happened here, and nothing caught it: `flutter
/// analyze` does not read the manifest and `flutter test` never builds one.
/// These read the file directly.
void main() {
  group('main AndroidManifest', () {
    late String manifest;

    setUpAll(() {
      final file = File('android/app/src/main/AndroidManifest.xml');
      expect(
        file.existsSync(),
        isTrue,
        reason: 'the release build merges from main/AndroidManifest.xml',
      );
      manifest = file.readAsStringSync();
    });

    test('declares INTERNET, without which the release build cannot reach the API', () {
      expect(
        manifest,
        contains('android.permission.INTERNET'),
        reason: 'a release APK without this fails every request at runtime',
      );
    });

    test('does not allow cleartext traffic', () {
      // The app talks to the API over TLS; permitting cleartext would let a
      // misconfigured build downgrade silently.
      expect(manifest, isNot(contains('android:usesCleartextTraffic="true"')));
    });

    test('keeps the launcher activity exported, or the app cannot be opened', () {
      expect(manifest, contains('android:exported="true"'));
      expect(manifest, contains('android.intent.category.LAUNCHER'));
    });
  });
}
