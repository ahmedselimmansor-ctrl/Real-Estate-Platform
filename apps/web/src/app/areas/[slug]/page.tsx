import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CompoundCard } from '@/components/catalog/compound-card';
import { T } from '@/components/i18n/t';
import { PageHeader } from '@/components/layout/page-header';
import { PropertyCard } from '@/components/property/property-card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatCompactEGP, formatNumber } from '@/lib/format';
import { routes } from '@/lib/routes';
import type { Area, Compound } from '@/types/catalog';
import type { Property } from '@/types/property';

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function fetchArea(slug: string): Promise<Area | null> {
  return api
    .get<Area>(`/areas/${encodeURIComponent(slug)}`, {
      next: { revalidate: 300, tags: [`area:${slug}`] },
    })
    .catch(() => null);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const area = await fetchArea(slug);
  if (!area) return { title: 'Area not found' };

  return {
    title: `Property in ${area.nameEn}`,
    description:
      area.descriptionEn?.slice(0, 300) ??
      `Homes, compounds and price per metre in ${area.nameEn}, ${area.governorate}.`,
    alternates: { canonical: `/areas/${area.slug}` },
  };
}

export default async function AreaPage({ params }: PageProps) {
  const { slug } = await params;
  const area = await fetchArea(slug);
  if (!area) notFound();

  const [compounds, properties] = await Promise.all([
    api
      .get<Compound[]>('/compounds', { query: { areaId: area.id, limit: 6 } })
      .catch(() => [] as Compound[]),
    api
      .get<Property[]>('/properties', { query: { areaId: area.id, limit: 6 } })
      .catch(() => [] as Property[]),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 lg:px-6">
      <PageHeader
        eyebrow={`${area.city}, ${area.governorate}`}
        title={<T en={area.nameEn} ar={area.nameAr} />}
        lede={<T en={area.descriptionEn ?? ''} ar={area.descriptionAr ?? ''} />}
      >
        <dl className="figure mt-6 flex flex-wrap gap-x-10 gap-y-4">
          <div>
            <dt className="eyebrow">
              <T en="Homes listed" ar="وحدات معروضة" />
            </dt>
            <dd className="mt-1 text-2xl text-foreground">{formatNumber(area.propertyCount)}</dd>
          </div>
          {area.avgPricePerMeter ? (
            <div>
              <dt className="eyebrow">
                <T en="Average" ar="المتوسط" />
              </dt>
              <dd className="mt-1 text-2xl text-foreground">
                {formatCompactEGP(area.avgPricePerMeter)}
                <span className="text-sm text-muted-foreground">/m²</span>
              </dd>
            </div>
          ) : null}
          {area.priceRange ? (
            <div>
              <dt className="eyebrow">
                <T en="Range" ar="النطاق" />
              </dt>
              <dd className="mt-1 text-2xl text-foreground">
                {formatCompactEGP(area.priceRange.min)} <T en="to" ar="إلى" />{' '}
                {formatCompactEGP(area.priceRange.max)}
              </dd>
            </div>
          ) : null}
        </dl>

        <Button asChild className="mt-6">
          <Link href={routes.search({ areaId: [area.id] })}>
            <T en="Search" ar="ابحث في" /> <T en={area.nameEn} ar={area.nameAr} />
          </Link>
        </Button>
      </PageHeader>

      {compounds.length > 0 ? (
        <section className="mt-10 space-y-5">
          <h2 className="display text-xl">
            <T en="Compounds in" ar="كمبوندات في" /> <T en={area.nameEn} ar={area.nameAr} />
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {compounds.map((compound) => (
              <CompoundCard key={compound.id} compound={compound} />
            ))}
          </div>
        </section>
      ) : null}

      {properties.length > 0 ? (
        <section className="mt-12 space-y-5">
          <h2 className="display text-xl">
            <T en="Homes for sale" ar="وحدات للبيع" />
          </h2>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {properties.map((property) => (
              <PropertyCard key={property.propertyId} property={property} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
