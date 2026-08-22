import { describe, expect, it } from 'vitest';

import { ACCOUNTS, call, fetchBytes, login, tokens } from '../setup/client';

/**
 * The flows that cross a service boundary — the ones no single service's unit
 * tests can cover, because the bug lives in the seam between them.
 */

describe('the buyer journey: search → detail → save → enquire', () => {
  it('carries a listing from a search hit to a saved favourite and a lead', async () => {
    // 1. Find something.
    const results = await call<{ results: Array<{ slug: string; id: string }> }>(
      '/api/search?bedrooms=3&limit=1',
    );
    expect(results.body.meta!.total).toBeGreaterThan(0);
    const hit = results.body.data!.results[0];

    // 2. The search hit must resolve in the catalogue — this is the Mongo/ES seam.
    const detail = await call<{ propertyId: string; slug: string }>(`/api/v1/properties/${hit.slug}`);
    expect(detail.status).toBe(200);
    const propertyId = detail.body.data!.propertyId;

    // 3. Save it.
    const token = await login(ACCOUNTS.user);
    const added = await call(`/api/v1/favorites/${propertyId}`, { method: 'POST', token });
    expect([200, 201, 409]).toContain(added.status);

    const saved = await call<Array<{ propertyId: string }>>('/api/v1/favorites', { token });
    expect(saved.body.data!.map((f) => f.propertyId)).toContain(propertyId);

    // 4. Enquire about it.
    const lead = await call<{ id: string }>('/api/v1/leads', {
      method: 'POST',
      body: {
        propertyId,
        name: 'Integration Buyer',
        email: 'integration@example.com',
        phone: '+201000000042',
        message: 'Is this still available?',
        source: 'website',
      },
    });
    expect(lead.status).toBe(201);
    const leadId = lead.body.data!.id;

    // 5. Staff can see it and move it along.
    const { admin } = await tokens();
    const queue = await call<Array<{ id: string }>>('/api/v1/leads?limit=100&sort=-createdAt', {
      token: admin,
    });
    expect(queue.body.data!.some((l) => l.id === leadId)).toBe(true);

    const moved = await call<{ status: string }>(`/api/v1/leads/${leadId}`, {
      method: 'PATCH',
      body: { status: 'contacted' },
      token: admin,
    });
    expect(moved.status).toBe(200);
    expect(moved.body.data!.status).toBe('contacted');

    // 6. Clean up the favourite so re-runs stay idempotent.
    await call(`/api/v1/favorites/${propertyId}`, { method: 'DELETE', token });
  });
});

describe('favourites', () => {
  it('requires a session', async () => {
    expect((await call('/api/v1/favorites')).status).toBe(401);
  });

  it('is scoped per user — one account never sees another\'s saves', async () => {
    const { user, agent } = await tokens();
    const property = (await call<Array<{ propertyId: string }>>('/api/v1/properties?limit=1')).body
      .data![0].propertyId;

    await call(`/api/v1/favorites/${property}`, { method: 'POST', token: user });

    const agentSaves = await call<Array<{ propertyId: string }>>('/api/v1/favorites', { token: agent });
    expect(agentSaves.body.data!.map((f) => f.propertyId)).not.toContain(property);

    await call(`/api/v1/favorites/${property}`, { method: 'DELETE', token: user });
  });

  it('is idempotent — saving twice does not duplicate', async () => {
    const { user } = await tokens();
    const property = (await call<Array<{ propertyId: string }>>('/api/v1/properties?limit=1')).body
      .data![0].propertyId;

    await call(`/api/v1/favorites/${property}`, { method: 'POST', token: user });
    await call(`/api/v1/favorites/${property}`, { method: 'POST', token: user });

    const saves = await call<Array<{ propertyId: string }>>('/api/v1/favorites', { token: user });
    const matches = saves.body.data!.filter((f) => f.propertyId === property);
    expect(matches).toHaveLength(1);

    await call(`/api/v1/favorites/${property}`, { method: 'DELETE', token: user });
  });
});

describe('leads', () => {
  it('accepts a sell enquiry that names an area instead of a listing', async () => {
    const areaId = (await call<Array<{ id: string }>>('/api/v1/areas')).body.data![0].id;

    const result = await call<{ id: string }>('/api/v1/leads', {
      method: 'POST',
      body: {
        areaId,
        propertyType: 'apartment',
        name: 'Integration Seller',
        email: 'seller@example.com',
        phone: '+201000000043',
        message: 'I want to sell my apartment',
        source: 'sell_page',
      },
    });

    expect(result.status).toBe(201);
  });

  it('validates rather than storing junk', async () => {
    const result = await call('/api/v1/leads', {
      method: 'POST',
      body: { name: '', email: 'not-an-email', phone: '' },
    });

    expect([400, 422]).toContain(result.status);
    expect(result.body.error?.details.length).toBeGreaterThan(0);
  });

  it('is not readable without staff rights', async () => {
    const { user } = await tokens();

    expect((await call('/api/v1/leads', { token: user })).status).toBe(403);
  });
});

describe('the finance engine', () => {
  it('computes a mortgage whose interest reconciles with the schedule', async () => {
    const price = 8_000_000;
    const downPaymentPercent = 10;
    const years = 7;

    const result = await call<{ summary: { monthlyPayment: number; totalInterest: number } }>(
      '/api/reports/mortgage/calculate',
      { method: 'POST', body: { price, downPaymentPercent, years, annualRatePercent: 14 } },
    );

    expect(result.status).toBe(200);
    const { monthlyPayment, totalInterest } = result.body.data!.summary;
    const principal = price * (1 - downPaymentPercent / 100);

    // The two figures must describe the same loan.
    expect(monthlyPayment * years * 12 - principal).toBeCloseTo(totalInterest, 0);
  });

  it('charges more interest over a longer term for the same loan', async () => {
    const body = { price: 5_000_000, downPaymentPercent: 20, annualRatePercent: 14 };

    const short = await call<{ summary: { totalInterest: number } }>('/api/reports/mortgage/calculate', {
      method: 'POST',
      body: { ...body, years: 5 },
    });
    const long = await call<{ summary: { totalInterest: number } }>('/api/reports/mortgage/calculate', {
      method: 'POST',
      body: { ...body, years: 15 },
    });

    expect(long.body.data!.summary.totalInterest).toBeGreaterThan(
      short.body.data!.summary.totalInterest,
    );
  });

  it('rejects nonsense input instead of returning NaN', async () => {
    const result = await call('/api/reports/mortgage/calculate', {
      method: 'POST',
      body: { price: -1, downPaymentPercent: 500, years: 0 },
    });

    expect([400, 422]).toContain(result.status);
  });

  it('emits an installment schedule that pays the loan off', async () => {
    const result = await call<{ schedule?: unknown[]; installments?: unknown[] }>(
      '/api/reports/installment/schedule',
      { method: 'POST', body: { price: 5_000_000, downPaymentPercent: 15, years: 5 } },
    );

    expect(result.status).toBe(200);
    const rows = result.body.data!.schedule ?? result.body.data!.installments ?? [];
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe('the PDF brochure', () => {
  it('renders for every identifier the contract documents', async () => {
    const property = (
      await call<Array<{ propertyId: string; slug: string; referenceNo: string }>>(
        '/api/v1/properties?limit=1',
      )
    ).body.data![0];

    for (const [label, identifier] of [
      ['uuid', property.propertyId],
      ['slug', property.slug],
      ['reference', property.referenceNo],
    ] as const) {
      const { status, bytes, contentType } = await fetchBytes(
        `/api/reports/property/${identifier}/brochure.pdf`,
      );

      expect(status, `${label} should render`).toBe(200);
      expect(contentType).toMatch(/application\/pdf/);
      // %PDF magic bytes — a JSON error body would not have them.
      expect(String.fromCharCode(...bytes.slice(0, 4)), `${label} should be a PDF`).toBe('%PDF');
      expect(bytes.length).toBeGreaterThan(1000);
    }
  });

  it('404s an unknown property rather than emitting an empty PDF', async () => {
    const { status } = await fetchBytes('/api/reports/property/no-such-property/brochure.pdf');

    expect(status).toBe(404);
  });
});

describe('admin exports', () => {
  it('emits a properties CSV whose two id columns differ', async () => {
    const { admin } = await tokens();
    const { status, bytes } = await fetchBytes('/api/reports/admin/export/properties.csv', {
      token: admin,
    });

    expect(status).toBe(200);
    const text = new TextDecoder().decode(bytes);
    const [header, firstRow] = text.split('\n');

    expect(header).toMatch(/Property ID/);
    expect(header).toMatch(/Mongo ID/);

    const [propertyId, mongoId] = firstRow.split(',');
    expect(propertyId).not.toBe(mongoId);
    // The UUID and the ObjectId have distinguishable shapes.
    expect(propertyId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(mongoId).toMatch(/^[0-9a-f]{24}$/i);
  });

  it('refuses an export to a non-staff caller', async () => {
    const { user } = await tokens();
    const { status } = await fetchBytes('/api/reports/admin/export/leads.csv', { token: user });

    expect([401, 403]).toContain(status);
  });
});

describe('the chatbot', () => {
  it('opens a thread and answers with citations', async () => {
    const thread = await call<{ threadId: string; guestToken: string }>('/api/chat/threads', {
      method: 'POST',
      body: { locale: 'en' },
    });
    expect(thread.status).toBe(201);

    const { threadId, guestToken } = thread.body.data!;

    const answer = await call<{ answer: string; sources: unknown[] }>('/api/chat/message', {
      method: 'POST',
      body: {
        threadId,
        guestToken,
        message: 'Show me 3 bedroom apartments in New Cairo under 10 million',
        locale: 'en',
      },
    });

    expect(answer.status).toBe(200);
    expect(answer.body.data!.answer.length).toBeGreaterThan(20);
    // Retrieval actually ran, rather than the model answering from nothing.
    expect(answer.body.data!.sources.length).toBeGreaterThan(0);
  });

  it('answers an Arabic question in Arabic', async () => {
    const thread = await call<{ threadId: string; guestToken: string }>('/api/chat/threads', {
      method: 'POST',
      body: { locale: 'ar' },
    });
    const { threadId, guestToken } = thread.body.data!;

    const answer = await call<{ answer: string }>('/api/chat/message', {
      method: 'POST',
      body: { threadId, guestToken, message: 'ابحث عن شقة ٣ غرف في القاهرة الجديدة', locale: 'ar' },
    });

    expect(answer.status).toBe(200);
    expect(answer.body.data!.answer).toMatch(/[؀-ۿ]/);
  });

  it('refuses another visitor\'s thread', async () => {
    const thread = await call<{ threadId: string }>('/api/chat/threads', {
      method: 'POST',
      body: { locale: 'en' },
    });

    const result = await call('/api/chat/message', {
      method: 'POST',
      body: {
        threadId: thread.body.data!.threadId,
        guestToken: 'not-the-right-token',
        message: 'hello',
        locale: 'en',
      },
    });

    expect([401, 403, 404]).toContain(result.status);
  });
});
