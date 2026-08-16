import Link from 'next/link';
import { Building2, Compass, Home, MapPin } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { POPULAR_AREAS } from '@/lib/constants';
import { routes } from '@/lib/routes';

/** 404 — keep the user moving with real destinations instead of a dead end. */
export default function NotFound() {
  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <span
        className="mb-6 flex size-16 items-center justify-center rounded-2xl bg-primary-soft text-primary"
        aria-hidden="true"
      >
        <Compass className="size-7" />
      </span>

      <p className="text-sm font-semibold tracking-widest text-primary uppercase">404</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
        We couldn’t find that page
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
        The listing may have been sold or the link may be out of date. Try one of these instead.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button asChild>
          <Link href={routes.home}>
            <Home aria-hidden="true" />
            Back home
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={routes.search()}>
            <Building2 aria-hidden="true" />
            Browse properties
          </Link>
        </Button>
      </div>

      <div className="mt-12 w-full max-w-2xl">
        <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Popular areas
        </h2>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {POPULAR_AREAS.slice(0, 8).map((area) => (
            <Link
              key={area.slug}
              href={routes.area(area.slug)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-primary-soft"
            >
              <MapPin className="size-3.5 text-primary" aria-hidden="true" />
              {area.labelEn}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
