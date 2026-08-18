import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../data/repositories.dart';
import '../../l10n/strings.dart';
import '../../models/property.dart';
import '../../models/search.dart';
import '../property/property_screen.dart';
import '../widgets/property_card.dart';
import '../widgets/states.dart';
import 'filter_sheet.dart';

/// Results, with the filter set that produced them.
///
/// Paginates as you scroll rather than showing a pager: on a phone the next
/// page is always "more of the same list", and a page control puts a decision
/// where none is needed.
class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key, this.initialFilters = const SearchFilters()});

  final SearchFilters initialFilters;

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final ScrollController _scroll = ScrollController();
  late final TextEditingController _query;
  late SearchFilters _filters;

  final List<Property> _results = [];
  int _page = 1;
  int _total = 0;
  bool _loading = false;
  bool _loadingMore = false;
  Object? _error;
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    _filters = widget.initialFilters;
    _query = TextEditingController(text: _filters.q ?? '');
    _scroll.addListener(_onScroll);
    unawaited(_run(reset: true));
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _scroll.dispose();
    _query.dispose();
    super.dispose();
  }

  void _onScroll() {
    // Fetch a page early rather than at the very bottom, so the list rarely
    // shows the user a spinner they have to wait at.
    if (_scroll.position.pixels >= _scroll.position.maxScrollExtent - 600) {
      unawaited(_loadMore());
    }
  }

  Future<void> _run({bool reset = false}) async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
      if (reset) {
        _results.clear();
        _page = 1;
      }
    });

    try {
      final response = await context.read<SearchRepository>().search(_filters, page: _page);
      if (!mounted) return;
      setState(() {
        _results.addAll(response.results);
        _total = response.total;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error;
        _loading = false;
      });
    }
  }

  Future<void> _loadMore() async {
    if (_loading || _loadingMore || _results.length >= _total) return;
    setState(() => _loadingMore = true);
    _page++;
    try {
      final response = await context.read<SearchRepository>().search(_filters, page: _page);
      if (!mounted) return;
      setState(() {
        _results.addAll(response.results);
        _loadingMore = false;
      });
    } catch (_) {
      if (!mounted) return;
      // A failed page is not a failed search; keep what is on screen.
      setState(() {
        _page--;
        _loadingMore = false;
      });
    }
  }

  void _onQueryChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      _filters = _filters.copyWith(q: value);
      unawaited(_run(reset: true));
    });
  }

  Future<void> _openFilters() async {
    final updated = await showModalBottomSheet<SearchFilters>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => FilterSheet(filters: _filters),
    );
    if (updated == null || !mounted) return;
    _filters = updated;
    unawaited(_run(reset: true));
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final activeCount = _filters.activeCount;

    return Scaffold(
      appBar: AppBar(
        title: TextField(
          controller: _query,
          onChanged: _onQueryChanged,
          textInputAction: TextInputAction.search,
          decoration: InputDecoration(
            hintText: strings.searchPlaceholder,
            prefixIcon: const Icon(Icons.search),
            isDense: true,
            filled: false,
            border: InputBorder.none,
            enabledBorder: InputBorder.none,
            focusedBorder: InputBorder.none,
          ),
        ),
        actions: [
          Padding(
            padding: const EdgeInsetsDirectional.only(end: 8),
            child: Badge(
              isLabelVisible: activeCount > 0,
              label: Text('$activeCount'),
              child: IconButton(
                onPressed: _openFilters,
                icon: const Icon(Icons.tune),
                tooltip: strings.filters,
              ),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          if (!_loading && _error == null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
              child: Row(
                children: [
                  Text(
                    strings.resultCount(_total),
                    style: Theme.of(context).textTheme.labelLarge,
                  ),
                  const Spacer(),
                  DropdownButton<String>(
                    value: _filters.sort,
                    underline: const SizedBox.shrink(),
                    isDense: true,
                    onChanged: (value) {
                      if (value == null) return;
                      _filters = _filters.copyWith(sort: value);
                      unawaited(_run(reset: true));
                    },
                    items: [
                      for (final sort in const [
                        'relevance',
                        'price_asc',
                        'price_desc',
                        'newest',
                        'area_desc',
                      ])
                        DropdownMenuItem(value: sort, child: Text(strings.sortLabel(sort))),
                    ],
                  ),
                ],
              ),
            ),
          Expanded(child: _body(strings)),
        ],
      ),
    );
  }

  Widget _body(Strings strings) {
    if (_loading && _results.isEmpty) {
      return const SingleChildScrollView(
        padding: EdgeInsets.all(16),
        child: LoadingCards(),
      );
    }

    if (_error != null && _results.isEmpty) {
      return ErrorState(error: _error!, onRetry: () => _run(reset: true));
    }

    if (_results.isEmpty) {
      return EmptyState(
        icon: Icons.search_off_outlined,
        title: strings.noResults,
        body: strings.noResultsHint,
        action: _filters.activeCount == 0
            ? null
            : FilledButton.tonal(
                onPressed: () {
                  _filters = SearchFilters(q: _filters.q);
                  unawaited(_run(reset: true));
                },
                child: Text(strings.reset),
              ),
      );
    }

    return ListView.separated(
      controller: _scroll,
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      itemCount: _results.length + (_loadingMore ? 1 : 0),
      separatorBuilder: (_, __) => const SizedBox(height: 16),
      itemBuilder: (context, index) {
        if (index >= _results.length) {
          return const Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Center(child: CircularProgressIndicator()),
          );
        }
        final property = _results[index];
        return PropertyCard(
          property: property,
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (_) => PropertyScreen(idOrSlug: property.slug, preview: property),
            ),
          ),
        );
      },
    );
  }
}
