'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Home, RefreshCcw, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { routes } from '@/lib/routes';

/** Route-level error boundary (App Router). */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaced in the browser console and the container logs.
    console.error('[nawy:web] route error', { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <span
        className="mb-6 flex size-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive"
        aria-hidden="true"
      >
        <TriangleAlert className="size-7" />
      </span>

      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Something went wrong</h1>

      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
        We hit an unexpected error while loading this page. Trying again usually fixes it, if it
        keeps happening, our team is already looking into it.
      </p>

      {error.digest ? (
        <p className="mt-3 text-xs text-muted-foreground/80">
          Reference: <code className="font-mono">{error.digest}</code>
        </p>
      ) : null}

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={reset}>
          <RefreshCcw aria-hidden="true" />
          Try again
        </Button>
        <Button asChild variant="outline">
          <Link href={routes.home}>
            <Home aria-hidden="true" />
            Back home
          </Link>
        </Button>
      </div>
    </div>
  );
}
