import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/property.dart';

/// Which language the app is in, and therefore its text direction.
///
/// Persisted so a returning Arabic user is not shown English on every launch.
class LocaleController extends ChangeNotifier {
  LocaleController(this._prefs) : _locale = _prefs.getString(_key) == 'ar' ? 'ar' : 'en';

  static const String _key = 'topchoice.locale';

  final SharedPreferences _prefs;
  String _locale;

  String get locale => _locale;
  bool get isArabic => _locale == 'ar';

  Future<void> toggle() => set(isArabic ? 'en' : 'ar');

  Future<void> set(String value) async {
    final next = value == 'ar' ? 'ar' : 'en';
    if (next == _locale) return;
    _locale = next;
    notifyListeners();
    await _prefs.setString(_key, next);
  }
}

/// Saved listings.
///
/// Stored locally rather than only on the server: saving is the first thing a
/// browsing user does and demanding an account for it loses the save. The
/// snapshot of each property is kept too, so the list renders offline instead
/// of showing a column of spinners.
class FavoritesController extends ChangeNotifier {
  FavoritesController(this._prefs) {
    _restore();
  }

  static const String _key = 'topchoice.favorites';

  final SharedPreferences _prefs;
  final Map<String, Property> _byId = {};

  List<Property> get all => _byId.values.toList().reversed.toList();
  int get count => _byId.length;
  bool contains(String id) => _byId.containsKey(id);

  void _restore() {
    final raw = _prefs.getString(_key);
    if (raw == null || raw.isEmpty) return;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return;
      for (final entry in decoded.whereType<Map<String, dynamic>>()) {
        final property = Property.fromJson(entry);
        if (property.id.isNotEmpty) _byId[property.id] = property;
      }
    } catch (_) {
      // A corrupt store is not worth crashing over; start clean.
      unawaited(_prefs.remove(_key));
    }
  }

  /// Returns true when the property ended up saved.
  Future<bool> toggle(Property property) async {
    final wasSaved = _byId.remove(property.id) != null;
    if (!wasSaved) _byId[property.id] = property;
    notifyListeners();
    await _persist();
    return !wasSaved;
  }

  Future<void> remove(String id) async {
    if (_byId.remove(id) == null) return;
    notifyListeners();
    await _persist();
  }

  Future<void> _persist() async {
    // Only what is needed to redraw a card, not the whole document.
    final payload = _byId.values
        .map((p) => {
              'id': p.id,
              'slug': p.slug,
              'referenceNo': p.referenceNo,
              'title': {'en': p.title.en, 'ar': p.title.ar},
              'propertyType': p.propertyType,
              'saleType': p.saleType,
              'status': p.status,
              'finishing': p.finishing,
              'price': {'amount': p.price.amount, 'currency': p.price.currency},
              'specs': {
                'bedrooms': p.specs.bedrooms,
                'bathrooms': p.specs.bathrooms,
                'areaSqm': p.specs.areaSqm,
              },
              'paymentPlan': {
                'downPaymentPercent': p.plan.downPaymentPercent,
                'installmentYears': p.plan.installmentYears,
                'monthlyInstallment': p.plan.monthlyInstallment,
                'deliveryDate': p.plan.deliveryDate,
              },
              'location': {'areaName': p.location.areaName, 'city': p.location.city},
              'images': p.images,
              if (p.compound != null)
                'compound': {
                  'id': p.compound!.id,
                  'name': p.compound!.name,
                  'slug': p.compound!.slug,
                },
            },)
        .toList();

    await _prefs.setString(_key, jsonEncode(payload));
  }
}
