import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/formatting.dart';
import '../../l10n/strings.dart';
import '../../models/property.dart';
import '../../state/controllers.dart';
import '../../theme/theme.dart';
import 'instalment_ledger.dart';
import 'remote_image.dart';

/// A listing, as it appears in every list in the app.
///
/// Leads with the plan rather than only the price: a buyer here shops on the
/// monthly, and two units at the same price with different plans are not the
/// same offer.
class PropertyCard extends StatelessWidget {
  const PropertyCard({super.key, required this.property, this.onTap, this.compact = false});

  final Property property;
  final VoidCallback? onTap;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;
    final favorites = context.watch<FavoritesController>();
    final isSaved = favorites.contains(property.id);

    return Card(
      child: InkWell(
        onTap: onTap,
        child: Column(
          // The card is as tall as its content. Without this it stretches to
          // fill a bounded parent and the aspect-ratio image pushes the text
          // past the bottom edge.
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Stack(
              children: [
                AspectRatio(
                  aspectRatio: 16 / 10,
                  child: RemoteImage(url: property.primaryImage),
                ),
                if (property.isFeatured)
                  PositionedDirectional(
                    start: 10,
                    top: 10,
                    child: _Pill(
                      label: strings.pick('Featured', 'مميز'),
                      background: AppColors.featured,
                      foreground: Colors.white,
                    ),
                  ),
                PositionedDirectional(
                  end: 4,
                  top: 4,
                  child: IconButton(
                    onPressed: () async {
                      final saved = await favorites.toggle(property);
                      if (!context.mounted) return;
                      ScaffoldMessenger.of(context)
                        ..clearSnackBars()
                        ..showSnackBar(
                          SnackBar(
                            content: Text(saved ? strings.saved : strings.removed),
                            duration: const Duration(seconds: 2),
                          ),
                        );
                    },
                    icon: Icon(isSaved ? Icons.favorite : Icons.favorite_border),
                    color: isSaved ? AppColors.featured : Colors.white,
                    tooltip: strings.favorites,
                    style: IconButton.styleFrom(
                      backgroundColor: Colors.black.withValues(alpha: 0.28),
                    ),
                  ),
                ),
                if (property.plan.deliveryDate != null)
                  PositionedDirectional(
                    start: 10,
                    bottom: 10,
                    child: _Pill(
                      label:
                          '${strings.handover} ${Figures.quarter(property.plan.deliveryDate, locale: strings.locale)}',
                      background: Colors.black.withValues(alpha: 0.55),
                      foreground: Colors.white,
                    ),
                  ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    Money.full(property.price.amount, locale: strings.locale),
                    style: kFigureStyle.copyWith(fontSize: 18, color: scheme.onSurface),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    property.title.pick(strings.locale),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 13.5, color: scheme.onSurfaceVariant, height: 1.35),
                  ),
                  const SizedBox(height: 8),
                  _SpecRow(property: property),
                  if (!compact && property.plan.installmentYears > 0) ...[
                    const SizedBox(height: 12),
                    InstalmentLedger(price: property.price.amount, plan: property.plan),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SpecRow extends StatelessWidget {
  const _SpecRow({required this.property});

  final Property property;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;
    final specs = property.specs;

    final items = <(IconData, String)>[
      if (specs.bedrooms > 0)
        (Icons.bed_outlined, Figures.count(specs.bedrooms, locale: strings.locale)),
      if (specs.bathrooms > 0)
        (Icons.bathtub_outlined, Figures.count(specs.bathrooms, locale: strings.locale)),
      if (specs.areaSqm > 0)
        (Icons.straighten_outlined, Figures.area(specs.areaSqm, locale: strings.locale)),
    ];

    return Row(
      children: [
        for (final (icon, label) in items) ...[
          Icon(icon, size: 15, color: scheme.onSurfaceVariant),
          const SizedBox(width: 4),
          Text(
            label,
            style: kFigureStyle.copyWith(fontSize: 12.5, color: scheme.onSurfaceVariant),
          ),
          const SizedBox(width: 12),
        ],
        Expanded(
          child: Text(
            property.location.areaName,
            textAlign: TextAlign.end,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 12.5, color: scheme.onSurfaceVariant),
          ),
        ),
      ],
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.label, required this.background, required this.foreground});

  final String label;
  final Color background;
  final Color foreground;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(999)),
        child: Text(
          label,
          style: TextStyle(color: foreground, fontSize: 11, fontWeight: FontWeight.w600),
        ),
      );
}
