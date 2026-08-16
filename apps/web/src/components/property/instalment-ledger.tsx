import { cn } from '@/lib/utils';
import { formatCompactEGP, formatEGP } from '@/lib/format';
import type { Locale } from '@/types/enums';

export interface InstalmentLedgerProps {
  price: number;
  downPaymentPercent: number;
  installmentYears: number;
  /** ISO date. Rendered as the handover marker at the end of the run. */
  deliveryDate?: string | null;
  monthlyInstallment?: number | null;
  locale?: Locale;
  /**
   * `bar` is the micro form used on cards: a single ledger strip.
   * `detail` adds the figures underneath, for a listing page or the hero.
   */
  variant?: 'bar' | 'detail';
  className?: string;
}

/**
 * A payment plan drawn as a schedule.
 *
 * Egyptian primary sales are sold on the plan, not the sticker price, so the
 * plan gets a shape of its own: a solid down-payment block, a ticked run of
 * instalments, and the handover marker. The proportions are real, the block is
 * sized by the actual deposit percentage.
 */
export function InstalmentLedger({
  price,
  downPaymentPercent,
  installmentYears,
  deliveryDate,
  monthlyInstallment,
  locale = 'en',
  variant = 'bar',
  className,
}: InstalmentLedgerProps) {
  const down = Math.min(60, Math.max(0, downPaymentPercent));
  const handover = 6;
  const run = Math.max(0, 100 - down - handover);

  const monthly =
    monthlyInstallment ??
    (installmentYears > 0
      ? Math.round((price * (1 - down / 100)) / (installmentYears * 12))
      : 0);

  const deliveryYear = deliveryDate ? new Date(deliveryDate).getUTCFullYear() : null;

  return (
    <div className={cn('w-full', className)}>
      <div
        className="ledger"
        role="img"
        aria-label={`${down}% down, then ${installmentYears} years of instalments${
          deliveryYear ? `, handover ${deliveryYear}` : ''
        }`}
      >
        <span className="ledger-down" style={{ width: `${down}%` }} />
        <span className="ledger-run" style={{ width: `${run}%` }} />
        <span className="ledger-handover" style={{ width: `${handover}%` }} />
      </div>

      {variant === 'detail' ? (
        <dl className="mt-3 grid grid-cols-3 gap-3">
          <div>
            <dt className="eyebrow">{locale === 'ar' ? 'المقدم' : 'Down'}</dt>
            <dd className="figure mt-1 text-sm text-foreground">
              {down}% · {formatCompactEGP((price * down) / 100, { locale })}
            </dd>
          </div>
          <div>
            <dt className="eyebrow">{locale === 'ar' ? 'شهريًا' : 'Monthly'}</dt>
            <dd className="figure mt-1 text-sm text-foreground">
              {formatEGP(monthly, { locale })}
            </dd>
          </div>
          <div>
            <dt className="eyebrow">{locale === 'ar' ? 'التسليم' : 'Handover'}</dt>
            <dd className="figure mt-1 text-sm text-foreground">
              {deliveryYear ?? (locale === 'ar' ? 'جاهزة' : 'Ready')}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="figure mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {down}% {locale === 'ar' ? 'مقدم' : 'down'} · {installmentYears}
            {locale === 'ar' ? 'س' : 'y'}
          </span>
          <span className="text-foreground">
            {formatCompactEGP(monthly, { locale })}/{locale === 'ar' ? 'ش' : 'mo'}
          </span>
        </p>
      )}
    </div>
  );
}
