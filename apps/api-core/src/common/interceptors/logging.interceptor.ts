import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

import { SLOW_REQUEST_THRESHOLD_MS } from '../constants';

/**
 * Per-handler timing log. Transport level access logs are produced by
 * `nestjs-pino`; this interceptor adds the resolved controller/handler pair and
 * flags slow requests, always carrying the `X-Request-Id` correlation id.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const startedAt = process.hrtime.bigint();

    const describe = (): string => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const handler = `${context.getClass().name}.${context.getHandler().name}`;
      return JSON.stringify({
        requestId: request.requestId,
        method: request.method,
        path: request.originalUrl ?? request.url,
        handler,
        statusCode: response.statusCode,
        durationMs: Number(durationMs.toFixed(2)),
      });
    };

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
          if (durationMs >= SLOW_REQUEST_THRESHOLD_MS) {
            this.logger.warn(`slow request ${describe()}`);
            return;
          }
          this.logger.debug(describe());
        },
        error: () => {
          this.logger.debug(`failed ${describe()}`);
        },
      }),
    );
  }
}
