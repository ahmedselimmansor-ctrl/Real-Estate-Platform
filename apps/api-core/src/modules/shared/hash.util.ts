import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Hex SHA-256 — used for reset tokens and refresh token fingerprints. */
export const sha256Hex = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

/** URL-safe random token (default 32 bytes → 64 hex chars). */
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('hex');

/**
 * Pseudonymised client address. Raw IPs are never persisted (GDPR-ish hygiene);
 * the hash is stable per address so views can still be de-duplicated.
 */
export const hashIp = (ip: string | undefined | null, salt = 'topchoice'): string | null => {
  if (!ip) {
    return null;
  }
  return sha256Hex(`${salt}:${ip}`).slice(0, 32);
};

/** Constant-time comparison of two hex digests of equal length. */
export const safeEqualHex = (a: string, b: string): boolean => {
  if (a.length !== b.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
};
