import { describe, expect, it } from 'vitest';

import { BASE_URL, call } from '../setup/client';

/**
 * The edge is the only thing every request passes through, so a mistake here is
 * a mistake everywhere. These assert the guarantees nginx is supposed to make
 * on behalf of all five services.
 */

describe('TLS and redirects', () => {
  it('redirects plain HTTP to HTTPS rather than serving it', async () => {
    const httpUrl = BASE_URL.replace(/^https:/, 'http:').replace(/:443$/, '');
    const response = await fetch(httpUrl, { redirect: 'manual' });

    expect([301, 308]).toContain(response.status);
    expect(response.headers.get('location')).toMatch(/^https:/);
  });
});

describe('security headers', () => {
  it('sends HSTS, so a downgrade is refused by the browser next time', async () => {
    const { headers } = await call('/');

    expect(headers.get('strict-transport-security')).toMatch(/max-age=\d+/);
  });

  it.each([
    ['x-content-type-options', /nosniff/i],
    ['x-frame-options', /SAMEORIGIN|DENY/i],
    ['referrer-policy', /strict-origin|no-referrer/i],
    ['content-security-policy', /default-src/i],
  ])('sends %s', async (header, pattern) => {
    const { headers } = await call('/');

    expect(headers.get(header) ?? '').toMatch(pattern);
  });

  it('does not advertise the server version', async () => {
    const { headers } = await call('/');
    const server = headers.get('server') ?? '';

    expect(server).not.toMatch(/\d+\.\d+\.\d+/);
  });
});

describe('request correlation', () => {
  it('echoes an inbound X-Request-Id so a client can trace its own call', async () => {
    const id = 'integration-fixed-id-0001';
    const { headers } = await call('/api/v1/properties?limit=1', { headers: { 'X-Request-Id': id } });

    expect(headers.get('x-request-id')).toBe(id);
  });

  it('generates one when the client sends none', async () => {
    const { requestId } = await call('/api/v1/properties?limit=1');

    expect(requestId).toBeTruthy();
  });
});

describe('routing', () => {
  it.each([
    ['/api/v1/properties?limit=1', 'api-core'],
    ['/api/search?limit=1', 'search-svc'],
    ['/api/reports/market/summary', 'reports-svc'],
  ])('%s reaches %s', async (path) => {
    const { status } = await call(path);

    expect(status).toBe(200);
  });

  it('serves the storefront at the root', async () => {
    const response = await fetch(`${BASE_URL}/`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/text\/html/);
  });

  it.each(['nginx', 'web', 'api-core', 'search-svc', 'rag-svc', 'reports-svc'])(
    'exposes a health probe for %s',
    async (service) => {
      const { status } = await call(`/__health/${service}`);

      expect(status).toBe(200);
    },
  );
});

describe('error surfaces', () => {
  it('returns the JSON envelope for an unknown API path, not an HTML page', async () => {
    const result = await call('/api/v1/definitely-not-a-route');

    expect(result.status).toBe(404);
    expect(result.headers.get('content-type')).toMatch(/application\/json/);
    expect(result.body.success).toBe(false);
    expect(result.body.error?.code).toBeTruthy();
  });

  it('rejects an oversized body rather than buffering it forever', async () => {
    const response = await fetch(`${BASE_URL}/api/v1/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'x'.repeat(30 * 1024 * 1024) }),
    }).catch(() => null);

    // Either nginx rejects it (413) or the connection is cut — both are fine;
    // silently accepting 30 MB is not.
    if (response) expect([413, 400, 422]).toContain(response.status);
  });
});
