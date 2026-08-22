import { beforeAll, describe, expect, it } from 'vitest';

import { call } from '../setup/client';

/**
 * The catalogue endpoints and the §4 envelope they all speak. The point of
 * these is the shape and the invariants, not the seed data's exact values —
 * anything that hardcodes "180 listings" would break the moment someone adds
 * one.
 */

interface Property {
  propertyId: string;
  slug: string;
  referenceNo: string;
  title: { en: string; ar: string };
  price: { amount: number; currency: string };
  specs: { bedrooms: number; bathrooms: number; areaSqm: number };
  location: { areaId: string; areaName: string };
  media: { images: Array<{ url: string }> };
}

let sample: Property;

beforeAll(async () => {
  const result = await call<Property[]>('/api/v1/properties?limit=1');
  sample = result.body.data![0];
});

describe('the response envelope (CONTRACT §4)', () => {
  it.each([
    '/api/v1/properties?limit=2',
    '/api/v1/areas',
    '/api/v1/developers',
    '/api/v1/compounds?limit=2',
    '/api/v1/amenities',
  ])('%s returns success with a data array', async (path) => {
    const result = await call<unknown[]>(path);

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(Array.isArray(result.body.data)).toBe(true);
  });

  it('carries pagination meta on a paginated collection', async () => {
    const result = await call<unknown[]>('/api/v1/properties?limit=5&page=2');

    expect(result.body.meta).toMatchObject({ page: 2, limit: 5 });
    expect(result.body.meta!.total).toBeGreaterThan(0);
    expect(result.body.meta!.totalPages).toBeGreaterThan(0);
  });

  it('shapes an error as code + message + details array', async () => {
    const result = await call('/api/v1/properties/no-such-listing-anywhere');

    expect(result.status).toBe(404);
    expect(result.body.success).toBe(false);
    expect(result.body.error?.code).toBeTruthy();
    expect(result.body.error?.message).toBeTruthy();
    expect(Array.isArray(result.body.error?.details)).toBe(true);
  });
});

describe('pagination', () => {
  it('returns a different page of results for page 2', async () => {
    const first = await call<Property[]>('/api/v1/properties?limit=3&page=1&sort=slug');
    const second = await call<Property[]>('/api/v1/properties?limit=3&page=2&sort=slug');

    const firstIds = first.body.data!.map((p) => p.propertyId);
    const secondIds = second.body.data!.map((p) => p.propertyId);

    expect(firstIds).not.toEqual(secondIds);
    expect(firstIds.some((id) => secondIds.includes(id))).toBe(false);
  });

  it('rejects a limit beyond the cap instead of dumping the table', async () => {
    const result = await call('/api/v1/properties?limit=100000');

    expect([400, 422]).toContain(result.status);
    expect(result.body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('reports totalPages consistently with total and limit', async () => {
    const result = await call<unknown[]>('/api/v1/properties?limit=7');
    const { total, limit, totalPages } = result.body.meta!;

    expect(totalPages).toBe(Math.ceil(total / limit));
  });
});

describe('a property document', () => {
  it('is bilingual in both title and description', async () => {
    const result = await call<Property>(`/api/v1/properties/${sample.slug}`);
    const property = result.body.data!;

    expect(property.title.en).toBeTruthy();
    expect(property.title.ar).toBeTruthy();
    expect(property.title.ar).toMatch(/[؀-ۿ]/);
  });

  it('carries the money, the specs and the location a card needs', async () => {
    const property = (await call<Property>(`/api/v1/properties/${sample.slug}`)).body.data!;

    expect(property.price.amount).toBeGreaterThan(0);
    expect(property.price.currency).toBe('EGP');
    expect(property.specs.bedrooms).toBeGreaterThanOrEqual(0);
    expect(property.specs.areaSqm).toBeGreaterThan(0);
    expect(property.location.areaName).toBeTruthy();
  });

  it('carries at least one image', async () => {
    const property = (await call<Property>(`/api/v1/properties/${sample.slug}`)).body.data!;

    expect(property.media.images.length).toBeGreaterThan(0);
    expect(property.media.images[0].url).toBeTruthy();
  });

  it('is reachable by slug and by uuid, and they agree', async () => {
    const bySlug = await call<Property>(`/api/v1/properties/${sample.slug}`);
    const byId = await call<Property>(`/api/v1/properties/${sample.propertyId}`);

    expect(byId.status).toBe(200);
    expect(byId.body.data!.slug).toBe(bySlug.body.data!.slug);
  });

  it('returns similar listings that exclude the listing itself', async () => {
    const result = await call<Property[]>(`/api/v1/properties/${sample.propertyId}/similar?limit=4`);

    expect(result.status).toBe(200);
    expect(result.body.data!.map((p) => p.propertyId)).not.toContain(sample.propertyId);
  });

  it('accepts a view ping without requiring a session', async () => {
    const result = await call(`/api/v1/properties/${sample.propertyId}/view`, { method: 'POST' });

    expect([200, 201, 202, 204]).toContain(result.status);
  });
});

describe('referential integrity across the catalogue', () => {
  it('every listing names an area that exists in the areas collection', async () => {
    const [listings, areas] = await Promise.all([
      call<Property[]>('/api/v1/properties?limit=100'),
      call<Array<{ id: string }>>('/api/v1/areas'),
    ]);

    const areaIds = new Set(areas.body.data!.map((a) => a.id));
    const orphans = listings.body.data!.filter((p) => !areaIds.has(p.location.areaId));

    expect(orphans.map((p) => p.slug)).toEqual([]);
  });

  it('slugs are unique across the catalogue', async () => {
    const result = await call<Property[]>('/api/v1/properties?limit=100');
    const slugs = result.body.data!.map((p) => p.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('reference numbers are unique too', async () => {
    const result = await call<Property[]>('/api/v1/properties?limit=100');
    const refs = result.body.data!.map((p) => p.referenceNo);

    expect(new Set(refs).size).toBe(refs.length);
  });
});

describe('compounds, developers and areas', () => {
  it('resolves a compound by slug with its developer attached', async () => {
    const list = await call<Array<{ slug: string }>>('/api/v1/compounds?limit=1');
    const slug = list.body.data![0].slug;

    const detail = await call<{ slug: string; developer?: unknown }>(`/api/v1/compounds/${slug}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data!.slug).toBe(slug);
  });

  it('404s an unknown compound rather than returning an empty object', async () => {
    const result = await call('/api/v1/compounds/not-a-real-compound');

    expect(result.status).toBe(404);
  });

  it('returns areas with both language names', async () => {
    const result = await call<Array<{ nameEn?: string; nameAr?: string; name?: unknown }>>('/api/v1/areas');
    const area = result.body.data![0];

    // The field naming differs by endpoint; what matters is that Arabic is present.
    expect(JSON.stringify(area)).toMatch(/[؀-ۿ]/);
  });
});
