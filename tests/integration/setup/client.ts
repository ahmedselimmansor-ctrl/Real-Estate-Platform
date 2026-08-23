/**
 * A thin HTTP client for the black-box suite.
 *
 * Deliberately does NOT reuse apps/web's api.ts — these tests exist to prove
 * the deployed contract, and sharing the client would let a bug in the client
 * hide the same bug in the service.
 */

/** The stack uses a self-signed certificate; refuse to reach anything else. */
if (!process.env.NODE_EXTRA_CA_CERTS) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

export const BASE_URL = (process.env.INTEGRATION_BASE_URL ?? 'https://localhost').replace(/\/+$/, '');

export const DEMO_PASSWORD = process.env.INTEGRATION_DEMO_PASSWORD ?? 'TopChoice@Demo123';

export const ACCOUNTS = {
  admin: process.env.INTEGRATION_ADMIN_EMAIL ?? 'admin@topchoice.local',
  agent: process.env.INTEGRATION_AGENT_EMAIL ?? 'agent@topchoice.local',
  user: process.env.INTEGRATION_USER_EMAIL ?? 'buyer@topchoice.local',
} as const;

export interface ApiEnvelope<T = unknown> {
  success: boolean;
  data?: T;
  meta?: { page: number; limit: number; total: number; totalPages: number };
  error?: { code: string; message: string; details: unknown[] };
}

export interface Result<T = unknown> {
  status: number;
  headers: Headers;
  body: ApiEnvelope<T>;
  raw: string;
  requestId: string | null;
}

export interface CallOptions {
  method?: string;
  body?: unknown;
  token?: string | null;
  headers?: Record<string, string>;
  /** Send no Accept-Encoding etc. and return the raw bytes (for PDF/CSV). */
  expectBinary?: boolean;
  redirect?: RequestRedirect;
}

/** Issue a request and parse the §4 envelope, never throwing on a non-2xx. */
export async function call<T = unknown>(path: string, options: CallOptions = {}): Promise<Result<T>> {
  const { method = 'GET', body, token, headers = {}, redirect = 'manual' } = options;

  const requestHeaders: Record<string, string> = { Accept: 'application/json', ...headers };
  if (token) requestHeaders.Authorization = `Bearer ${token}`;
  if (body !== undefined && !requestHeaders['Content-Type']) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect,
  });

  const raw = await response.text();
  let parsed: ApiEnvelope<T>;
  try {
    parsed = JSON.parse(raw) as ApiEnvelope<T>;
  } catch {
    parsed = { success: response.ok } as ApiEnvelope<T>;
  }

  return {
    status: response.status,
    headers: response.headers,
    body: parsed,
    raw,
    requestId: response.headers.get('x-request-id'),
  };
}

/** Fetch raw bytes — used for the PDF brochure and the CSV exports. */
export async function fetchBytes(
  path: string,
  options: CallOptions = {},
): Promise<{ status: number; bytes: Uint8Array; contentType: string | null }> {
  const headers: Record<string, string> = { ...options.headers };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const response = await fetch(`${BASE_URL}${path}`, { method: options.method ?? 'GET', headers });
  const bytes = new Uint8Array(await response.arrayBuffer());

  return { status: response.status, bytes, contentType: response.headers.get('content-type') };
}

/** Sign in and return the access token, failing loudly if the fixture is absent. */
export async function login(email: string, password = DEMO_PASSWORD): Promise<string> {
  const result = await call<{ accessToken: string }>('/api/v1/auth/login', {
    method: 'POST',
    body: { email, password },
  });

  if (result.status !== 200 || !result.body.data?.accessToken) {
    throw new Error(
      `login failed for ${email}: ${result.status} ${result.raw.slice(0, 200)}. ` +
        'Is the stack seeded? Run `make seed`.',
    );
  }
  return result.body.data.accessToken;
}

/** Poll until `check` passes, so a spec never races a background reindex. */
export async function eventually<T>(
  check: () => Promise<T | null | undefined | false>,
  { attempts = 20, delayMs = 1000, what = 'condition' } = {},
): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const value = await check();
      if (value) return value as T;
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error(`${what} never became true after ${attempts} attempts. Last error: ${String(last)}`);
}
