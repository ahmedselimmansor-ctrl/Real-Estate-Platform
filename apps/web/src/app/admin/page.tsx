'use client';

import Link from 'next/link';
import { Building2, LayoutDashboard, MessageSquare, Users } from 'lucide-react';

import { T, useT } from '@/components/i18n/t';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCompactEGP, formatNumber } from '@/lib/format';
import { useAdminStats } from '@/lib/queries';
import { routes } from '@/lib/routes';
import { useAuthStore } from '@/store/auth.store';

export default function AdminOverviewPage() {
  const t = useT();
  const user = useAuthStore((state) => state.user);
  const { data, isLoading, isError } = useAdminStats();

  const cards = [
    {
      icon: Building2,
      label: t('Listings', 'الوحدات'),
      value: data ? formatNumber(data.properties.total) : null,
      hint: data ? `${formatNumber(data.properties.available)} ${t('available', 'متاحة')}` : '',
    },
    {
      icon: LayoutDashboard,
      label: t('Portfolio value', 'قيمة المحفظة'),
      value: data ? formatCompactEGP(data.properties.portfolioValue) : null,
      hint: data ? `${t('avg', 'متوسط')} ${formatCompactEGP(data.properties.avgPrice)}` : '',
    },
    {
      icon: MessageSquare,
      label: t('Leads', 'العملاء المحتملون'),
      value: data ? formatNumber(data.leads.total) : null,
      hint: data ? `${formatNumber(data.leads.newThisMonth)} ${t('this month', 'هذا الشهر')}` : '',
    },
    {
      icon: Users,
      label: t('Users', 'المستخدمون'),
      value: data ? formatNumber(data.users.total) : null,
      hint: data ? `${formatNumber(data.users.byRole.agent)} ${t('agents', 'وسطاء')}` : '',
    },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 lg:px-6">
      <header className="space-y-1">
        <h1 className="display text-3xl text-foreground">
          <T en="Dashboard" ar="لوحة التحكم" />
        </h1>
        <p className="text-sm text-muted-foreground">
          <T en="Signed in as" ar="مسجّل الدخول باسم" /> {user?.name} ({user?.role}).
        </p>
      </header>

      {isError ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">
            <T en="Could not load dashboard statistics." ar="تعذر تحميل إحصاءات لوحة التحكم." />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <Card key={card.label}>
              <CardContent className="space-y-2 p-5">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <card.icon className="size-4" />
                  <span className="text-xs uppercase tracking-wide">{card.label}</span>
                </div>
                {isLoading || card.value === null ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <p className="text-2xl font-semibold tabular-nums">{card.value}</p>
                )}
                <p className="text-xs text-muted-foreground">{card.hint}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="space-y-2 p-6">
          <h2 className="display text-lg">
            <T en="Top areas by listing count" ar="أكثر المناطق من حيث عدد الوحدات" />
          </h2>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <ul className="divide-y text-sm">
              {(data?.topAreas ?? []).map((area) => (
                <li key={area.areaId} className="flex items-center justify-between py-2">
                  <span>{area.areaName}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatNumber(area.count)} <T en="listings, avg" ar="وحدة، متوسط" />{' '}
                    {formatCompactEGP(area.avgPrice)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        <Link href={routes.home} className="underline">
          <T en="Back to the storefront" ar="العودة إلى الموقع" />
        </Link>
      </p>
    </div>
  );
}
