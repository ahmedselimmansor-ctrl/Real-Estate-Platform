'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Menu, Phone } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { useI18n } from '@/hooks/use-i18n';
import { BRAND, MAIN_NAV, POPULAR_AREAS, TOP_DEVELOPERS } from '@/lib/constants';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { LanguageToggle } from './language-toggle';
import { OmniboxSearch } from './omnibox-search';
import { ThemeToggle } from './theme-toggle';

/** Slide-over navigation for small screens. */
export function MobileNav() {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();
  const { locale, pick } = useI18n();

  // Any route change closes the panel.
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="xl:hidden"
          aria-label={pick('Open menu', 'فتح القائمة')}
        >
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>

      <SheetContent side="left" className="w-full max-w-sm p-0">
        <SheetHeader className="border-b border-border">
          <SheetTitle>{pick('Menu', 'القائمة')}</SheetTitle>
          <SheetDescription>
            {locale === 'ar' ? BRAND.tagline.ar : BRAND.tagline.en}
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="flex flex-col gap-6">
          <OmniboxSearch onNavigate={() => setOpen(false)} />

          <nav aria-label={pick('Primary', 'التنقل الرئيسي')} className="flex flex-col">
            {MAIN_NAV.map((item) => {
              const Icon = item.icon;
              const [path] = item.href.split('?');
              const isActive = pathname.startsWith(path ?? '');

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-3 transition-colors',
                    isActive ? 'bg-primary-soft text-accent-foreground' : 'hover:bg-muted',
                  )}
                >
                  {Icon ? (
                    <span className="flex size-9 items-center justify-center rounded-lg bg-card text-primary shadow-xs">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">
                      {locale === 'ar' ? item.labelAr : item.labelEn}
                    </span>
                    {item.descriptionEn ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {locale === 'ar' ? item.descriptionAr : item.descriptionEn}
                      </span>
                    ) : null}
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground flip-rtl"
                    aria-hidden="true"
                  />
                </Link>
              );
            })}
          </nav>

          <Separator />

          <section>
            <h3 className="mb-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {pick('Popular areas', 'مناطق شائعة')}
            </h3>
            <div className="flex flex-wrap gap-2">
              {POPULAR_AREAS.slice(0, 6).map((area) => (
                <Link
                  key={area.slug}
                  href={routes.area(area.slug)}
                  className="rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary/40 hover:bg-primary-soft"
                >
                  {locale === 'ar' ? area.labelAr : area.labelEn}
                </Link>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {pick('Top developers', 'أبرز المطورين')}
            </h3>
            <div className="flex flex-wrap gap-2">
              {TOP_DEVELOPERS.slice(0, 6).map((developer) => (
                <Link
                  key={developer.slug}
                  href={routes.developer(developer.slug)}
                  className="rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary/40 hover:bg-primary-soft"
                >
                  {locale === 'ar' ? developer.labelAr : developer.labelEn}
                </Link>
              ))}
            </div>
          </section>
        </SheetBody>

        <SheetFooter className="border-t border-border">
          <div className="flex w-full items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <LanguageToggle />
              <ThemeToggle />
            </div>
            <Button asChild variant="outline" size="sm">
              <a href={`tel:${BRAND.phone.replace(/\s/g, '')}`}>
                <Phone aria-hidden="true" />
                {pick('Call us', 'اتصل بنا')}
              </a>
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
