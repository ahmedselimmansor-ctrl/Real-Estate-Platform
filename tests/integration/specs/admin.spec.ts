import { describe, expect, it } from 'vitest';

import { call } from '../setup/client';
import { tokens } from '../setup/fixtures';

/**
 * The write paths behind the dashboard.
 *
 * These endpoints existed long before anything could reach them, so they had
 * never been exercised by a client — which is how `q` came to be declared on
 * PropertyListParams while the API answered 422 for it. Everything the admin
 * screens send is asserted here against the running services.
 *
 * Every spec that creates something removes it again, so a re-run against the
 * same stack behaves like the first.
 */

interface Property {
  propertyId: string;
  slug: string;
  referenceNo: string;
  title: { en: string; ar: string };
  status: string;
  isFeatured: boolean;
  publishedAt: string | null;
}

describe('the listing catalogue is searchable by what staff know', () => {
  it('finds a listing by its reference number', async () => {
    const sample = (await call<Property[]>('/api/v1/properties?limit=1')).body.data![0];

    const result = await call<Property[]>(
      `/api/v1/properties?q=${encodeURIComponent(sample.referenceNo)}`,
    );

    expect(result.status).toBe(200);
    expect(result.body.data!.map((p) => p.referenceNo)).toContain(sample.referenceNo);
  });

  it('finds listings by a fragment of the slug', async () => {
    const result = await call<Property[]>('/api/v1/properties?q=palm&limit=50');

    expect(result.status).toBe(200);
    expect(result.body.meta!.total).toBeGreaterThan(0);
    for (const property of result.body.data!) {
      const haystack = `${property.slug} ${property.referenceNo} ${property.title.en}`.toLowerCase();
      expect(haystack).toContain('palm');
    }
  });

  it('searches the Arabic title too', async () => {
    const result = await call<Property[]>(
      `/api/v1/properties?q=${encodeURIComponent('القاهرة')}&limit=5`,
    );

    expect(result.status).toBe(200);
    expect(result.body.meta!.total).toBeGreaterThan(0);
  });

  it('narrows rather than being ignored', async () => {
    const all = await call<Property[]>('/api/v1/properties?limit=1');
    const filtered = await call<Property[]>('/api/v1/properties?q=palm&limit=1');

    expect(filtered.body.meta!.total).toBeLessThan(all.body.meta!.total);
  });

  it('treats a regex metacharacter as text, not as a pattern', async () => {
    const all = await call<Property[]>('/api/v1/properties?limit=1');

    // The term becomes a RegExp server-side. Unescaped, `.*` would match every
    // listing — the search would be a pattern the caller controls.
    const wildcard = await call<Property[]>('/api/v1/properties?q=.*&limit=1');

    expect(wildcard.status).toBe(200);
    expect(wildcard.body.meta!.total).toBe(0);
    expect(wildcard.body.meta!.total).not.toBe(all.body.meta!.total);
  });

  it('survives an unbalanced bracket instead of 500ing', async () => {
    const result = await call('/api/v1/properties?q=' + encodeURIComponent('New Cairo ('));

    expect(result.status).toBe(200);
  });

  it('returns nothing, rather than everything, for a term that matches nothing', async () => {
    const result = await call<Property[]>('/api/v1/properties?q=zzzznosuchlisting');

    expect(result.status).toBe(200);
    expect(result.body.meta!.total).toBe(0);
  });
});

describe('listing writes', () => {
  it('moves a status and puts it back', async () => {
    const { admin } = tokens();
    const sample = (await call<Property[]>('/api/v1/properties?limit=1')).body.data![0];
    const original = sample.status;
    const next = original === 'available' ? 'reserved' : 'available';

    const changed = await call<Property>(`/api/v1/properties/${sample.propertyId}`, {
      method: 'PATCH',
      body: { status: next },
      token: admin,
    });

    expect(changed.status).toBe(200);
    expect(changed.body.data!.status).toBe(next);

    // The list must reflect it, not just the write response — the dashboard
    // reads the row back from the list.
    const reread = await call<Property>(`/api/v1/properties/${sample.propertyId}`);
    expect(reread.body.data!.status).toBe(next);

    await call(`/api/v1/properties/${sample.propertyId}`, {
      method: 'PATCH',
      body: { status: original },
      token: admin,
    });
  });

  it('toggles featured and puts it back', async () => {
    const { admin } = tokens();
    const sample = (await call<Property[]>('/api/v1/properties?limit=1')).body.data![0];
    const original = sample.isFeatured;

    const changed = await call<Property>(`/api/v1/properties/${sample.propertyId}`, {
      method: 'PATCH',
      body: { isFeatured: !original },
      token: admin,
    });

    expect(changed.status).toBe(200);
    expect(changed.body.data!.isFeatured).toBe(!original);

    await call(`/api/v1/properties/${sample.propertyId}`, {
      method: 'PATCH',
      body: { isFeatured: original },
      token: admin,
    });
  });

  it('refuses a write from a signed-in visitor, and from nobody at all', async () => {
    const { user } = tokens();
    const sample = (await call<Property[]>('/api/v1/properties?limit=1')).body.data![0];

    expect(
      (
        await call(`/api/v1/properties/${sample.propertyId}`, {
          method: 'PATCH',
          body: { status: 'sold' },
          token: user,
        })
      ).status,
    ).toBe(403);

    expect(
      (
        await call(`/api/v1/properties/${sample.propertyId}`, {
          method: 'PATCH',
          body: { status: 'sold' },
        })
      ).status,
    ).toBe(401);
  });

  it('rejects a status the enum does not contain', async () => {
    const { admin } = tokens();
    const sample = (await call<Property[]>('/api/v1/properties?limit=1')).body.data![0];

    const result = await call(`/api/v1/properties/${sample.propertyId}`, {
      method: 'PATCH',
      body: { status: 'not-a-real-status' },
      token: admin,
    });

    expect([400, 422]).toContain(result.status);
  });

  it('404s a listing that does not exist', async () => {
    const { admin } = tokens();

    const result = await call('/api/v1/properties/00000000-0000-4000-8000-000000000000', {
      method: 'PATCH',
      body: { status: 'sold' },
      token: admin,
    });

    expect(result.status).toBe(404);
  });
});

describe('catalogue writes', () => {
  it('creates, reads back and removes an area', async () => {
    const { admin } = tokens();
    const slug = 'integration-test-area';

    const created = await call<{ id: string; slug: string }>('/api/v1/areas', {
      method: 'POST',
      body: {
        slug,
        nameEn: 'Integration Test Area',
        nameAr: 'منطقة اختبار',
        city: 'Cairo',
        governorate: 'Cairo',
        // Required: areas.lat/lng are NOT NULL in Postgres.
        lat: 30.0304,
        lng: 31.4913,
      },
      token: admin,
    });

    expect(created.status).toBe(201);
    const id = created.body.data!.id;

    try {
      const listed = await call<Array<{ id: string }>>('/api/v1/areas');
      expect(listed.body.data!.map((a) => a.id)).toContain(id);

      const renamed = await call<{ nameEn: string }>(`/api/v1/areas/${id}`, {
        method: 'PATCH',
        body: { nameEn: 'Renamed By Integration' },
        token: admin,
      });
      expect(renamed.status).toBe(200);
      expect(renamed.body.data!.nameEn).toBe('Renamed By Integration');
    } finally {
      const removed = await call(`/api/v1/areas/${id}`, { method: 'DELETE', token: admin });
      expect([200, 204]).toContain(removed.status);
    }
  });

  it('refuses catalogue writes from a non-staff caller', async () => {
    const { user } = tokens();

    const result = await call('/api/v1/areas', {
      method: 'POST',
      body: { slug: 'should-not-exist', nameEn: 'Nope', nameAr: 'لا', city: 'Cairo' },
      token: user,
    });

    expect(result.status).toBe(403);
  });

  it('validates rather than storing a nameless area', async () => {
    const { admin } = tokens();

    const result = await call('/api/v1/areas', {
      method: 'POST',
      body: { slug: '', nameEn: '', nameAr: '' },
      token: admin,
    });

    expect([400, 422]).toContain(result.status);
    expect(result.body.error?.details.length).toBeGreaterThan(0);
  });
});
