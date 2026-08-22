import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { routes } from './routes';

/**
 * Guards the bug class that shipped a "Leads" item in the staff menu pointing
 * at /admin/leads, a route declared here with no page behind it. Anything in
 * `routes` is a link somebody can click, so it must resolve to a real page.
 *
 * This walks the App Router tree rather than trusting a hand-kept list, so a
 * deleted page fails here instead of in production.
 */

const APP_DIR = join(process.cwd(), 'src', 'app');

/** Every route the App Router will serve, as URL paths. */
function routablePaths(dir: string = APP_DIR, prefix = ''): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);

    if (!statSync(full).isDirectory()) {
      if (entry === 'page.tsx' || entry === 'page.ts') found.push(prefix || '/');
      continue;
    }

    // Private folders are not routes.
    if (entry.startsWith('_')) continue;

    // A route group `(x)` groups files without appearing in the URL.
    if (entry.startsWith('(') && entry.endsWith(')')) {
      found.push(...routablePaths(full, prefix));
      continue;
    }

    found.push(...routablePaths(full, `${prefix}/${entry}`));
  }

  return found;
}

const PATHS = new Set(routablePaths());

/** `/compounds/[slug]` in the tree satisfies a `/compounds/:slug` builder. */
function hasDynamicMatch(path: string): boolean {
  const segments = path.split('/').filter(Boolean);
  for (const candidate of PATHS) {
    const parts = candidate.split('/').filter(Boolean);
    if (parts.length !== segments.length) continue;
    const matches = parts.every(
      (part, index) => part === segments[index] || (part.startsWith('[') && part.endsWith(']')),
    );
    if (matches) return true;
  }
  return false;
}

describe('every declared route has a page behind it', () => {
  const staticEntries = Object.entries(routes as Record<string, unknown>).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );

  it.each(staticEntries)('routes.%s → %s', (_name, path) => {
    // Strip any query string: `/search?saleType=primary` is served by `/search`.
    const pathname = path.split('?')[0];

    expect(PATHS.has(pathname) || hasDynamicMatch(pathname)).toBe(true);
  });

  it.each([
    ['property', () => routes.property('a-slug')],
    ['compound', () => routes.compound('a-slug')],
    ['developer', () => routes.developer('a-slug')],
    ['area', () => routes.area('a-slug')],
    ['search', () => routes.search({ q: 'x' })],
  ])('routes.%s builds a path that resolves', (_name, build) => {
    const pathname = build().split('?')[0];

    expect(hasDynamicMatch(pathname) || PATHS.has(pathname)).toBe(true);
  });

  it('found a plausible number of pages, so a broken walk fails loudly', () => {
    expect(PATHS.size).toBeGreaterThan(15);
  });
});
