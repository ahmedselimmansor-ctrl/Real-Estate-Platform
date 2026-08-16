'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutGrid, List, Search as SearchIcon, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';

import { PropertyCard, PropertyCardSkeleton } from '@/components/property/property-card';
import { FilterSidebar } from '@/components/search/filter-sidebar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { SORT_OPTIONS, optionLabel } from '@/lib/constants';
import { countActiveFilters, deserializeFilters } from '@/lib/filters';
import { formatNumber } from '@/lib/format';
import { useCreateSavedSearch, useSearch, useSearchFacets } from '@/lib/queries';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { useI18n } from '@/hooks/use-i18n';
import { useFiltersStore } from '@/store/filters.store';
import type { SearchSort } from '@/types/enums';
import type { SearchFilters } from '@/types/search';

const PAGE_WINDOW = 2;

export function SearchClient({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const pathname = usePathname();

  const { locale, pick } = useI18n();
  const filters = useFiltersStore((state) => state.filters);
  const layout = useFiltersStore((state) => state.layout);
  const setLayout = useFiltersStore((state) => state.setLayout);
  const patchFilters = useFiltersStore((state) => state.patchFilters);
  const setFilters = useFiltersStore((state) => state.setFilters);
  const applyDraft = useFiltersStore((state) => state.applyDraft);
  const openDraft = useFiltersStore((state) => state.openDraft);
  const toQueryString = useFiltersStore((state) => state.toQueryString);

  const isAuthenticated = useAuthStore((state) => Boolean(state.accessToken));
  const createSavedSearch = useCreateSavedSearch();

  // --- URL ⇄ store -----------------------------------------------------------
  // Two directions, and the order matters. On first paint the store still holds
  // its defaults, so pushing store→URL before the URL has been read would wipe
  // the very filters the visitor arrived with (a shared link, a back button).
  // `appliedQuery` records what was last read from — or written to — the URL, so
  // each direction only fires on a genuine change.
  const appliedQuery = useRef<string | null>(null);

  // Seed the store from the server-supplied query, once.
  useEffect(() => {
    if (appliedQuery.current !== null) return;

    appliedQuery.current = initialQuery;
    setFilters(deserializeFilters(Object.fromEntries(new URLSearchParams(initialQuery))));
  }, [initialQuery, setFilters]);

  const nextQueryString = toQueryString();

  useEffect(() => {
    // Wait until the URL has been consumed at least once.
    if (appliedQuery.current === null) return;
    if (nextQueryString === appliedQuery.current) return;

    appliedQuery.current = nextQueryString;
    router.replace(nextQueryString ? `${pathname}?${nextQueryString}` : pathname, {
      scroll: false,
    });
  }, [nextQueryString, pathname, router]);

  const { data, isLoading, isFetching, isError, error, refetch } = useSearch(filters);
  const { data: facets, isLoading: facetsLoading } = useSearchFacets(filters);

  const activeCount = countActiveFilters(filters);
  const meta = data?.meta;
  const hits = data?.hits ?? [];

  const pages = useMemo(() => {
    if (!meta || meta.totalPages <= 1) return [] as number[];
    const current = meta.page;
    const from = Math.max(1, current - PAGE_WINDOW);
    const to = Math.min(meta.totalPages, current + PAGE_WINDOW);
    return Array.from({ length: to - from + 1 }, (_, index) => from + index);
  }, [meta]);

  const handleSaveSearch = () => {
    if (!isAuthenticated) {
      toast.error('Sign in to save this search', {
        action: { label: 'Sign in', onClick: () => router.push(routes.login) },
      });
      return;
    }

    createSavedSearch.mutate(
      { name: describeFilters(filters), filters, alertsEnabled: true },
      {
        onSuccess: () => toast.success('Search saved, we will alert you about new matches'),
        onError: () => toast.error('Could not save this search'),
      },
    );
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-6">
      <SearchHeader />

      <div className="mt-6 flex gap-8">
        {/* ------------------------------------------------ desktop sidebar */}
        <div className="hidden w-72 shrink-0 lg:block">
          {/* An explicit height, not just a cap. `max-h` alone leaves this box
              `height: auto`, so the panel's `h-full` resolved against auto and
              its scroll region grew to full content height, spilling the
              filters down the page and over the footer. */}
          <div className="sticky top-24 h-[calc(100vh-7rem)] overflow-hidden">
            <FilterSidebar facets={facets} isLoading={facetsLoading} className="h-full" />
          </div>
        </div>

        {/* ---------------------------------------------------------- results */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
            <div className="flex items-center gap-3">
              <Sheet onOpenChange={(open) => open && openDraft()}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="lg:hidden">
                    <SlidersHorizontal className="me-1.5 size-4" />
                    {pick('Filters', 'الفلاتر')}
                    {activeCount > 0 && (
                      <span className="ms-1.5 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
                        {activeCount}
                      </span>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="flex w-[88vw] max-w-sm flex-col p-0">
                  <SheetHeader className="border-b px-4 py-3">
                    <SheetTitle>{pick('Filters', 'الفلاتر')}</SheetTitle>
                  </SheetHeader>
                  <FilterSidebar
                    facets={facets}
                    isLoading={facetsLoading}
                    useDraft
                    className="flex-1 px-4"
                  />
                  <div className="border-t p-4">
                    <Button className="w-full" onClick={applyDraft}>
                      {pick('Show results', 'اعرض النتائج')}
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>

              <p className="text-sm text-muted-foreground" aria-live="polite">
                {isLoading ? (
                  pick('Searching…', 'جاري البحث…')
                ) : (
                  <>
                    <span className="font-semibold text-foreground">
                      {formatNumber(meta?.total ?? 0, { locale })}
                    </span>{' '}
                    {pick(meta?.total === 1 ? 'property' : 'properties', 'وحدة')}
                  </>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSaveSearch}
                disabled={createSavedSearch.isPending}
              >
                {pick('Save search', 'احفظ البحث')}
              </Button>

              <Select
                value={filters.sort ?? 'relevance'}
                onValueChange={(value) => patchFilters({ sort: value as SearchSort, page: 1 })}
              >
                <SelectTrigger size="sm" className="w-[168px]">
                  <SelectValue placeholder={pick('Sort', 'الترتيب')} />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {optionLabel(option, locale)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="hidden items-center rounded-md border sm:flex">
                {(['grid', 'list'] as const).map((mode) => {
                  const Icon = mode === 'grid' ? LayoutGrid : List;
                  return (
                    <button
                      key={mode}
                      type="button"
                      aria-label={`${mode} view`}
                      aria-pressed={layout === mode}
                      onClick={() => setLayout(mode)}
                      className={cn(
                        'grid size-8 place-items-center transition-colors',
                        layout === mode
                          ? 'bg-muted text-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <Icon className="size-4" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {isError ? (
            <EmptyState
              title={pick('Search is unavailable right now', 'البحث غير متاح حاليًا')}
              description={error?.message ?? 'Please try again in a moment.'}
              action={
                <Button onClick={() => refetch()} variant="outline">
                  {pick('Retry', 'حاول مرة أخرى')}
                </Button>
              }
            />
          ) : isLoading ? (
            <div
              className={cn(
                'grid gap-5',
                layout === 'grid' ? 'sm:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1',
              )}
            >
              {Array.from({ length: 9 }, (_, index) => (
                <PropertyCardSkeleton key={index} variant={layout === 'list' ? 'list' : 'grid'} />
              ))}
            </div>
          ) : hits.length === 0 ? (
            <EmptyState
              icon={SearchIcon}
              title={pick('No properties match those filters', 'لا توجد وحدات مطابقة')}
              description={pick('Try widening your budget, removing a filter, or searching a nearby area.', 'جرّب توسيع الميزانية أو إزالة فلتر أو البحث في منطقة قريبة.')}
              action={
                <Button variant="outline" onClick={() => useFiltersStore.getState().reset()}>
                  {pick('Clear all filters', 'مسح كل الفلاتر')}
                </Button>
              }
            />
          ) : (
            <>
              <div
                className={cn(
                  'grid gap-5 transition-opacity',
                  layout === 'grid' ? 'sm:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1',
                  isFetching && 'opacity-60',
                )}
              >
                {hits.map((hit, index) => (
                  <PropertyCard
                    key={hit.id}
                    property={hit}
                    variant={layout === 'list' ? 'list' : 'grid'}
                    priority={index < 3}
                  />
                ))}
              </div>

              {meta && meta.totalPages > 1 && (
                <Pagination className="mt-10">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        aria-disabled={meta.page <= 1}
                        className={cn(meta.page <= 1 && 'pointer-events-none opacity-50')}
                        onClick={(event) => {
                          event.preventDefault();
                          patchFilters({ page: Math.max(1, meta.page - 1) });
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                      />
                    </PaginationItem>

                    {pages.map((page) => (
                      <PaginationItem key={page}>
                        <PaginationLink
                          href="#"
                          isActive={page === meta.page}
                          onClick={(event) => {
                            event.preventDefault();
                            patchFilters({ page });
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    ))}

                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        aria-disabled={meta.page >= meta.totalPages}
                        className={cn(
                          meta.page >= meta.totalPages && 'pointer-events-none opacity-50',
                        )}
                        onClick={(event) => {
                          event.preventDefault();
                          patchFilters({ page: Math.min(meta.totalPages, meta.page + 1) });
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Free-text box, debounced so every keystroke does not hit Elasticsearch. */
function SearchHeader() {
  const { pick } = useI18n();
  const committed = useFiltersStore((state) => state.filters.q ?? '');
  const patchFilters = useFiltersStore((state) => state.patchFilters);

  const [term, setTerm] = useState(committed);
  const debounced = useDebouncedValue(term, 350);

  // Keep the box in step when the query changes from elsewhere (back button,
  // a chip being cleared) without clobbering what is being typed.
  useEffect(() => {
    setTerm((current) => (current === committed ? current : committed));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committed]);

  useEffect(() => {
    const next = debounced.trim();
    if (next !== committed) {
      patchFilters({ q: next || undefined, page: 1 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight">
        {pick('Properties for sale in Egypt', 'عقارات للبيع في مصر')}
      </h1>
      <p className="text-sm text-muted-foreground">
        {pick(
          'Search compounds, developers and areas across New Cairo, Sheikh Zayed, the North Coast and more.',
          'ابحث في الكمبوندات والمطورين والمناطق في القاهرة الجديدة والشيخ زايد والساحل الشمالي وغيرها.',
        )}
      </p>

      <div className="relative mt-4">
        <SearchIcon className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={pick('Try “Palm Hills New Cairo” or “3 bedroom villa North Coast”', 'جرّب «بالم هيلز القاهرة الجديدة» أو «فيلا 3 غرف الساحل الشمالي»')}
          className="h-11 ps-9"
          aria-label={pick('Search properties', 'ابحث عن عقار')}
        />
      </div>
    </div>
  );
}

/** Human-readable name for a saved search, e.g. "villa · New Cairo · up to 15M". */
function describeFilters(filters: SearchFilters): string {
  const parts: string[] = [];

  if (filters.propertyType?.length) parts.push(filters.propertyType.join(', '));
  if (filters.bedrooms?.length) parts.push(`${filters.bedrooms.join('/')} bed`);
  if (filters.maxPrice) parts.push(`up to ${Math.round(filters.maxPrice / 1_000_000)}M`);
  if (filters.q) parts.push(filters.q);

  return parts.length > 0 ? parts.join(' · ') : 'All properties';
}
