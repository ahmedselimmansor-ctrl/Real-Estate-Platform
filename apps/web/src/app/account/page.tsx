'use client';

import Link from 'next/link';
import { Bookmark, Heart, Scale, UserRound } from 'lucide-react';

import { T, useT } from '@/components/i18n/t';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { routes } from '@/lib/routes';
import { useMounted } from '@/hooks/use-mounted';
import { useCompareStore } from '@/store/compare.store';
import { useFavoritesStore } from '@/store/favorites.store';
import { useAuthStore } from '@/store/auth.store';

/**
 * Everything kept for this visitor. Works signed out, because the shortlist and
 * the comparison live on the device until an account exists to sync them to.
 */
export default function AccountPage() {
  const t = useT();
  const mounted = useMounted();
  const user = useAuthStore((state) => state.user);
  const savedCount = useFavoritesStore((state) => state.ids.length);
  const compareCount = useCompareStore((state) => state.items.length);

  const cards = [
    {
      icon: Heart,
      label: t('Saved homes', 'الوحدات المحفوظة'),
      value: mounted ? savedCount : 0,
      href: routes.favorites,
    },
    {
      icon: Scale,
      label: t('In comparison', 'في المقارنة'),
      value: mounted ? compareCount : 0,
      href: routes.compare,
    },
    {
      icon: Bookmark,
      label: t('Saved searches', 'عمليات البحث المحفوظة'),
      value: null,
      href: routes.savedSearches,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 lg:px-6">
      <PageHeader
        eyebrow={<T en="Your things" ar="أغراضك" />}
        title={user ? user.name : t('Your account', 'حسابك')}
        lede={
          user
            ? user.email
            : t(
                'Saved homes and comparisons are kept on this device. No account needed to browse.',
                'الوحدات المحفوظة والمقارنات محفوظة على هذا الجهاز. لا حاجة لحساب للتصفح.',
              )
        }
      />

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <Link key={card.label} href={card.href} className="focus:outline-none">
            <Card className="h-full transition-colors hover:border-primary/40">
              <CardContent className="space-y-3 p-5">
                <card.icon className="size-5 text-primary" aria-hidden />
                <p className="text-sm text-muted-foreground">{card.label}</p>
                {card.value !== null ? (
                  <p className="figure text-2xl text-foreground">{card.value}</p>
                ) : (
                  <p className="text-sm text-primary">
                    <T en="View" ar="عرض" />
                  </p>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {!user ? (
        <Card className="mt-6">
          <CardContent className="flex items-start gap-3 p-5">
            <UserRound className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">
              <T
                en="Signing in is only needed for the staff dashboard. Everything on this page works without one."
                ar="تسجيل الدخول مطلوب فقط للوحة تحكم الموظفين. كل ما في هذه الصفحة يعمل بدونه."
              />
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
