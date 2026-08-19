/// The figures reports-svc returns for a purchase.
///
/// The service nests them under `summary`; older shapes put them at the top
/// level, so both are accepted rather than rendering "about null per month".
class MortgageQuote {
  const MortgageQuote({
    required this.price,
    required this.downPayment,
    required this.principal,
    required this.months,
    required this.monthlyPayment,
    required this.totalInterest,
    required this.totalCost,
  });

  final double price;
  final double downPayment;
  final double principal;
  final int months;
  final double monthlyPayment;
  final double totalInterest;
  final double totalCost;

  factory MortgageQuote.fromJson(Map<String, dynamic> json) {
    final summary =
        json['summary'] is Map<String, dynamic> ? json['summary'] as Map<String, dynamic> : json;

    double number(String key) => (summary[key] as num?)?.toDouble() ?? 0;

    return MortgageQuote(
      price: number('price'),
      downPayment: number('downPayment'),
      principal: number('principal'),
      months: (summary['months'] as num?)?.toInt() ?? 0,
      monthlyPayment: number('monthlyPayment'),
      totalInterest: number('totalInterest'),
      totalCost: number('totalCost'),
    );
  }

  /// A developer instalment plan carries no interest, which is the normal case
  /// in the primary market and worth saying rather than showing "EGP 0".
  bool get isInterestFree => totalInterest <= 0;
}
