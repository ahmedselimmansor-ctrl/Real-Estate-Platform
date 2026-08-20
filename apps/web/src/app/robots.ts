import type { MetadataRoute } from 'next';

import { publicEnv } from '@/lib/env';

/**
 * Replaces `public/robots.txt`, which hardcoded `https://localhost` as the
 * sitemap host — so every deployed environment told crawlers its sitemap lived
 * on their own machine. The origin comes from NEXT_PUBLIC_SITE_URL now, the
 * same value `metadataBase` uses for canonical URLs.
 */
export default function robots(): MetadataRoute.Robots {
  const base = publicEnv.siteUrl.replace(/\/+$/, '');

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Signed-in surfaces and the auth round-trip. Nothing here is useful in
      // an index and `/auth/` carries one-time codes in the query string.
      disallow: ['/account', '/admin', '/auth/', '/api/'],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
