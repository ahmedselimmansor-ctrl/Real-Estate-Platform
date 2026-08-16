import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { Globe, Phone } from 'lucide-react';

import { CompoundCard } from '@/components/catalog/compound-card';
import { T } from '@/components/i18n/t';
import { PageHeader } from '@/components/layout/page-header';
import { api } from '@/lib/api';
import type { Compound, Developer } from '@/types/catalog';

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function fetchDeveloper(slug: string): Promise<Developer | null> {
  return api
    .get<Developer>(`/developers/${encodeURIComponent(slug)}`, {
      next: { revalidate: 300, tags: [`developer:${slug}`] },
    })
    .catch(() => null);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const developer = await fetchDeveloper(slug);
  if (!developer) return { title: 'Developer not found' };

  return {
    title: developer.name,
    description:
      developer.descriptionEn?.slice(0, 300) ?? `Compounds and units by ${developer.name}.`,
    alternates: { canonical: `/developers/${developer.slug}` },
  };
}

export default async function DeveloperPage({ params }: PageProps) {
  const { slug } = await params;
  const developer = await fetchDeveloper(slug);
  if (!developer) notFound();

  const compounds = await api
    .get<Compound[]>('/compounds', { query: { developerId: developer.id, limit: 24 } })
    .catch(() => [] as Compound[]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 lg:px-6">
      <PageHeader
        eyebrow={
          developer.foundedYear ? (
            <>
              <T en="Building since" ar="يبني منذ" /> {developer.foundedYear}
            </>
          ) : (
            <T en="Developer" ar="مطور" />
          )
        }
        title={<T en={developer.name} ar={developer.nameAr} />}
        lede={<T en={developer.descriptionEn ?? ''} ar={developer.descriptionAr ?? ''} />}
        count={developer.projectsCount}
        countLabel={<T en="projects" ar="مشروع" />}
      >
        <div className="mt-6 flex flex-wrap items-center gap-4">
          {developer.logoUrl ? (
            <div className="relative size-14 overflow-hidden rounded-xl border border-border bg-card">
              <Image src={developer.logoUrl} alt="" fill sizes="56px" className="object-cover" />
            </div>
          ) : null}

          {developer.website ? (
            <a
              href={developer.website}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
            >
              <Globe className="size-4" aria-hidden />
              <T en="Website" ar="الموقع" />
            </a>
          ) : null}

          {developer.phone ? (
            <a
              href={`tel:${developer.phone}`}
              className="figure inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <Phone className="size-4" aria-hidden />
              {developer.phone}
            </a>
          ) : null}
        </div>
      </PageHeader>

      <h2 className="display mt-10 text-xl">
        <T en="Compounds" ar="الكمبوندات" />
      </h2>
      {compounds.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          <T en="No compounds are listed for this developer yet." ar="لا توجد كمبوندات مدرجة لهذا المطور بعد." />
        </p>
      ) : (
        <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {compounds.map((compound, index) => (
            <CompoundCard key={compound.id} compound={compound} priority={index < 3} />
          ))}
        </div>
      )}
    </div>
  );
}
