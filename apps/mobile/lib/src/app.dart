import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';

import 'state/controllers.dart';
import 'theme/theme.dart';
import 'ui/shell.dart';

/// The root widget.
///
/// Locale drives both the copy and the text direction: choosing Arabic must
/// flip the whole layout, not merely translate it, or every leading edge in
/// the app ends up on the wrong side.
class TopChoiceApp extends StatelessWidget {
  const TopChoiceApp({super.key});

  @override
  Widget build(BuildContext context) {
    final locale = context.watch<LocaleController>();

    return MaterialApp(
      title: 'TopChoice',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      locale: Locale(locale.locale),
      supportedLocales: const [Locale('en'), Locale('ar')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: const AppShell(),
    );
  }
}
