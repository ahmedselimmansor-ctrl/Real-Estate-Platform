import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../l10n/strings.dart';
import '../../state/controllers.dart';
import '../property/property_screen.dart';
import '../widgets/property_card.dart';
import '../widgets/states.dart';

/// Saved listings, served from the local store so the list works offline.
class FavoritesScreen extends StatelessWidget {
  const FavoritesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final favorites = context.watch<FavoritesController>();
    final items = favorites.all;

    return Scaffold(
      appBar: AppBar(
        title: Text(strings.favorites),
        actions: [
          if (items.isNotEmpty)
            Padding(
              padding: const EdgeInsetsDirectional.only(end: 12),
              child: Center(
                child: Text(
                  strings.resultCount(items.length),
                  style: Theme.of(context).textTheme.labelMedium,
                ),
              ),
            ),
        ],
      ),
      body: items.isEmpty
          ? EmptyState(
              icon: Icons.favorite_border,
              title: strings.noFavorites,
              body: strings.noFavoritesHint,
            )
          : ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
              itemCount: items.length,
              separatorBuilder: (_, __) => const SizedBox(height: 16),
              itemBuilder: (context, index) {
                final property = items[index];
                return Dismissible(
                  key: ValueKey(property.id),
                  direction: DismissDirection.endToStart,
                  onDismissed: (_) => favorites.remove(property.id),
                  background: Container(
                    alignment: AlignmentDirectional.centerEnd,
                    padding: const EdgeInsetsDirectional.only(end: 24),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.errorContainer,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Icon(
                      Icons.delete_outline,
                      color: Theme.of(context).colorScheme.onErrorContainer,
                    ),
                  ),
                  child: PropertyCard(
                    property: property,
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => PropertyScreen(idOrSlug: property.slug, preview: property),
                      ),
                    ),
                  ),
                );
              },
            ),
    );
  }
}
