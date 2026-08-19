import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/formatting.dart';
import '../../data/repositories.dart';
import '../../l10n/strings.dart';
import '../../models/catalog.dart';
import '../../models/search.dart';
import '../../theme/theme.dart';
import '../search/search_screen.dart';
import '../widgets/remote_image.dart';
import '../widgets/states.dart';

/// Compounds: masterplans rather than single units.
///
/// A separate browse from search because buyers here shop two ways — "a
/// 3-bedroom under 10M" and "what's available in Mivida" — and the second is
/// a question about the development, not about any one listing.
class CompoundsScreen extends StatefulWidget {
  const CompoundsScreen({super.key});

  @override
  State<CompoundsScreen> createState() => _CompoundsScreenState();
}

class _CompoundsScreenState extends State<CompoundsScreen> {
  late Future<List<Compound>> _future;
  final TextEditingController _query = TextEditingController();
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    _future = context.read<CatalogRepository>().compounds();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _query.dispose();
    super.dispose();
  }

  void _search(String term) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      setState(() {
        _future = context.read<CatalogRepository>().compounds(q: term.trim());
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);

    return Scaffold(
      appBar: AppBar(title: Text(strings.compounds)),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: TextField(
              controller: _query,
              onChanged: _search,
              decoration: InputDecoration(
                hintText: strings.searchCompounds,
                prefixIcon: const Icon(Icons.search),
              ),
            ),
          ),
          Expanded(
            child: FutureBuilder<List<Compound>>(
              future: _future,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snapshot.hasError) {
                  return ErrorState(
                    error: snapshot.error!,
                    onRetry: () => setState(
                      () => _future = context.read<CatalogRepository>().compounds(),
                    ),
                  );
                }

                final compounds = snapshot.data ?? const [];
                if (compounds.isEmpty) {
                  return EmptyState(
                    icon: Icons.location_city_outlined,
                    title: strings.noCompounds,
                    body: strings.noResultsHint,
                  );
                }

                return ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                  itemCount: compounds.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 14),
                  itemBuilder: (context, index) => _CompoundCard(compound: compounds[index]),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

/// A compound leads with the two figures a buyer shops on: what units start
/// at, and when the developer hands over.
class _CompoundCard extends StatelessWidget {
  const _CompoundCard({required this.compound});

  final Compound compound;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;

    return Card(
      child: InkWell(
        // Its units are a filtered search, which is exactly what the compound
        // page would show anyway.
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (_) => SearchScreen(
              initialFilters: SearchFilters(compoundIds: [compound.id]),
            ),
          ),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Stack(
              children: [
                AspectRatio(
                  aspectRatio: 16 / 9,
                  child: RemoteImage(url: compound.primaryImage),
                ),
                if (compound.deliveryYear != null)
                  PositionedDirectional(
                    end: 10,
                    top: 10,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: AppColors.ochre,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        '${strings.handover} ${compound.deliveryYear}',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (compound.developerName != null)
                    Text(
                      compound.developerName!.pick(strings.locale).toUpperCase(),
                      style: TextStyle(
                        fontSize: 10.5,
                        letterSpacing: 0.6,
                        fontWeight: FontWeight.w700,
                        color: scheme.onSurfaceVariant,
                      ),
                    ),
                  const SizedBox(height: 3),
                  Text(
                    compound.name.pick(strings.locale),
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  if (compound.areaName != null) ...[
                    const SizedBox(height: 3),
                    Row(
                      children: [
                        Icon(Icons.place_outlined, size: 14, color: scheme.onSurfaceVariant),
                        const SizedBox(width: 4),
                        Text(
                          compound.areaName!.pick(strings.locale),
                          style: TextStyle(fontSize: 12.5, color: scheme.onSurfaceVariant),
                        ),
                      ],
                    ),
                  ],
                  const SizedBox(height: 12),
                  const Divider(height: 1),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: _Figure(
                          label: strings.unitsFrom,
                          value: compound.startingPrice == null
                              ? strings.onRequest
                              : Money.compact(compound.startingPrice, locale: strings.locale),
                        ),
                      ),
                      Expanded(
                        child: _Figure(
                          label: strings.paymentPlan,
                          value: '${compound.downPaymentPercent ?? 0}% / '
                              '${compound.installmentYears ?? 0}'
                              '${strings.pick('y', 'س')}',
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Figure extends StatelessWidget {
  const _Figure({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 2),
          Text(value, style: kFigureStyle.copyWith(fontSize: 14)),
        ],
      );
}
