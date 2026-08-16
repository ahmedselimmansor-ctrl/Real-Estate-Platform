import type { AccessTokenClaims } from '@/types/user';

/**
 * Read-only JWT helpers. Signature verification happens server-side in the
 * backing services (CONTRACT §5) — the browser only needs the claims to know
 * when to refresh.
 */

function base64UrlDecode(segment: string): string {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  if (typeof atob === 'function') {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(padded, 'base64').toString('utf8');
}

export function decodeAccessToken(token: string | null | undefined): AccessTokenClaims | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(base64UrlDecode(parts[1])) as AccessTokenClaims;
  } catch {
    return null;
  }
}

/** Epoch milliseconds of the `exp` claim, or `null` when unreadable. */
export function tokenExpiresAt(token: string | null | undefined): number | null {
  const claims = decodeAccessToken(token);
  return claims?.exp ? claims.exp * 1000 : null;
}

/**
 * `true` when the token is missing or within `skewSeconds` of expiry.
 * A 30s skew keeps us from firing a request that is certain to 401.
 */
export function isTokenExpired(token: string | null | undefined, skewSeconds = 30): boolean {
  const expiresAt = tokenExpiresAt(token);
  if (expiresAt === null) return !token;
  return Date.now() >= expiresAt - skewSeconds * 1000;
}
