'use client';

import Link from 'next/link';
import { Bookmark, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { T, useT } from '@/components/i18n/t';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useDeleteSavedSearch, useSavedSearches } from '@/lib/queries';
import { routes } from '@/lib/routes';
import { useAuthStore } from '@/store/auth.store';
import type { SearchFilters } from '@/types/search';

export default function SavedSearchesPage() {
  const t = useT();
  const isAuthenticated = useAuthStore((state) => state.status === 'authenticated');
  const { data, isLoading } = useSavedSearches({ enabled: isAuthenticated });
  const remove = useDeleteSavedSearch();

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 lg:px-6">
      <PageHeader
        eyebrow={<T en="Alerts" ar="التنبيهات" />}
        title={<T en="Saved searches" ar="عمليات البحث المحفوظة" />}
        lede={
          <T
            en="Filter sets you asked us to keep. We will tell you when something new matches."
            ar="مجموعات الفلاتر التي طلبت حفظها. سنخبرك عند ظهور وحدة مطابقة."
          />
        }
      />

      {!isAuthenticated ? (
        <div className="mt-10">
          <EmptyState
            icon={Bookmark}
            title={t('Saved searches need an account', 'حفظ البحث يتطلب حسابًا')}
            description={t('Sign in from the dashboard to keep a filter set and get alerts.', 'سجّل الدخول من لوحة التحكم لحفظ الفلاتر وتلقي التنبيهات.')}
            action={
              <Button asChild variant="outline">
                <Link href={routes.search()}>
                  <T en="Keep browsing" ar="واصل التصفح" />
                </Link>
              </Button>
            }
          />
        </div>
      ) : isLoading ? (
        <div className="mt-10 space-y-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : (data?.items.length ?? 0) === 0 ? (
        <div className="mt-10">
          <EmptyState
            icon={Bookmark}
            title={t('No saved searches yet', 'لا توجد عمليات بحث محفوظة')}
            description={t('Run a search you like, then use “Save search” above the results.', 'نفّذ بحثًا يعجبك ثم استخدم «احفظ البحث» أعلى النتائج.')}
            action={
              <Button asChild>
                <Link href={routes.search()}>
                  <T en="Search homes" ar="ابحث عن وحدات" />
                </Link>
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="mt-10 space-y-3">
          {data?.items.map((search) => (
            <li key={search.id}>
              <Card>
                <CardContent className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <Link
                      href={routes.search(search.filters as SearchFilters)}
                      className="font-medium hover:text-primary"
                    >
                      {search.name}
                    </Link>
                    <p className="figure mt-1 text-xs text-muted-foreground">
                      {search.alertsEnabled
                        ? t('Alerts on', 'التنبيهات مفعّلة')
                        : t('Alerts off', 'التنبيهات متوقفة')}
                    </p>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${search.name}`}
                    onClick={() =>
                      remove.mutate(search.id, {
                        onSuccess: () => toast.success('Saved search deleted'),
                        onError: () => toast.error('Could not delete that'),
                      })
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
