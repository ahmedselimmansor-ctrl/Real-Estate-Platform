import type { Metadata } from 'next';

import { SearchClient } from './search-client';

/**
 * Rendered per request so the query string is known on the server.
 *
 * The filters live in the URL, and they are read here and handed to the client
 * as a prop rather than through `useSearchParams()`. That hook suspends until
 * the client router provides the query, which on a prerendered route can leave
 * the Suspense boundary showing its fallback indefinitely.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Properties for sale in Egypt',
  description:
    'Search apartments, villas, townhouses and chalets across New Cairo, Sheikh Zayed, the North Coast, the New Capital and more. Filter by price, bedrooms, payment plan and delivery date.',
  alternates: { canonical: '/search' },
  openGraph: {
    title: 'Properties for sale in Egypt | Nawy',
    description: 'Search Egypt\u2019s primary and resale market with real payment plans.',
    type: 'website',
  },
};

interface SearchPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      value.forEach((entry) => query.append(key, entry));
    } else if (value !== undefined) {
      query.set(key, value);
    }
  }

  return <SearchClient initialQuery={query.toString()} />;
}
