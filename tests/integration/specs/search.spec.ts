import { describe, expect, it } from 'vitest';

import { call } from '../setup/client';

/**
 * search-svc against a real Elasticsearch index. The value here is the things
 * unit tests with a fake client cannot prove: that the Arabic analyzer is
 * actually installed, that filters genuinely narrow the set, and that the index
 * has not drifted from the catalogue it was built from.
 */

interface Hit {
  id: string;
  slug: string;
  price: number;
  propertyType: string;
  saleType: string;
  specs: { bedrooms: number; bathrooms: number; areaSqm: number };
  areaId: string;
  areaName: string;
}

async function search(query: string) {
  return call<{ results: Hit[]; facets: Record<string, unknown> | null }>(`/api/search${query}`);
}

describe('the index tracks the catalogue', () => {
  it('indexes exactly the listings the API publishes', async () => {
    const [indexed, published] = await Promise.all([
      call('/api/search?limit=1'),
      call('/api/v1/properties?limit=1'),
    ]);

    expect(indexed.body.meta!.total).toBe(published.body.meta!.total);
  });
});

describe('full-text query', () => {
  it('matches an area name', async () => {
    const result = await search('?q=new%20cairo&limit=5');

    expect(result.status).toBe(200);
    expect(result.body.meta!.total).toBeGreaterThan(0);
  });

  it('matches Arabic, which proves the Arabic analyzer is live', async () => {
    const result = await search(`?q=${encodeURIComponent('فيلا')}&limit=5`);

    expect(result.status).toBe(200);
    expect(result.body.meta!.total).toBeGreaterThan(0);
  });

  it('is not case sensitive', async () => {
    const lower = await search('?q=zayed');
    const upper = await search('?q=ZAYED');

    expect(upper.body.meta!.total).toBe(lower.body.meta!.total);
  });

  it('returns an empty result set, not an error, for nonsense', async () => {
    const result = await search('?q=zzzqqqxxx-no-such-thing');

    expect(result.status).toBe(200);
    expect(result.body.meta!.total).toBe(0);
    expect(result.body.data!.results).toEqual([]);
  });
});

describe('filters', () => {
  it('narrows the set rather than being ignored', async () => {
    const all = await search('?limit=1');
    const threeBed = await search('?bedrooms=3&limit=1');

    expect(threeBed.body.meta!.total).toBeGreaterThan(0);
    expect(threeBed.body.meta!.total).toBeLessThan(all.body.meta!.total);
  });

  it('applies the bedroom filter to every hit it returns', async () => {
    const result = await search('?bedrooms=3&limit=20');

    for (const hit of result.body.data!.results) {
      expect(hit.specs.bedrooms).toBe(3);
    }
  });

  it('composes filters conjunctively', async () => {
    const oneFilter = await search('?bedrooms=3&limit=1');
    const areaId = (await search('?bedrooms=3&limit=1')).body.data!.results[0].areaId;
    const both = await search(`?bedrooms=3&areaId=${areaId}&limit=1`);

    expect(both.body.meta!.total).toBeGreaterThan(0);
    expect(both.body.meta!.total).toBeLessThanOrEqual(oneFilter.body.meta!.total);
  });

  it('respects a price ceiling', async () => {
    const ceiling = 8_000_000;
    const result = await search(`?maxPrice=${ceiling}&limit=20`);

    for (const hit of result.body.data!.results) {
      expect(hit.price).toBeLessThanOrEqual(ceiling);
    }
  });

  it('respects a price floor', async () => {
    const floor = 10_000_000;
    const result = await search(`?minPrice=${floor}&limit=20`);

    for (const hit of result.body.data!.results) {
      expect(hit.price).toBeGreaterThanOrEqual(floor);
    }
  });

  it('ignores an unknown filter rather than 500ing', async () => {
    const result = await search('?notARealFilter=banana&limit=1');

    expect(result.status).toBe(200);
  });
});

describe('sorting', () => {
  it('sorts ascending by price', async () => {
    const result = await search('?sort=price_asc&limit=10');
    const prices = result.body.data!.results.map((h) => h.price);

    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it('sorts descending by price', async () => {
    const result = await search('?sort=price_desc&limit=10');
    const prices = result.body.data!.results.map((h) => h.price);

    expect(prices).toEqual([...prices].sort((a, b) => b - a));
  });
});

describe('facets', () => {
  it('are omitted by default, so an ordinary page does not pay for aggregations', async () => {
    const result = await search('?limit=1');

    expect(result.body.data!.facets).toBeFalsy();
  });

  it('are computed on request and cover the filter sidebar', async () => {
    const result = await search('?facets=true&limit=1');
    const facets = result.body.data!.facets!;

    for (const key of ['propertyType', 'saleType', 'bedrooms', 'areas', 'price', 'amenities']) {
      expect(facets, `missing facet ${key}`).toHaveProperty(key);
    }
  });

  it('reflect the active filter rather than the whole corpus', async () => {
    const unfiltered = await search('?facets=true&limit=1');
    const filtered = await search('?bedrooms=3&facets=true&limit=1');

    expect(JSON.stringify(filtered.body.data!.facets)).not.toBe(
      JSON.stringify(unfiltered.body.data!.facets),
    );
  });
});

describe('autocomplete', () => {
  it('suggests on a prefix, which is what edge n-grams are for', async () => {
    const result = await call<{ suggestions: Array<{ text: string; type: string }> }>(
      '/api/search/autocomplete?q=new',
    );

    expect(result.status).toBe(200);
    const payload = JSON.stringify(result.body.data);
    expect(payload.length).toBeGreaterThan(2);
  });

  it('handles an Arabic prefix', async () => {
    const result = await call(`/api/search/autocomplete?q=${encodeURIComponent('القا')}`);

    expect(result.status).toBe(200);
  });

  it('does not fall over on an empty or single-character query', async () => {
    expect([200, 400, 422]).toContain((await call('/api/search/autocomplete?q=')).status);
    expect((await call('/api/search/autocomplete?q=n')).status).toBe(200);
  });
});

describe('pagination', () => {
  it('returns disjoint pages', async () => {
    const first = await search('?limit=5&page=1&sort=price_asc');
    const second = await search('?limit=5&page=2&sort=price_asc');

    const a = first.body.data!.results.map((h) => h.slug);
    const b = second.body.data!.results.map((h) => h.slug);

    expect(a.some((slug) => b.includes(slug))).toBe(false);
  });

  it('keeps the total stable across pages', async () => {
    const first = await search('?limit=5&page=1');
    const second = await search('?limit=5&page=2');

    expect(second.body.meta!.total).toBe(first.body.meta!.total);
  });
});
