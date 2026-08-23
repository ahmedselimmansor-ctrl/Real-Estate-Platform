import { inject } from 'vitest';

import type { ACCOUNTS } from './client';

/**
 * Spec-side fixtures. Kept apart from `client.ts` because this imports
 * `vitest`, and `client.ts` is also imported by `global-setup.ts`, which runs
 * in a different context where that import throws.
 */

/**
 * Access tokens for the three seeded roles, signed in once for the whole run
 * by `global-setup.ts`.
 *
 * Vitest gives each spec file its own module registry, so a cache inside the
 * client is rebuilt per file. Even with one, the suite was logging in twenty-odd
 * times a minute, tripping the auth rate limit and failing unrelated specs on
 * 429 — the suite measuring the limiter by accident. Three logins now cover the
 * entire run.
 */
export function tokens(): Record<keyof typeof ACCOUNTS, string> {
  return inject('tokens');
}

/**
 * Space out calls to `/api/v1/auth/*`.
 *
 * nginx throttles that whole prefix — not just login — at 20 requests a minute
 * with a burst of 10 and `nodelay`, so anything past the burst is refused
 * outright rather than queued. A spec file that exercises the auth lifecycle
 * properly makes more calls than that, and the excess comes back 429.
 *
 * The limit is deliberately strict because credential stuffing is the attack
 * that actually happens, so the suite paces itself rather than the production
 * config being loosened to suit it. Costs about a minute in the auth spec.
 */
export function throttleAuth(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 3_200));
}
