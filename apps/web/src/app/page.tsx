import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { CompoundCard } from '@/components/catalog/compound-card';
import { T } from '@/components/i18n/t';
import { HeroSearch } from '@/components/home/hero-search';
import { PropertyCard } from '@/components/property/property-card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { formatCompactEGP, formatNumber } from '@/lib/format';
import { routes } from '@/lib/routes';
import type { Area, Compound, Developer } from '@/types/catalog';
import type { Property } from '@/types/property';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

export const revalidate = 300;

export default async function HomePage() {
  const [featured, areas, compounds, developers] = await Promise.all([
    api
      .get<Property[]>('/properties', { query: { isFeatured: true, limit: 6 } })
      .catch(() => [] as Property[]),
    api
      .get<Area[]>('/areas', { query: { limit: 6, sort: '-propertyCount' } })
      .catch(() => [] as Area[]),
    api
      .get<Compound[]>('/compounds', { query: { isFeatured: true, limit: 3 } })
      .catch(() => [] as Compound[]),
    api
      .get<Developer[]>('/developers', { query: { limit: 8 } })
      .catch(() => [] as Developer[]),
  ]);

  return (
    <>
      <HeroSearch />

      {/* ------------------------------------------------------------ areas */}
      {areas.length > 0 && (
        <Section
          eyebrow={<T en="Where people are buying" ar="أين يشتري الناس" />}
          title={<T en="Areas" ar="المناطق" />}
          href={routes.areas}
          linkLabel={<T en="All areas" ar="كل المناطق" />}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {areas.map((area, index) => (
              <Link
                key={area.id}
                href={routes.area(area.slug)}
                className="group relative aspect-[16/10] overflow-hidden rounded-xl bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {area.heroImage ? (
                  <Image
                    src={area.heroImage}
                    alt=""
                    fill
                    priority={index < 2}
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-ink-950/85 via-ink-950/20 to-transparent" />

                <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                  <h3 className="display text-xl">
                    <T en={area.nameEn} ar={area.nameAr} />
                  </h3>
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
        </Section>
      )}

      {/* --------------------------------------------------------- featured */}
      {featured.length > 0 && (
        <Section
          eyebrow={<T en="Picked this week" ar="اختيار هذا الأسبوع" />}
          title={<T en="Featured homes" ar="وحدات مميزة" />}
          href={routes.search({ sort: 'newest' })}
          linkLabel={<T en="All homes" ar="كل الوحدات" />}
          tinted
        >
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((property) => (
              <PropertyCard key={property.id} property={property} />
            ))}
          </div>
        </Section>
      )}

      {/* -------------------------------------------------------- compounds */}
      {compounds.length > 0 && (
        <Section
          eyebrow={<T en="Masterplans" ar="المخططات العامة" />}
          title={<T en="Compounds worth a look" ar="كمبوندات تستحق النظر" />}
          href={routes.compounds}
          linkLabel={<T en="All compounds" ar="كل الكمبوندات" />}
        >
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {compounds.map((compound) => (
              <CompoundCard key={compound.id} compound={compound} />
            ))}
          </div>
        </Section>
      )}

      {/* ------------------------------------------------------- developers */}
      {developers.length > 0 && (
        <Section
          eyebrow={<T en="Who builds it" ar="من يبني" />}
          title={<T en="Developers" ar="المطورون" />}
          href={routes.developers}
          linkLabel={<T en="All developers" ar="كل المطورين" />}
          tinted
        >
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {developers.map((developer) => (
              <li key={developer.id}>
                <Link
                  href={routes.developer(developer.slug)}
                  className="flex h-full items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
                >
                  <div className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {developer.logoUrl ? (
                      <Image
                        src={developer.logoUrl}
                        alt=""
                        fill
                        sizes="40px"
                        className="object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      <T en={developer.name} ar={developer.nameAr} />
                    </p>
                    <p className="figure text-xs text-muted-foreground">
                      {developer.projectsCount} <T en="projects" ar="مشروع" />
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* -------------------------------------------------------------- cta */}
      <section className="border-t border-border bg-primary text-primary-foreground">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-start gap-6 px-4 py-16 lg:flex-row lg:items-center lg:justify-between lg:px-6">
          <div>
            <h2 className="display text-3xl sm:text-4xl">
              <T en="Not sure what you can afford?" ar="غير متأكد مما تستطيع تحمله؟" />
            </h2>
            <p className="mt-3 max-w-lg text-primary-foreground/80">
              <T
                en="Tell a consultant your budget and where you want to live. They will come back with units that fit the schedule, not just the price."
                ar="أخبر المستشار بميزانيتك والمكان الذي تريد السكن فيه، وسيعود إليك بوحدات تناسب خطة السداد لا السعر وحده."
              />
            </p>
          </div>

          <Button asChild size="lg" variant="secondary" className="shrink-0">
            <Link href={routes.contact}>
              <T en="Talk to a consultant" ar="تحدث مع مستشار" />
              <ArrowRight className="ms-2 size-4 rtl:rotate-180" aria-hidden />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}

/** Consistent section rhythm: eyebrow, title, a link out, then the content. */
function Section({
  eyebrow,
  title,
  href,
  linkLabel,
  tinted = false,
  children,
}: {
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  href: string;
  linkLabel: React.ReactNode;
  tinted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={tinted ? 'border-b border-border bg-surface' : 'border-b border-border'}>
      <div className="mx-auto w-full max-w-7xl px-4 py-14 lg:px-6 lg:py-20">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2 className="display mt-2 text-3xl text-foreground sm:text-4xl">{title}</h2>
          </div>

          <Link
            href={href}
            className="figure inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
          >
            {linkLabel}
            <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
          </Link>
        </div>

        {children}
      </div>
    </section>
  );
}
