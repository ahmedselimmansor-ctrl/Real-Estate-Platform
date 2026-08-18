import 'package:flutter/material.dart';

/// A network image with the three states a listing photo actually has.
///
/// Property photos load over a slow mobile link and sometimes 404 after a
/// catalogue edit. A bare `Image.network` shows a grey void for the first and
/// an exception glyph for the second; both read as breakage. This shows a
/// tinted placeholder instead, which reads as "loading" and "no photo".
class RemoteImage extends StatelessWidget {
  const RemoteImage({super.key, required this.url, this.fit = BoxFit.cover});

  final String url;
  final BoxFit fit;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    if (url.isEmpty) return _Placeholder(scheme: scheme);

    return Image.network(
      url,
      fit: fit,
      gaplessPlayback: true,
      loadingBuilder: (context, child, progress) =>
          progress == null ? child : _Placeholder(scheme: scheme),
      errorBuilder: (context, error, stack) => _Placeholder(scheme: scheme, failed: true),
    );
  }
}

class _Placeholder extends StatelessWidget {
  const _Placeholder({required this.scheme, this.failed = false});

  final ColorScheme scheme;
  final bool failed;

  @override
  Widget build(BuildContext context) => ColoredBox(
        color: scheme.surfaceContainerHighest,
        child: Center(
          child: Icon(
            failed ? Icons.image_not_supported_outlined : Icons.apartment_outlined,
            color: scheme.onSurfaceVariant.withValues(alpha: 0.4),
            size: 28,
          ),
        ),
      );
}
