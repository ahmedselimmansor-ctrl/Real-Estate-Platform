'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  BarChart3,
  Bookmark,
  Heart,
  LayoutDashboard,
  LogOut,
  Scale,
  User as UserIcon,
} from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useI18n } from '@/hooks/use-i18n';
import { useLogout } from '@/lib/queries';
import { routes } from '@/lib/routes';
import { initials } from '@/lib/utils';
import { useAuthHydrated, useAuthStore } from '@/store/auth.store';

/**
 * Account dropdown for a signed-in user.
 *
 * There is deliberately **no login call-to-action in the header**: the storefront
 * is fully browsable as a guest, and sign-in only appears when someone navigates
 * to the admin dashboard (see `src/app/admin/layout.tsx`).
 */
export function UserMenu() {
  const router = useRouter();
  const { pick } = useI18n();
  const hydrated = useAuthHydrated();
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.status === 'authenticated');
  const logout = useLogout({
    onSuccess: () => {
      toast.success(pick('Signed out', 'تم تسجيل الخروج'));
      router.push(routes.home);
    },
  });

  if (!hydrated) {
    return <Skeleton className="size-9 rounded-full" />;
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  const isStaff = user.role === 'admin' || user.role === 'superadmin' || user.role === 'agent';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label={pick('Account menu', 'قائمة الحساب')}
        >
          <Avatar size="sm">
            {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user.name} /> : null}
            <AvatarFallback>{initials(user.name)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="normal-case">
          <span className="block truncate text-sm font-semibold text-foreground">{user.name}</span>
          <span className="block truncate text-xs font-normal text-muted-foreground lowercase">
            {user.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href={routes.account}>
            <UserIcon aria-hidden="true" />
            {pick('My account', 'حسابي')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={routes.favorites}>
            <Heart aria-hidden="true" />
            {pick('Saved properties', 'العقارات المحفوظة')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={routes.savedSearches}>
            <Bookmark aria-hidden="true" />
            {pick('Saved searches', 'عمليات البحث المحفوظة')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={routes.compare}>
            <Scale aria-hidden="true" />
            {pick('Compare', 'المقارنة')}
          </Link>
        </DropdownMenuItem>

        {isStaff ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={routes.admin}>
                <LayoutDashboard aria-hidden="true" />
                {pick('Dashboard', 'لوحة التحكم')}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={routes.adminLeads}>
                <BarChart3 aria-hidden="true" />
                {pick('Leads', 'العملاء المحتملون')}
              </Link>
            </DropdownMenuItem>
          </>
        ) : null}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={logout.isPending}
          onSelect={(event) => {
            event.preventDefault();
            logout.mutate();
          }}
        >
          <LogOut aria-hidden="true" />
          {pick('Sign out', 'تسجيل الخروج')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
