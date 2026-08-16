'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useI18n } from '@/hooks/use-i18n';
import { useMounted } from '@/hooks/use-mounted';
import { MOBILE_BOTTOM_NAV } from '@/lib/constants';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { useFavoritesCount } from '@/store/favorites.store';

/**
 * Thumb-reachable bottom bar for phones. Hidden from `lg` up; the root layout
 * reserves matching bottom padding so it never covers page content.
 */
export function MobileBottomNav() {
  const pathname = usePathname();
  const { locale } = useI18n();
  const mounted = useMounted();
  const favorites = useFavoritesCount();

  return (
    <nav
      aria-label={locale === 'ar' ? 'التنقل السريع' : 'Quick navigation'}
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 lg:hidden',
        'glass border-t border-border',
        'pb-[env(safe-area-inset-bottom)]',
      )}
    >
      <ul className="grid grid-cols-5">
        {MOBILE_BOTTOM_NAV.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === routes.home ? pathname === '/' : pathname.startsWith(item.href);
          const showBadge = mounted && item.href === routes.favorites && favorites > 0;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'relative flex h-full flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span className="relative">
                  {Icon ? <Icon className="size-5" aria-hidden="true" /> : null}
                  {showBadge ? (
                    <span
                      className="absolute -top-1.5 -end-2 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] leading-4 font-semibold text-destructive-foreground"
                      aria-hidden="true"
                    >
                      {favorites > 99 ? '99+' : favorites}
                    </span>
                  ) : null}
                </span>
                {locale === 'ar' ? item.labelAr : item.labelEn}
                {isActive ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-primary"
                  />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
