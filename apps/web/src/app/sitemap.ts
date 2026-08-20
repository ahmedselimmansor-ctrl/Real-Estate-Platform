import type { MetadataRoute } from 'next';

import { api } from '@/lib/api';
import { publicEnv } from '@/lib/env';
import { routes } from '@/lib/routes';
import type { Area, Compound, Developer } from '@/types/catalog';
import type { Property } from '@/types/property';

/**
 * `public/robots.txt` has always pointed crawlers at `/sitemap.xml`, and until
 * now that URL returned a 404 — every listing had to be discovered by crawling
 * links from the home page.
 *
 * Regenerated every hour rather than at build time, because the catalogue
 * changes while the site is running and a build-time sitemap would freeze at
 * whatever was published on deploy day.
 */
export const revalidate = 3600;

/** Marketing and tool pages. Anything behind auth is deliberately absent. */
const STATIC_ENTRIES: Array<{ path: string; priority: number; frequency: Frequency }> = [
  { path: routes.home, priority: 1.0, frequency: 'daily' },
  { path: '/search', priority: 0.9, frequency: 'daily' },
  { path: routes.compounds, priority: 0.8, frequency: 'weekly' },
  { path: routes.areas, priority: 0.8, frequency: 'weekly' },
  { path: routes.developers, priority: 0.7, frequency: 'weekly' },
  { path: routes.topchoiceNow, priority: 0.6, frequency: 'weekly' },
  { path: routes.mortgageCalculator, priority: 0.6, frequency: 'monthly' },
  { path: routes.sell, priority: 0.6, frequency: 'monthly' },
  { path: routes.about, priority: 0.4, frequency: 'monthly' },
  { path: routes.contact, priority: 0.4, frequency: 'monthly' },
  { path: routes.terms, priority: 0.2, frequency: 'yearly' },
  { path: routes.privacy, priority: 0.2, frequency: 'yearly' },
];

type Frequency = NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>;

/** `limit` is capped at 100 by the API (CONTRACT §3), so anything larger 422s. */
const PAGE_SIZE = 100;

/** Stops a runaway loop from walking the catalogue forever. */
const MAX_PAGES = 100;

/**
 * Walks the paginated collection until it runs dry.
 *
 * A sitemap that 500s is worse than a short one — Search Console treats the
 * fetch failure as a signal about the whole site — so a page that fails ends
 * the walk and keeps whatever came before it.
 */
async function collect<T>(
  path: string,
  query: Record<string, string | number> = {},
): Promise<T[]> {
  const items: T[] = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    let batch: T[];
    try {
      batch = await api.get<T[]>(path, { query: { ...query, limit: PAGE_SIZE, page } });
    } catch {
      break;
    }
    if (!batch?.length) break;
    items.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  return items;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = publicEnv.siteUrl.replace(/\/+$/, '');
  const now = new Date();

  const [properties, compounds, areas, developers] = await Promise.all([
    collect<Property>('/properties', { sort: '-publishedAt' }),
    collect<Compound>('/compounds', { sort: 'name' }),
    collect<Area>('/areas'),
    collect<Developer>('/developers'),
  ]);

  const entries: MetadataRoute.Sitemap = STATIC_ENTRIES.map(
    ({ path, priority, frequency }) => ({
      url: `${base}${path}`,
      lastModified: now,
      changeFrequency: frequency,
      priority,
    }),
  );

  for (const property of properties) {
    if (!property.slug) continue;
    entries.push({
      url: `${base}${routes.property(property.slug)}`,
      // A listing's own timestamp, so a crawler can tell a repriced unit from
      // one that has not moved since it was published.
      lastModified: new Date(property.updatedAt ?? property.publishedAt ?? now),
      changeFrequency: 'weekly',
      priority: property.isFeatured ? 0.8 : 0.7,
    });
  }

  for (const compound of compounds) {
    if (!compound.slug) continue;
    entries.push({
      url: `${base}${routes.compound(compound.slug)}`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.6,
    });
  }

  for (const area of areas) {
    if (!area.slug) continue;
    entries.push({
      url: `${base}${routes.area(area.slug)}`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.6,
    });
  }

  for (const developer of developers) {
    if (!developer.slug) continue;
    entries.push({
      url: `${base}${routes.developer(developer.slug)}`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    });
  }

  return entries;
}
