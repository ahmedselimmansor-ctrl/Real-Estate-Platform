'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useI18n } from '@/hooks/use-i18n';
import { BEDROOM_OPTIONS, PRICE_PRESETS, PROPERTY_TYPE_OPTIONS } from '@/lib/constants';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';
import type { PropertyType } from '@/types/enums';
import type { SearchFilters } from '@/types/search';

type Mode = 'compounds' | 'units';

/** Sentinel for "no preference" — a Radix SelectItem cannot hold an empty value. */
const ANY = 'any';

/**
 * The search hero.
 *
 * A full-bleed photograph with the heading over it, and the search card
 * straddling the bottom edge of the image so it reads as one object rather than
 * a band stacked under a picture.
 *
 * The two tabs go to genuinely different places: compounds are masterplans and
 * live at `/compounds`, units are individual listings and live at `/search`.
 * The filter row only applies to units, so it is disabled on the compounds tab
 * rather than silently ignored.
 */
export function HeroSearch() {
  const router = useRouter();
  const { pick, locale } = useI18n();

  const [mode, setMode] = useState<Mode>('units');
  const [query, setQuery] = useState('');
  const [propertyType, setPropertyType] = useState<string>(ANY);
  const [bedrooms, setBedrooms] = useState<string>(ANY);
  const [priceIndex, setPriceIndex] = useState<string>(ANY);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const term = query.trim();

    if (mode === 'compounds') {
      router.push(term ? `${routes.compounds}?q=${encodeURIComponent(term)}` : routes.compounds);
      return;
    }

    const filters: SearchFilters = {};
    if (term) filters.q = term;
    if (propertyType !== ANY) filters.propertyType = [propertyType as PropertyType];
    if (bedrooms !== ANY) filters.bedrooms = [Number(bedrooms)];

    if (priceIndex !== ANY) {
      const preset = PRICE_PRESETS[Number(priceIndex)];
      if (preset?.minPrice) filters.minPrice = preset.minPrice;
      if (preset?.maxPrice) filters.maxPrice = preset.maxPrice;
    }

    router.push(routes.search(filters));
  };

  const filtersDisabled = mode === 'compounds';

  const TABS: { value: Mode; en: string; ar: string }[] = [
    { value: 'compounds', en: 'Compounds', ar: 'كمبوندات' },
    { value: 'units', en: 'Units', ar: 'وحدات' },
  ];

  return (
    <section className="relative">
      {/* ------------------------------------------------------ the photograph */}
      <div className="relative h-[380px] sm:h-[440px] lg:h-[500px]">
        <Image
          src="/properties/property-21.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        {/* Scrim weighted to the side the type sits on, so the headline holds
            contrast without flattening the whole picture. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-ink-950/45 via-ink-950/25 to-ink-950/70"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-l from-ink-950/70 via-ink-950/20 to-transparent rtl:bg-gradient-to-r"
        />

        <div className="absolute inset-x-0 bottom-24 mx-auto w-full max-w-7xl px-4 text-end lg:px-6 ltr:text-start">
          <h1 className="display text-[clamp(2rem,5vw,3.25rem)] text-white drop-shadow-sm">
            {pick('Find your home', 'ابحث عن منزلك')}
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-white/90 sm:text-base ltr:ms-0 rtl:ms-auto">
            {pick(
              'Search and compare more than 15,000 homes across 800+ compounds, or list your own property for sale.',
              'ابحث وقارن بين أكثر من 15000+ عقار من بين 800+ كمبوند أو اعرض عقارك للبيع',
            )}
          </p>
        </div>
      </div>

      {/* -------------------------------------------- the card, straddling it */}
      <div className="relative z-10 mx-auto -mt-16 mb-14 w-full max-w-5xl px-4 lg:px-6">
        <form
          onSubmit={submit}
          className="rounded-2xl border border-border bg-card p-4 shadow-elevated sm:p-6"
          role="search"
        >
          {/* --- tabs --- */}
          <div
            role="tablist"
            aria-label={pick('What to search', 'ماذا تبحث')}
            className="flex border-b border-border"
          >
            {TABS.map((tab) => {
              const active = mode === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setMode(tab.value)}
                  className={cn(
                    'relative flex-1 pb-3 text-sm font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {pick(tab.en, tab.ar)}
                  <span
                    aria-hidden
                    className={cn(
                      'absolute inset-x-0 -bottom-px h-0.5 rounded-full transition-colors',
                      active ? 'bg-primary' : 'bg-transparent',
                    )}
                  />
                </button>
              );
            })}
          </div>

          {/* --- the term --- */}
          <div className="relative mt-5">
            <Search
              className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                mode === 'compounds'
                  ? pick(
                      'Search by compound, location or developer',
                      'البحث بالكمبوند، الموقع، المطور العقاري',
                    )
                  : pick('Search by area, compound or developer', 'البحث بالمنطقة، الكمبوند أو المطور')
              }
              aria-label={pick('Search term', 'كلمة البحث')}
              className="h-12 pe-10"
            />
          </div>

          {/* --- refinements + submit --- */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
            <Select
              value={propertyType}
              onValueChange={setPropertyType}
              disabled={filtersDisabled}
            >
              <SelectTrigger className="h-12" aria-label={pick('Unit type', 'أنواع الوحدات')}>
                <SelectValue placeholder={pick('Unit types', 'أنواع الوحدات')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>{pick('Unit types', 'أنواع الوحدات')}</SelectItem>
                {PROPERTY_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {locale === 'ar' ? option.labelAr : option.labelEn}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={bedrooms} onValueChange={setBedrooms} disabled={filtersDisabled}>
              <SelectTrigger className="h-12" aria-label={pick('Bedrooms', 'غرف النوم')}>
                <SelectValue placeholder={pick('Bedrooms', 'غرف نوم و حمامات')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>{pick('Bedrooms', 'غرف نوم و حمامات')}</SelectItem>
                {BEDROOM_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {locale === 'ar' ? option.labelAr : option.labelEn}{' '}
                    {pick(option.value === 1 ? 'bedroom' : 'bedrooms', 'غرف')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={priceIndex} onValueChange={setPriceIndex} disabled={filtersDisabled}>
              <SelectTrigger className="h-12" aria-label={pick('Price range', 'معدل السعر')}>
                <SelectValue placeholder={pick('Price range', 'معدل السعر')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>{pick('Price range', 'معدل السعر')}</SelectItem>
                {PRICE_PRESETS.map((preset, index) => (
                  <SelectItem key={preset.labelEn} value={String(index)}>
                    {locale === 'ar' ? preset.labelAr : preset.labelEn}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button type="submit" size="lg" className="h-12 px-8">
              <Search className="me-2 size-4" aria-hidden />
              {pick('Search', 'ابحث')}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
