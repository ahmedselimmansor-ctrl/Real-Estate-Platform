import { beforeEach, describe, expect, it } from 'vitest';

import { ACCOUNTS, DEMO_PASSWORD, call, login } from '../setup/client';
import { throttleAuth, tokens } from '../setup/fixtures';

/**
 * The authentication lifecycle end to end, including the distinctions that are
 * easy to get wrong: 401 for "who are you" versus 403 for "not you", and a
 * refresh cookie that the browser can use but script cannot read.
 */

// Every test here hits /api/v1/auth/*, which nginx throttles as one prefix.
beforeEach(throttleAuth);

describe('login', () => {
  it('issues an access token and returns the user', async () => {
    const result = await call<{ accessToken: string; user: { email: string; role: string } }>(
      '/api/v1/auth/login',
      { method: 'POST', body: { email: ACCOUNTS.user, password: DEMO_PASSWORD } },
    );

    expect(result.status).toBe(200);
    expect(result.body.data?.accessToken).toBeTruthy();
    expect(result.body.data?.user.email).toBe(ACCOUNTS.user);
  });

  it('sets an httpOnly refresh cookie that script cannot read', async () => {
    const result = await call('/api/v1/auth/login', {
      method: 'POST',
      body: { email: ACCOUNTS.user, password: DEMO_PASSWORD },
    });

    const cookie = result.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/topchoice_rt=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite/i);
  });

  it('rejects a wrong password with 401', async () => {
    const result = await call('/api/v1/auth/login', {
      method: 'POST',
      body: { email: ACCOUNTS.user, password: 'definitely-not-the-password' },
    });

    expect(result.status).toBe(401);
    expect(result.body.success).toBe(false);
  });

  it('does not reveal whether the account exists', async () => {
    const wrongPassword = await call('/api/v1/auth/login', {
      method: 'POST',
      body: { email: ACCOUNTS.user, password: 'wrong' },
    });
    const noSuchUser = await call('/api/v1/auth/login', {
      method: 'POST',
      body: { email: 'nobody-here@topchoice.local', password: 'wrong' },
    });

    // Same status and same message, or account enumeration is free.
    expect(noSuchUser.status).toBe(wrongPassword.status);
    expect(noSuchUser.body.error?.message).toBe(wrongPassword.body.error?.message);
  });

  it.each([
    ['a malformed address', { email: 'not-an-email', password: 'x' }],
    ['a missing password', { email: ACCOUNTS.user }],
    ['an empty body', {}],
  ])('answers %s with the same 401 as a wrong password, never a 500', async (_label, body) => {
    const result = await call('/api/v1/auth/login', { method: 'POST', body });

    // Not 422. LocalAuthGuard runs ahead of any validation pipe and there is no
    // @Body() DTO on the handler, so every rejected shape comes back as
    // INVALID_CREDENTIALS. That is the right answer for a login endpoint —
    // telling a prober "your email is malformed" versus "wrong password"
    // distinguishes a probe that got the field right from one that did not.
    expect(result.status).toBe(401);
    expect(result.body.error?.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('the authenticated identity', () => {
  it('returns the caller for a valid token', async () => {
    const token = tokens().user;
    const result = await call<{ email: string; role: string }>('/api/v1/auth/me', { token });

    expect(result.status).toBe(200);
    expect(result.body.data?.email).toBe(ACCOUNTS.user);
  });

  it('refuses an absent token with 401', async () => {
    const result = await call('/api/v1/auth/me');

    expect(result.status).toBe(401);
  });

  it.each([
    ['garbage', 'not-a-jwt-at-all'],
    ['a well-formed but unsigned token', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.forged'],
  ])('refuses %s', async (_label, token) => {
    const result = await call('/api/v1/auth/me', { token });

    expect(result.status).toBe(401);
  });
});

describe('role enforcement', () => {
  it.each(['/api/v1/admin/stats', '/api/v1/admin/activity', '/api/v1/leads'])(
    '%s: admin passes, a signed-in user is forbidden, an anonymous caller is unauthorised',
    async (path) => {
      const { admin, user } = tokens();

      expect((await call(path, { token: admin })).status).toBe(200);
      // 403, not 401 — the caller is known, they are simply not allowed.
      expect((await call(path, { token: user })).status).toBe(403);
      expect((await call(path)).status).toBe(401);
    },
  );

  it('lets an agent reach the lead queue they work', async () => {
    const { agent } = tokens();

    expect((await call('/api/v1/leads', { token: agent })).status).toBe(200);
  });
});

describe('logout', () => {
  it('clears the refresh cookie', async () => {
    // Its own session, deliberately. Logging out revokes the token it is given,
    // and the run-wide one from global-setup is shared with every later spec —
    // using it here signed the whole suite out and left a trail of 401s in
    // journeys.spec that read like an authorisation bug.
    const token = await login(ACCOUNTS.user);
    const result = await call('/api/v1/auth/logout', { method: 'POST', token });

    expect([200, 204]).toContain(result.status);
    const cookie = result.headers.get('set-cookie') ?? '';
    if (cookie) expect(cookie).toMatch(/topchoice_rt=;|Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  });
});
