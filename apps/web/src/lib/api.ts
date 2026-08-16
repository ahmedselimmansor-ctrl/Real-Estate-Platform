import { useAuthStore } from '@/store/auth.store';
import type {
  ApiEnvelope,
  ApiErrorPayload,
  Paginated,
  PaginationMeta,
  QueryParams,
} from '@/types/common';
import type { User } from '@/types/user';
import { isServer, serviceBaseUrl, type ServiceName } from './env';
import { uuid } from './utils';

/**
 * Typed fetch client for every backing service (CONTRACT §4/§5).
 *
 *  • Unwraps `{ success, data, meta }` and throws a typed `ApiError` for
 *    `{ success:false, error:{ code, message, details } }`.
 *  • Attaches `Authorization: Bearer <accessToken>` from the auth store.
 *  • On 401 performs a *single-flight* refresh against `/auth/refresh`
 *    (httpOnly `nawy_rt` cookie) and replays the original request once.
 *  • Generates and propagates `X-Request-Id` on every call.
 *  • Runs unchanged in server components — there it targets the internal
 *    docker URLs and simply skips the browser-only auth/refresh path.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export const AUTH_EXPIRED_EVENT = 'nawy:auth-expired';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown[];
  readonly requestId?: string;

  constructor(params: {
    code: string;
    message: string;
    status: number;
    details?: unknown[];
    requestId?: string;
  }) {
    super(params.message);
    this.name = 'ApiError';
    this.code = params.code;
    this.status = params.status;
    this.details = params.details ?? [];
    this.requestId = params.requestId;
  }

  get isUnauthorized() {
    return this.status === 401;
  }

  get isForbidden() {
    return this.status === 403;
  }

  get isNotFound() {
    return this.status === 404;
  }

  get isRateLimited() {
    return this.status === 429;
  }

  get isNetworkError() {
    return this.status === 0;
  }

  static from(error: unknown): ApiError {
    if (error instanceof ApiError) return error;
    if (error instanceof Error) {
      return new ApiError({ code: 'NETWORK_ERROR', message: error.message, status: 0 });
    }
    return new ApiError({ code: 'UNKNOWN_ERROR', message: 'Something went wrong', status: 0 });
  }
}

export interface RequestOptions {
  method?: HttpMethod;
  /** Which backing service to talk to. Defaults to api-core. */
  service?: ServiceName;
  query?: QueryParams;
  body?: unknown;
  headers?: Record<string, string>;
  /** Explicit bearer token — used by server components that already have one. */
  token?: string | null;
  /** Skip the Authorization header entirely (public endpoints). */
  skipAuth?: boolean;
  /** Disable the automatic 401 → refresh → replay dance. */
  skipRefresh?: boolean;
  signal?: AbortSignal;
  requestId?: string;
  credentials?: RequestCredentials;
  cache?: RequestCache;
  next?: { revalidate?: number | false; tags?: string[] };
}

export interface ApiResult<T> {
  data: T;
  meta?: PaginationMeta;
  requestId?: string;
  status: number;
}

/* -------------------------------------------------------------------------- */
/*  URL helpers                                                               */
/* -------------------------------------------------------------------------- */

export function buildQueryString(query?: QueryParams): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry === undefined || entry === null || entry === '') continue;
        params.append(key, String(entry));
      }
      continue;
    }
    params.append(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

/** Fully-qualified (or root-relative) URL for a service path. */
export function serviceUrl(
  service: ServiceName,
  path: string,
  query?: QueryParams,
): string {
  const base = serviceBaseUrl(service).replace(/\/+$/, '');
  const suffix = path === '' || path === '/' ? '' : `/${path.replace(/^\/+/, '')}`;
  return `${base}${suffix}${buildQueryString(query)}`;
}

/* -------------------------------------------------------------------------- */
/*  Auth-store bridge (browser only — never dot into the store on the server)  */
/* -------------------------------------------------------------------------- */

function readAccessToken(): string | null {
  if (isServer) return null;
  return useAuthStore.getState().accessToken;
}

function applyRefreshedSession(accessToken: string, user?: User | null) {
  if (isServer) return;
  useAuthStore.getState().setSession({ accessToken, user: user ?? undefined });
}

function clearSession() {
  if (isServer) return;
  useAuthStore.getState().logout();
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
}

/* -------------------------------------------------------------------------- */
/*  Single-flight refresh                                                     */
/* -------------------------------------------------------------------------- */

let refreshInFlight: Promise<string | null> | null = null;

interface RefreshResponse {
  accessToken: string;
  user?: User;
}

async function performRefresh(): Promise<string | null> {
  try {
    const response = await fetch(serviceUrl('core', '/auth/refresh'), {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'X-Request-Id': uuid(),
      },
    });

    if (!response.ok) return null;

    const envelope = (await response.json()) as ApiEnvelope<RefreshResponse>;
    if (!envelope.success || !envelope.data?.accessToken) return null;

    applyRefreshedSession(envelope.data.accessToken, envelope.data.user ?? null);
    return envelope.data.accessToken;
  } catch {
    return null;
  }
}

/** Concurrent 401s share one refresh round-trip. */
export function refreshAccessToken(): Promise<string | null> {
  if (isServer) return Promise.resolve(null);
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/* -------------------------------------------------------------------------- */
/*  Core request                                                              */
/* -------------------------------------------------------------------------- */

function normalizeError(
  payload: unknown,
  status: number,
  requestId: string | undefined,
  fallbackMessage: string,
): ApiError {
  const envelope = payload as Partial<ApiEnvelope<unknown>> | null;
  const error = (envelope && 'error' in (envelope as object)
    ? (envelope as { error?: ApiErrorPayload }).error
    : undefined) as ApiErrorPayload | undefined;

  return new ApiError({
    code: error?.code ?? httpStatusCode(status),
    message: error?.message ?? fallbackMessage,
    status,
    details: Array.isArray(error?.details) ? error.details : [],
    requestId,
  });
}

function httpStatusCode(status: number): string {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 422:
      return 'VALIDATION_ERROR';
    case 429:
      return 'RATE_LIMITED';
    case 0:
      return 'NETWORK_ERROR';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED';
  }
}

async function executeRequest<T>(
  path: string,
  options: RequestOptions,
  attempt: number,
): Promise<ApiResult<T>> {
  const {
    method = 'GET',
    service = 'core',
    query,
    body,
    headers: extraHeaders,
    token,
    skipAuth = false,
    skipRefresh = false,
    signal,
    requestId = uuid(),
    credentials = 'include',
    cache,
    next,
  } = options;

  const url = serviceUrl(service, path, query);

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Request-Id': requestId,
    ...extraHeaders,
  };

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (!skipAuth) {
    const bearer = token ?? readAccessToken();
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
  }

  const init: RequestInit & { next?: RequestOptions['next'] } = {
    method,
    headers,
    credentials,
    signal,
  };

  if (body !== undefined) {
    init.body = isFormData ? (body as FormData) : JSON.stringify(body);
  }
  if (cache) init.cache = cache;
  if (next) init.next = next;

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError({
      code: 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : 'Unable to reach the server',
      status: 0,
      requestId,
    });
  }

  const responseRequestId = response.headers.get('x-request-id') ?? requestId;

  // 401 → single-flight refresh → replay once.
  if (
    response.status === 401 &&
    attempt === 0 &&
    !skipAuth &&
    !skipRefresh &&
    !isServer &&
    !path.includes('/auth/refresh')
  ) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return executeRequest<T>(path, { ...options, token: refreshed, requestId }, attempt + 1);
    }
    clearSession();
  }

  if (response.status === 204 || response.status === 205) {
    if (!response.ok) {
      throw normalizeError(null, response.status, responseRequestId, response.statusText);
    }
    return { data: undefined as T, requestId: responseRequestId, status: response.status };
  }

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');

  if (!isJson) {
    const text = await response.text();
    if (!response.ok) {
      throw new ApiError({
        code: httpStatusCode(response.status),
        message: text.slice(0, 300) || response.statusText || 'Request failed',
        status: response.status,
        requestId: responseRequestId,
      });
    }
    return { data: text as unknown as T, requestId: responseRequestId, status: response.status };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    if (!response.ok) {
      throw normalizeError(null, response.status, responseRequestId, response.statusText);
    }
    throw new ApiError({
      code: 'INVALID_RESPONSE',
      message: 'The server returned a malformed response',
      status: response.status,
      requestId: responseRequestId,
    });
  }

  if (!response.ok) {
    throw normalizeError(payload, response.status, responseRequestId, response.statusText);
  }

  const envelope = payload as ApiEnvelope<T>;

  // Every service speaks the §4 envelope; tolerate a bare payload defensively.
  if (envelope && typeof envelope === 'object' && 'success' in envelope) {
    if (!envelope.success) {
      throw normalizeError(envelope, response.status, responseRequestId, 'Request failed');
    }
    return {
      data: envelope.data,
      meta: envelope.meta,
      requestId: responseRequestId,
      status: response.status,
    };
  }

  return { data: payload as T, requestId: responseRequestId, status: response.status };
}

/** Full result including `meta` and the correlation id. */
export function requestWithMeta<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  return executeRequest<T>(path, options, 0);
}

/** Unwrapped `data` — the common case. */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const result = await executeRequest<T>(path, options, 0);
  return result.data;
}

const EMPTY_META: PaginationMeta = { page: 1, limit: 0, total: 0, totalPages: 0 };

/** `{ items, meta }` for paginated list endpoints. */
export async function requestPaginated<T>(
  path: string,
  options: RequestOptions = {},
): Promise<Paginated<T>> {
  const result = await executeRequest<T[]>(path, options, 0);
  const items = Array.isArray(result.data) ? result.data : [];
  return {
    items,
    meta:
      result.meta ??
      ({
        ...EMPTY_META,
        limit: items.length,
        total: items.length,
        totalPages: items.length ? 1 : 0,
      } satisfies PaginationMeta),
  };
}

/* -------------------------------------------------------------------------- */
/*  Sugar                                                                     */
/* -------------------------------------------------------------------------- */

type BodylessOptions = Omit<RequestOptions, 'method' | 'body'>;
type BodyOptions = Omit<RequestOptions, 'method'>;

export const api = {
  get: <T>(path: string, options: BodylessOptions = {}) =>
    request<T>(path, { ...options, method: 'GET' }),
  list: <T>(path: string, options: BodylessOptions = {}) =>
    requestPaginated<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options: BodyOptions = {}) =>
    request<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options: BodyOptions = {}) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options: BodyOptions = {}) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options: BodyOptions = {}) =>
    request<T>(path, { ...options, method: 'DELETE' }),
  raw: requestWithMeta,
} as const;

/** Convenience wrappers bound to the non-core services. */
export const searchApi = {
  get: <T>(path: string, options: BodylessOptions = {}) =>
    request<T>(path, { ...options, service: 'search', method: 'GET' }),
  raw: <T>(path: string, options: RequestOptions = {}) =>
    requestWithMeta<T>(path, { ...options, service: 'search' }),
} as const;

export const chatApi = {
  get: <T>(path: string, options: BodylessOptions = {}) =>
    request<T>(path, { ...options, service: 'chat', method: 'GET' }),
  post: <T>(path: string, body?: unknown, options: BodyOptions = {}) =>
    request<T>(path, { ...options, service: 'chat', method: 'POST', body }),
} as const;

export const reportsApi = {
  get: <T>(path: string, options: BodylessOptions = {}) =>
    request<T>(path, { ...options, service: 'reports', method: 'GET' }),
  post: <T>(path: string, body?: unknown, options: BodyOptions = {}) =>
    request<T>(path, { ...options, service: 'reports', method: 'POST', body }),
} as const;

/** Human-friendly message for toasts. */
export function errorMessage(error: unknown, fallback = 'Something went wrong'): string {
  const apiError = error instanceof ApiError ? error : null;
  if (!apiError) return error instanceof Error ? error.message : fallback;
  if (apiError.isNetworkError) return 'Cannot reach the server. Check your connection.';
  return apiError.message || fallback;
}
