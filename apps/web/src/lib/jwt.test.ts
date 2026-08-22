import { afterEach, describe, expect, it, vi } from 'vitest';

import { decodeAccessToken, isTokenExpired, tokenExpiresAt } from './jwt';

/**
 * The browser never verifies a signature — it reads `exp` to decide when to
 * refresh. So what matters here is that a token it cannot read is handled
 * deliberately rather than crashing or being mistaken for a valid session.
 */

/** Mint an unsigned token with the given payload; the signature is never checked. */
function token(payload: Record<string, unknown>, signature = 'sig'): string {
  const b64 = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.${signature}`;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('decodeAccessToken', () => {
  it('reads the claims out of the payload segment', () => {
    const claims = decodeAccessToken(token({ sub: 'u1', role: 'admin', exp: 1_800_000_000 }));

    expect(claims).toMatchObject({ sub: 'u1', role: 'admin', exp: 1_800_000_000 });
  });

  it('decodes base64url padding correctly, including the unpadded case', () => {
    // A payload whose base64 length is not a multiple of four exercises the padding branch.
    const claims = decodeAccessToken(token({ sub: 'abc' }));
    expect(claims).toMatchObject({ sub: 'abc' });
  });

  it('survives non-ASCII claims rather than mangling them', () => {
    const claims = decodeAccessToken(token({ name: 'أحمد' }));
    expect(claims).toMatchObject({ name: 'أحمد' });
  });

  it('returns null for anything that is not a three-part token', () => {
    expect(decodeAccessToken('not.a.jwt.at.all')).toBeNull();
    expect(decodeAccessToken('onlyonepart')).toBeNull();
    expect(decodeAccessToken('two.parts')).toBeNull();
  });

  it('returns null rather than throwing on an undecodable payload', () => {
    expect(decodeAccessToken('aaa.!!!not-base64!!!.ccc')).toBeNull();
  });

  it('returns null for an absent token', () => {
    expect(decodeAccessToken(null)).toBeNull();
    expect(decodeAccessToken(undefined)).toBeNull();
    expect(decodeAccessToken('')).toBeNull();
  });
});

describe('tokenExpiresAt', () => {
  it('converts the exp claim from seconds to milliseconds', () => {
    expect(tokenExpiresAt(token({ exp: 1_800_000_000 }))).toBe(1_800_000_000_000);
  });

  it('returns null when there is no exp claim', () => {
    expect(tokenExpiresAt(token({ sub: 'u1' }))).toBeNull();
  });

  it('returns null for an unreadable token', () => {
    expect(tokenExpiresAt('garbage')).toBeNull();
  });
});

describe('isTokenExpired', () => {
  it('is false for a token with plenty of life left', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const exp = Math.floor(Date.parse('2026-01-01T01:00:00Z') / 1000);

    expect(isTokenExpired(token({ exp }))).toBe(false);
  });

  it('is true once the expiry has passed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T02:00:00Z'));
    const exp = Math.floor(Date.parse('2026-01-01T01:00:00Z') / 1000);

    expect(isTokenExpired(token({ exp }))).toBe(true);
  });

  it('treats a token inside the skew window as already expired', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    // Expires in 20s, which is inside the default 30s skew.
    const exp = Math.floor(Date.parse('2026-01-01T00:00:20Z') / 1000);

    expect(isTokenExpired(token({ exp }))).toBe(true);
    // …but not with a skew small enough to let it through.
    expect(isTokenExpired(token({ exp }), 5)).toBe(false);
  });

  it('treats a missing token as expired', () => {
    expect(isTokenExpired(null)).toBe(true);
    expect(isTokenExpired(undefined)).toBe(true);
    expect(isTokenExpired('')).toBe(true);
  });

  it('does not call an unreadable-but-present token expired — the server decides', () => {
    // Deliberate: the client cannot prove it is expired, so it sends it and lets
    // the 401-refresh path handle the answer rather than logging the user out.
    expect(isTokenExpired('garbage-token')).toBe(false);
    expect(isTokenExpired(token({ sub: 'no-exp' }))).toBe(false);
  });
});
