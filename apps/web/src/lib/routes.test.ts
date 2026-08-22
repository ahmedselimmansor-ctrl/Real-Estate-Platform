import { describe, expect, it } from 'vitest';

import { routes, suggestionHref } from './routes';

/**
 * `routes` is `as const`, so its values are a union of string literals and
 * builder functions. Widen once here rather than fighting the predicate at each
 * call site.
 */
function staticPaths(): string[] {
  return Object.values(routes as Record<string, unknown>).filter(
    (value): value is string => typeof value === 'string',
  );
}

describe('static routes', () => {
  it('are all root-relative, never absolute or protocol-relative', () => {
    const statics = staticPaths();

    expect(statics.length).toBeGreaterThan(10);
    for (const path of statics) {
      expect(path.startsWith('/'), `${path} should be root-relative`).toBe(true);
      expect(path.startsWith('//'), `${path} should not be protocol-relative`).toBe(false);
    }
  });

  it('have no trailing slash except the home route', () => {
    const statics = staticPaths();

    for (const path of statics) {
      if (path === '/') continue;
      expect(path.endsWith('/'), `${path} should not end in a slash`).toBe(false);
    }
  });
});

describe('parameterised routes', () => {
  it('build the expected detail paths', () => {
    expect(routes.property('el-patio-oro-2br')).toBe('/property/el-patio-oro-2br');
    expect(routes.compound('palm-hills')).toBe('/compounds/palm-hills');
    expect(routes.developer('sodic')).toBe('/developers/sodic');
    expect(routes.area('new-cairo')).toBe('/areas/new-cairo');
  });

  it('nest each detail under its own index route', () => {
    expect(routes.compound('x').startsWith(`${routes.compounds}/`)).toBe(true);
    expect(routes.developer('x').startsWith(`${routes.developers}/`)).toBe(true);
    expect(routes.area('x').startsWith(`${routes.areas}/`)).toBe(true);
  });

  it('returns the bare search path when nothing is filtered', () => {
    expect(routes.search()).toBe('/search');
  });

  it('serialises filters onto the search path', () => {
    expect(routes.search({ q: 'zayed' })).toBe('/search?q=zayed');
  });

  it('points the buy and rent shortcuts at a filtered search', () => {
    expect(routes.buy).toContain('/search?');
    expect(routes.rent).toContain('/search?');
  });
});

describe('suggestionHref', () => {
  it.each([
    ['property', 'el-patio-oro', '/property/el-patio-oro'],
    ['compound', 'palm-hills', '/compounds/palm-hills'],
    ['developer', 'sodic', '/developers/sodic'],
    ['area', 'new-cairo', '/areas/new-cairo'],
  ])('routes a %s suggestion to its own page', (type, slug, expected) => {
    expect(suggestionHref({ type, slug, text: 'x' })).toBe(expected);
  });

  it('falls back to a search for an unrecognised suggestion type', () => {
    const href = suggestionHref({ type: 'something-new', slug: 'x', text: 'sheikh zayed' });

    expect(href.startsWith('/search?')).toBe(true);
    expect(href).toContain('sheikh');
  });
});
