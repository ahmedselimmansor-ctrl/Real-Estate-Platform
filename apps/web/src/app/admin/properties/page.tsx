'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Search as SearchIcon, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { T, useT } from '@/components/i18n/t';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { PROPERTY_STATUS_OPTIONS, getEnumLabel } from '@/lib/constants';
import { formatCompactEGP, formatNumber } from '@/lib/format';
import { useDeleteProperty, useProperties, useUpdateProperty } from '@/lib/queries';
import { routes } from '@/lib/routes';
import { useUiStore } from '@/store/ui.store';
import type { PropertyStatus } from '@/types/enums';
import type { Property } from '@/types/property';

const PAGE_SIZE = 25;

function statusVariant(status: PropertyStatus) {
  return PROPERTY_STATUS_OPTIONS.find((option) => option.value === status)?.tone ?? 'default';
}

/**
 * Listing operations.
 *
 * api-core has carried POST/PATCH/DELETE on properties from the start and
 * nothing in the dashboard could reach any of it, so the catalogue was editable
 * only through the seeder or by hand in Mongo. This is the screen an operator
 * actually spends the day in: find a unit, move its status, feature it, or take
 * it down.
 *
 * The status and featured controls write immediately rather than collecting
 * into a form. Marking a unit sold is a single decision made while looking at
 * the row, and making someone open an editor and save to do it is how a sold
 * listing stays on the storefront for another hour.
 */
export default function AdminPropertiesPage() {
  const t = useT();
  const locale = useUiStore((state) => state.locale);

  const [status, setStatus] = useState<PropertyStatus | 'all'>('all');
  const [term, setTerm] = useState('');
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<Property | null>(null);

  const debouncedTerm = useDebouncedValue(term, 300);

  const params = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      sort: '-publishedAt',
      ...(status === 'all' ? {} : { status }),
      ...(debouncedTerm.trim() ? { q: debouncedTerm.trim() } : {}),
    }),
    [page, status, debouncedTerm],
  );

  const { data, isLoading, isError } = useProperties(params);

  const updateProperty = useUpdateProperty({
    onError: (error) =>
      toast.error(error.message || t('Could not update the listing', 'تعذر تحديث الوحدة')),
  });

  const deleteProperty = useDeleteProperty({
    onSuccess: () => {
      toast.success(t('Listing removed', 'تم حذف الوحدة'));
      setPendingDelete(null);
    },
    onError: (error) =>
      toast.error(error.message || t('Could not remove the listing', 'تعذر حذف الوحدة')),
  });

  const properties = data?.items ?? [];
  const total = data?.meta?.total ?? 0;
  const totalPages = data?.meta?.totalPages ?? 1;

  function changeStatus(property: Property, next: PropertyStatus) {
    if (next === property.status) return;
    updateProperty.mutate(
      { id: property.propertyId, patch: { status: next } },
      { onSuccess: () => toast.success(t('Status updated', 'تم تحديث الحالة')) },
    );
  }

  function toggleFeatured(property: Property) {
    updateProperty.mutate({
      id: property.propertyId,
      patch: { isFeatured: !property.isFeatured },
    });
  }

  return (
    <div className="space-y-6 py-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="display text-3xl text-foreground">
            <T en="Listings" ar="الوحدات" />
          </h1>
          <p className="text-sm text-muted-foreground">
            {isLoading ? (
              <T en="Loading the catalogue…" ar="جارٍ تحميل الدليل…" />
            ) : (
              <>
                {formatNumber(total)} <T en="listings" ar="وحدة" />
              </>
            )}
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={term}
            onChange={(event) => {
              setTerm(event.target.value);
              setPage(1);
            }}
            className="ps-9"
            placeholder={t('Search title, reference or slug', 'ابحث بالعنوان أو الرقم المرجعي')}
            aria-label={t('Search listings', 'ابحث في الوحدات')}
          />
        </div>

        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value as PropertyStatus | 'all');
            setPage(1);
          }}
        >
          <SelectTrigger className="sm:w-56" aria-label={t('Filter by status', 'تصفية حسب الحالة')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('All statuses', 'كل الحالات')}</SelectItem>
            {PROPERTY_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {locale === 'ar' ? option.labelAr : option.labelEn}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isError ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">
            <T en="Could not load the catalogue." ar="تعذر تحميل الدليل." />
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : properties.length === 0 ? (
        <EmptyState
          title={t('No listings match those filters', 'لا توجد وحدات مطابقة')}
          description={t('Try a different status, or clear the search.', 'جرّب حالة أخرى أو امسح البحث.')}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('Listing', 'الوحدة')}</TableHead>
                    <TableHead>{t('Price', 'السعر')}</TableHead>
                    <TableHead>{t('Specs', 'المواصفات')}</TableHead>
                    <TableHead className="text-center">{t('Featured', 'مميزة')}</TableHead>
                    <TableHead className="text-end">{t('Status', 'الحالة')}</TableHead>
                    <TableHead className="text-end">{t('Actions', 'إجراءات')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {properties.map((property) => (
                    <TableRow key={property.propertyId}>
                      <TableCell className="max-w-sm align-top">
                        <div className="line-clamp-1 font-medium">
                          {locale === 'ar' ? property.title.ar : property.title.en}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span dir="ltr">{property.referenceNo}</span>
                          <span>·</span>
                          <span>{property.location?.areaName}</span>
                          {/* A draft has never been published, so an operator
                              needs to see that before wondering why the
                              storefront does not show it. */}
                          {!property.publishedAt ? (
                            <Badge variant="warning">{t('Draft', 'مسودة')}</Badge>
                          ) : null}
                        </div>
                      </TableCell>

                      <TableCell className="align-top tabular-nums">
                        {formatCompactEGP(property.price?.amount, { locale })}
                      </TableCell>

                      <TableCell className="align-top text-sm text-muted-foreground">
                        {property.specs?.bedrooms}
                        <T en=" bd · " ar=" غرفة · " />
                        {property.specs?.areaSqm}
                        <T en=" m²" ar=" م²" />
                      </TableCell>

                      <TableCell className="text-center align-top">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleFeatured(property)}
                          disabled={updateProperty.isPending}
                          aria-pressed={property.isFeatured}
                          aria-label={
                            property.isFeatured
                              ? t('Remove from featured', 'إزالة من المميزة')
                              : t('Mark as featured', 'تعيين كمميزة')
                          }
                        >
                          <Star
                            className={
                              property.isFeatured
                                ? 'size-4 fill-warning text-warning'
                                : 'size-4 text-muted-foreground'
                            }
                          />
                        </Button>
                      </TableCell>

                      <TableCell className="align-top">
                        <div className="flex items-center justify-end gap-2">
                          <Badge
                            variant={statusVariant(property.status)}
                            className="hidden lg:inline-flex"
                          >
                            {getEnumLabel(PROPERTY_STATUS_OPTIONS, property.status, locale)}
                          </Badge>
                          <Select
                            value={property.status}
                            onValueChange={(value) =>
                              changeStatus(property, value as PropertyStatus)
                            }
                          >
                            <SelectTrigger
                              className="w-36"
                              aria-label={t('Change status', 'تغيير الحالة')}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PROPERTY_STATUS_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {locale === 'ar' ? option.labelAr : option.labelEn}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </TableCell>

                      <TableCell className="align-top">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" asChild>
                            <Link
                              href={routes.property(property.slug)}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={t('Open on the storefront', 'فتح في الموقع')}
                            >
                              <ExternalLink className="size-4" />
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setPendingDelete(property)}
                            aria-label={t('Remove listing', 'حذف الوحدة')}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            <T en="Previous" ar="السابق" />
          </Button>
          <span className="tabular-nums text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          >
            <T en="Next" ar="التالي" />
          </Button>
        </div>
      ) : null}

      {/* Removing a listing is not reversible from this screen, so it asks —
          and names the unit, because the row it came from is behind a dialog. */}
      <Dialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <T en="Remove this listing?" ar="حذف هذه الوحدة؟" />
            </DialogTitle>
            <DialogDescription>
              {pendingDelete
                ? locale === 'ar'
                  ? pendingDelete.title.ar
                  : pendingDelete.title.en
                : null}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <T
              en="It disappears from the storefront and from search. Enquiries already received are kept."
              ar="ستختفي من الموقع ومن البحث. الطلبات المستلمة بالفعل تبقى محفوظة."
            />
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              <T en="Cancel" ar="إلغاء" />
            </Button>
            <Button
              variant="destructive"
              disabled={deleteProperty.isPending}
              onClick={() => pendingDelete && deleteProperty.mutate(pendingDelete.propertyId)}
            >
              <T en="Remove" ar="حذف" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
