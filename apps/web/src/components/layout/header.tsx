'use client';

import * as React from 'react';
import Link from 'next/link';
import { Scale, Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/hooks/use-i18n';
import { useMounted } from '@/hooks/use-mounted';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { useCompareCount } from '@/store/compare.store';
import { FavoritesButton } from './favorites-button';
import { LanguageToggle } from './language-toggle';
import { MainNav } from './main-nav';
import { MobileNav } from './mobile-nav';
import { OmniboxSearch } from './omnibox-search';
import { SiteLogo } from './site-logo';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';

/**
 * Sticky site header: logo · primary nav · omnibox · locale/theme · saved ·
 * compare · account. Frosted glass with a hairline border that only appears
 * once the page has scrolled.
 */
export function SiteHeader() {
  const { pick } = useI18n();
  const mounted = useMounted();
  const compareCount = useCompareCount();
  const [scrolled, setScrolled] = React.useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = React.useState(false);

  React.useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      data-scrolled={scrolled || undefined}
      className={cn(
        'sticky top-0 z-50 w-full glass transition-shadow duration-200',
        'border-b border-transparent data-[scrolled]:border-border data-[scrolled]:shadow-card',
      )}
    >
      <div className="container-page">
        <div className="flex h-16 items-center gap-2 lg:h-18 lg:gap-4">
          <MobileNav />

          <SiteLogo className="shrink-0" />

          <MainNav className="hidden xl:flex" />

          <div className="ms-auto hidden min-w-0 flex-1 justify-end md:flex xl:ms-4 xl:justify-center">
            <OmniboxSearch className="max-w-md" />
          </div>

          <div className="ms-auto flex items-center gap-1 md:ms-0">
            <Button
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              aria-label={pick('Search', 'بحث')}
              aria-expanded={mobileSearchOpen}
              onClick={() => setMobileSearchOpen((open) => !open)}
            >
              {mobileSearchOpen ? <X aria-hidden="true" /> : <Search aria-hidden="true" />}
            </Button>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  variant="ghost"
                  size="icon-sm"
                  className="relative hidden sm:inline-flex"
                >
                  <Link href={routes.compare} aria-label={pick('Compare', 'المقارنة')}>
                    <Scale aria-hidden="true" />
                    {mounted && compareCount > 0 ? (
                      <span
                        className="absolute -top-1 -end-1 flex min-w-4.5 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-4 font-semibold text-primary-foreground"
                        aria-hidden="true"
                      >
                        {compareCount}
                      </span>
                    ) : null}
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{pick('Compare properties', 'قارن العقارات')}</TooltipContent>
            </Tooltip>

            <FavoritesButton />

            <LanguageToggle className="hidden sm:inline-flex" compact />
            <ThemeToggle className="hidden sm:inline-flex" />

            <div className="ms-1">
              <UserMenu />
            </div>
          </div>
        </div>

        {mobileSearchOpen ? (
          <div className="pb-3 md:hidden">
            <OmniboxSearch autoFocus onNavigate={() => setMobileSearchOpen(false)} />
          </div>
        ) : null}
      </div>
    </header>
  );
}
