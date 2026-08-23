import { afterAll, describe, expect, it } from 'vitest';

import { ACCOUNTS, DEMO_PASSWORD, call } from '../setup/client';

/**
 * Rate limiting, isolated and deliberately last.
 *
 * nginx limits per client address, so flooding the auth endpoint consumes a
 * resource every other spec shares. When these lived in auth.spec.ts they
 * tripped the limiter and eight later tests failed on 429 while trying to log
 * in — the suite reporting a stack fault that was entirely its own doing.
 *
 * Hence the filename: specs run in path order, so `zz-` puts this after
 * everything else. The afterAll hook then waits for the window to drain, which
 * is what makes a second run behave like the first.
 */

describe('the auth endpoint throttles credential stuffing', () => {
  it('answers 429 in the contract envelope, not an HTML error page', async () => {
    const attempts = await Promise.all(
      Array.from({ length: 45 }, () =>
        call('/api/v1/auth/login', {
          method: 'POST',
          body: { email: 'flood@topchoice.local', password: 'wrong' },
        }),
      ),
    );

    const limited = attempts.filter((a) => a.status === 429);
    expect(limited.length, '45 rapid attempts should trip the limiter').toBeGreaterThan(0);

    const first = limited[0];
    expect(first.headers.get('content-type')).toMatch(/application\/json/);
    expect(first.body.success).toBe(false);
    expect(first.body.error?.code).toBe('RATE_LIMITED');
    // Without this a client has no idea how long to back off for.
    expect(first.headers.get('retry-after')).toBeTruthy();
  });

  it('leaves the read paths alone — one abusive caller must not close the storefront', async () => {
    // The catalogue sits behind a far looser bucket, so it should still serve
    // even though the auth limiter is currently tripped for this address.
    const result = await call('/api/v1/properties?limit=1');

    expect(result.status).toBe(200);
  });
});

afterAll(async () => {
  // Let the window drain in silence, so an immediate re-run is not poisoned by
  // the flood above.
  //
  // Deliberately a plain wait rather than a poll: probing every few seconds
  // spends the budget as fast as it refills, so the poll never observes the
  // recovery it is itself preventing. The zone is 20r/m, so a minute of quiet
  // clears it.
  await new Promise((resolve) => setTimeout(resolve, 62_000));

  // One request afterwards, to confirm the limiter genuinely released rather
  // than the suite merely having stopped asking.
  const recovered = await call('/api/v1/auth/login', {
    method: 'POST',
    body: { email: ACCOUNTS.user, password: DEMO_PASSWORD },
  });
  expect(recovered.status, 'the auth limiter should release after its window').toBe(200);
}, 150_000);
