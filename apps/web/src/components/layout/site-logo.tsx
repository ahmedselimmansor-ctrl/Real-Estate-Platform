import * as React from 'react';
import Link from 'next/link';

import { TopChoiceLockup } from '@/components/brand/topchoice-mark';
import { cn } from '@/lib/utils';
import { routes } from '@/lib/routes';
import { BRAND } from '@/lib/constants';

export interface SiteLogoProps extends React.HTMLAttributes<HTMLAnchorElement> {
  /** Smaller lockup for compact bars. */
  compact?: boolean;
  href?: string;
}

/**
 * The TopChoice lockup in the header.
 *
 * Vector rather than a raster: it stays sharp on any display, inverts with the
 * theme, and needs no light plate behind it to stay legible on the dark petrol
 * header.
 */
export function SiteLogo({
  className,
  compact = false,
  href = routes.home,
  ...props
}: SiteLogoProps) {
  return (
    <Link
      href={href}
      aria-label={`${BRAND.name}, home`}
      className={cn(
        'inline-flex items-center rounded-xl outline-none transition-opacity hover:opacity-90',
        'focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
      {...props}
    >
      <TopChoiceLockup
        name={BRAND.name}
        markClassName={compact ? 'size-7' : 'size-8'}
        wordmarkClassName={cn(
          'text-foreground',
          compact ? 'text-base' : 'text-[1.0625rem]',
          // The wordmark is redundant with the mark on a narrow bar.
          'hidden sm:inline',
        )}
      />
    </Link>
  );
}
