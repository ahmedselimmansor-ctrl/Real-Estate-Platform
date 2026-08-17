/**
 * Environment access for apps/web. Names are contractual (CONTRACT §7).
 *
 * NEXT_PUBLIC_* values are inlined at build time, so they must be referenced as
 * full static member expressions — never `process.env[key]`.
 *
 * Browser  → relative public paths (`/api/v1`), served through nginx.
 * Server   → internal docker URLs (`http://api-core:4000`) because a relative
 *            path is meaningless inside a server component's fetch.
 */

export const isServer = typeof window === 'undefined';
export const isProduction = process.env.NODE_ENV === 'production';
export const isDevelopment = process.env.NODE_ENV === 'development';

/** Public, browser-visible base paths. */
export const publicEnv = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || '/api/v1',
  searchUrl: process.env.NEXT_PUBLIC_SEARCH_URL || '/api/search',
  chatUrl: process.env.NEXT_PUBLIC_CHAT_URL || '/api/chat',
  reportsUrl: process.env.NEXT_PUBLIC_REPORTS_URL || '/api/reports',
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://localhost',
  mapboxToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '',
} as const;

/** Internal service origins — only resolvable server-side. */
export const serverEnv = {
  apiCoreUrl: process.env.API_CORE_URL || 'http://localhost:4000',
  searchSvcUrl: process.env.SEARCH_SVC_URL || 'http://localhost:8000',
  ragSvcUrl: process.env.RAG_SVC_URL || 'http://localhost:8001',
  reportsSvcUrl: process.env.REPORTS_SVC_URL || 'http://localhost:4567',
} as const;

export type ServiceName = 'core' | 'search' | 'chat' | 'reports';

const PUBLIC_BASE: Record<ServiceName, string> = {
  core: publicEnv.apiUrl,
  search: publicEnv.searchUrl,
  chat: publicEnv.chatUrl,
  reports: publicEnv.reportsUrl,
};

const SERVER_ORIGIN: Record<ServiceName, string> = {
  core: serverEnv.apiCoreUrl,
  search: serverEnv.searchSvcUrl,
  chat: serverEnv.ragSvcUrl,
  reports: serverEnv.reportsSvcUrl,
};

/**
 * Resolve the base URL for a service in the current runtime.
 * Server-side we prefix the internal origin onto the public path so both
 * runtimes hit the exact same route (`/api/v1/properties`).
 */
export function serviceBaseUrl(service: ServiceName): string {
  const publicPath = PUBLIC_BASE[service];
  if (!isServer) return publicPath;
  if (/^https?:\/\//i.test(publicPath)) return publicPath;
  const origin = SERVER_ORIGIN[service].replace(/\/+$/, '');
  return `${origin}${publicPath.startsWith('/') ? publicPath : `/${publicPath}`}`;
}

/** Refresh-token cookie name (CONTRACT §5). */
export const REFRESH_COOKIE = 'topchoice_rt';
