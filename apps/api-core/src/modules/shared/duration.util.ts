/**
 * Duration parsing for the `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` style values
 * (`15m`, `30d`, `3600`). Redis needs seconds; `jsonwebtoken` accepts the raw
 * string, so both representations are kept in sync from one source.
 */

const UNIT_SECONDS: Readonly<Record<string, number>> = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 60 * 60 * 24,
  w: 60 * 60 * 24 * 7,
  y: 60 * 60 * 24 * 365,
};

const DURATION_PATTERN = /^(\d+(?:\.\d+)?)\s*(s|m|h|d|w|y)?$/i;

/**
 * `'15m'` → `900`. A bare number is already seconds. Throws on garbage so a
 * misconfigured TTL fails at boot rather than minting eternal tokens.
 */
export function durationToSeconds(value: string | number): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Invalid duration: ${value}`);
    }
    return Math.floor(value);
  }

  const match = DURATION_PATTERN.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid duration: "${value}" (expected e.g. "15m", "30d", "3600")`);
  }

  const amount = Number.parseFloat(match[1]);
  const unit = (match[2] ?? 's').toLowerCase();
  const seconds = Math.floor(amount * UNIT_SECONDS[unit]);

  if (seconds <= 0) {
    throw new Error(`Invalid duration: "${value}" resolves to ${seconds}s`);
  }

  return seconds;
}

/** Seconds from now as an absolute `Date` — for `expiresAt` columns. */
export const secondsFromNow = (seconds: number, from: Date = new Date()): Date =>
  new Date(from.getTime() + seconds * 1000);

/** Remaining lifetime of a JWT `exp` (seconds), floored at zero. */
export const secondsUntilExpiry = (expUnixSeconds: number, now: Date = new Date()): number =>
  Math.max(0, expUnixSeconds - Math.floor(now.getTime() / 1000));
