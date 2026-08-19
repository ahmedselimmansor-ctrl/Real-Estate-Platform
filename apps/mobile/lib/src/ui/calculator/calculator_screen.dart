import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/formatting.dart';
import '../../data/repositories.dart';
import '../../l10n/strings.dart';
import '../../models/mortgage.dart';
import '../../theme/theme.dart';
import '../widgets/states.dart';

/// What a unit costs per month.
///
/// Backed by reports-svc rather than doing the arithmetic locally: the finance
/// engine is the same one the brochures and the web calculator use, so the
/// figure a buyer sees here is the figure on the PDF an agent sends them.
class CalculatorScreen extends StatefulWidget {
  const CalculatorScreen({super.key, this.initialPrice});

  /// Prefilled when opened from a listing.
  final int? initialPrice;

  @override
  State<CalculatorScreen> createState() => _CalculatorScreenState();
}

class _CalculatorScreenState extends State<CalculatorScreen> {
  late double _price = (widget.initialPrice ?? 5000000).toDouble();
  double _downPercent = 10;
  double _years = 7;
  double _ratePercent = 0;

  MortgageQuote? _quote;
  Object? _error;
  bool _loading = false;
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    unawaited(_recalculate());
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  /// Sliders fire continuously; one request per frame would hammer the service
  /// and the answers would arrive out of order.
  void _scheduleRecalculate() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), _recalculate);
  }

  Future<void> _recalculate() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final quote = await context.read<ReportsRepository>().mortgage(
            price: _price.round(),
            downPaymentPercent: _downPercent,
            years: _years.round(),
            annualRatePercent: _ratePercent,
          );
      if (!mounted) return;
      setState(() {
        _quote = quote;
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

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);

    return Scaffold(
      appBar: AppBar(title: Text(strings.calculator)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
        children: [
          _Result(quote: _quote, loading: _loading, error: _error, onRetry: _recalculate),
          const SizedBox(height: 28),
          _Slider(
            label: strings.price,
            value: Money.compact(_price, locale: strings.locale),
            slider: Slider(
              value: _price,
              min: 500000,
              max: 60000000,
              divisions: 119,
              onChanged: (value) => setState(() => _price = value),
              onChangeEnd: (_) => _scheduleRecalculate(),
            ),
          ),
          _Slider(
            label: strings.downPayment,
            value: '${_downPercent.round()}%',
            slider: Slider(
              value: _downPercent,
              max: 60,
              divisions: 12,
              onChanged: (value) => setState(() => _downPercent = value),
              onChangeEnd: (_) => _scheduleRecalculate(),
            ),
          ),
          _Slider(
            label: strings.years,
            value: strings.pick('${_years.round()} years', '${_years.round()} سنوات'),
            slider: Slider(
              value: _years,
              min: 1,
              max: 15,
              divisions: 14,
              onChanged: (value) => setState(() => _years = value),
              onChangeEnd: (_) => _scheduleRecalculate(),
            ),
          ),
          _Slider(
            label: strings.interestRate,
            value:
                _ratePercent == 0 ? strings.developerPlan : '${_ratePercent.toStringAsFixed(1)}%',
            slider: Slider(
              value: _ratePercent,
              max: 30,
              divisions: 60,
              onChanged: (value) => setState(() => _ratePercent = value),
              onChangeEnd: (_) => _scheduleRecalculate(),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            strings.calculatorNote,
            style: TextStyle(
              fontSize: 12,
              color: Theme.of(context).colorScheme.onSurfaceVariant,
              height: 1.4,
            ),
          ),
        ],
      ),
    );
  }
}

class _Result extends StatelessWidget {
  const _Result({
    required this.quote,
    required this.loading,
    required this.error,
    required this.onRetry,
  });

  final MortgageQuote? quote;
  final bool loading;
  final Object? error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;

    if (error != null && quote == null) {
      return SizedBox(height: 220, child: ErrorState(error: error!, onRetry: onRetry));
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            Text(
              strings.monthly.toUpperCase(),
              style: TextStyle(
                fontSize: 11,
                letterSpacing: 0.8,
                fontWeight: FontWeight.w700,
                color: scheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 6),
            // The figure stays put while a new one is fetched; blanking it on
            // every slider nudge makes the screen feel broken.
            AnimatedOpacity(
              opacity: loading ? 0.45 : 1,
              duration: const Duration(milliseconds: 150),
              child: Text(
                quote == null ? '—' : Money.full(quote!.monthlyPayment, locale: strings.locale),
                style: kFigureStyle.copyWith(fontSize: 30, color: scheme.primary),
              ),
            ),
            if (quote != null) ...[
              const SizedBox(height: 18),
              const Divider(),
              const SizedBox(height: 14),
              _Row(
                label: strings.downPayment,
                value: Money.full(quote!.downPayment, locale: strings.locale),
              ),
              _Row(
                label: strings.financed,
                value: Money.full(quote!.principal, locale: strings.locale),
              ),
              _Row(
                label: strings.totalInterest,
                value: quote!.isInterestFree
                    ? strings.developerPlan
                    : Money.full(quote!.totalInterest, locale: strings.locale),
              ),
              _Row(
                label: strings.totalCost,
                value: Money.full(quote!.totalCost, locale: strings.locale),
                emphasised: true,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.value, this.emphasised = false});

  final String label;
  final String value;
  final bool emphasised;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 5),
        child: Row(
          children: [
            Expanded(
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 13,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                  fontWeight: emphasised ? FontWeight.w600 : null,
                ),
              ),
            ),
            Text(
              value,
              style: kFigureStyle.copyWith(fontSize: emphasised ? 15 : 13.5),
            ),
          ],
        ),
      );
}

class _Slider extends StatelessWidget {
  const _Slider({required this.label, required this.value, required this.slider});

  final String label;
  final String value;
  final Widget slider;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
                ),
                Text(value, style: kFigureStyle.copyWith(fontSize: 14)),
              ],
            ),
            slider,
          ],
        ),
      );
}
