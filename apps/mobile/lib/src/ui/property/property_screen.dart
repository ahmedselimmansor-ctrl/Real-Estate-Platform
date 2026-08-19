import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/formatting.dart';
import '../../data/repositories.dart';
import '../../l10n/strings.dart';
import '../../models/property.dart';
import '../../state/controllers.dart';
import '../../theme/theme.dart';
import '../widgets/instalment_ledger.dart';
import '../widgets/property_card.dart';
import '../widgets/remote_image.dart';
import '../calculator/calculator_screen.dart';
import '../widgets/states.dart';
import 'lead_sheet.dart';

/// A listing in full.
///
/// Takes an optional [preview] — the card the user tapped — so the page paints
/// its header and price instantly and fills in the rest when the detail
/// request lands. Waiting on a spinner for content already in hand is a
/// self-inflicted delay.
class PropertyScreen extends StatefulWidget {
  const PropertyScreen({super.key, required this.idOrSlug, this.preview});

  final String idOrSlug;
  final Property? preview;

  @override
  State<PropertyScreen> createState() => _PropertyScreenState();
}

class _PropertyScreenState extends State<PropertyScreen> {
  late Future<Property> _future;
  List<Property> _similar = const [];

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<Property> _load() async {
    final repository = context.read<PropertiesRepository>();
    final property = await repository.byIdOrSlug(widget.idOrSlug);

    unawaited(repository.recordView(property.id));
    // Similar units are a nicety: a failure here must not disturb the page.
    unawaited(() async {
      try {
        final items = await repository.similar(property.id);
        if (mounted) setState(() => _similar = items);
      } catch (_) {
        // Left empty on purpose.
      }
    }());

    return property;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: FutureBuilder<Property>(
        future: _future,
        builder: (context, snapshot) {
          final property = snapshot.data ?? widget.preview;

          if (property == null) {
            if (snapshot.hasError) {
              return Scaffold(
                appBar: AppBar(),
                body: ErrorState(
                  error: snapshot.error!,
                  onRetry: () => setState(() => _future = _load()),
                ),
              );
            }
            return const Scaffold(body: Center(child: CircularProgressIndicator()));
          }

          return _Content(
            property: property,
            similar: _similar,
            // Descriptions and amenities only exist on the full document.
            isPartial: !snapshot.hasData,
          );
        },
      ),
    );
  }
}

class _Content extends StatelessWidget {
  const _Content({required this.property, required this.similar, required this.isPartial});

  final Property property;
  final List<Property> similar;
  final bool isPartial;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;
    final favorites = context.watch<FavoritesController>();
    final isSaved = favorites.contains(property.id);

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            expandedHeight: 280,
            pinned: true,
            actions: [
              IconButton(
                onPressed: () => favorites.toggle(property),
                icon: Icon(isSaved ? Icons.favorite : Icons.favorite_border),
                color: isSaved ? AppColors.featured : null,
                tooltip: strings.favorites,
              ),
            ],
            flexibleSpace: FlexibleSpaceBar(
              background: _Gallery(images: property.images),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
            sliver: SliverList.list(
              children: [
                Text(
                  Money.full(property.price.amount, locale: strings.locale),
                  style: kFigureStyle.copyWith(fontSize: 26),
                ),
                if (property.price.perMeter != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      '${Money.full(property.price.perMeter, locale: strings.locale)} / '
                      '${strings.pick('m²', 'م²')}',
                      style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13),
                    ),
                  ),
                const SizedBox(height: 10),
                Text(
                  property.title.pick(strings.locale),
                  style: Theme.of(context)
                      .textTheme
                      .titleLarge
                      ?.copyWith(fontWeight: FontWeight.w700, height: 1.25),
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Icon(Icons.place_outlined, size: 16, color: scheme.onSurfaceVariant),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        [property.location.areaName, property.location.city]
                            .where((s) => s.isNotEmpty)
                            .join(', '),
                        style: TextStyle(color: scheme.onSurfaceVariant),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                _SpecGrid(property: property),
                if (property.plan.installmentYears > 0) ...[
                  const SizedBox(height: 24),
                  Row(
                    children: [
                      Expanded(child: _SectionTitle(strings.paymentPlan)),
                      TextButton.icon(
                        onPressed: () => Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) => CalculatorScreen(initialPrice: property.price.amount),
                          ),
                        ),
                        icon: const Icon(Icons.calculate_outlined, size: 18),
                        label: Text(strings.calculator),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  InstalmentLedger(
                    price: property.price.amount,
                    plan: property.plan,
                    detailed: true,
                  ),
                ],
                if (!property.description.isEmpty) ...[
                  const SizedBox(height: 24),
                  _SectionTitle(strings.overview),
                  const SizedBox(height: 8),
                  Text(
                    property.description.pick(strings.locale),
                    style: const TextStyle(height: 1.6, fontSize: 14),
                  ),
                ],
                if (property.amenities.isNotEmpty) ...[
                  const SizedBox(height: 24),
                  _SectionTitle(strings.amenities),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final amenity in property.amenities)
                        Chip(
                          label: Text(_amenityLabel(amenity)),
                          visualDensity: VisualDensity.compact,
                        ),
                    ],
                  ),
                ],
                if (isPartial)
                  const Padding(
                    padding: EdgeInsets.only(top: 24),
                    child: Center(child: CircularProgressIndicator()),
                  ),
                if (similar.isNotEmpty) ...[
                  const SizedBox(height: 28),
                  _SectionTitle(strings.similarProperties),
                  const SizedBox(height: 12),
                  SizedBox(
                    height: 330,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: similar.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 12),
                      itemBuilder: (context, index) => SizedBox(
                        width: 260,
                        child: PropertyCard(
                          property: similar[index],
                          compact: true,
                          onTap: () => Navigator.of(context).pushReplacement(
                            MaterialPageRoute<void>(
                              builder: (_) => PropertyScreen(
                                idOrSlug: similar[index].slug,
                                preview: similar[index],
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: _CallbackBar(property: property),
    );
  }

  /// `gym & fitness centre` reads better than the raw slug, and the seed uses
  /// stable kebab-case keys, so a light touch-up beats a translation table
  /// that would drift from the catalogue.
  String _amenityLabel(String slug) => slug
      .split('-')
      .map((word) => word.isEmpty ? word : '${word[0].toUpperCase()}${word.substring(1)}')
      .join(' ');
}

class _Gallery extends StatefulWidget {
  const _Gallery({required this.images});

  final List<String> images;

  @override
  State<_Gallery> createState() => _GalleryState();
}

class _GalleryState extends State<_Gallery> {
  final PageController _controller = PageController();
  int _index = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.images.isEmpty) return const RemoteImage(url: '');

    return Stack(
      fit: StackFit.expand,
      children: [
        PageView.builder(
          controller: _controller,
          itemCount: widget.images.length,
          onPageChanged: (index) => setState(() => _index = index),
          itemBuilder: (context, index) => RemoteImage(url: widget.images[index]),
        ),
        if (widget.images.length > 1)
          PositionedDirectional(
            bottom: 12,
            start: 0,
            end: 0,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (var i = 0; i < widget.images.length; i++)
                  Container(
                    width: i == _index ? 18 : 6,
                    height: 6,
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: i == _index ? 1 : 0.5),
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
              ],
            ),
          ),
      ],
    );
  }
}

class _SpecGrid extends StatelessWidget {
  const _SpecGrid({required this.property});

  final Property property;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final specs = property.specs;

    final entries = <({IconData icon, String label, String value})>[
      if (specs.bedrooms > 0)
        (
          icon: Icons.bed_outlined,
          label: strings.bedrooms,
          value: Figures.count(specs.bedrooms, locale: strings.locale)
        ),
      if (specs.bathrooms > 0)
        (
          icon: Icons.bathtub_outlined,
          label: strings.bathrooms,
          value: Figures.count(specs.bathrooms, locale: strings.locale)
        ),
      if (specs.areaSqm > 0)
        (
          icon: Icons.straighten_outlined,
          label: strings.area,
          value: Figures.area(specs.areaSqm, locale: strings.locale)
        ),
      if (specs.floor != null)
        (
          icon: Icons.stairs_outlined,
          label: strings.floor,
          value: Figures.count(specs.floor, locale: strings.locale)
        ),
      if ((specs.parkingSpots ?? 0) > 0)
        (
          icon: Icons.local_parking_outlined,
          label: strings.parking,
          value: Figures.count(specs.parkingSpots, locale: strings.locale)
        ),
      if (property.finishing != null)
        (
          icon: Icons.format_paint_outlined,
          label: strings.finishing,
          value: strings.finishingLabel(property.finishing!)
        ),
      if (property.referenceNo.isNotEmpty)
        (icon: Icons.tag, label: strings.reference, value: property.referenceNo),
    ];

    return Wrap(
      spacing: 12,
      runSpacing: 12,
      children: [
        for (final entry in entries)
          SizedBox(
            width: (MediaQuery.sizeOf(context).width - 32 - 12) / 2,
            child: Row(
              children: [
                Icon(entry.icon, size: 18, color: Theme.of(context).colorScheme.primary),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        entry.label,
                        style: TextStyle(
                          fontSize: 11,
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                      ),
                      Text(entry.value, style: kFigureStyle.copyWith(fontSize: 13.5)),
                    ],
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.title);

  final String title;

  @override
  Widget build(BuildContext context) => Text(
        title,
        style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
      );
}

/// The one action this page exists to produce.
class _CallbackBar extends StatelessWidget {
  const _CallbackBar({required this.property});

  final Property property;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    return Material(
      elevation: 8,
      color: Theme.of(context).colorScheme.surface,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      strings.monthly,
                      style: TextStyle(
                        fontSize: 11,
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                    Text(
                      Money.compact(
                        property.plan.monthlyFor(property.price.amount),
                        locale: strings.locale,
                      ),
                      style: kFigureStyle.copyWith(fontSize: 16),
                    ),
                  ],
                ),
              ),
              FilledButton.icon(
                onPressed: () => showModalBottomSheet<void>(
                  context: context,
                  isScrollControlled: true,
                  useSafeArea: true,
                  builder: (_) => LeadSheet(property: property),
                ),
                icon: const Icon(Icons.phone_in_talk_outlined, size: 18),
                label: Text(strings.requestCallback),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
