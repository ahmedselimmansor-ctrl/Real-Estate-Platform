import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Request, Response } from 'express';

import { REQUEST_ID_HEADER } from '../constants';
import { ApiErrorResponse } from '../types/api-response';
import { normalizeException } from './error-normalizer';

/**
 * Global exception filter — renders **every** failure as the CONTRACT §4 error
 * envelope:
 *
 * ```json
 * { "success": false, "error": { "code": "PROPERTY_NOT_FOUND", "message": "…", "details": [] } }
 * ```
 *
 * Prisma, Mongoose, Zod, JWT and express errors are translated to the shared
 * error codes; anything unrecognised becomes a logged 500.
 */
@Injectable()
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      this.logger.error(
        'Non-HTTP exception',
        exception instanceof Error ? exception.stack : exception,
      );
      return;
    }

    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const normalized = normalizeException(exception);
    const requestId = request?.requestId ?? (request?.headers?.[REQUEST_ID_HEADER] as string) ?? '';

    const body: ApiErrorResponse = {
      success: false,
      error: {
        code: normalized.code,
        message: normalized.message,
        details: normalized.details ?? [],
      },
    };

    this.log(normalized.status, normalized.message, requestId, request, normalized.cause);

    if (response.headersSent) {
      return;
    }

    if (requestId) {
      response.setHeader('X-Request-Id', requestId);
    }

    const httpAdapter = this.httpAdapterHost?.httpAdapter;
    if (httpAdapter) {
      httpAdapter.reply(response, body, normalized.status);
      return;
    }

    response.status(normalized.status).json(body);
  }

  private log(
    status: number,
    message: string,
    requestId: string,
    request: Request | undefined,
    cause: unknown,
  ): void {
    const context = {
      requestId,
      method: request?.method,
      path: request?.originalUrl ?? request?.url,
      statusCode: status,
    };

    if (status >= (HttpStatus.INTERNAL_SERVER_ERROR as number)) {
      this.logger.error(
        `${message} ${JSON.stringify(context)}`,
        cause instanceof Error ? cause.stack : JSON.stringify(cause ?? {}),
      );
      return;
    }

    if (status === (HttpStatus.NOT_FOUND as number)) {
      this.logger.debug(`${message} ${JSON.stringify(context)}`);
      return;
    }

    this.logger.warn(`${message} ${JSON.stringify(context)}`);
  }
}
