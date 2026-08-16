'use client';

import { useEffect, useMemo, useState } from 'react';
import { Calculator } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { formatEGP, formatPercent } from '@/lib/format';
import { useMortgageCalculation } from '@/lib/queries';
import { useI18n } from '@/hooks/use-i18n';

interface MortgageCalculatorProps {
  price: number;
  defaultDownPaymentPercent?: number;
  defaultYears?: number;
  className?: string;
}

/**
 * Calls `reports-svc` for the amortisation so the browser and the PDF brochure
 * always quote the same numbers, with a local fallback while that request is in
 * flight (or if the service is unreachable).
 */
export function MortgageCalculator({
  price,
  defaultDownPaymentPercent = 10,
  defaultYears = 8,
  className,
}: MortgageCalculatorProps) {
  const { locale, pick } = useI18n();

  const [downPaymentPercent, setDownPaymentPercent] = useState(defaultDownPaymentPercent);
  const [years, setYears] = useState(defaultYears);
  const [rate, setRate] = useState(0);

  // `useMortgageCalculation` is a mutation (reports-svc exposes a POST), so it
  // is driven off a debounce rather than being a live query.
  const calculation = useMortgageCalculation();
  const inputs = useDebouncedValue(
    { price, downPaymentPercent, years, annualRatePercent: rate },
    350,
  );

  useEffect(() => {
    if (inputs.price > 0) {
      calculation.mutate(inputs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs.price, inputs.downPaymentPercent, inputs.years, inputs.annualRatePercent]);

  const data = calculation.data;
  const isError = calculation.isError;

  /** Same formula the Ruby engine uses — shown until the request resolves. */
  const local = useMemo(() => {
    const principal = price * (1 - downPaymentPercent / 100);
    const months = years * 12;
    if (months <= 0) return { principal, monthly: 0, totalInterest: 0 };

    if (rate <= 0) {
      return { principal, monthly: principal / months, totalInterest: 0 };
    }

    const monthlyRate = rate / 100 / 12;
    const factor = (1 + monthlyRate) ** months;
    const monthly = (principal * monthlyRate * factor) / (factor - 1);

    return { principal, monthly, totalInterest: monthly * months - principal };
  }, [price, downPaymentPercent, years, rate]);

  const monthly = data?.monthlyPayment ?? local.monthly;
  const principal = data?.loanAmount ?? local.principal;
  const totalInterest = data?.totalInterest ?? local.totalInterest;
  const downPaymentAmount = price - principal;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Calculator className="size-4 text-primary" />
          {pick('Payment calculator', 'حاسبة السداد')}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <Label>{pick('Down payment', 'المقدم')}</Label>
            <span className="text-sm font-medium tabular-nums">
              {formatPercent(downPaymentPercent, { locale })} ·{' '}
              {formatEGP(downPaymentAmount, { locale })}
            </span>
          </div>
          <Slider
            value={[downPaymentPercent]}
            onValueChange={([value]) => setDownPaymentPercent(value)}
            min={0}
            max={50}
            step={1}
            aria-label="Down payment percentage"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <Label>{pick('Instalment period', 'مدة التقسيط')}</Label>
            <span className="text-sm font-medium tabular-nums">
              {years} {pick(years === 1 ? 'year' : 'years', 'سنة')}
            </span>
          </div>
          <Slider
            value={[years]}
            onValueChange={([value]) => setYears(value)}
            min={1}
            max={15}
            step={1}
            aria-label="Instalment period in years"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="annual-rate">
            {pick('Annual interest rate (%)', 'سعر الفائدة السنوي (%)')}
            <span className="ms-1 font-normal text-muted-foreground">
{pick(', leave at 0 for a developer plan', '، اتركه صفرًا لخطة المطور')}
            </span>
          </Label>
          <Input
            id="annual-rate"
            type="number"
            min={0}
            max={40}
            step={0.25}
            value={rate}
            onChange={(event) => setRate(Number(event.target.value) || 0)}
          />
        </div>

        <div className="rounded-xl border bg-muted/40 p-4">
          <p className="eyebrow">{pick('Monthly payment', 'القسط الشهري')}</p>
          {calculation.isPending && !data ? (
            <Skeleton className="mt-1 h-8 w-40" />
          ) : (
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {formatEGP(Math.round(monthly), { locale })}
            </p>
          )}

          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">{pick('Financed', 'الممول')}</dt>
              <dd className="font-medium tabular-nums">
                {formatEGP(Math.round(principal), { locale })}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{pick('Total interest', 'إجمالي الفوائد')}</dt>
              <dd className="font-medium tabular-nums">
                {formatEGP(Math.round(totalInterest), { locale })}
              </dd>
            </div>
          </dl>
        </div>

        <p className="text-xs text-muted-foreground">
          {isError
            ? pick(
                'Showing an estimate, the calculation service is unavailable.',
                'هذا تقدير تقريبي، خدمة الحساب غير متاحة.',
              )
            : pick('Figures are indicative. The developer may revise prices and plans.', 'الأرقام استرشادية وقد يعدّل المطور الأسعار والخطط.')}
        </p>

        <Button variant="outline" className="w-full" asChild>
          <a href="/contact">{pick('Talk to a consultant', 'تحدث مع مستشار')}</a>
        </Button>
      </CardContent>
    </Card>
  );
}
