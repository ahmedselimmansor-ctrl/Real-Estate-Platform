'use client';

import { useState } from 'react';

import { MortgageCalculator } from '@/components/property/mortgage-calculator';
import { T } from '@/components/i18n/t';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatEGP } from '@/lib/format';

/**
 * Standalone version of the calculator that sits on every listing page. Both
 * call reports-svc, so the figures here match a brochure exactly.
 */
export default function MortgageCalculatorPage() {
  const [price, setPrice] = useState(8_500_000);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 lg:px-6">
      <PageHeader
        eyebrow={<T en="Work out the schedule" ar="احسب خطة السداد" />}
        title={<T en="Payment calculator" ar="حاسبة السداد" />}
        lede={
          <T
            en="Set a price and a plan to see the monthly instalment. A developer plan carries no interest, so leave the rate at zero unless you are modelling a bank mortgage."
            ar="حدد السعر والخطة لترى القسط الشهري. خطة المطور بدون فوائد، لذا اترك النسبة صفرًا إلا إذا كنت تحسب تمويلًا بنكيًا."
          />
        }
      />

      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card className="h-fit">
          <CardContent className="space-y-4 p-6">
            <div className="space-y-1.5">
              <Label htmlFor="price">
                <T en="Property price (EGP)" ar="سعر الوحدة (ج.م)" />
              </Label>
              <Input
                id="price"
                type="number"
                min={100000}
                step={100000}
                value={price}
                onChange={(event) => setPrice(Number(event.target.value) || 0)}
                className="figure text-lg"
              />
              <p className="figure text-xs text-muted-foreground">{formatEGP(price)}</p>
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/40 p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">
                <T en="How Egyptian plans usually work" ar="كيف تعمل خطط السداد في مصر عادةً" />
              </p>
              <ul className="mt-2 space-y-1.5">
                <li>
                  <T en="Down payments run from 5% to 20% of the price." ar="المقدم يتراوح بين 5% و20% من السعر." />
                </li>
                <li>
                  <T en="Instalments are commonly quarterly over 6 to 10 years." ar="الأقساط غالبًا ربع سنوية على مدى 6 إلى 10 سنوات." />
                </li>
                <li>
                  <T en="A maintenance deposit of around 8% falls due at handover." ar="وديعة صيانة بنحو 8% تُستحق عند التسليم." />
                </li>
                <li>
                  <T en="Developer plans carry no interest; bank mortgages do." ar="خطط المطورين بدون فوائد، أما التمويل البنكي فبفوائد." />
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <MortgageCalculator price={price} />
      </div>
    </div>
  );
}
