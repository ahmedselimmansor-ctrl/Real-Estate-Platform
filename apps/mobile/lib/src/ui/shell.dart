import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../l10n/strings.dart';
import '../state/controllers.dart';
import 'chat/chat_screen.dart';
import 'favorites/favorites_screen.dart';
import 'home/home_screen.dart';
import 'search/search_screen.dart';
import 'sell/sell_screen.dart';

/// The five destinations, kept alive across taps.
///
/// An IndexedStack rather than swapping the body: switching tabs should not
/// discard a half-scrolled results list or a conversation in progress.
class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final favorites = context.watch<FavoritesController>();

    return Scaffold(
      body: IndexedStack(
        index: _index,
        children: const [
          HomeScreen(),
          SearchScreen(),
          SellScreen(),
          FavoritesScreen(),
          ChatScreen(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (index) => setState(() => _index = index),
        destinations: [
          NavigationDestination(
            icon: const Icon(Icons.home_outlined),
            selectedIcon: const Icon(Icons.home),
            label: strings.home,
          ),
          NavigationDestination(
            icon: const Icon(Icons.search),
            selectedIcon: const Icon(Icons.search),
            label: strings.search,
          ),
          NavigationDestination(
            icon: const Icon(Icons.sell_outlined),
            selectedIcon: const Icon(Icons.sell),
            label: strings.sell,
          ),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: favorites.count > 0,
              label: Text('${favorites.count}'),
              child: const Icon(Icons.favorite_border),
            ),
            selectedIcon: const Icon(Icons.favorite),
            label: strings.favorites,
          ),
          NavigationDestination(
            icon: const Icon(Icons.forum_outlined),
            selectedIcon: const Icon(Icons.forum),
            label: strings.chat,
          ),
        ],
      ),
    );
  }
}
