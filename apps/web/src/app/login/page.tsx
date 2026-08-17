import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { T } from '@/components/i18n/t';
import { routes } from '@/lib/routes';
import { LoginForm } from './login-form';

/**
 * Rendered per request.
 *
 * The client reads filters with `useSearchParams()`. On a statically
 * prerendered route that hook has nothing to resolve against until the client
 * router hands over the query string, and the Suspense boundary around it can
 * stay in its fallback indefinitely. Rendering on demand gives the server the
 * real query string, so the page hydrates with content already in place.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Dashboard sign in',
  description: 'Staff sign in for the TopChoice admin dashboard.',
  // Not a storefront page, so keep it out of search results.
  robots: { index: false, follow: false },
};

/**
 * Reached only from the admin dashboard guard. The public site never links
 * here, which is why the header carries no sign-in button.
 */
interface LoginPageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next: requested } = await searchParams;

  // Same-origin paths only, so `?next=https://evil.example` cannot turn this
  // into an open redirect.
  const next =
    requested && requested.startsWith('/') && !requested.startsWith('//')
      ? requested
      : routes.admin;

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-7xl flex-col items-center justify-center gap-6 px-4 py-12">
      <LoginForm next={next} />

      <Link
        href={routes.home}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        <T en="Back to browsing properties" ar="العودة لتصفح العقارات" />
      </Link>
    </div>
  );
}
