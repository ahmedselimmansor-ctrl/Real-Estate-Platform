'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Bath, BedDouble, Heart, Maximize, Scale } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { InstalmentLedger } from '@/components/property/instalment-ledger';
import {
  FINISHING_OPTIONS,
  MAX_COMPARE_ITEMS,
  SALE_TYPE_OPTIONS,
  getEnumLabel,
} from '@/lib/constants';
import { formatArea, formatEGP, formatPricePerMeter } from '@/lib/format';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { useCompareStore } from '@/store/compare.store';
import { useFavoritesStore } from '@/store/favorites.store';
import { useUiStore } from '@/store/ui.store';
import type { PropertyType } from '@/types/enums';
import type { PropertySearchHit } from '@/types/property';

export interface PropertyCardProps {
  property: PropertyCardData;
  className?: string;
  /** Horizontal layout used by the list view and the compare rail. */
  variant?: 'grid' | 'list';
  priority?: boolean;
  showCompare?: boolean;
}

/**
 * The card renders from either shape the platform serves: an Elasticsearch hit
 * (`/api/search`) or the canonical Mongo document (`/api/v1/properties`). The
 * union is normalised once, in `normalise`, so no caller has to care.
 */
export type PropertyCardData =
  | PropertySearchHit
  | {
      /**
       * The catalogue shape identifies a listing by `propertyId`; only an
       * Elasticsearch hit carries `id`. This branch had the two the other way
       * round — `id` required, `propertyId` optional — which is what let every
       * `key={property.id}` in the app type-check against a field
       * `/api/v1/properties` never returns.
       */
      propertyId: string;
      slug: string;
      title: { en: string; ar: string };
      propertyType: string;
      saleType: string;
      finishing: string;
      status: string;
      price: { amount: number; pricePerMeter: number };
      paymentPlan?: {
        downPaymentPercent: number;
        installmentYears: number;
        monthlyInstallment: number;
        deliveryDate: string;
      };
      specs: { bedrooms: number; bathrooms: number; areaSqm: number };
      location: { areaName: string; city: string };
      compound?: { name: string } | null;
      developer?: { name: string } | null;
      media?: { images?: { url: string; isPrimary: boolean }[] };
      isFeatured?: boolean;
    };

interface NormalisedCard {
  id: string;
  slug: string;
  titleEn: string;
  titleAr: string;
  propertyType: string;
  saleType: string;
  finishing: string;
  status: string;
  price: number;
  pricePerMeter: number;
  bedrooms: number;
  bathrooms: number;
  areaSqm: number;
  areaName: string;
  compoundName: string | null;
  developerName: string | null;
  image: string | null;
  isFeatured: boolean;
  downPaymentPercent: number;
  installmentYears: number;
  monthlyInstallment: number | null;
  deliveryDate: string | null;
}

/**
 * An Elasticsearch hit carries a flat numeric `price`; the api-core document
 * nests it under `price.amount`. TypeScript will not narrow a union on the
 * *type* of a shared property, so the discrimination is an explicit guard.
 */
function isSearchHit(property: PropertyCardData): property is PropertySearchHit {
  return typeof (property as PropertySearchHit).price === 'number';
}

function normalise(property: PropertyCardData): NormalisedCard {
  if (isSearchHit(property)) {
    return {
      id: property.id,
      slug: property.slug,
      titleEn: property.title.en,
      titleAr: property.title.ar,
      propertyType: property.propertyType,
      saleType: property.saleType,
      finishing: property.finishing,
      status: property.status,
      price: property.price,
      pricePerMeter: property.pricePerMeter,
      bedrooms: property.specs.bedrooms,
      bathrooms: property.specs.bathrooms,
      areaSqm: property.specs.areaSqm,
      areaName: property.areaName,
      compoundName: property.compoundName ?? null,
      developerName: property.developerName ?? null,
      image: property.primaryImage ?? null,
      isFeatured: property.isFeatured,
      downPaymentPercent: property.paymentPlan?.downPaymentPercent ?? 10,
      installmentYears: property.paymentPlan?.installmentYears ?? 0,
      monthlyInstallment: property.paymentPlan?.monthlyInstallment ?? null,
      deliveryDate: property.paymentPlan?.deliveryDate ?? null,
    };
  }

  const images = property.media?.images ?? [];
  const primary = images.find((image) => image.isPrimary) ?? images[0];

  return {
    id: property.propertyId,
    slug: property.slug,
    titleEn: property.title.en,
    titleAr: property.title.ar,
    propertyType: property.propertyType,
    saleType: property.saleType,
    finishing: property.finishing,
    status: property.status,
    price: property.price.amount,
    pricePerMeter: property.price.pricePerMeter,
    bedrooms: property.specs.bedrooms,
    bathrooms: property.specs.bathrooms,
    areaSqm: property.specs.areaSqm,
    areaName: property.location.areaName,
    compoundName: property.compound?.name ?? null,
    developerName: property.developer?.name ?? null,
    image: primary?.url ?? null,
    isFeatured: Boolean(property.isFeatured),
    downPaymentPercent: property.paymentPlan?.downPaymentPercent ?? 10,
    installmentYears: property.paymentPlan?.installmentYears ?? 0,
    monthlyInstallment: property.paymentPlan?.monthlyInstallment ?? null,
    deliveryDate: property.paymentPlan?.deliveryDate ?? null,
  };
}

export function PropertyCard({
  property,
  className,
  variant = 'grid',
  priority = false,
  showCompare = true,
}: PropertyCardProps) {
  const data = normalise(property);
  const locale = useUiStore((state) => state.locale);

  const isFavorite = useFavoritesStore((state) => state.isFavorite(data.id));
  const toggleFavorite = useFavoritesStore((state) => state.toggle);

  const inCompare = useCompareStore((state) => state.has(data.id));
  const toggleCompare = useCompareStore((state) => state.toggle);

  const title = locale === 'ar' ? data.titleAr : data.titleEn;
  const isList = variant === 'list';

  const handleFavorite = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    toggleFavorite(data.id);
    toast.success(isFavorite ? 'Removed from saved' : 'Saved to your list');
  };

  const handleCompare = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const result = toggleCompare({
      id: data.id,
      slug: data.slug,
      title: title,
      image: data.image,
      price: data.price,
      areaSqm: data.areaSqm,
      bedrooms: data.bedrooms,
      bathrooms: data.bathrooms,
      propertyType: data.propertyType as PropertyType,
      areaName: data.areaName,
      compoundName: data.compoundName,
    });

    if (!result.ok && result.reason === 'full') {
      toast.error(`You can compare up to ${MAX_COMPARE_ITEMS} properties`);
      return;
    }

    toast.success(result.added ? 'Added to compare' : 'Removed from compare');
  };

  return (
    <Card
      className={cn(
        'group relative overflow-hidden border-border/60 p-0 transition-all duration-200',
        'hover:-translate-y-0.5 hover:border-border hover:shadow-lg',
        isList && 'sm:flex sm:flex-row',
        className,
      )}
    >
      <Link href={routes.property(data.slug)} className="block focus:outline-none">
        <div
          className={cn(
            'relative overflow-hidden bg-muted',
            isList ? 'aspect-[4/3] sm:aspect-auto sm:h-full sm:w-72 sm:shrink-0' : 'aspect-[4/3]',
          )}
        >
          {data.image ? (
            <Image
              src={data.image}
              alt={title}
              fill
              priority={priority}
              sizes={isList ? '(max-width: 640px) 100vw, 288px' : '(max-width: 768px) 100vw, 33vw'}
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No image
            </div>
          )}

          <div className="absolute start-3 top-3 flex flex-wrap gap-1.5">
            {data.isFeatured && (
              <Badge className="border-0 bg-accent text-accent-foreground shadow-sm">
                {locale === 'ar' ? 'مميز' : 'Featured'}
              </Badge>
            )}
            <Badge variant="secondary" className="shadow-sm backdrop-blur">
              {getEnumLabel(SALE_TYPE_OPTIONS, data.saleType as never, locale)}
            </Badge>
            {data.status === 'sold' && (
              <Badge variant="destructive" className="shadow-sm">
                Sold
              </Badge>
            )}
          </div>

          <div className="absolute end-3 top-3 flex flex-col gap-1.5">
            <button
              type="button"
              onClick={handleFavorite}
              aria-label={isFavorite ? 'Remove from saved' : 'Save this property'}
              aria-pressed={isFavorite}
              className={cn(
                'grid size-9 place-items-center rounded-full bg-background/90 shadow-sm backdrop-blur',
                'transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              <Heart
                className={cn(
                  'size-4 transition-colors',
                  isFavorite ? 'fill-destructive text-destructive' : 'text-foreground/70',
                )}
              />
            </button>

            {showCompare && (
              <button
                type="button"
                onClick={handleCompare}
                aria-label={inCompare ? 'Remove from compare' : 'Add to compare'}
                aria-pressed={inCompare}
                className={cn(
                  'grid size-9 place-items-center rounded-full bg-background/90 shadow-sm backdrop-blur',
                  'transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-ring',
                  inCompare && 'bg-primary text-primary-foreground hover:bg-primary',
                )}
              >
                <Scale className="size-4" />
              </button>
            )}
          </div>
        </div>
      </Link>

      <div className={cn('flex flex-1 flex-col gap-3 p-4', isList && 'sm:justify-between')}>
        <Link href={routes.property(data.slug)} className="focus:outline-none">
          <p className="eyebrow">
            {[data.compoundName, data.areaName].filter(Boolean).join(' / ')}
          </p>

          <h3 className="mt-2 line-clamp-2 text-[15px] leading-snug font-medium text-foreground group-hover:text-primary">
            {title}
          </h3>

          <div className="mt-3 flex items-baseline justify-between gap-3">
            <p className="figure-lg text-xl text-foreground">
              {formatEGP(data.price, { locale })}
            </p>
            <span className="figure shrink-0 text-xs text-muted-foreground">
              {formatPricePerMeter(data.pricePerMeter, { locale })}
            </span>
          </div>
        </Link>

        {/* The plan, at card scale. */}
        <InstalmentLedger
          price={data.price}
          downPaymentPercent={data.downPaymentPercent}
          installmentYears={data.installmentYears}
          monthlyInstallment={data.monthlyInstallment}
          deliveryDate={data.deliveryDate}
          locale={locale}
          className="mt-1"
        />

        <div className="figure mt-1 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/60 pt-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <BedDouble className="size-3.5" aria-hidden />
            {data.bedrooms}
            <span className="sr-only">bedrooms</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Bath className="size-3.5" aria-hidden />
            {data.bathrooms}
            <span className="sr-only">bathrooms</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Maximize className="size-3.5" aria-hidden />
            {formatArea(data.areaSqm, { locale })}
          </span>
          <span className="ms-auto hidden font-sans sm:inline">
            {getEnumLabel(FINISHING_OPTIONS, data.finishing as never, locale)}
          </span>
        </div>
      </div>
    </Card>
  );
}

export function PropertyCardSkeleton({ variant = 'grid' }: { variant?: 'grid' | 'list' }) {
  const isList = variant === 'list';

  return (
    <Card className={cn('overflow-hidden border-border/60 p-0', isList && 'sm:flex sm:flex-row')}>
      <Skeleton
        className={cn(isList ? 'aspect-[4/3] sm:h-auto sm:w-72 sm:shrink-0' : 'aspect-[4/3]')}
      />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-20" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <div className="flex gap-4 border-t border-border/60 pt-3">
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    </Card>
  );
}

export function PropertyCardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, index) => (
        <PropertyCardSkeleton key={index} />
      ))}
    </div>
  );
}
