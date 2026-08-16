import type { Metadata } from 'next';

import { CompoundCard } from '@/components/catalog/compound-card';
import { T } from '@/components/i18n/t';
import { PageHeader } from '@/components/layout/page-header';
import { api } from '@/lib/api';
import type { Compound } from '@/types/catalog';

export const metadata: Metadata = {
  title: 'Compounds in Egypt',
  description:
    'Browse gated compounds across New Cairo, Sheikh Zayed, the North Coast and the New Administrative Capital, with starting prices, payment plans and handover years.',
  alternates: { canonical: '/compounds' },
};

export const revalidate = 300;

interface CompoundsPageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function CompoundsPage({ searchParams }: CompoundsPageProps) {
  const { q } = await searchParams;
  const term = q?.trim();

  const compounds = await api
    .get<Compound[]>('/compounds', {
      query: { limit: 60, sort: 'name', ...(term ? { q: term } : {}) },
    })
    .catch(() => [] as Compound[]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 lg:px-6">
      <PageHeader
        eyebrow={<T en="Masterplans" ar="المخططات العامة" />}
        title={<T en="Compounds" ar="الكمبوندات" />}
        lede={
          <T
            en="Every gated community on Nawy, with what units start at and when the developer hands over."
            ar="كل الكمبوندات المغلقة على ناوي، مع سعر بداية الوحدات وموعد التسليم."
          />
        }
        count={compounds.length}
        countLabel={<T en="compounds" ar="كمبوند" />}
      />

      {compounds.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">
          {term ? (
            <>
              <T en="No compounds match" ar="لا توجد كمبوندات تطابق" /> “{term}”.
            </>
          ) : (
            <T en="No compounds are available right now." ar="لا توجد كمبوندات متاحة حاليًا." />
          )}
        </p>
      ) : (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {compounds.map((compound, index) => (
            <CompoundCard key={compound.id} compound={compound} priority={index < 3} />
          ))}
        </div>
      )}
    </div>
  );
}
