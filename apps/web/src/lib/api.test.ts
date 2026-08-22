// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AUTH_EXPIRED_EVENT,
  ApiError,
  api,
  buildQueryString,
  errorMessage,
  request,
  requestPaginated,
  requestWithMeta,
  serviceUrl,
} from './api';
import { useAuthStore } from '@/store/auth.store';

/**
 * `isServer` is a module-level const derived from `typeof window`, so these run
 * under jsdom — otherwise every browser-only branch (refresh, session clearing)
 * is short-circuited and the interesting logic never executes.
 */

/** Build a Response the way the contract's §4 envelope shapes one. */
function envelope(data: unknown, init: { status?: number; meta?: unknown } = {}) {
  const { status = 200, meta } = init;
  return new Response(JSON.stringify({ success: status < 400, data, ...(meta ? { meta } : {}) }), {
    status,
    headers: { 'content-type': 'application/json', 'x-request-id': 'req-fixed' },
  });
}

function errorEnvelope(code: string, message: string, status: number, details: unknown[] = []) {
  return new Response(JSON.stringify({ success: false, error: { code, message, details } }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Await a call that must reject and hand back the ApiError it threw. */
async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    return error as ApiError;
  }
  throw new Error('expected the request to reject, but it resolved');
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  useAuthStore.setState({ user: null, accessToken: null, status: 'unauthenticated' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('buildQueryString', () => {
  it('drops undefined, null and empty values rather than sending key=', () => {
    expect(buildQueryString({ a: undefined, b: null, c: '', d: 1 })).toBe('?d=1');
  });

  it('repeats a key per array entry', () => {
    expect(buildQueryString({ t: ['villa', 'chalet'] })).toBe('?t=villa&t=chalet');
  });

  it('drops empty entries inside an array', () => {
    expect(buildQueryString({ t: ['villa', '', null as never] })).toBe('?t=villa');
  });

  it('returns an empty string, not "?", when nothing survives', () => {
    expect(buildQueryString({ a: undefined })).toBe('');
    expect(buildQueryString()).toBe('');
  });

  it('encodes values that would otherwise break the URL', () => {
    expect(buildQueryString({ q: 'new cairo & zayed' })).toContain('new+cairo+%26+zayed');
  });
});

describe('serviceUrl', () => {
  it('joins base and path without doubling the slash', () => {
    expect(serviceUrl('core', '/properties')).toBe('/api/v1/properties');
    expect(serviceUrl('core', 'properties')).toBe('/api/v1/properties');
  });

  it('returns the bare base for an empty path', () => {
    expect(serviceUrl('search', '')).toBe('/api/search');
    expect(serviceUrl('search', '/')).toBe('/api/search');
  });

  it('appends the query string', () => {
    expect(serviceUrl('core', '/properties', { limit: 2 })).toBe('/api/v1/properties?limit=2');
  });
});

describe('ApiError', () => {
  it('exposes the status as named predicates', () => {
    const e = (status: number) => new ApiError({ code: 'X', message: 'm', status });
    expect(e(401).isUnauthorized).toBe(true);
    expect(e(403).isForbidden).toBe(true);
    expect(e(404).isNotFound).toBe(true);
    expect(e(429).isRateLimited).toBe(true);
    expect(e(0).isNetworkError).toBe(true);
    expect(e(500).isUnauthorized).toBe(false);
  });

  it('passes an ApiError through `from` unchanged', () => {
    const original = new ApiError({ code: 'A', message: 'b', status: 418 });
    expect(ApiError.from(original)).toBe(original);
  });

  it('wraps a plain Error as a network failure', () => {
    const wrapped = ApiError.from(new Error('socket hang up'));
    expect(wrapped.code).toBe('NETWORK_ERROR');
    expect(wrapped.status).toBe(0);
    expect(wrapped.message).toBe('socket hang up');
  });

  it('wraps a non-Error throw without losing the type', () => {
    const wrapped = ApiError.from('a string');
    expect(wrapped).toBeInstanceOf(ApiError);
    expect(wrapped.code).toBe('UNKNOWN_ERROR');
  });

  it('always exposes details as an array', () => {
    expect(new ApiError({ code: 'X', message: 'm', status: 400 }).details).toEqual([]);
  });
});

describe('request', () => {
  it('unwraps the envelope to data', async () => {
    fetchMock.mockResolvedValueOnce(envelope({ id: 'p1' }));
    await expect(request('/properties/p1')).resolves.toEqual({ id: 'p1' });
  });

  it('sends a correlation id and echoes back the one the server returns', async () => {
    fetchMock.mockResolvedValueOnce(envelope({ ok: true }));
    const result = await requestWithMeta('/x');

    expect(fetchMock.mock.calls[0][1].headers['X-Request-Id']).toBeTruthy();
    expect(result.requestId).toBe('req-fixed');
  });

  it('serialises a JSON body and sets the content type', async () => {
    fetchMock.mockResolvedValueOnce(envelope({ ok: true }));
    await request('/leads', { method: 'POST', body: { name: 'Sara' } });

    const init = fetchMock.mock.calls[0][1];
    expect(init.body).toBe('{"name":"Sara"}');
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('leaves FormData alone so the browser can set the boundary', async () => {
    fetchMock.mockResolvedValueOnce(envelope({ ok: true }));
    const form = new FormData();
    form.append('file', 'x');
    await request('/upload', { method: 'POST', body: form });

    const init = fetchMock.mock.calls[0][1];
    expect(init.body).toBe(form);
    expect(init.headers['Content-Type']).toBeUndefined();
  });

  it('attaches the stored bearer token', async () => {
    useAuthStore.setState({ accessToken: 'tok-123' });
    fetchMock.mockResolvedValueOnce(envelope({ ok: true }));
    await request('/me');

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok-123');
  });

  it('omits the header entirely when skipAuth is set', async () => {
    useAuthStore.setState({ accessToken: 'tok-123' });
    fetchMock.mockResolvedValueOnce(envelope({ ok: true }));
    await request('/properties', { skipAuth: true });

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('prefers an explicitly passed token over the stored one', async () => {
    useAuthStore.setState({ accessToken: 'stored' });
    fetchMock.mockResolvedValueOnce(envelope({ ok: true }));
    await request('/me', { token: 'explicit' });

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer explicit');
  });
});

describe('error handling', () => {
  it('turns the error envelope into an ApiError with its code and details', async () => {
    fetchMock.mockResolvedValueOnce(
      errorEnvelope('VALIDATION_ERROR', 'Request validation failed', 422, [{ field: 'limit' }]),
    );

    const error = await rejection(request('/x'));
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.status).toBe(422);
    expect(error.details).toEqual([{ field: 'limit' }]);
  });

  it('derives a code from the status when the body carries none', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('{}', { status: 409, headers: { 'content-type': 'application/json' } }),
    );

    const error = await rejection(request('/x'));
    expect(error.code).toBe('CONFLICT');
  });

  it('maps 5xx to INTERNAL_ERROR', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('{}', { status: 503, headers: { 'content-type': 'application/json' } }),
    );

    await expect(request('/x')).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('reports an unreachable server as a network error rather than throwing raw', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const error = await rejection(request('/x'));
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.status).toBe(0);
  });

  it('lets an abort propagate as an AbortError, not a network error', async () => {
    fetchMock.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));

    const error = await rejection(request('/x'));
    expect(error).toBeInstanceOf(DOMException);
    expect(error.name).toBe('AbortError');
  });

  it('surfaces a non-JSON error body as the message instead of swallowing it', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<html>502 Bad Gateway</html>', {
        status: 502,
        headers: { 'content-type': 'text/html' },
      }),
    );

    const error = await rejection(request('/x'));
    expect(error.status).toBe(502);
    expect(error.message).toContain('502 Bad Gateway');
  });

  it('flags a malformed JSON body rather than resolving with junk', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('not json at all', { status: 200, headers: { 'content-type': 'application/json' } }),
    );

    await expect(request('/x')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('throws when the envelope reports success: false on a 200', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false, error: { code: 'BUSINESS_RULE', message: 'no' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(request('/x')).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
  });
});

describe('204 and bare payloads', () => {
  it('resolves undefined for a No Content response', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(request('/favorites/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('tolerates a response that is not wrapped in the envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'bare' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(request('/x')).resolves.toEqual({ id: 'bare' });
  });
});

describe('401 refresh and replay', () => {
  it('refreshes once, replays the request with the new token, and returns the data', async () => {
    useAuthStore.setState({ accessToken: 'expired' });

    fetchMock
      .mockResolvedValueOnce(errorEnvelope('UNAUTHORIZED', 'expired', 401))
      .mockResolvedValueOnce(envelope({ accessToken: 'fresh-token' })) // the refresh call
      .mockResolvedValueOnce(envelope({ id: 'p1' })); // the replay

    await expect(request('/me')).resolves.toEqual({ id: 'p1' });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1][0])).toContain('/auth/refresh');
    // The replay must carry the new token, not the stale one.
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer fresh-token');
  });

  it('reuses the correlation id across the replay so the pair is traceable', async () => {
    useAuthStore.setState({ accessToken: 'expired' });
    fetchMock
      .mockResolvedValueOnce(errorEnvelope('UNAUTHORIZED', 'expired', 401))
      .mockResolvedValueOnce(envelope({ accessToken: 'fresh' }))
      .mockResolvedValueOnce(envelope({ ok: true }));

    await request('/me');

    const first = fetchMock.mock.calls[0][1].headers['X-Request-Id'];
    const replay = fetchMock.mock.calls[2][1].headers['X-Request-Id'];
    expect(replay).toBe(first);
  });

  it('gives up after one replay instead of looping on a persistent 401', async () => {
    useAuthStore.setState({ accessToken: 'expired' });
    fetchMock
      .mockResolvedValueOnce(errorEnvelope('UNAUTHORIZED', 'expired', 401))
      .mockResolvedValueOnce(envelope({ accessToken: 'fresh' }))
      .mockResolvedValueOnce(errorEnvelope('UNAUTHORIZED', 'still expired', 401));

    await expect(request('/me')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('clears the session and announces it when the refresh itself fails', async () => {
    useAuthStore.setState({ accessToken: 'expired', user: { id: 'u1' } as never, status: 'authenticated' });
    const onExpired = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);

    fetchMock
      .mockResolvedValueOnce(errorEnvelope('UNAUTHORIZED', 'expired', 401))
      .mockResolvedValueOnce(errorEnvelope('UNAUTHORIZED', 'no cookie', 401)); // refresh fails

    await expect(request('/me')).rejects.toMatchObject({ status: 401 });

    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(onExpired).toHaveBeenCalledTimes(1);
    window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  });

  it('never tries to refresh the refresh endpoint itself', async () => {
    fetchMock.mockResolvedValueOnce(errorEnvelope('UNAUTHORIZED', 'no cookie', 401));

    await expect(request('/auth/refresh', { method: 'POST' })).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('honours skipRefresh for callers that want the raw 401', async () => {
    useAuthStore.setState({ accessToken: 'expired' });
    fetchMock.mockResolvedValueOnce(errorEnvelope('UNAUTHORIZED', 'expired', 401));

    await expect(request('/me', { skipRefresh: true })).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not refresh a public request that happens to 401', async () => {
    fetchMock.mockResolvedValueOnce(errorEnvelope('UNAUTHORIZED', 'nope', 401));

    await expect(request('/properties', { skipAuth: true })).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('collapses concurrent 401s into a single refresh round-trip', async () => {
    useAuthStore.setState({ accessToken: 'expired' });

    let refreshCalls = 0;
    fetchMock.mockImplementation((url: string, init: RequestInit) => {
      const target = String(url);
      if (target.includes('/auth/refresh')) {
        refreshCalls += 1;
        // Defer, so all three callers land while this one is still in flight.
        return new Promise((resolve) =>
          setTimeout(() => resolve(envelope({ accessToken: 'fresh' })), 10),
        );
      }
      const auth = (init.headers as Record<string, string>).Authorization;
      return Promise.resolve(
        auth === 'Bearer fresh' ? envelope({ ok: true }) : errorEnvelope('UNAUTHORIZED', 'expired', 401),
      );
    });

    const results = await Promise.all([request('/a'), request('/b'), request('/c')]);

    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    // Three 401s, one refresh — this is the whole point of the single-flight guard.
    expect(refreshCalls).toBe(1);
  });
});

describe('requestPaginated', () => {
  it('returns items with the server meta', async () => {
    fetchMock.mockResolvedValueOnce(
      envelope([{ id: 1 }, { id: 2 }], { meta: { page: 2, limit: 2, total: 9, totalPages: 5 } }),
    );

    const page = await requestPaginated('/properties');
    expect(page.items).toHaveLength(2);
    expect(page.meta).toEqual({ page: 2, limit: 2, total: 9, totalPages: 5 });
  });

  it('synthesises meta when the endpoint returns a bare array', async () => {
    fetchMock.mockResolvedValueOnce(envelope([{ id: 1 }, { id: 2 }, { id: 3 }]));

    const page = await requestPaginated('/areas');
    expect(page.meta).toEqual({ page: 1, limit: 3, total: 3, totalPages: 1 });
  });

  it('reports zero pages for an empty list rather than one empty page', async () => {
    fetchMock.mockResolvedValueOnce(envelope([]));

    const page = await requestPaginated('/areas');
    expect(page.items).toEqual([]);
    expect(page.meta.totalPages).toBe(0);
  });

  it('does not explode when the payload is not an array at all', async () => {
    fetchMock.mockResolvedValueOnce(envelope({ not: 'an array' }));

    const page = await requestPaginated('/areas');
    expect(page.items).toEqual([]);
  });
});

describe('api verb sugar', () => {
  it.each([
    ['get', 'GET'],
    ['post', 'POST'],
    ['patch', 'PATCH'],
    ['put', 'PUT'],
    ['delete', 'DELETE'],
  ])('api.%s issues a %s', async (verb, method) => {
    fetchMock.mockResolvedValueOnce(envelope({ ok: true }));
    await (api as Record<string, (p: string, o?: unknown) => Promise<unknown>>)[verb]('/x');

    expect(fetchMock.mock.calls[0][1].method).toBe(method);
  });
});

describe('errorMessage', () => {
  it('prefers the API message', () => {
    expect(errorMessage(new ApiError({ code: 'X', message: 'Too many requests', status: 429 }))).toBe(
      'Too many requests',
    );
  });

  it('falls back for a value that is not an error', () => {
    expect(errorMessage(undefined, 'fallback')).toBe('fallback');
  });
});
