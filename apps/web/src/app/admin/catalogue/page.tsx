'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCompactEGP, formatNumber } from '@/lib/format';
import {
  useAreas,
  useCompounds,
  useDeleteArea,
  useDeleteCompound,
  useDeleteDeveloper,
  useDevelopers,
} from '@/lib/queries';
import { useUiStore } from '@/store/ui.store';

/**
 * Compounds, developers and areas — the three catalogues a listing points at.
 *
 * All three have carried POST/PATCH/DELETE since the beginning with nothing in
 * the dashboard able to reach them, which meant a new developer or area could
 * only be added by editing the seed and re-running it.
 *
 * They share a screen because they are read together: deciding whether an area
 * is worth keeping means looking at how many compounds sit in it, and a
 * developer with no compounds is the one safe to remove.
 */

type Entity = 'compounds' | 'developers' | 'areas';

interface PendingDelete {
  entity: Entity;
  id: string;
  label: string;
  /** Non-zero blocks the delete: something still references this row. */
  references: number;
  referenceLabel: string;
}

export default function AdminCataloguePage() {
  const t = useT();
  const locale = useUiStore((state) => state.locale);
  const [pending, setPending] = useState<PendingDelete | null>(null);

  const compounds = useCompounds({ limit: 100, sort: 'name' });
  const developers = useDevelopers();
  const areas = useAreas();

  const onDeleted = (message: string) => () => {
    toast.success(message);
    setPending(null);
  };
  const onFailed = (error: { message?: string }) =>
    toast.error(error.message || t('Could not remove it', 'تعذر الحذف'));

  const deleteCompound = useDeleteCompound({
    onSuccess: onDeleted(t('Compound removed', 'تم حذف الكمبوند')),
    onError: onFailed,
  });
  const deleteDeveloper = useDeleteDeveloper({
    onSuccess: onDeleted(t('Developer removed', 'تم حذف المطور')),
    onError: onFailed,
  });
  const deleteArea = useDeleteArea({
    onSuccess: onDeleted(t('Area removed', 'تم حذف المنطقة')),
    onError: onFailed,
  });

  function confirmDelete() {
    if (!pending) return;
    if (pending.entity === 'compounds') deleteCompound.mutate(pending.id);
    if (pending.entity === 'developers') deleteDeveloper.mutate(pending.id);
    if (pending.entity === 'areas') deleteArea.mutate(pending.id);
  }

  const removing =
    deleteCompound.isPending || deleteDeveloper.isPending || deleteArea.isPending;

  return (
    <div className="space-y-6 py-6">
      <header className="space-y-1">
        <h1 className="display text-3xl text-foreground">
          <T en="Catalogue" ar="الدليل" />
        </h1>
        <p className="text-sm text-muted-foreground">
          <T
            en="The compounds, developers and areas every listing points at."
            ar="الكمبوندات والمطورون والمناطق التي ترتبط بها كل وحدة."
          />
        </p>
      </header>

      <Tabs defaultValue="compounds">
        <TabsList>
          <TabsTrigger value="compounds">
            <T en="Compounds" ar="الكمبوندات" />
          </TabsTrigger>
          <TabsTrigger value="developers">
            <T en="Developers" ar="المطورون" />
          </TabsTrigger>
          <TabsTrigger value="areas">
            <T en="Areas" ar="المناطق" />
          </TabsTrigger>
        </TabsList>

        {/* ------------------------------------------------------ compounds */}
        <TabsContent value="compounds" className="mt-4">
          {compounds.isLoading ? (
            <TableSkeleton />
          ) : (compounds.data?.items.length ?? 0) === 0 ? (
            <EmptyState title={t('No compounds yet', 'لا توجد كمبوندات')} />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('Compound', 'الكمبوند')}</TableHead>
                        <TableHead>{t('Developer', 'المطور')}</TableHead>
                        <TableHead>{t('Area', 'المنطقة')}</TableHead>
                        <TableHead>{t('From', 'يبدأ من')}</TableHead>
                        <TableHead className="text-end">{t('Actions', 'إجراءات')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {compounds.data?.items.map((compound) => (
                        <TableRow key={compound.id}>
                          <TableCell className="align-top">
                            <div className="font-medium">
                              {locale === 'ar' ? compound.nameAr : compound.name}
                            </div>
                            <div className="text-xs text-muted-foreground" dir="ltr">
                              {compound.slug}
                            </div>
                          </TableCell>
                          <TableCell className="align-top text-sm text-muted-foreground">
                            {compound.developer?.name ?? '—'}
                          </TableCell>
                          <TableCell className="align-top text-sm text-muted-foreground">
                            {compound.area?.nameEn ?? '—'}
                          </TableCell>
                          <TableCell className="align-top tabular-nums">
                            {compound.startingPrice
                              ? formatCompactEGP(compound.startingPrice, { locale })
                              : '—'}
                          </TableCell>
                          <TableCell className="text-end align-top">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={t('Remove compound', 'حذف الكمبوند')}
                              onClick={() =>
                                setPending({
                                  entity: 'compounds',
                                  id: compound.id,
                                  label: locale === 'ar' ? compound.nameAr : compound.name,
                                  references: compound.propertyCount ?? 0,
                                  referenceLabel: t('listings', 'وحدة'),
                                })
                              }
                            >
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ----------------------------------------------------- developers */}
        <TabsContent value="developers" className="mt-4">
          {developers.isLoading ? (
            <TableSkeleton />
          ) : (developers.data?.items.length ?? 0) === 0 ? (
            <EmptyState title={t('No developers yet', 'لا يوجد مطورون')} />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('Developer', 'المطور')}</TableHead>
                        <TableHead>{t('Founded', 'تأسست')}</TableHead>
                        <TableHead>{t('Projects', 'المشاريع')}</TableHead>
                        <TableHead className="text-end">{t('Actions', 'إجراءات')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {developers.data?.items.map((developer) => (
                        <TableRow key={developer.id}>
                          <TableCell className="align-top">
                            <div className="flex items-center gap-2 font-medium">
                              {locale === 'ar' ? developer.nameAr : developer.name}
                              {developer.isFeatured ? (
                                <Badge variant="info">{t('Featured', 'مميز')}</Badge>
                              ) : null}
                            </div>
                            <div className="text-xs text-muted-foreground" dir="ltr">
                              {developer.slug}
                            </div>
                          </TableCell>
                          <TableCell className="align-top tabular-nums text-muted-foreground">
                            {developer.foundedYear ?? '—'}
                          </TableCell>
                          <TableCell className="align-top tabular-nums text-muted-foreground">
                            {formatNumber(developer.projectsCount)}
                          </TableCell>
                          <TableCell className="text-end align-top">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={t('Remove developer', 'حذف المطور')}
                              onClick={() =>
                                setPending({
                                  entity: 'developers',
                                  id: developer.id,
                                  label: locale === 'ar' ? developer.nameAr : developer.name,
                                  references: developer.compoundCount ?? 0,
                                  referenceLabel: t('compounds', 'كمبوند'),
                                })
                              }
                            >
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ---------------------------------------------------------- areas */}
        <TabsContent value="areas" className="mt-4">
          {areas.isLoading ? (
            <TableSkeleton />
          ) : (areas.data?.items.length ?? 0) === 0 ? (
            <EmptyState title={t('No areas yet', 'لا توجد مناطق')} />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('Area', 'المنطقة')}</TableHead>
                        <TableHead>{t('City', 'المدينة')}</TableHead>
                        <TableHead>{t('Listings', 'الوحدات')}</TableHead>
                        <TableHead>{t('Avg / m²', 'متوسط المتر')}</TableHead>
                        <TableHead className="text-end">{t('Actions', 'إجراءات')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {areas.data?.items.map((area) => (
                        <TableRow key={area.id}>
                          <TableCell className="align-top">
                            <div className="font-medium">
                              {locale === 'ar' ? area.nameAr : area.nameEn}
                            </div>
                            <div className="text-xs text-muted-foreground" dir="ltr">
                              {area.slug}
                            </div>
                          </TableCell>
                          <TableCell className="align-top text-sm text-muted-foreground">
                            {area.city}
                          </TableCell>
                          <TableCell className="align-top tabular-nums text-muted-foreground">
                            {formatNumber(area.propertyCount)}
                          </TableCell>
                          <TableCell className="align-top tabular-nums text-muted-foreground">
                            {area.avgPricePerMeter
                              ? formatCompactEGP(area.avgPricePerMeter, { locale })
                              : '—'}
                          </TableCell>
                          <TableCell className="text-end align-top">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={t('Remove area', 'حذف المنطقة')}
                              onClick={() =>
                                setPending({
                                  entity: 'areas',
                                  id: area.id,
                                  label: locale === 'ar' ? area.nameAr : area.nameEn,
                                  references: area.propertyCount ?? 0,
                                  referenceLabel: t('listings', 'وحدة'),
                                })
                              }
                            >
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(pending)} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <T en="Remove this entry?" ar="حذف هذا العنصر؟" />
            </DialogTitle>
            <DialogDescription>{pending?.label}</DialogDescription>
          </DialogHeader>

          {/* Deleting something a listing still points at leaves that listing
              with a dangling reference, so the count is shown and the button
              is disabled rather than letting the API reject it afterwards. */}
          {pending && pending.references > 0 ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <T en="Still referenced by" ar="ما زال مرتبطًا بـ" />{' '}
              {formatNumber(pending.references)} {pending.referenceLabel}.{' '}
              <T en="Move those first." ar="انقلها أولاً." />
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              <T en="Nothing references it, so this is safe." ar="لا شيء مرتبط به، الحذف آمن." />
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>
              <T en="Cancel" ar="إلغاء" />
            </Button>
            <Button
              variant="destructive"
              disabled={removing || (pending?.references ?? 0) > 0}
              onClick={confirmDelete}
            >
              <T en="Remove" ar="حذف" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton key={index} className="h-14 w-full" />
      ))}
    </div>
  );
}
