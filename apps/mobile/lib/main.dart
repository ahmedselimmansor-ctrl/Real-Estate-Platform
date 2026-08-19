import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'src/app.dart';
import 'src/core/api_client.dart';
import 'src/data/chat_repository.dart';
import 'src/data/repositories.dart';
import 'src/state/controllers.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Preferences are read before the first frame so the app opens in the
  // language the user last chose, rather than flashing English and switching.
  final prefs = await SharedPreferences.getInstance();
  final api = ApiClient();

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => LocaleController(prefs)),
        ChangeNotifierProvider(create: (_) => FavoritesController(prefs)),
        Provider<ApiClient>.value(value: api),
        Provider(create: (_) => PropertiesRepository(api)),
        Provider(create: (_) => SearchRepository(api)),
        Provider(create: (_) => CatalogRepository(api)),
        Provider(create: (_) => LeadsRepository(api)),
        Provider(create: (_) => ReportsRepository(api)),
        Provider(create: (_) => ChatRepository(api)),
      ],
      child: const TopChoiceApp(),
    ),
  );
}
