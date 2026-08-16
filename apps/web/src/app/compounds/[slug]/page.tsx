import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Check, MapPin } from 'lucide-react';

import { PropertyCard } from '@/components/property/property-card';
import { T } from '@/components/i18n/t';
import { InstalmentLedger } from '@/components/property/instalment-ledger';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';
import { PROPERTY_TYPE_OPTIONS } from '@/lib/constants';
import { formatArea, formatCompactEGP, formatEGP } from '@/lib/format';
import { routes } from '@/lib/routes';
import type { Compound } from '@/types/catalog';
import type { Property } from '@/types/property';

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function fetchCompound(slug: string): Promise<Compound | null> {
  return api
    .get<Compound>(`/compounds/${encodeURIComponent(slug)}`, {
      next: { revalidate: 300, tags: [`compound:${slug}`] },
    })
    .catch(() => null);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const compound = await fetchCompound(slug);
  if (!compound) return { title: 'Compound not found' };

  return {
    title: `${compound.name}, ${compound.area?.nameEn}`,
    description:
      compound.descriptionEn?.slice(0, 300) ??
      `Units, payment plans and handover dates in ${compound.name}.`,
    alternates: { canonical: `/compounds/${compound.slug}` },
    openGraph: { images: compound.images?.[0] ? [compound.images[0]] : [] },
  };
}

export default async function CompoundPage({ params }: PageProps) {
  const { slug } = await params;
  const compound = await fetchCompound(slug);
  if (!compound) notFound();

  const units = await api
    .get<Property[]>('/properties', { query: { compoundId: compound.id, limit: 6 } })
    .catch(() => [] as Property[]);

  return (
    <article className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-6">
      {compound.images?.[0] ? (
        <div className="relative aspect-[21/9] overflow-hidden rounded-2xl bg-muted">
          <Image
            src={compound.images[0]}
            alt={compound.name}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950/80 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-8">
            <p className="eyebrow text-white/70">
              <T en={compound.developer?.name ?? ''} ar={compound.developer?.nameAr ?? ''} />
            </p>
            <h1 className="display mt-2 text-3xl sm:text-5xl">
              <T en={compound.name} ar={compound.nameAr} />
            </h1>
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-white/85">
              <MapPin className="size-4" aria-hidden />
              <T en={compound.area?.nameEn ?? ''} ar={compound.area?.nameAr ?? ''} />, {compound.area?.city}
            </p>
          </div>
        </div>
      ) : null}

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-10">
          {compound.descriptionEn ? (
            <section className="space-y-3">
              <h2 className="display text-xl">
                <T en="About" ar="عن" /> <T en={compound.name} ar={compound.nameAr} />
              </h2>
              <p className="leading-relaxed text-muted-foreground">
                <T en={compound.descriptionEn ?? ''} ar={compound.descriptionAr ?? ''} />
              </p>
            </section>
          ) : null}

          {compound.unitTypes?.length ? (
            <section className="space-y-3">
              <h2 className="display text-xl">
                <T en="Unit types" ar="أنواع الوحدات" />
              </h2>
              <div className="flex flex-wrap gap-2">
                {compound.unitTypes.map((type) => {
                  const option = PROPERTY_TYPE_OPTIONS.find((entry) => entry.value === type);
                  return (
                    <Badge key={type} variant="secondary" className="capitalize">
                      <T
                        en={option?.labelEn ?? type.replace(/_/g, ' ')}
                        ar={option?.labelAr ?? type.replace(/_/g, ' ')}
                      />
                    </Badge>
                  );
                })}
              </div>
            </section>
          ) : null}

          {compound.amenities?.length ? (
            <section className="space-y-3">
              <h2 className="display text-xl">
                <T en="Amenities" ar="المرافق" />
              </h2>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {compound.amenities.map((amenity) => (
                  <li key={amenity.id} className="flex items-center gap-2 text-sm">
                    <Check className="size-4 shrink-0 text-primary" aria-hidden />
                    <T en={amenity.nameEn} ar={amenity.nameAr} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {units.length > 0 ? (
            <section className="space-y-4">
              <div className="flex items-end justify-between gap-4">
                <h2 className="display text-xl">
                  <T en="Available units" ar="الوحدات المتاحة" />
                </h2>
                <Link
                  href={routes.search({ compoundId: [compound.id] })}
                  className="text-sm text-primary underline-offset-4 hover:underline"
                >
                  <T en="See all" ar="عرض الكل" />
                </Link>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {units.map((unit) => (
                  <PropertyCard key={unit.id} property={unit} />
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardContent className="space-y-5 p-5">
              <div>
                <p className="eyebrow">
                  <T en="Units from" ar="تبدأ من" />
                </p>
                <p className="figure-lg mt-1 text-2xl">
                  {compound.startingPrice ? formatEGP(compound.startingPrice) : <T en="On request" ar="عند الطلب" />}
                </p>
                {compound.maxPrice ? (
                  <p className="figure mt-1 text-xs text-muted-foreground">
                    <T en="up to" ar="حتى" /> {formatCompactEGP(compound.maxPrice)}
                  </p>
                ) : null}
              </div>

              {compound.startingPrice ? (
                <div>
                  <p className="eyebrow mb-2">
                    <T en="Typical plan" ar="خطة نموذجية" />
                  </p>
                  <InstalmentLedger
                    price={compound.startingPrice}
                    downPaymentPercent={compound.downPaymentPercent ?? 10}
                    installmentYears={compound.installmentYears ?? 0}
                    deliveryDate={
                      compound.deliveryYear ? `${compound.deliveryYear}-12-31` : null
                    }
                    variant="detail"
                  />
                </div>
              ) : null}

              <dl className="figure space-y-2 border-t border-border/60 pt-4 text-sm">
                {compound.minAreaSqm && compound.maxAreaSqm ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">
                      <T en="Unit sizes" ar="مساحات الوحدات" />
                    </dt>
                    <dd>
                      {formatArea(compound.minAreaSqm)} <T en="to" ar="إلى" />{' '}
                      {formatArea(compound.maxAreaSqm)}
                    </dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">
                    <T en="Developer" ar="المطور" />
                  </dt>
                  <dd className="font-sans">
                    <Link
                      href={routes.developer(compound.developer.slug)}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      <T en={compound.developer.name} ar={compound.developer.nameAr} />
                    </Link>
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">
                    <T en="Area" ar="المنطقة" />
                  </dt>
                  <dd className="font-sans">
                    <Link
                      href={routes.area(compound.area.slug)}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      <T en={compound.area.nameEn} ar={compound.area.nameAr} />
                    </Link>
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </aside>
      </div>
    </article>
  );
}
