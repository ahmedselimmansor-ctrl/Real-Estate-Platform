import { NextResponse } from 'next/server';

import { serverEnv } from '@/lib/env';

/**
 * Runtime BFF proxy for the four backend services (CONTRACT §7).
 *
 * This used to be `rewrites()` in next.config.ts, but `rewrites()` is evaluated
 * during `next build` and frozen into `routes-manifest.json`. In a container
 * the build runs without the service URLs set, so every destination was baked
 * as `http://localhost:<port>` and the image could only ever work behind nginx.
 * Reading `serverEnv` per request makes the same image deployable anywhere.
 *
 * nginx still terminates `/api/*` in the compose and AWS topologies, so in
 * those deployments requests never reach this handler at all.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** First path segment after `/api/` → which service owns it. */
function originFor(segment: string | undefined): string | null {
  switch (segment) {
    case 'v1':
      return serverEnv.apiCoreUrl;
    case 'search':
      return serverEnv.searchSvcUrl;
    case 'chat':
      return serverEnv.ragSvcUrl;
    case 'reports':
      return serverEnv.reportsSvcUrl;
    default:
      return null;
  }
}

/**
 * Hop-by-hop headers, plus the ones `fetch` must recompute. Forwarding `host`
 * would make the upstream reject the request, and a stale `content-length`
 * truncates the body.
 */
const STRIP_REQUEST = new Set([
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'accept-encoding',
  // Next.js fills these from the server's own bind address, so they arrive as
  // `0.0.0.0:3000`. Forwarding that makes a host-authorising upstream (Sinatra
  // 4 / rack-protection) answer "Host not permitted"; the upstream should just
  // see its own hostname in `Host`.
  'x-forwarded-host',
  'x-forwarded-port',
]);

const STRIP_RESPONSE = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'content-encoding',
  'content-length',
]);

async function proxy(request: Request, path: string[]): Promise<Response> {
  const origin = originFor(path[0]);

  if (!origin) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'NOT_FOUND', message: `Unknown API namespace "${path[0] ?? ''}"`, details: [] },
      },
      { status: 404 },
    );
  }

  const incoming = new URL(request.url);
  const target = `${origin}/api/${path.join('/')}${incoming.search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!STRIP_REQUEST.has(key.toLowerCase())) headers.set(key, value);
  });
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      // Required by undici whenever a stream is used as the body.
      ...(hasBody ? { duplex: 'half' } : {}),
      redirect: 'manual',
      cache: 'no-store',
    } as RequestInit);

    const responseHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
      if (!STRIP_RESPONSE.has(key.toLowerCase())) responseHeaders.set(key, value);
    });

    // The body is passed through as a stream so SSE (`/api/chat/stream/:id`)
    // reaches the browser token by token instead of arriving all at once.
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error(`[nawy:web] proxy to ${target} failed`, error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'UPSTREAM_UNAVAILABLE',
          message: 'The upstream service is not reachable right now.',
          details: [],
        },
      },
      { status: 502 },
    );
  }
}

type Context = { params: Promise<{ path: string[] }> };

async function handler(request: Request, context: Context): Promise<Response> {
  const { path } = await context.params;
  return proxy(request, path ?? []);
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
export const OPTIONS = handler;
