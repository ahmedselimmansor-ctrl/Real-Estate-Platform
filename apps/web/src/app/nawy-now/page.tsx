import type { Metadata } from 'next';
import Link from 'next/link';

import { T } from '@/components/i18n/t';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { routes } from '@/lib/routes';

export const metadata: Metadata = {
  title: 'Nawy Now',
  description:
    'Buy a resale unit outright, then settle with the seller through Nawy instead of chasing a cash buyer.',
  alternates: { canonical: '/nawy-now' },
};

const STEPS = [
  {
    titleEn: 'Pick the unit',
    titleAr: 'اختر الوحدة',
    bodyEn:
      'Any resale listing on Nawy is eligible. The price you see is the price the seller has agreed.',
    bodyAr: 'أي وحدة إعادة بيع على ناوي مؤهلة. السعر الذي تراه هو السعر الذي وافق عليه البائع.',
  },
  {
    titleEn: 'We settle in cash',
    titleAr: 'ندفع للبائع نقدًا',
    bodyEn:
      'Nawy pays the seller outright, so they are not waiting on a chain and the unit comes off the market.',
    bodyAr: 'يدفع ناوي للبائع نقدًا بالكامل، فلا ينتظر سلسلة مشترين وتخرج الوحدة من السوق.',
  },
  {
    titleEn: 'You pay us back',
    titleAr: 'تسدد لنا',
    bodyEn:
      'You take over on a plan that works for you, with the schedule agreed in writing before anything moves.',
    bodyAr: 'تتسلم الوحدة بخطة سداد تناسبك، ويُتفق على الجدول كتابيًا قبل أي خطوة.',
  },
];

export default function NawyNowPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 lg:px-6">
      <PageHeader
        eyebrow={<T en="Resale, without the chain" ar="إعادة بيع بلا انتظار" />}
        title={<T en="Nawy Now" ar="ناوي الآن" />}
        lede={
          <T
            en="Resale sellers want cash and buyers want a plan. Nawy Now bridges the two: we settle with the seller, and you repay on a schedule."
            ar="بائع إعادة البيع يريد نقدًا والمشتري يريد تقسيطًا. ناوي الآن يجمع بينهما: نسدد للبائع، وتسدد أنت على أقساط."
          />
        }
      />

      <ol className="mt-10 grid gap-4 sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.titleEn}>
            <Card className="h-full">
              <CardContent className="space-y-2 p-5">
                {/* The steps are a real sequence, so they are numbered. */}
                <p className="figure text-sm text-primary">
                  <T en="Step" ar="خطوة" /> {index + 1}
                </p>
                <h2 className="font-medium text-foreground">
                  <T en={step.titleEn} ar={step.titleAr} />
                </h2>
                <p className="text-sm text-muted-foreground">
                  <T en={step.bodyEn} ar={step.bodyAr} />
                </p>
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>

      <div className="mt-10 flex flex-wrap gap-3">
        <Button asChild>
          <Link href={routes.search({ saleType: 'resale' })}>
            <T en="Browse resale homes" ar="تصفح وحدات إعادة البيع" />
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={routes.contact}>
            <T en="Talk to a consultant" ar="تحدث مع مستشار" />
          </Link>
        </Button>
      </div>

      <p className="mt-8 text-xs text-muted-foreground">
        <T
          en="Eligibility and terms depend on the unit and are confirmed by a consultant before anything is agreed."
          ar="الأهلية والشروط تعتمد على الوحدة ويؤكدها المستشار قبل الاتفاق على أي شيء."
        />
      </p>
    </div>
  );
}
