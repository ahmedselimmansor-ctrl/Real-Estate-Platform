import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';

import { cn } from '@/lib/utils';
import { routes } from '@/lib/routes';
import { BRAND } from '@/lib/constants';

/** Intrinsic size of `public/brand/nawy-logo.png`. */
const LOGO_WIDTH = 510;
const LOGO_HEIGHT = 186;
const RATIO = LOGO_WIDTH / LOGO_HEIGHT;

export interface SiteLogoProps extends React.HTMLAttributes<HTMLAnchorElement> {
  /** Smaller lockup for compact bars. */
  compact?: boolean;
  href?: string;
}

/**
 * The Nawy wordmark.
 *
 * The supplied PNG carries an opaque near-white background rather than
 * transparency, so rather than fight it the mark is presented on a deliberate
 * light plate. That reads as intentional in both themes and keeps the navy
 * lettering legible on the dark petrol header, where a bare transparent
 * placement would disappear.
 */
export function SiteLogo({
  className,
  compact = false,
  href = routes.home,
  ...props
}: SiteLogoProps) {
  const height = compact ? 24 : 30;
  const width = Math.round(height * RATIO);

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
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-lg bg-white',
          'px-2 py-1.5 ring-1 ring-black/5 dark:ring-white/10',
        )}
      >
        <Image
          src="/brand/nawy-logo.png"
          alt={BRAND.name}
          width={width}
          height={height}
          priority
          sizes={`${width}px`}
          className="h-auto w-auto"
          style={{ height, width }}
        />
      </span>
    </Link>
  );
}
