'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Scale, X } from 'lucide-react';

import { T, useT } from '@/components/i18n/t';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useMounted } from '@/hooks/use-mounted';
import { formatArea, formatEGP } from '@/lib/format';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { useCompareStore } from '@/store/compare.store';

/** Rows are declared once so every column renders in the same order. */
const ROWS = [
  { label: 'Price', get: (item: CompareRow) => formatEGP(item.price), figure: true },
  {
    label: 'Price / m²',
    get: (item: CompareRow) => formatEGP(Math.round(item.price / Math.max(1, item.areaSqm))),
    figure: true,
  },
  { label: 'Area', get: (item: CompareRow) => formatArea(item.areaSqm), figure: true },
  { label: 'Bedrooms', get: (item: CompareRow) => String(item.bedrooms), figure: true },
  { label: 'Bathrooms', get: (item: CompareRow) => String(item.bathrooms), figure: true },
  { label: 'Type', get: (item: CompareRow) => item.propertyType.replace(/_/g, ' '), figure: false },
  { label: 'Area name', get: (item: CompareRow) => item.areaName, figure: false },
  { label: 'Compound', get: (item: CompareRow) => item.compoundName ?? 'Standalone', figure: false },
] as const;

interface CompareRow {
  id: string;
  slug: string;
  title: string;
  image: string | null;
  price: number;
  areaSqm: number;
  bedrooms: number;
  bathrooms: number;
  propertyType: string;
  areaName: string;
  compoundName?: string | null;
}

export default function ComparePage() {
  const t = useT();
  const mounted = useMounted();
  const items = useCompareStore((state) => state.items);
  const remove = useCompareStore((state) => state.remove);
  const clear = useCompareStore((state) => state.clear);

  /** Values that differ across columns are the ones worth looking at. */
  const isDistinct = (row: (typeof ROWS)[number]) =>
    new Set(items.map((item) => row.get(item as CompareRow))).size > 1;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 lg:px-6">
      <PageHeader
        eyebrow={<T en="Side by side" ar="جنبًا إلى جنب" />}
        title={<T en="Compare" ar="المقارنة" />}
        lede={
          <T
            en="Differences are highlighted. Everything identical stays quiet."
            ar="الاختلافات مميزة، وما هو متطابق يبقى هادئًا."
          />
        }
        count={mounted ? items.length : undefined}
        countLabel={<T en="homes" ar="وحدة" />}
      >
        {mounted && items.length > 0 ? (
          <Button variant="ghost" size="sm" className="mt-4" onClick={clear}>
            <T en="Clear all" ar="مسح الكل" />
          </Button>
        ) : null}
      </PageHeader>

      {!mounted ? null : items.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            icon={Scale}
            title={t('Nothing to compare yet', 'لا توجد وحدات للمقارنة')}
            description={t('Add up to four homes from any listing card.', 'أضف حتى أربع وحدات من أي بطاقة.')}
            action={
              <Button asChild>
                <Link href={routes.search()}>
                  <T en="Browse homes" ar="تصفح الوحدات" />
                </Link>
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-10 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-32 border-b border-border p-3 text-start align-bottom">
                  <span className="eyebrow">
                    <T en="Home" ar="الوحدة" />
                  </span>
                </th>
                {items.map((item) => (
                  <th key={item.id} className="border-b border-border p-3 text-start align-bottom">
                    <div className="relative mb-3 aspect-[4/3] overflow-hidden rounded-lg bg-muted">
                      {item.image ? (
                        <Image
                          src={item.image}
                          alt=""
                          fill
                          sizes="220px"
                          className="object-cover"
                        />
                      ) : null}
                      <button
                        type="button"
                        onClick={() => remove(item.id)}
                        aria-label={`Remove ${item.title}`}
                        className="absolute end-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-background/90 backdrop-blur hover:bg-background"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                    <Link
                      href={routes.property(item.slug)}
                      className="line-clamp-2 font-medium hover:text-primary"
                    >
                      {item.title}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {ROWS.map((row) => {
                const distinct = isDistinct(row);
                return (
                  <tr key={row.label} className={cn(distinct && 'bg-accent/40')}>
                    <th scope="row" className="border-b border-border p-3 text-start font-normal text-muted-foreground">
                      {row.label}
                    </th>
                    {items.map((item) => (
                      <td
                        key={item.id}
                        className={cn(
                          'border-b border-border p-3 capitalize',
                          row.figure && 'figure',
                          distinct && 'font-medium text-foreground',
                        )}
                      >
                        {row.get(item as CompareRow)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
