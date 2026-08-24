'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, LayoutDashboard, Map, MessageSquare } from 'lucide-react';

import { T } from '@/components/i18n/t';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

/**
 * Section navigation for the dashboard.
 *
 * The admin layout guarded access but rendered no navigation at all, so an
 * operator who landed on the leads queue could only reach anything else through
 * the account menu in the storefront header — or by typing a URL.
 */

const SECTIONS = [
  {
    href: routes.admin,
    icon: LayoutDashboard,
    label: <T en="Overview" ar="نظرة عامة" />,
  },
  {
    href: routes.adminProperties,
    icon: Building2,
    label: <T en="Listings" ar="الوحدات" />,
  },
  {
    href: routes.adminLeads,
    icon: MessageSquare,
    label: <T en="Leads" ar="العملاء المحتملون" />,
  },
  {
    href: routes.adminCatalogue,
    icon: Map,
    label: <T en="Catalogue" ar="الدليل" />,
  },
] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Dashboard sections"
      className="sticky top-0 z-20 -mx-4 mb-6 border-b bg-background/95 px-4 backdrop-blur lg:-mx-6 lg:px-6"
    >
      <ul className="flex gap-1 overflow-x-auto py-2">
        {SECTIONS.map((section) => {
          // `/admin` would otherwise light up on every child route, so only the
          // dashboard root matches exactly.
          const active =
            section.href === routes.admin
              ? pathname === routes.admin
              : pathname.startsWith(section.href);

          return (
            <li key={section.href}>
              <Link
                href={section.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <section.icon aria-hidden="true" className="size-4" />
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
