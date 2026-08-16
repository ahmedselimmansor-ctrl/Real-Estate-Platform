'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { MAIN_NAV } from '@/lib/constants';
import { useI18n } from '@/hooks/use-i18n';
import { cn } from '@/lib/utils';

/** Desktop primary navigation: Buy · Rent · Compounds · Developers · Areas · Nawy Now. */
export function MainNav({ className }: { className?: string }) {
  const pathname = usePathname();
  const { locale, pick } = useI18n();

  return (
    <nav
      aria-label={pick('Primary', 'التنقل الرئيسي')}
      className={cn('items-center gap-1', className)}
    >
      {MAIN_NAV.map((item) => {
        const [path] = item.href.split('?');
        const isActive = path === '/' ? pathname === '/' : pathname.startsWith(path ?? '');

        return (
          <Link
            key={item.href}
            href={item.href}
            data-active={isActive || undefined}
            className={cn(
              'relative inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium',
              'text-muted-foreground transition-colors outline-none',
              'hover:bg-muted hover:text-foreground',
              'focus-visible:ring-2 focus-visible:ring-ring/50',
              'data-[active]:text-foreground',
            )}
          >
            {locale === 'ar' ? item.labelAr : item.labelEn}
            {item.badge === 'new' ? (
              <span className="rounded-full bg-featured px-1.5 py-0.5 text-[10px] leading-none font-semibold text-featured-foreground uppercase">
                {pick('New', 'جديد')}
              </span>
            ) : null}
            {isActive ? (
              <span
                aria-hidden="true"
                className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary"
              />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
