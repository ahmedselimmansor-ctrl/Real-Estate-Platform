'use client';

import { useMemo } from 'react';
import { X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BEDROOM_OPTIONS,
  DOWN_PAYMENT_OPTIONS,
  FINISHING_OPTIONS,
  INSTALLMENT_YEARS_OPTIONS,
  PRICE_PRESETS,
  PROPERTY_TYPE_OPTIONS,
  SALE_TYPE_OPTIONS,
  optionLabel,
} from '@/lib/constants';
import { countActiveFilters } from '@/lib/filters';
import { formatCompactEGP } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/use-i18n';
import { useFiltersStore } from '@/store/filters.store';
import type { Locale } from '@/types/enums';
import type { FacetBucket, SearchFacets, SearchFilters } from '@/types/search';

interface FilterSidebarProps {
  facets?: SearchFacets;
  isLoading?: boolean;
  className?: string;
  /** Edit the draft copy (mobile sheet) instead of the live filters. */
  useDraft?: boolean;
}

/** Picks the localised label off any `{labelEn, labelAr}` option. */
function label(option: { labelEn: string; labelAr: string }, locale: Locale): string {
  return locale === 'ar' ? option.labelAr : option.labelEn;
}

/** Turns a facet bucket list into a count lookup so options can show `(12)`. */
function countsOf(buckets: FacetBucket[] | undefined): Map<string, number> {
  return new Map((buckets ?? []).map((bucket) => [String(bucket.value), bucket.count]));
}

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="space-y-3 py-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function FilterSidebar({
  facets,
  isLoading = false,
  className,
  useDraft = false,
}: FilterSidebarProps) {
  const { locale, pick } = useI18n();

  const live = useFiltersStore((state) => state.filters);
  const draft = useFiltersStore((state) => state.draft);
  const filters = useDraft ? draft : live;

  const patchFilters = useFiltersStore((state) => state.patchFilters);
  const patchDraft = useFiltersStore((state) => state.patchDraft);
  const reset = useFiltersStore((state) => state.reset);
  const resetDraft = useFiltersStore((state) => state.resetDraft);

  const patch = useDraft ? patchDraft : patchFilters;
  const activeCount = countActiveFilters(filters);

  const typeCounts = useMemo(() => countsOf(facets?.propertyType), [facets]);
  const finishingCounts = useMemo(() => countsOf(facets?.finishing), [facets]);
  const bedroomCounts = useMemo(() => countsOf(facets?.bedrooms), [facets]);
  const areaCounts = useMemo(() => facets?.areas ?? [], [facets]);

  /** Toggling a value inside an array filter, resetting to page 1. */
  const toggleIn = <K extends keyof SearchFilters>(key: K, value: string) => {
    const current = (filters[key] as string[] | undefined) ?? [];
    const next = current.includes(value)
      ? current.filter((entry) => entry !== value)
      : [...current, value];

    patch({ [key]: next.length ? next : undefined, page: 1 } as Partial<SearchFilters>);
  };

  const toggleNumber = (key: 'bedrooms' | 'bathrooms', value: number) => {
    const current = filters[key] ?? [];
    const next = current.includes(value)
      ? current.filter((entry) => entry !== value)
      : [...current, value];

    patch({ [key]: next.length ? next : undefined, page: 1 });
  };

  if (isLoading && !facets) {
    return (
      <aside className={cn('space-y-6', className)}>
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="space-y-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-3/4" />
          </div>
        ))}
      </aside>
    );
  }

  return (
    <aside className={cn('flex min-h-0 flex-col', className)} aria-label={pick('Filters', 'الفلاتر')}>
      <div className="flex items-center justify-between gap-2 pb-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          {pick('Filters', 'الفلاتر')}
          {activeCount > 0 && (
            <Badge variant="secondary" className="rounded-full px-2 text-xs">
              {activeCount}
            </Badge>
          )}
        </h2>
        {activeCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground"
            onClick={() => (useDraft ? resetDraft() : reset())}
          >
            <X className="me-1 size-3.5" />
            {pick('Clear all', 'مسح الكل')}
          </Button>
        )}
      </div>

      {/* `min-h-0` matters: a flex child defaults to `min-height: auto`,
          which refuses to shrink below its content and defeats the scroll. */}
      <ScrollArea className="-me-3 min-h-0 flex-1 pe-3">
        <div className="divide-y divide-border/60">
          {/* ---------------------------------------------------- sale type */}
          <Section title={pick('Purpose', 'الغرض')}>
            <div className="flex flex-wrap gap-2">
              {SALE_TYPE_OPTIONS.map((option) => {
                const selected = filters.saleType === option.value;
                return (
                  <Button
                    key={option.value}
                    type="button"
                    variant={selected ? 'default' : 'outline'}
                    size="sm"
                    onClick={() =>
                      patch({ saleType: selected ? undefined : option.value, page: 1 })
                    }
                  >
                    {optionLabel(option, locale)}
                  </Button>
                );
              })}
            </div>
          </Section>

          {/* ------------------------------------------------ property type */}
          <Section title={pick('Property type', 'نوع الوحدة')}>
            <div className="space-y-2.5">
              {PROPERTY_TYPE_OPTIONS.map((option) => {
                const count = typeCounts.get(option.value);
                const checked = filters.propertyType?.includes(option.value) ?? false;

                return (
                  <div key={option.value} className="flex items-center gap-2.5">
                    <Checkbox
                      id={`type-${option.value}`}
                      checked={checked}
                      disabled={!checked && count === 0}
                      onCheckedChange={() => toggleIn('propertyType', option.value)}
                    />
                    <Label
                      htmlFor={`type-${option.value}`}
                      className="flex flex-1 cursor-pointer items-center justify-between text-sm font-normal"
                    >
                      <span>{optionLabel(option, locale)}</span>
                      {count !== undefined && (
                        <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
                      )}
                    </Label>
                  </div>
                );
              })}
            </div>
          </Section>

          {/* -------------------------------------------------------- price */}
          <Section title={pick('Price (EGP)', 'السعر (ج.م)')}>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="numeric"
                placeholder={pick('Min', 'الأدنى')}
                aria-label={pick('Minimum price', 'أقل سعر')}
                value={filters.minPrice ?? ''}
                onChange={(event) =>
                  patch({
                    minPrice: event.target.value ? Number(event.target.value) : undefined,
                    page: 1,
                  })
                }
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="number"
                inputMode="numeric"
                placeholder={pick('Max', 'الأعلى')}
                aria-label={pick('Maximum price', 'أعلى سعر')}
                value={filters.maxPrice ?? ''}
                onChange={(event) =>
                  patch({
                    maxPrice: event.target.value ? Number(event.target.value) : undefined,
                    page: 1,
                  })
                }
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {PRICE_PRESETS.map((preset) => {
                const selected =
                  filters.minPrice === preset.minPrice && filters.maxPrice === preset.maxPrice;

                return (
                  <button
                    key={preset.labelEn}
                    type="button"
                    onClick={() =>
                      patch(
                        selected
                          ? { minPrice: undefined, maxPrice: undefined, page: 1 }
                          : { minPrice: preset.minPrice, maxPrice: preset.maxPrice, page: 1 },
                      )
                    }
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs transition-colors',
                      selected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground',
                    )}
                  >
                    {label(preset, locale)}
                  </button>
                );
              })}
            </div>

            {facets?.price?.stats && (
              <p className="text-xs text-muted-foreground">
                {pick('Listings range', 'نطاق الأسعار')}{' '}
                {formatCompactEGP(facets.price.stats.min, { locale })} –{' '}
                {formatCompactEGP(facets.price.stats.max, { locale })}
              </p>
            )}
          </Section>

          {/* ----------------------------------------------------- bedrooms */}
          <Section title={pick('Bedrooms', 'غرف النوم')}>
            <div className="flex flex-wrap gap-2">
              {BEDROOM_OPTIONS.map((option) => {
                const selected = filters.bedrooms?.includes(option.value) ?? false;
                const count = bedroomCounts.get(String(option.value));

                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={!selected && count === 0}
                    onClick={() => toggleNumber('bedrooms', option.value)}
                    className={cn(
                      'min-w-11 rounded-lg border px-3 py-1.5 text-sm transition-colors',
                      'disabled:cursor-not-allowed disabled:opacity-40',
                      selected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border hover:border-foreground/30',
                    )}
                  >
                    {label(option, locale)}
                  </button>
                );
              })}
            </div>
          </Section>

          {/* -------------------------------------------------- area (sqm) */}
          <Section title={pick('Unit area (m²)', 'مساحة الوحدة (م²)')}>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="numeric"
                placeholder={pick('Min', 'الأدنى')}
                aria-label={pick('Minimum area', 'أقل مساحة')}
                value={filters.minArea ?? ''}
                onChange={(event) =>
                  patch({
                    minArea: event.target.value ? Number(event.target.value) : undefined,
                    page: 1,
                  })
                }
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="number"
                inputMode="numeric"
                placeholder={pick('Max', 'الأعلى')}
                aria-label={pick('Maximum area', 'أعلى مساحة')}
                value={filters.maxArea ?? ''}
                onChange={(event) =>
                  patch({
                    maxArea: event.target.value ? Number(event.target.value) : undefined,
                    page: 1,
                  })
                }
              />
            </div>
          </Section>

          {/* ---------------------------------------------------- finishing */}
          <Section title={pick('Finishing', 'التشطيب')}>
            <div className="space-y-2.5">
              {FINISHING_OPTIONS.map((option) => {
                const count = finishingCounts.get(option.value);
                const checked = filters.finishing?.includes(option.value) ?? false;

                return (
                  <div key={option.value} className="flex items-center gap-2.5">
                    <Checkbox
                      id={`finishing-${option.value}`}
                      checked={checked}
                      disabled={!checked && count === 0}
                      onCheckedChange={() => toggleIn('finishing', option.value)}
                    />
                    <Label
                      htmlFor={`finishing-${option.value}`}
                      className="flex flex-1 cursor-pointer items-center justify-between text-sm font-normal"
                    >
                      <span>{optionLabel(option, locale)}</span>
                      {count !== undefined && (
                        <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
                      )}
                    </Label>
                  </div>
                );
              })}
            </div>
          </Section>

          {/* --------------------------------------------------- payment */}
          <Section title={pick('Payment plan', 'خطة السداد')}>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{pick('Max down payment', 'أقصى مقدم')}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {DOWN_PAYMENT_OPTIONS.map((option) => {
                    const selected = filters.maxDownPayment === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          patch({
                            maxDownPayment: selected ? undefined : option.value,
                            page: 1,
                          })
                        }
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-xs transition-colors',
                          selected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {label(option, locale)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{pick('Min instalment years', 'أقل عدد سنوات تقسيط')}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {INSTALLMENT_YEARS_OPTIONS.map((option) => {
                    const selected = filters.minInstallmentYears === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          patch({
                            minInstallmentYears: selected ? undefined : option.value,
                            page: 1,
                          })
                        }
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-xs transition-colors',
                          selected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {label(option, locale)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </Section>

          {/* --------------------------------------------------------- area */}
          {areaCounts.length > 0 && (
            <Section title={pick('Location', 'المنطقة')}>
              <div className="space-y-2.5">
                {areaCounts.slice(0, 12).map((bucket) => {
                  const id = String(bucket.value);
                  const checked = filters.areaId?.includes(id) ?? false;

                  return (
                    <div key={id} className="flex items-center gap-2.5">
                      <Checkbox
                        id={`area-${id}`}
                        checked={checked}
                        onCheckedChange={() => toggleIn('areaId', id)}
                      />
                      <Label
                        htmlFor={`area-${id}`}
                        className="flex flex-1 cursor-pointer items-center justify-between text-sm font-normal"
                      >
                        <span>{(locale === 'ar' && bucket.labelAr) || bucket.label || id}</span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {bucket.count}
                        </span>
                      </Label>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* ----------------------------------------------------- amenities */}
          {facets?.amenities?.length ? (
            <Section title={pick('Amenities', 'المرافق')}>
              <div className="flex flex-wrap gap-1.5">
                {facets.amenities.slice(0, 24).map((bucket) => {
                  const slug = String(bucket.value);
                  const selected = filters.amenities?.includes(slug) ?? false;

                  return (
                    <button
                      key={slug}
                      type="button"
                      onClick={() => toggleIn('amenities', slug)}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-xs capitalize transition-colors',
                        selected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {(locale === 'ar' && bucket.labelAr) || bucket.label || slug.replace(/-/g, ' ')}
                      <span className="ms-1 opacity-60">{bucket.count}</span>
                    </button>
                  );
                })}
              </div>
            </Section>
          ) : null}

          <Separator className="opacity-0" />
        </div>
      </ScrollArea>
    </aside>
  );
}
