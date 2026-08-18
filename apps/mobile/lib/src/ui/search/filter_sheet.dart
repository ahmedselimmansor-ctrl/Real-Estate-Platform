import 'package:flutter/material.dart';

import '../../core/formatting.dart';
import '../../l10n/strings.dart';
import '../../models/search.dart';

/// Price brackets that match how budgets are actually stated here, rather than
/// an even split of the range. Most stock sits under 15M, so the low end gets
/// the resolution.
const List<({int? min, int? max})> kPricePresets = [
  (min: null, max: 3000000),
  (min: 3000000, max: 6000000),
  (min: 6000000, max: 10000000),
  (min: 10000000, max: 15000000),
  (min: 15000000, max: 25000000),
  (min: 25000000, max: null),
];

const List<String> kPropertyTypes = [
  'apartment',
  'villa',
  'townhouse',
  'twinhouse',
  'duplex',
  'penthouse',
  'studio',
  'chalet',
];

/// The refinement sheet.
///
/// Edits a local copy and only returns it on Apply, so backing out of the
/// sheet leaves the current results alone. Half-applied filters are the most
/// common way a filter UI lies to the user about what they are looking at.
class FilterSheet extends StatefulWidget {
  const FilterSheet({super.key, required this.filters});

  final SearchFilters filters;

  @override
  State<FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<FilterSheet> {
  late SearchFilters _draft = widget.filters;

  void _toggleType(String type) {
    final next = [..._draft.propertyTypes];
    next.contains(type) ? next.remove(type) : next.add(type);
    setState(() => _draft = _draft.copyWith(propertyTypes: next));
  }

  void _toggleBedrooms(int count) {
    final next = [..._draft.bedrooms];
    next.contains(count) ? next.remove(count) : next.add(count);
    setState(() => _draft = _draft.copyWith(bedrooms: next));
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.85,
      maxChildSize: 0.95,
      builder: (context, controller) => Column(
        children: [
          const SizedBox(height: 8),
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.outlineVariant,
              borderRadius: BorderRadius.circular(999),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 12, 4),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    strings.filters,
                    style: Theme.of(context)
                        .textTheme
                        .titleLarge
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
                TextButton(
                  onPressed: () => setState(() => _draft = SearchFilters(q: _draft.q)),
                  child: Text(strings.reset),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: ListView(
              controller: controller,
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
              children: [
                _Group(
                  title: strings.propertyType,
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final type in kPropertyTypes)
                        FilterChip(
                          label: Text(strings.propertyTypeLabel(type)),
                          selected: _draft.propertyTypes.contains(type),
                          onSelected: (_) => _toggleType(type),
                        ),
                    ],
                  ),
                ),
                _Group(
                  title: strings.bedrooms,
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final count in const [1, 2, 3, 4, 5])
                        FilterChip(
                          label: Text(
                            count == 5
                                ? '${Figures.count(count, locale: strings.locale)}+'
                                : Figures.count(count, locale: strings.locale),
                          ),
                          selected: _draft.bedrooms.contains(count),
                          onSelected: (_) => _toggleBedrooms(count),
                        ),
                    ],
                  ),
                ),
                _Group(
                  title: strings.priceRange,
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      ChoiceChip(
                        label: Text(strings.anyPrice),
                        selected: _draft.minPrice == null && _draft.maxPrice == null,
                        onSelected: (_) =>
                            setState(() => _draft = _draft.copyWith(clearPrice: true)),
                      ),
                      for (final preset in kPricePresets)
                        ChoiceChip(
                          label: Text(_presetLabel(preset, strings)),
                          selected: _draft.minPrice == preset.min && _draft.maxPrice == preset.max,
                          onSelected: (_) => setState(
                            () => _draft = _draft
                                .copyWith(
                                  clearPrice: true,
                                )
                                .copyWith(minPrice: preset.min, maxPrice: preset.max),
                          ),
                        ),
                    ],
                  ),
                ),
                _Group(
                  title: strings.pick('Sale type', 'نوع البيع'),
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      ChoiceChip(
                        label: Text(strings.pick('Any', 'الكل')),
                        selected: _draft.saleType == null,
                        onSelected: (_) =>
                            setState(() => _draft = _draft.copyWith(clearSaleType: true)),
                      ),
                      for (final type in const ['primary', 'resale', 'rent'])
                        ChoiceChip(
                          label: Text(strings.saleTypeLabel(type)),
                          selected: _draft.saleType == type,
                          onSelected: (_) =>
                              setState(() => _draft = _draft.copyWith(saleType: type)),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () => Navigator.of(context).pop(_draft),
                  child: Text(
                    _draft.activeCount == 0
                        ? strings.apply
                        : '${strings.apply} (${_draft.activeCount})',
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _presetLabel(({int? min, int? max}) preset, Strings strings) {
    final locale = strings.locale;
    if (preset.min == null) {
      return strings.pick(
        'Under ${Money.compact(preset.max, locale: locale)}',
        'أقل من ${Money.compact(preset.max, locale: locale)}',
      );
    }
    if (preset.max == null) {
      return strings.pick(
        '${Money.compact(preset.min, locale: locale)}+',
        '${Money.compact(preset.min, locale: locale)}+',
      );
    }
    return '${Money.compact(preset.min, locale: locale)} - ${Money.compact(preset.max, locale: locale)}';
  }
}

class _Group extends StatelessWidget {
  const _Group({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 12),
            child,
          ],
        ),
      );
}
