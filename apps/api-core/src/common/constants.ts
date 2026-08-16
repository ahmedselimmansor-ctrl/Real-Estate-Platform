/** Values shared across the whole service. */

export const SERVICE_NAME = 'api-core';
export const SERVICE_VERSION = '1.0.0';

/** CONTRACT §1 — every api-core route lives under this prefix (except /health). */
export const API_PREFIX = 'api/v1';
export const SWAGGER_PATH = `${API_PREFIX}/docs`;

/** CONTRACT §4 — correlation header propagated by every service. */
export const REQUEST_ID_HEADER = 'x-request-id';

/** CONTRACT §5 — service-to-service header. */
export const SERVICE_TOKEN_HEADER = 'x-service-token';

/** CONTRACT §5 — refresh token cookie. */
export const REFRESH_TOKEN_COOKIE = 'nawy_rt';

/** CONTRACT §4 — pagination defaults. */
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Global throttle: 120 requests / minute / client (feature modules tighten this). */
export const GLOBAL_RATE_LIMIT = 120;
export const GLOBAL_RATE_LIMIT_TTL_MS = 60_000;

/** Requests slower than this are logged at warn level. */
export const SLOW_REQUEST_THRESHOLD_MS = 1_000;
