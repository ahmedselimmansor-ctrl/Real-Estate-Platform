import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../data/repositories.dart';
import '../../l10n/strings.dart';
import '../../models/catalog.dart';
import '../../models/property.dart';
import '../../models/search.dart';
import '../../state/controllers.dart';
import '../../theme/theme.dart';
import '../calculator/calculator_screen.dart';
import '../property/property_screen.dart';
import '../search/search_screen.dart';
import '../sell/sell_screen.dart';
import '../widgets/property_card.dart';
import '../widgets/remote_image.dart';
import '../widgets/states.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late Future<_HomeData> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<_HomeData> _load() async {
    final properties = context.read<PropertiesRepository>();
    final catalog = context.read<CatalogRepository>();

    // One await for all three: the home screen is useless until it has the
    // lot, and three sequential round trips on a mobile link is a visible wait.
    final results = await Future.wait([
      properties.list(limit: 6, featuredOnly: true),
      catalog.areas(),
      catalog.developers(),
    ]);

    return _HomeData(
      featured: (results[0] as dynamic).items as List<Property>,
      areas: results[1] as List<Area>,
      developers: results[2] as List<Developer>,
    );
  }

  Future<void> _refresh() async {
    final future = _load();
    setState(() => _future = future);
    await future;
  }

  void _openSearch({SearchFilters? filters}) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => SearchScreen(initialFilters: filters ?? const SearchFilters()),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<_HomeData>(
          future: _future,
          builder: (context, snapshot) {
            return CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                _HeroHeader(onSearchTap: () => _openSearch()),
                const _QuickActions(),
                if (snapshot.connectionState == ConnectionState.waiting)
                  const SliverPadding(
                    padding: EdgeInsets.all(16),
                    sliver: SliverToBoxAdapter(child: LoadingCards()),
                  )
                else if (snapshot.hasError)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: ErrorState(error: snapshot.error!, onRetry: _refresh),
                  )
                else if (snapshot.hasData) ...[
                  _SectionHeader(
                    title: strings.featuredListings,
                    actionLabel: strings.viewAll,
                    onAction: () => _openSearch(),
                  ),
                  SliverPadding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    sliver: SliverList.separated(
                      itemCount: snapshot.data!.featured.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 16),
                      itemBuilder: (context, index) {
                        final property = snapshot.data!.featured[index];
                        return PropertyCard(
                          property: property,
                          onTap: () => Navigator.of(context).push(
                            MaterialPageRoute<void>(
                              builder: (_) =>
                                  PropertyScreen(idOrSlug: property.slug, preview: property),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                  if (snapshot.data!.areas.isNotEmpty) ...[
                    _SectionHeader(title: strings.browseByArea),
                    _AreaStrip(
                      areas: snapshot.data!.areas,
                      onTap: (area) => _openSearch(filters: SearchFilters(areaIds: [area.id])),
                    ),
                  ],
                  if (snapshot.data!.developers.isNotEmpty) ...[
                    _SectionHeader(title: strings.topDevelopers),
                    _DeveloperStrip(developers: snapshot.data!.developers),
                  ],
                  const SliverToBoxAdapter(child: SizedBox(height: 24)),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}

/// Sell and the calculator: the two non-browsing jobs, given a place where
/// they are found rather than buried behind a tab a browsing user never taps.
class _QuickActions extends StatelessWidget {
  const _QuickActions();

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);

    return SliverPadding(
      padding: const EdgeInsets.fromLTRB(16, 44, 16, 0),
      sliver: SliverToBoxAdapter(
        child: Row(
          children: [
            Expanded(
              child: _Action(
                icon: Icons.sell_outlined,
                label: strings.sell,
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(builder: (_) => const SellScreen()),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _Action(
                icon: Icons.calculate_outlined,
                label: strings.calculator,
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(builder: (_) => const CalculatorScreen()),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Action extends StatelessWidget {
  const _Action({required this.icon, required this.label, required this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
          child: Row(
            children: [
              Icon(icon, size: 20, color: scheme.primary),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HomeData {
  const _HomeData({required this.featured, required this.areas, required this.developers});

  final List<Property> featured;
  final List<Area> areas;
  final List<Developer> developers;
}

/// The hero: a photograph with the search entry point sitting on its lower
/// edge, so the first thing in reach of a thumb is the thing most people came
/// to do.
class _HeroHeader extends StatelessWidget {
  const _HeroHeader({required this.onSearchTap});

  final VoidCallback onSearchTap;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final locale = context.watch<LocaleController>();

    return SliverToBoxAdapter(
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          SizedBox(
            height: 260,
            width: double.infinity,
            child: Stack(
              fit: StackFit.expand,
              children: [
                const RemoteImage(url: ''),
                const DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [AppColors.petrol, AppColors.ink],
                    ),
                  ),
                ),
                SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const _BrandMark(),
                            const SizedBox(width: 8),
                            const Text(
                              'TopChoice',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 17,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const Spacer(),
                            TextButton(
                              onPressed: locale.toggle,
                              style: TextButton.styleFrom(foregroundColor: Colors.white),
                              child: Text(strings.language),
                            ),
                          ],
                        ),
                        const Spacer(),
                        Text(
                          strings.heroTitle,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 28,
                            fontWeight: FontWeight.w700,
                            height: 1.15,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          strings.heroSubtitle,
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.86),
                            fontSize: 13.5,
                          ),
                        ),
                        const SizedBox(height: 44),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          PositionedDirectional(
            start: 16,
            end: 16,
            bottom: -26,
            child: Material(
              elevation: 6,
              borderRadius: BorderRadius.circular(14),
              shadowColor: Colors.black26,
              child: InkWell(
                onTap: onSearchTap,
                borderRadius: BorderRadius.circular(14),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                  child: Row(
                    children: [
                      Icon(Icons.search, color: Theme.of(context).colorScheme.onSurfaceVariant),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          strings.searchPlaceholder,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// The roof-and-check mark, matching the web wordmark.
class _BrandMark extends StatelessWidget {
  const _BrandMark();

  @override
  Widget build(BuildContext context) => Container(
        width: 28,
        height: 28,
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.16),
          borderRadius: BorderRadius.circular(8),
        ),
        child: const Icon(Icons.check, color: Colors.white, size: 17),
      );
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, this.actionLabel, this.onAction});

  final String title;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) => SliverToBoxAdapter(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 40, 8, 12),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  title,
                  style: Theme.of(context)
                      .textTheme
                      .titleMedium
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              if (actionLabel != null) TextButton(onPressed: onAction, child: Text(actionLabel!)),
            ],
          ),
        ),
      );
}

class _AreaStrip extends StatelessWidget {
  const _AreaStrip({required this.areas, required this.onTap});

  final List<Area> areas;
  final void Function(Area) onTap;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    return SliverToBoxAdapter(
      child: SizedBox(
        height: 120,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          itemCount: areas.length,
          separatorBuilder: (_, __) => const SizedBox(width: 12),
          itemBuilder: (context, index) {
            final area = areas[index];
            return SizedBox(
              width: 160,
              child: Card(
                child: InkWell(
                  onTap: () => onTap(area),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      RemoteImage(url: area.heroImage ?? ''),
                      const DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [Colors.transparent, Color(0xCC0A1C22)],
                          ),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(10),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.end,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              area.name.pick(strings.locale),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w700,
                                fontSize: 14,
                              ),
                            ),
                            Text(
                              strings.resultCount(area.propertyCount),
                              style: TextStyle(
                                color: Colors.white.withValues(alpha: 0.85),
                                fontSize: 11.5,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _DeveloperStrip extends StatelessWidget {
  const _DeveloperStrip({required this.developers});

  final List<Developer> developers;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    return SliverToBoxAdapter(
      child: SizedBox(
        height: 104,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          itemCount: developers.length,
          separatorBuilder: (_, __) => const SizedBox(width: 12),
          itemBuilder: (context, index) {
            final developer = developers[index];
            return SizedBox(
              width: 108,
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(10),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      ClipOval(
                        child: SizedBox(
                          width: 42,
                          height: 42,
                          child: RemoteImage(url: developer.logoUrl ?? ''),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        developer.name.pick(strings.locale),
                        maxLines: 2,
                        textAlign: TextAlign.center,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
