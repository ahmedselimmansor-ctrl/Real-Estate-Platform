import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { T } from '@/components/i18n/t';
import { PageHeader } from '@/components/layout/page-header';
import { api } from '@/lib/api';
import { formatCompactEGP, formatNumber } from '@/lib/format';
import { routes } from '@/lib/routes';
import type { Area } from '@/types/catalog';

export const metadata: Metadata = {
  title: 'Areas in Egypt',
  description:
    'New Cairo, Sheikh Zayed, the North Coast, the New Administrative Capital and every other area on TopChoice, with listing counts and price per metre.',
  alternates: { canonical: '/areas' },
};

export const revalidate = 300;

export default async function AreasPage() {
  const areas = await api
    .get<Area[]>('/areas', { query: { limit: 40, sort: '-propertyCount' } })
    .catch(() => [] as Area[]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 lg:px-6">
      <PageHeader
        eyebrow={<T en="Where" ar="أين" />}
        title={<T en="Areas" ar="المناطق" />}
        lede={
          <T
            en="Sorted by how much is for sale. Price per metre is the quickest way to read an area."
            ar="مرتبة حسب حجم المعروض. سعر المتر هو أسرع طريقة لقراءة أي منطقة."
          />
        }
        count={areas.length}
        countLabel={<T en="areas" ar="منطقة" />}
      />

      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {areas.map((area, index) => (
          <Link
            key={area.id}
            href={routes.area(area.slug)}
            className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {area.heroImage ? (
              <Image
                src={area.heroImage}
                alt=""
                fill
                priority={index < 3}
                sizes="(max-width: 768px) 100vw, 33vw"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
            ) : null}

            {/* Ink wash so the type stays legible over any photograph. */}
            <div className="absolute inset-0 bg-gradient-to-t from-ink-950/85 via-ink-950/25 to-transparent" />

            <div className="absolute inset-x-0 bottom-0 p-4 text-white">
              <h2 className="display text-xl">
                <T en={area.nameEn} ar={area.nameAr} />
              </h2>
              <p className="figure mt-1 flex items-center gap-3 text-xs text-white/80">
                <span>
                  {formatNumber(area.propertyCount)} <T en="homes" ar="وحدة" />
                </span>
                {area.avgPricePerMeter ? (
                  <span>{formatCompactEGP(area.avgPricePerMeter)}/m²</span>
                ) : null}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
