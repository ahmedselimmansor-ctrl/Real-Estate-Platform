'use client';

import Link from 'next/link';
import { Heart } from 'lucide-react';

import { T, useT } from '@/components/i18n/t';
import { PageHeader } from '@/components/layout/page-header';
import { PropertyCard, PropertyCardSkeleton } from '@/components/property/property-card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useProperties } from '@/lib/queries';
import { routes } from '@/lib/routes';
import { useFavoritesStore } from '@/store/favorites.store';
import { useMounted } from '@/hooks/use-mounted';

/**
 * Saved listings.
 *
 * The ids live in the persisted store, so a guest keeps their shortlist without
 * an account; signing in syncs it to the server.
 */
export default function FavoritesPage() {
  const t = useT();
  const mounted = useMounted();
  const ids = useFavoritesStore((state) => state.ids);
  const clear = useFavoritesStore((state) => state.clear);

  // One request for the whole shortlist rather than one per card.
  const { data, isLoading } = useProperties({ limit: 100 }, { enabled: mounted && ids.length > 0 });
  const saved = (data?.items ?? []).filter((property) => ids.includes(property.propertyId));

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 lg:px-6">
      <PageHeader
        eyebrow={<T en="Your shortlist" ar="قائمتك المختصرة" />}
        title={<T en="Saved homes" ar="الوحدات المحفوظة" />}
        lede={
          <T
            en="Kept on this device. Sign in on the dashboard to sync them to your account."
            ar="محفوظة على هذا الجهاز. سجّل الدخول من لوحة التحكم لمزامنتها مع حسابك."
          />
        }
        count={mounted ? ids.length : undefined}
        countLabel={<T en="saved" ar="محفوظة" />}
      >
        {mounted && ids.length > 0 ? (
          <Button variant="ghost" size="sm" className="mt-4" onClick={clear}>
            <T en="Clear all" ar="مسح الكل" />
          </Button>
        ) : null}
      </PageHeader>

      {!mounted || (isLoading && ids.length > 0) ? (
        <div className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <PropertyCardSkeleton key={index} />
          ))}
        </div>
      ) : ids.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            icon={Heart}
            title={t('Nothing saved yet', 'لا توجد وحدات محفوظة')}
            description={t('Tap the heart on any listing and it will show up here.', 'اضغط على القلب في أي وحدة وستظهر هنا.')}
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
        <div className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {saved.map((property) => (
            <PropertyCard key={property.propertyId} property={property} />
          ))}
        </div>
      )}
    </div>
  );
}
