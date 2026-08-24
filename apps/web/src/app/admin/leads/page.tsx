'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Mail, Phone, Search as SearchIcon } from 'lucide-react';
import { toast } from 'sonner';

import { T, useT } from '@/components/i18n/t';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { LEAD_STATUS_OPTIONS, getEnumLabel } from '@/lib/constants';
import { formatNumber } from '@/lib/format';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useLeads, useUpdateLead } from '@/lib/queries';
import { routes } from '@/lib/routes';
import { useUiStore } from '@/store/ui.store';
import type { LeadStatus } from '@/types/enums';
import type { Lead } from '@/types/lead';

const PAGE_SIZE = 25;

/** The pill colour is the one the status already carries in LEAD_STATUS_OPTIONS. */
function statusVariant(status: LeadStatus) {
  return LEAD_STATUS_OPTIONS.find((option) => option.value === status)?.tone ?? 'default';
}

/**
 * The user menu has always offered admins a "Leads" item, and it pointed at a
 * route with no page behind it — a 404 for the one screen an agent lives in.
 *
 * The API side was already complete (list, filter, paginate, PATCH the status),
 * so this is the view over it: triage the queue, move a lead along, call or
 * mail the person without leaving the row.
 */
export default function AdminLeadsPage() {
  const t = useT();
  const locale = useUiStore((state) => state.locale);

  const [status, setStatus] = useState<LeadStatus | 'all'>('all');
  const [term, setTerm] = useState('');
  const [page, setPage] = useState(1);

  // The list refetches per keystroke otherwise, and this is a staff screen
  // where someone is typing a phone number they are reading off a note.
  const debouncedTerm = useDebouncedValue(term, 300);

  const params = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      sort: '-createdAt',
      ...(status === 'all' ? {} : { status }),
      ...(debouncedTerm.trim() ? { q: debouncedTerm.trim() } : {}),
    }),
    [page, status, debouncedTerm],
  );

  const { data, isLoading, isError } = useLeads(params);
  const updateLead = useUpdateLead({
    onSuccess: () => toast.success(t('Lead updated', 'تم تحديث العميل')),
    onError: () => toast.error(t('Could not update the lead', 'تعذر تحديث العميل')),
  });

  const leads: Lead[] = data?.items ?? [];
  const total = data?.meta?.total ?? 0;
  const totalPages = data?.meta?.totalPages ?? 1;

  function changeStatus(lead: Lead, next: LeadStatus) {
    if (next === lead.status) return;
    updateLead.mutate({ id: lead.id, patch: { status: next } });
  }

  function resetTo(nextStatus: LeadStatus | 'all') {
    setStatus(nextStatus);
    setPage(1);
  }

  return (
    <div className="space-y-6 py-6">
      <header className="space-y-1">
        <h1 className="display text-3xl text-foreground">
          <T en="Leads" ar="العملاء المحتملون" />
        </h1>
        <p className="text-sm text-muted-foreground">
          {isLoading ? (
            <T en="Loading enquiries…" ar="جارٍ تحميل الطلبات…" />
          ) : (
            <>
              {formatNumber(total)}{' '}
              <T en="enquiries, newest first" ar="طلب، الأحدث أولاً" />
            </>
          )}
        </p>
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
            placeholder={t('Search name, phone or email', 'ابحث بالاسم أو الهاتف أو البريد')}
            aria-label={t('Search leads', 'ابحث في العملاء')}
          />
        </div>

        <Select value={status} onValueChange={(value) => resetTo(value as LeadStatus | 'all')}>
          <SelectTrigger className="sm:w-56" aria-label={t('Filter by status', 'تصفية حسب الحالة')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('All statuses', 'كل الحالات')}</SelectItem>
            {LEAD_STATUS_OPTIONS.map((option) => (
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
            <T en="Could not load the leads." ar="تعذر تحميل قائمة العملاء." />
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : leads.length === 0 ? (
        <EmptyState
          title={t('No leads match those filters', 'لا يوجد عملاء مطابقون')}
          description={t(
            'Try a different status, or clear the search.',
            'جرّب حالة أخرى أو امسح البحث.',
          )}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('Person', 'الشخص')}</TableHead>
                    <TableHead>{t('Interest', 'الاهتمام')}</TableHead>
                    <TableHead>{t('Source', 'المصدر')}</TableHead>
                    <TableHead>{t('Received', 'تاريخ الطلب')}</TableHead>
                    <TableHead className="text-end">{t('Status', 'الحالة')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell className="align-top">
                        <div className="font-medium">{lead.name}</div>
                        <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                          {/* Staff act on a lead by ringing it, so the phone is a
                              link rather than text to copy out by hand. */}
                          <a
                            href={`tel:${lead.phone}`}
                            className="inline-flex items-center gap-1 hover:text-foreground"
                          >
                            <Phone aria-hidden="true" className="size-3" />
                            <span dir="ltr">{lead.phone}</span>
                          </a>
                          <a
                            href={`mailto:${lead.email}`}
                            className="inline-flex items-center gap-1 hover:text-foreground"
                          >
                            <Mail aria-hidden="true" className="size-3" />
                            <span dir="ltr">{lead.email}</span>
                          </a>
                        </div>
                      </TableCell>

                      <TableCell className="max-w-xs align-top text-sm">
                        {lead.property?.slug ? (
                          <Link
                            href={routes.property(lead.property.slug)}
                            className="underline underline-offset-2"
                          >
                            {lead.property.referenceNo ?? lead.property.slug}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">
                            {t('General enquiry', 'استفسار عام')}
                          </span>
                        )}
                        {lead.message ? (
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {lead.message}
                          </p>
                        ) : null}
                      </TableCell>

                      <TableCell className="align-top text-sm text-muted-foreground">
                        {lead.source}
                      </TableCell>

                      <TableCell className="align-top text-sm tabular-nums text-muted-foreground">
                        {new Date(lead.createdAt).toLocaleDateString(
                          locale === 'ar' ? 'ar-EG' : 'en-GB',
                          { day: '2-digit', month: 'short', year: 'numeric' },
                        )}
                      </TableCell>

                      <TableCell className="align-top">
                        <div className="flex items-center justify-end gap-2">
                          <Badge variant={statusVariant(lead.status)} className="hidden sm:inline-flex">
                            {getEnumLabel(LEAD_STATUS_OPTIONS, lead.status, locale)}
                          </Badge>
                          <Select
                            value={lead.status}
                            onValueChange={(value) => changeStatus(lead, value as LeadStatus)}
                          >
                            <SelectTrigger
                              className="w-36"
                              aria-label={t('Change status', 'تغيير الحالة')}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {LEAD_STATUS_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {locale === 'ar' ? option.labelAr : option.labelEn}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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
          <span className="text-muted-foreground tabular-nums">
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

      <p className="text-sm text-muted-foreground">
        <Link href={routes.admin} className="underline">
          <T en="Back to the dashboard" ar="العودة إلى لوحة التحكم" />
        </Link>
      </p>
    </div>
  );
}
