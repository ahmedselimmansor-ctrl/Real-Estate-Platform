import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { T } from '@/components/i18n/t';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { routes } from '@/lib/routes';
import type { Developer } from '@/types/catalog';

export const metadata: Metadata = {
  title: 'Property developers in Egypt',
  description:
    'Palm Hills, SODIC, Emaar Misr, Talaat Moustafa Group, Mountain View, Ora and every other developer selling on Nawy.',
  alternates: { canonical: '/developers' },
};

export const revalidate = 300;

export default async function DevelopersPage() {
  const developers = await api
    .get<Developer[]>('/developers', { query: { limit: 60, sort: 'name' } })
    .catch(() => [] as Developer[]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 lg:px-6">
      <PageHeader
        eyebrow={<T en="Who builds it" ar="من يبني" />}
        title={<T en="Developers" ar="المطورون" />}
        lede={
          <T
            en="The companies behind the compounds, and how long each has been building in Egypt."
            ar="الشركات التي تقف خلف الكمبوندات، ومنذ متى تبني في مصر."
          />
        }
        count={developers.length}
        countLabel={<T en="developers" ar="مطور" />}
      />

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {developers.map((developer) => (
          <Card key={developer.id} className="group p-0 transition-colors hover:border-primary/40">
            <Link
              href={routes.developer(developer.slug)}
              className="flex h-full flex-col gap-4 p-5 focus:outline-none"
            >
              <div className="flex items-center gap-3">
                <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {developer.logoUrl ? (
                    <Image
                      src={developer.logoUrl}
                      alt=""
                      fill
                      sizes="48px"
                      className="object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <h2 className="truncate font-medium text-foreground group-hover:text-primary">
                    <T en={developer.name} ar={developer.nameAr} />
                  </h2>
                  {developer.foundedYear ? (
                    <p className="figure text-xs text-muted-foreground">
                      <T en="Building since" ar="يبني منذ" /> {developer.foundedYear}
                    </p>
                  ) : null}
                </div>
              </div>

              {developer.descriptionEn ? (
                <p className="line-clamp-3 text-sm text-muted-foreground">
                  <T en={developer.descriptionEn ?? ''} ar={developer.descriptionAr ?? ''} />
                </p>
              ) : null}

              <p className="figure mt-auto border-t border-border/60 pt-3 text-xs text-muted-foreground">
                <span className="text-foreground">{developer.projectsCount}</span>{' '}
                <T en="projects" ar="مشروع" />
              </p>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
