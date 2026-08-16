'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { T } from '@/components/i18n/t';
import { Spinner } from '@/components/ui/spinner';
import { routes } from '@/lib/routes';
import { useAuthHydrated, useAuthStore } from '@/store/auth.store';

/** Roles allowed into the dashboard. */
const STAFF_ROLES = new Set(['agent', 'admin', 'superadmin']);

/**
 * The only place the sign-in page is reachable from.
 *
 * The storefront is fully public, so authentication is enforced here rather
 * than globally: anyone landing on an `/admin` route without a staff session is
 * sent to `/login` with a `next` parameter so they return to where they were
 * headed.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const hydrated = useAuthHydrated();
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.status === 'authenticated');

  const allowed = isAuthenticated && Boolean(user) && STAFF_ROLES.has(user!.role);

  useEffect(() => {
    // Wait for the persisted session to load before deciding.
    if (!hydrated || allowed) return;

    router.replace(`${routes.login}?next=${encodeURIComponent(pathname)}`);
  }, [hydrated, allowed, pathname, router]);

  if (!hydrated || !allowed) {
    return (
      <div className="grid min-h-[60vh] place-items-center" aria-busy="true">
        <Spinner className="size-6 text-muted-foreground" />
        <span className="sr-only">
          <T en="Checking your access" ar="جارٍ التحقق من صلاحيتك" />
        </span>
      </div>
    );
  }

  return <>{children}</>;
}
