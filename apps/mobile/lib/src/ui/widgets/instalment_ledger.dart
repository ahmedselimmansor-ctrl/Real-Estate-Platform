import 'package:flutter/material.dart';

import '../../core/formatting.dart';
import '../../l10n/strings.dart';
import '../../models/property.dart';
import '../../theme/theme.dart';

/// A payment plan drawn as a schedule.
///
/// Egyptian primary sales are sold on the plan, not the sticker price, so the
/// plan gets a shape of its own: a solid down-payment block, a ticked run of
/// instalments, and the handover marker. The proportions are real — the block
/// is sized by the actual deposit percentage — so two plans can be compared by
/// glance alone.
class InstalmentLedger extends StatelessWidget {
  const InstalmentLedger({
    super.key,
    required this.price,
    required this.plan,
    this.detailed = false,
  });

  final int price;
  final PaymentPlan plan;

  /// `detailed` adds the figures underneath, for a listing page.
  final bool detailed;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;

    final down = plan.downPaymentPercent.clamp(0, 60).toDouble();
    const handover = 6.0;
    final run = (100 - down - handover).clamp(0.0, 100.0);
    final monthly = plan.monthlyFor(price);
    final deliveryYear = Figures.quarter(plan.deliveryDate, locale: strings.locale);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Semantics(
          label: strings.pick(
            '${plan.downPaymentPercent}% down, then ${plan.installmentYears} years of instalments',
            'مقدم ${plan.downPaymentPercent}% ثم ${plan.installmentYears} سنوات أقساط',
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: SizedBox(
              height: 8,
              child: Row(
                children: [
                  Expanded(
                    flex: (down * 10).round().clamp(1, 1000),
                    child: ColoredBox(color: scheme.primary),
                  ),
                  Expanded(
                    flex: (run * 10).round().clamp(1, 1000),
                    child: _InstalmentRun(color: scheme.primary.withValues(alpha: 0.28)),
                  ),
                  Expanded(
                    flex: (handover * 10).round(),
                    child: const ColoredBox(color: AppColors.ochre),
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 8),
        if (detailed)
          Row(
            children: [
              _Figure(
                label: strings.downPayment,
                value: '${plan.downPaymentPercent}% · '
                    '${Money.compact(price * plan.downPaymentPercent / 100, locale: strings.locale)}',
              ),
              _Figure(
                label: strings.monthly,
                value: Money.compact(monthly, locale: strings.locale),
              ),
              _Figure(
                label: strings.handover,
                value: deliveryYear.isEmpty ? strings.readyToMove : deliveryYear,
              ),
            ],
          )
        else
          DefaultTextStyle.merge(
            style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  strings.pick(
                    '${plan.downPaymentPercent}% down · ${plan.installmentYears}y',
                    'مقدم ${plan.downPaymentPercent}% · ${plan.installmentYears} سنوات',
                  ),
                  style: kFigureStyle.copyWith(fontSize: 12, color: scheme.onSurfaceVariant),
                ),
                Text(
                  Money.perMonth(monthly, locale: strings.locale),
                  style: kFigureStyle.copyWith(fontSize: 12, color: scheme.onSurface),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

/// The instalment stretch, ticked so it reads as a run of payments rather than
/// a plain progress bar.
class _InstalmentRun extends StatelessWidget {
  const _InstalmentRun({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) => CustomPaint(
        painter: _TickPainter(color: color, gap: Theme.of(context).colorScheme.surface),
        child: const SizedBox.expand(),
      );
}

class _TickPainter extends CustomPainter {
  const _TickPainter({required this.color, required this.gap});

  final Color color;
  final Color gap;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = color);

    // One tick every 6dp, which stays legible from a card-sized strip up to a
    // full-width detail header without needing a second design.
    final tick = Paint()
      ..color = gap
      ..strokeWidth = 1;
    for (double x = 6; x < size.width; x += 6) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), tick);
    }
  }

  @override
  bool shouldRepaint(_TickPainter oldDelegate) =>
      oldDelegate.color != color || oldDelegate.gap != gap;
}

class _Figure extends StatelessWidget {
  const _Figure({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label.toUpperCase(),
            style: TextStyle(
              fontSize: 10,
              letterSpacing: 0.6,
              fontWeight: FontWeight.w600,
              color: scheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 2),
          Text(value, style: kFigureStyle.copyWith(fontSize: 13)),
        ],
      ),
    );
  }
}
