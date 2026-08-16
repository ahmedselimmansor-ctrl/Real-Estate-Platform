import { publicEnv } from './env';
import type { ChatMessage, ChatSource, ChatStreamEvent } from '@/types/chat';

/**
 * Transport for `POST /api/chat/message`.
 *
 * `EventSource` cannot POST or send an `Authorization` header, so the SSE stream
 * is consumed from `fetch`'s `ReadableStream` and parsed by hand. The parser is
 * incremental: frames are split on the blank-line delimiter and any trailing
 * partial frame is carried over to the next chunk.
 */

const GUEST_TOKEN_KEY = 'nawy_chat_guest_token';

export interface StreamHandlers {
  onToken?: (text: string) => void;
  onSources?: (sources: ChatSource[]) => void;
  onToolStart?: (payload: { name?: string; route?: string }) => void;
  onToolEnd?: (payload: { name?: string; ok?: boolean; error?: string | null }) => void;
  onDone?: (payload: ChatDonePayload) => void;
  onError?: (error: { code?: string; message: string }) => void;
}

export interface ChatDonePayload {
  threadId: string;
  messageId?: string | null;
  answer?: string;
  sources?: ChatSource[];
  route?: string;
  degraded?: boolean;
  latencyMs?: number;
}

export interface SendOptions {
  message: string;
  threadId?: string | null;
  accessToken?: string | null;
  signal?: AbortSignal;
  locale?: 'en' | 'ar';
}

export const guestToken = {
  get(): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(GUEST_TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string | null): void {
    if (typeof window === 'undefined' || !token) return;
    try {
      window.localStorage.setItem(GUEST_TOKEN_KEY, token);
    } catch {
      // Storage disabled — the thread simply will not survive a reload.
    }
  },
  clear(): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(GUEST_TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

function headers(accessToken?: string | null): HeadersInit {
  return {
    'content-type': 'application/json',
    accept: 'text/event-stream',
    ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
  };
}

/** Splits an SSE buffer into complete frames, returning the unparsed remainder. */
function parseFrames(buffer: string): { frames: string[]; rest: string } {
  const parts = buffer.split(/\r?\n\r?\n/);
  const rest = parts.pop() ?? '';
  return { frames: parts, rest };
}

function readFrame(frame: string): { event: ChatStreamEvent | 'meta'; data: unknown } | null {
  let event = 'message';
  const dataLines: string[] = [];

  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith(':')) continue; // comment / keep-alive
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }

  if (dataLines.length === 0) return null;

  const raw = dataLines.join('\n');
  try {
    return { event: event as ChatStreamEvent, data: JSON.parse(raw) };
  } catch {
    return { event: event as ChatStreamEvent, data: raw };
  }
}

/**
 * Streams an answer. Falls back to the buffered JSON response when the server
 * does not return an event stream (proxy stripped it, or `stream` unsupported).
 */
export async function streamMessage(
  options: SendOptions,
  handlers: StreamHandlers,
): Promise<void> {
  const token = guestToken.get();

  const response = await fetch(`${publicEnv.chatUrl}/message`, {
    method: 'POST',
    headers: headers(options.accessToken),
    credentials: 'include',
    signal: options.signal,
    body: JSON.stringify({
      message: options.message,
      threadId: options.threadId ?? undefined,
      guestToken: token ?? undefined,
      locale: options.locale,
      stream: true,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    handlers.onError?.({
      code: body?.error?.code,
      message: body?.error?.message ?? `The assistant is unavailable (${response.status}).`,
    });
    return;
  }

  const contentType = response.headers.get('content-type') ?? '';

  // --- graceful degradation: a plain JSON envelope -------------------------
  if (!contentType.includes('text/event-stream')) {
    const body = await response.json().catch(() => null);
    const data = body?.data;

    if (!data) {
      handlers.onError?.({ message: 'The assistant returned an empty reply.' });
      return;
    }

    if (data.guestToken) guestToken.set(data.guestToken);
    if (data.answer) handlers.onToken?.(data.answer);
    if (data.sources?.length) handlers.onSources?.(data.sources);
    handlers.onDone?.(data as ChatDonePayload);
    return;
  }

  if (!response.body) {
    handlers.onError?.({ message: 'Streaming is not supported by this browser.' });
    return;
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += value;
      const { frames, rest } = parseFrames(buffer);
      buffer = rest;

      for (const frame of frames) {
        const parsed = readFrame(frame);
        if (!parsed) continue;
        dispatch(parsed.event, parsed.data, handlers);
      }
    }

    // Whatever is left after the stream closes is a final, unterminated frame.
    const trailing = readFrame(buffer);
    if (trailing) dispatch(trailing.event, trailing.data, handlers);
  } finally {
    reader.releaseLock();
  }
}

function dispatch(
  event: ChatStreamEvent | 'meta' | string,
  data: unknown,
  handlers: StreamHandlers,
): void {
  const payload = (data ?? {}) as Record<string, unknown>;

  switch (event) {
    case 'meta':
      guestToken.set(payload.guestToken as string);
      break;
    case 'token':
      handlers.onToken?.(String(payload.text ?? ''));
      break;
    case 'sources':
      handlers.onSources?.((payload.sources as ChatSource[]) ?? []);
      break;
    case 'tool_start':
      handlers.onToolStart?.(payload as { name?: string; route?: string });
      break;
    case 'tool_end':
      handlers.onToolEnd?.(payload as { name?: string; ok?: boolean; error?: string | null });
      break;
    case 'done':
      if (payload.guestToken) guestToken.set(payload.guestToken as string);
      handlers.onDone?.(payload as unknown as ChatDonePayload);
      break;
    case 'error':
      handlers.onError?.({
        code: payload.code as string | undefined,
        message: (payload.message as string) ?? 'The assistant hit an error.',
      });
      break;
    default:
      break;
  }
}

/** Loads a previous transcript so the widget survives a reload. */
export async function fetchThreadMessages(
  threadId: string,
  accessToken?: string | null,
): Promise<ChatMessage[]> {
  const token = guestToken.get();
  const query = new URLSearchParams({ limit: '50' });
  if (token) query.set('guestToken', token);

  const response = await fetch(
    `${publicEnv.chatUrl}/threads/${encodeURIComponent(threadId)}/messages?${query}`,
    {
      headers: accessToken ? { authorization: `Bearer ${accessToken}` } : undefined,
      credentials: 'include',
    },
  );

  if (!response.ok) return [];

  const body = await response.json().catch(() => null);
  return (body?.data ?? []) as ChatMessage[];
}

export async function sendFeedback(
  messageId: string,
  rating: 1 | -1,
  comment?: string,
  accessToken?: string | null,
): Promise<boolean> {
  const token = guestToken.get();
  const query = token ? `?guestToken=${encodeURIComponent(token)}` : '';

  const response = await fetch(`${publicEnv.chatUrl}/feedback${query}`, {
    method: 'POST',
    headers: headers(accessToken),
    credentials: 'include',
    body: JSON.stringify({ messageId, rating, comment }),
  });

  return response.ok;
}
