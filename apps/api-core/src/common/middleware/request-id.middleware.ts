import type { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4, validate as isUuid } from 'uuid';

import { REQUEST_ID_HEADER } from '../constants';

const MAX_REQUEST_ID_LENGTH = 128;
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]+$/;

/**
 * Accepts a caller supplied correlation id only when it is a UUID or a short,
 * log-safe token — otherwise a fresh UUID is generated. This keeps
 * `X-Request-Id` usable as a log field without opening a log-injection hole.
 */
export const normalizeRequestId = (raw: unknown): string => {
  const candidate = Array.isArray(raw) ? raw[0] : raw;

  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (
      trimmed.length > 0 &&
      trimmed.length <= MAX_REQUEST_ID_LENGTH &&
      (isUuid(trimmed) || SAFE_REQUEST_ID.test(trimmed))
    ) {
      return trimmed;
    }
  }

  return uuidv4();
};

/**
 * CONTRACT §4 — every service reads/propagates `X-Request-Id`, generating a UUID
 * when absent, and echoes it back on the response.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = normalizeRequestId(req.headers[REQUEST_ID_HEADER]);

  req.requestId = requestId;
  // Keep the inbound header canonical so downstream logging (pino) and any
  // outbound service call can reuse it verbatim.
  req.headers[REQUEST_ID_HEADER] = requestId;
  (req as unknown as { id?: string }).id = requestId;
  res.setHeader('X-Request-Id', requestId);

  next();
}
