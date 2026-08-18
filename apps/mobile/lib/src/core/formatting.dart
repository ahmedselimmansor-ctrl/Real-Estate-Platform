import 'package:intl/intl.dart';

/// Money and figures, in the shape Egyptian buyers read them.
///
/// Prices here run to eight digits, so the compact form is the default in
/// dense UI: "EGP 7.4M" is scannable in a card where "EGP 7,420,000" is not.
class Money {
  const Money._();

  static String full(num? amount, {String locale = 'en'}) {
    if (amount == null) return '';
    final format = NumberFormat.decimalPattern(locale == 'ar' ? 'ar_EG' : 'en');
    return locale == 'ar' ? '${format.format(amount)} ج.م' : 'EGP ${format.format(amount)}';
  }

  /// 7,420,000 -> "EGP 7.42M". Two significant decimals below 10M, one above,
  /// so the number stays four glyphs wide at any magnitude.
  static String compact(num? amount, {String locale = 'en'}) {
    if (amount == null) return '';
    final isAr = locale == 'ar';
    final unitM = isAr ? ' م' : 'M';
    final unitK = isAr ? ' ألف' : 'K';
    final currency = isAr ? ' ج.م' : 'EGP ';

    String number;
    String unit;
    if (amount.abs() >= 1000000) {
      final millions = amount / 1000000;
      number = millions >= 10 ? millions.toStringAsFixed(1) : millions.toStringAsFixed(2);
      unit = unitM;
    } else if (amount.abs() >= 1000) {
      number = (amount / 1000).toStringAsFixed(0);
      unit = unitK;
    } else {
      number = amount.toStringAsFixed(0);
      unit = '';
    }

    // Trim a trailing zero decimal: 7.40M reads worse than 7.4M.
    if (number.contains('.')) {
      number = number.replaceAll(RegExp(r'0+$'), '').replaceAll(RegExp(r'\.$'), '');
    }

    return isAr ? '$number$unit$currency' : '$currency$number$unit';
  }

  /// Monthly instalment, always compact and always suffixed.
  static String perMonth(num? amount, {String locale = 'en'}) {
    if (amount == null) return '';
    return locale == 'ar' ? '${compact(amount, locale: locale)}/شهر' : '${compact(amount)}/mo';
  }
}

/// Areas, bedrooms and other plain counts.
class Figures {
  const Figures._();

  static String area(num? sqm, {String locale = 'en'}) {
    if (sqm == null) return '';
    final value = NumberFormat.decimalPattern(locale == 'ar' ? 'ar_EG' : 'en').format(sqm);
    return locale == 'ar' ? '$value م²' : '$value m²';
  }

  static String count(num? value, {String locale = 'en'}) {
    if (value == null) return '';
    return NumberFormat.decimalPattern(locale == 'ar' ? 'ar_EG' : 'en').format(value);
  }

  /// "2026-03-31" -> "Q1 2026", which is how handover is actually quoted.
  static String quarter(String? isoDate, {String locale = 'en'}) {
    if (isoDate == null || isoDate.isEmpty) return '';
    final parsed = DateTime.tryParse(isoDate);
    if (parsed == null) return '';
    final quarter = ((parsed.month - 1) ~/ 3) + 1;
    return locale == 'ar' ? 'ر$quarter ${parsed.year}' : 'Q$quarter ${parsed.year}';
  }
}
