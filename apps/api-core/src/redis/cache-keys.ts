import { createHash } from 'node:crypto';

/**
 * CONTRACT §2 — Redis key namespaces. Every service must use these exact
 * prefixes so caches can be invalidated across process boundaries.
 *
 * ```
 * cache:prop:{id}                 TTL 300s
 * cache:list:{hash}               TTL 120s
 * cache:search:{hash}             TTL 60s
 * ratelimit:{scope}:{ip|userId}   TTL window
 * auth:denylist:{jti}             TTL = refresh token remaining life
 * auth:refresh:{userId}:{jti}     TTL 30d
 * chat:stream:{threadId}          TTL 3600s
 * lock:{resource}                 TTL 30s
 * ```
 */
export const CACHE_TTL = {
  /** `cache:prop:*` */
  property: 300,
  /** `cache:list:*` */
  list: 120,
  /** `cache:search:*` */
  search: 60,
  /** `auth:refresh:*` — 30 days, matching JWT_REFRESH_TTL. */
  refreshToken: 60 * 60 * 24 * 30,
  /** `chat:stream:*` */
  chatStream: 3600,
  /** `lock:*` */
  lock: 30,
} as const;

/** Stable hash for cache keys built from a filter/query object. */
export function hashKey(payload: unknown): string {
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(normalize);
    }
    if (value && typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, normalize(entry)]);
    }
    return value;
  };

  return createHash('sha1').update(JSON.stringify(normalize(payload) ?? null)).digest('hex');
}

export const cacheKeys = {
  property: (id: string): string => `cache:prop:${id}`,
  propertyPattern: (): string => 'cache:prop:*',

  list: (query: unknown): string => `cache:list:${hashKey(query)}`,
  listPattern: (): string => 'cache:list:*',

  search: (query: unknown): string => `cache:search:${hashKey(query)}`,
  searchPattern: (): string => 'cache:search:*',

  rateLimit: (scope: string, identifier: string): string => `ratelimit:${scope}:${identifier}`,

  authDenylist: (jti: string): string => `auth:denylist:${jti}`,
  authRefresh: (userId: string, jti: string): string => `auth:refresh:${userId}:${jti}`,
  authRefreshPattern: (userId: string): string => `auth:refresh:${userId}:*`,

  chatStream: (threadId: string): string => `chat:stream:${threadId}`,

  lock: (resource: string): string => `lock:${resource}`,
} as const;
