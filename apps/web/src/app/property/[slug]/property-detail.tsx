'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import {
  Bath,
  BedDouble,
  Building2,
  CalendarDays,
  Car,
  Check,
  Download,
  Heart,
  Layers,
  MapPin,
  Maximize,
  Scale,
  Share2,
  Trees,
} from 'lucide-react';
import { toast } from 'sonner';

import { ImageGallery } from '@/components/property/image-gallery';
import { InstalmentLedger } from '@/components/property/instalment-ledger';
import { MortgageCalculator } from '@/components/property/mortgage-calculator';
import { PropertyCard, PropertyCardSkeleton } from '@/components/property/property-card';
import { LeadForm } from '@/components/forms/lead-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FINISHING_OPTIONS,
  PROPERTY_STATUS_OPTIONS,
  PROPERTY_TYPE_OPTIONS,
  SALE_TYPE_OPTIONS,
  getEnumLabel,
} from '@/lib/constants';
import { publicEnv } from '@/lib/env';
import {
  formatArea,
  formatDate,
  formatEGP,
  formatPricePerMeter,
} from '@/lib/format';
import { useRecordPropertyView, useSimilarProperties } from '@/lib/queries';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { useCompareStore } from '@/store/compare.store';
import { useFavoritesStore } from '@/store/favorites.store';
import { useI18n } from '@/hooks/use-i18n';
import type { Property } from '@/types/property';

interface PropertyDetailProps {
  property: Property;
}

export function PropertyDetail({ property }: PropertyDetailProps) {
  const { locale, pick } = useI18n();
  const recordView = useRecordPropertyView();

  const propertyId = property.propertyId;
  const isFavorite = useFavoritesStore((state) => state.isFavorite(propertyId));
  const toggleFavorite = useFavoritesStore((state) => state.toggle);
  const inCompare = useCompareStore((state) => state.has(propertyId));
  const toggleCompare = useCompareStore((state) => state.toggle);

  const title = locale === 'ar' ? property.title.ar : property.title.en;
  const description = locale === 'ar' ? property.description.ar : property.description.en;

  const { data: similar, isLoading: similarLoading } = useSimilarProperties(propertyId);

  // Fire-and-forget; the API de-duplicates per viewer for 30 minutes.
  useEffect(() => {
    recordView.mutate(propertyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success('Link copied to clipboard');
    } catch {
      // The user dismissed the share sheet — nothing to report.
    }
  };

  const specs = [
    { icon: BedDouble, label: pick('Bedrooms', 'غرف النوم'), value: property.specs.bedrooms },
    { icon: Bath, label: pick('Bathrooms', 'الحمامات'), value: property.specs.bathrooms },
    {
      icon: Maximize,
      label: pick('Built-up area', 'مساحة البناء'),
      value: formatArea(property.specs.areaSqm, { locale }),
    },
    ...(property.specs.gardenSqm
      ? [
          {
            icon: Trees,
            label: pick('Garden', 'الحديقة'),
            value: formatArea(property.specs.gardenSqm, { locale }),
          },
        ]
      : []),
    ...(property.specs.floor
      ? [{ icon: Layers, label: pick('Floor', 'الدور'), value: String(property.specs.floor) }]
      : []),
    ...(property.specs.parkingSpots
      ? [{ icon: Car, label: pick('Parking', 'مواقف'), value: String(property.specs.parkingSpots) }]
      : []),
  ];

  return (
    <article className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-6">
      {/* --------------------------------------------------------- breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href={routes.home} className="hover:text-foreground">
              {pick('Home', 'الرئيسية')}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li>
            <Link href={routes.search()} className="hover:text-foreground">
              {pick('Properties', 'العقارات')}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li>
            <Link href={routes.area(property.location.areaId)} className="hover:text-foreground">
              {property.location.areaName}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li className="truncate text-foreground">{title}</li>
        </ol>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        {/* ============================================================ main */}
        <div className="min-w-0 space-y-8">
          <Tabs defaultValue="photos">
            <div className="flex items-center justify-between gap-3">
              <TabsList>
                <TabsTrigger value="photos">
                  {pick('Photos', 'الصور')} ({property.media.images.length})
                </TabsTrigger>
                {property.media.floorPlans.length > 0 && (
                  <TabsTrigger value="plans">
                    {pick('Floor plans', 'المخططات')} ({property.media.floorPlans.length})
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            <TabsContent value="photos" className="mt-3">
              <ImageGallery images={property.media.images} alt={title} />
            </TabsContent>

            {property.media.floorPlans.length > 0 && (
              <TabsContent value="plans" className="mt-3">
                <ImageGallery
                  images={property.media.floorPlans.map((plan, index) => ({
                    url: plan.url,
                    key: plan.label || `plan-${index}`,
                    width: 1600,
                    height: 900,
                    isPrimary: index === 0,
                    order: index,
                  }))}
                  alt={`${title} floor plan`}
                />
              </TabsContent>
            )}
          </Tabs>

          {/* ------------------------------------------------------- headline */}
          <header className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {getEnumLabel(SALE_TYPE_OPTIONS, property.saleType, locale)}
              </Badge>
              <Badge variant="outline">
                {getEnumLabel(PROPERTY_TYPE_OPTIONS, property.propertyType, locale)}
              </Badge>
              <Badge
                variant={property.status === 'available' ? 'default' : 'outline'}
                className={cn(property.status === 'sold' && 'bg-destructive text-white')}
              >
                {getEnumLabel(PROPERTY_STATUS_OPTIONS, property.status, locale)}
              </Badge>
              {property.isFeatured && (
                <Badge className="border-0 bg-featured text-featured-foreground">
                  {pick('Featured', 'مميز')}
                </Badge>
              )}
              <span className="figure text-xs text-muted-foreground">
                {pick('Ref', 'كود')} {property.referenceNo}
              </span>
            </div>

            <h1 className="display text-3xl text-foreground sm:text-4xl">{title}</h1>

            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-4 shrink-0" />
              {[property.location.address, property.location.areaName, property.location.city]
                .filter(Boolean)
                .join(', ')}
            </p>

            <div className="flex flex-wrap items-end justify-between gap-4 pt-2">
              <div>
                <p className="figure-lg text-4xl text-foreground">
                  {formatEGP(property.price.amount, { locale })}
                </p>
                <p className="figure mt-1 text-sm text-muted-foreground">
                  {formatPricePerMeter(property.price.pricePerMeter, { locale })}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    toggleFavorite(propertyId);
                    toast.success(isFavorite ? 'Removed from saved' : 'Saved to your list');
                  }}
                >
                  <Heart
                    className={cn('me-1.5 size-4', isFavorite && 'fill-destructive text-destructive')}
                  />
                  {isFavorite ? pick('Saved', 'محفوظة') : pick('Save', 'حفظ')}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const result = toggleCompare({
                      id: propertyId,
                      slug: property.slug,
                      title,
                      image: property.media.images.find((image) => image.isPrimary)?.url ?? null,
                      price: property.price.amount,
                      areaSqm: property.specs.areaSqm,
                      bedrooms: property.specs.bedrooms,
                      bathrooms: property.specs.bathrooms,
                      propertyType: property.propertyType,
                      areaName: property.location.areaName,
                      compoundName: property.compound?.name ?? null,
                    });
                    if (!result.ok && result.reason === 'full') {
                      toast.error('You can compare up to 4 properties');
                      return;
                    }
                    toast.success(result.added ? 'Added to compare' : 'Removed from compare');
                  }}
                >
                  <Scale className="me-1.5 size-4" />
                  {inCompare ? pick('In compare', 'في المقارنة') : pick('Compare', 'قارن')}
                </Button>

                <Button variant="outline" size="sm" onClick={share}>
                  <Share2 className="me-1.5 size-4" />
                  {pick('Share', 'مشاركة')}
                </Button>

                <Button variant="outline" size="sm" asChild>
                  <a
                    href={`${publicEnv.reportsUrl}/property/${propertyId}/brochure.pdf`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Download className="me-1.5 size-4" />
                    {pick('Brochure', 'الكتيب')}
                  </a>
                </Button>
              </div>
            </div>
          </header>

          {/* ---------------------------------------------------------- specs */}
          <section aria-label="Key specifications">
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3 lg:grid-cols-6">
              {specs.map((spec) => (
                <div key={spec.label} className="bg-card p-4">
                  <spec.icon className="size-4 text-muted-foreground" aria-hidden />
                  <p className="figure mt-2 text-lg text-foreground">{spec.value}</p>
                  <p className="text-xs text-muted-foreground">{spec.label}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ---------------------------------------------------- description */}
          <section className="space-y-3">
            <h2 className="display text-xl">{pick('About this property', 'عن هذه الوحدة')}</h2>
            <p className="whitespace-pre-line leading-relaxed text-muted-foreground">
              {description}
            </p>
            <dl className="grid gap-2 pt-2 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-4 border-b py-2">
                <dt className="text-muted-foreground">{pick('Finishing', 'التشطيب')}</dt>
                <dd>{getEnumLabel(FINISHING_OPTIONS, property.finishing, locale)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b py-2">
                <dt className="text-muted-foreground">{pick('Delivery', 'التسليم')}</dt>
                <dd>{formatDate(property.paymentPlan.deliveryDate, { locale })}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b py-2">
                <dt className="text-muted-foreground">{pick('Listed', 'تاريخ الإدراج')}</dt>
                <dd>{formatDate(property.publishedAt, { locale })}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b py-2">
                <dt className="text-muted-foreground">{pick('Reference', 'الكود')}</dt>
                <dd>{property.referenceNo}</dd>
              </div>
            </dl>
          </section>

          {/* ------------------------------------------------------ amenities */}
          {property.amenities.length > 0 && (
            <section className="space-y-3">
              <h2 className="display text-xl">{pick('Amenities', 'المرافق')}</h2>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {property.amenities.map((amenity) => (
                  <li key={amenity} className="flex items-center gap-2 text-sm capitalize">
                    <Check className="size-4 shrink-0 text-primary" aria-hidden />
                    {amenity.replace(/-/g, ' ')}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* -------------------------------------------- compound + developer */}
          <section className="grid gap-4 sm:grid-cols-2">
            {property.compound && (
            <Card>
              <CardContent className="space-y-2 p-5">
                <p className="eyebrow">{pick('Compound', 'الكمبوند')}</p>
                <Link
                  href={routes.compound(property.compound.slug)}
                  className="flex items-center gap-2 text-base font-semibold hover:text-primary"
                >
                  <Building2 className="size-4" />
                  {property.compound.name}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {pick('See every available unit in this compound.', 'اطّلع على كل الوحدات المتاحة في هذا الكمبوند.')}
                </p>
              </CardContent>
            </Card>
            )}

            {property.developer && (
            <Card>
              <CardContent className="space-y-2 p-5">
                <p className="eyebrow">{pick('Developer', 'المطور')}</p>
                <Link
                  href={routes.developer(property.developer.slug)}
                  className="block text-base font-semibold hover:text-primary"
                >
                  {property.developer.name}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {pick('Browse their other projects across Egypt.', 'تصفح مشروعاته الأخرى في مصر.')}
                </p>
              </CardContent>
            </Card>
            )}
          </section>

          {/* -------------------------------------------------------- similar */}
          <section className="space-y-4">
            <h2 className="display text-xl">{pick('Similar properties', 'وحدات مشابهة')}</h2>
            {similarLoading ? (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }, (_, index) => (
                  <PropertyCardSkeleton key={index} />
                ))}
              </div>
            ) : similar && similar.length > 0 ? (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {similar.slice(0, 6).map((item) => (
                  <PropertyCard key={item.id} property={item} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No comparable listings right now, try{' '}
                <Link href={routes.search()} className="underline">
                  browsing the full catalogue
                </Link>
                .
              </p>
            )}
          </section>
        </div>

        {/* ========================================================== sidebar */}
        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardContent className="space-y-5 p-5">
              <div>
                <p className="eyebrow">{pick('Monthly instalment', 'القسط الشهري')}</p>
                <p className="figure-lg mt-2 text-3xl text-foreground">
                  {formatEGP(property.paymentPlan.monthlyInstallment, { locale })}
                </p>
              </div>

              {/* The plan at full size: this is what the buyer is committing to. */}
              <InstalmentLedger
                price={property.price.amount}
                downPaymentPercent={property.paymentPlan.downPaymentPercent}
                installmentYears={property.paymentPlan.installmentYears}
                monthlyInstallment={property.paymentPlan.monthlyInstallment}
                deliveryDate={property.paymentPlan.deliveryDate}
                locale={locale}
                variant="detail"
              />

              <dl className="figure space-y-2.5 border-t border-border/60 pt-4 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{pick('Payments', 'عدد الأقساط')}</dt>
                  <dd>{property.paymentPlan.installmentYears * 12}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="flex items-center gap-1.5 text-muted-foreground">
                    <CalendarDays className="size-3.5" aria-hidden />
                    {pick('Handover', 'التسليم')}
                  </dt>
                  <dd>{formatDate(property.paymentPlan.deliveryDate, { locale })}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <LeadForm
                propertyId={propertyId}
                defaultMessage={`I am interested in ${property.referenceNo}, ${title}.`}
              />
            </CardContent>
          </Card>

          <MortgageCalculator
            price={property.price.amount}
            defaultDownPaymentPercent={property.paymentPlan.downPaymentPercent}
            defaultYears={property.paymentPlan.installmentYears}
          />
        </aside>
      </div>
    </article>
  );
}
