// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from './auth.store';
import type { User } from '@/types/user';

/**
 * `status` is derived, never set directly, and the whole app gates on it. The
 * rule is that it is only 'authenticated' when a token *and* a user are both
 * present — a half-populated session must not read as signed in.
 */

const get = () => useAuthStore.getState();

const user = { id: 'u1', email: 'a@b.test', name: 'Ahmed', role: 'user' } as User;

/** An unsigned token with a real `exp`, so expiresAt is derived rather than null. */
function token(secondsFromNow = 3600): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256' })}.${b64({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + secondsFromNow })}.sig`;
}

beforeEach(() => {
  useAuthStore.setState({
    user: null,
    accessToken: null,
    expiresAt: null,
    status: 'unauthenticated',
    hasHydrated: true,
  });
});

describe('login', () => {
  it('stores the pair and marks the session authenticated', () => {
    get().login({ user, accessToken: token() });

    expect(get().status).toBe('authenticated');
    expect(get().user).toEqual(user);
  });

  it('derives the expiry from the token rather than trusting a caller', () => {
    get().login({ user, accessToken: token(3600) });

    expect(get().expiresAt).toBeTypeOf('number');
    expect(get().expiresAt!).toBeGreaterThan(Date.now());
  });

  it('leaves expiresAt null for a token with no exp claim', () => {
    get().login({ user, accessToken: 'not.a.jwt' });

    expect(get().expiresAt).toBeNull();
  });
});

describe('status is derived, not assigned', () => {
  it('is unauthenticated with a token but no user', () => {
    get().setAccessToken(token());

    expect(get().status).toBe('unauthenticated');
  });

  it('is unauthenticated with a user but no token', () => {
    get().setUser(user);

    expect(get().status).toBe('unauthenticated');
  });

  it('flips to authenticated once the second half arrives', () => {
    get().setUser(user);
    get().setAccessToken(token());

    expect(get().status).toBe('authenticated');
  });

  it('drops back to unauthenticated when the token is cleared', () => {
    get().login({ user, accessToken: token() });
    get().setAccessToken(null);

    expect(get().status).toBe('unauthenticated');
    expect(get().user).toEqual(user); // the user object survives; the session does not
  });

  it('drops back to unauthenticated when the user is cleared', () => {
    get().login({ user, accessToken: token() });
    get().setUser(null);

    expect(get().status).toBe('unauthenticated');
  });
});

describe('setSession', () => {
  it('refreshes the token while keeping the existing user, which is the refresh path', () => {
    get().login({ user, accessToken: token() });
    const rotated = token(7200);

    get().setSession({ accessToken: rotated });

    expect(get().accessToken).toBe(rotated);
    expect(get().user).toEqual(user);
    expect(get().status).toBe('authenticated');
  });

  it('distinguishes an omitted user from an explicit null', () => {
    get().login({ user, accessToken: token() });

    get().setSession({ accessToken: token(), user: null });
    expect(get().user).toBeNull();
    expect(get().status).toBe('unauthenticated');
  });

  it('recomputes the expiry on every rotation', () => {
    get().login({ user, accessToken: token(60) });
    const first = get().expiresAt!;

    get().setSession({ accessToken: token(7200) });
    expect(get().expiresAt!).toBeGreaterThan(first);
  });
});

describe('logout', () => {
  it('clears every part of the session', () => {
    get().login({ user, accessToken: token() });
    get().logout();

    expect(get()).toMatchObject({
      user: null,
      accessToken: null,
      expiresAt: null,
      status: 'unauthenticated',
    });
  });

  it('is safe to call when already signed out', () => {
    expect(() => get().logout()).not.toThrow();
    expect(get().status).toBe('unauthenticated');
  });
});
