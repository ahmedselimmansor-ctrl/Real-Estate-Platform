import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { SKIP_RESPONSE_TRANSFORM_KEY } from '../decorators/skip-response-transform.decorator';
import { ApiSuccessResponse, PaginationMeta } from '../types/api-response';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isPaginationMeta = (value: unknown): value is PaginationMeta =>
  isRecord(value) &&
  typeof value.page === 'number' &&
  typeof value.limit === 'number' &&
  typeof value.total === 'number' &&
  typeof value.totalPages === 'number';

/**
 * Wraps every successful payload in the CONTRACT §4 envelope:
 *
 * ```json
 * { "success": true, "data": <payload>, "meta": { "page": 1, "limit": 20, "total": 134, "totalPages": 7 } }
 * ```
 *
 * `meta` is emitted only when the handler returns `{ data, meta }` — i.e. only
 * for paginated endpoints.
 */
@Injectable()
export class TransformInterceptor implements NestInterceptor<unknown, unknown> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<unknown>): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_RESPONSE_TRANSFORM_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skip) {
      return next.handle();
    }

    return next.handle().pipe(map((payload) => this.wrap(payload)));
  }

  private wrap(payload: unknown): unknown {
    // Binary / streamed responses are returned untouched.
    if (payload instanceof StreamableFile || Buffer.isBuffer(payload)) {
      return payload;
    }

    // Already an envelope (e.g. proxied from another service).
    if (isRecord(payload) && typeof payload.success === 'boolean') {
      return payload;
    }

    if (isRecord(payload) && Array.isArray(payload.data) && isPaginationMeta(payload.meta)) {
      const envelope: ApiSuccessResponse<unknown[]> = {
        success: true,
        data: payload.data,
        meta: payload.meta,
      };
      return envelope;
    }

    const envelope: ApiSuccessResponse<unknown> = {
      success: true,
      data: payload === undefined ? null : payload,
    };
    return envelope;
  }
}
