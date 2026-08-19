import { HttpException, HttpStatus } from '@nestjs/common';

import { ApiErrorDetail } from '../types/api-response';
import { ERROR_CODES, ErrorCode } from './error-codes';

/**
 * A known error code, or any other string.
 *
 * `ErrorCode | string` would collapse to `string` and lose the autocomplete
 * that makes the catalogue useful; intersecting with `{}` keeps the literals
 * suggested while still accepting a code a module defines for itself.
 */
type AnyErrorCode = ErrorCode | (string & {});

export interface AppExceptionPayload {
  code: string;
  message: string;
  details?: ApiErrorDetail[];
}

/**
 * The only exception type feature code should throw.
 *
 * It carries the CONTRACT §4 `code` / `message` / `details` triple so the global
 * filter can render the envelope without guessing.
 */
export class AppException extends HttpException {
  readonly code: string;
  readonly details: ApiErrorDetail[];

  constructor(status: HttpStatus | number, payload: AppExceptionPayload) {
    super(
      {
        code: payload.code,
        message: payload.message,
        details: payload.details ?? [],
      },
      status,
    );
    this.code = payload.code;
    this.details = payload.details ?? [];
  }

  static badRequest(
    message: string,
    code: AnyErrorCode = ERROR_CODES.BAD_REQUEST,
    details: ApiErrorDetail[] = [],
  ): AppException {
    return new AppException(HttpStatus.BAD_REQUEST, { code, message, details });
  }

  static validation(
    message: string,
    details: ApiErrorDetail[] = [],
    code: AnyErrorCode = ERROR_CODES.VALIDATION_ERROR,
  ): AppException {
    return new AppException(HttpStatus.UNPROCESSABLE_ENTITY, { code, message, details });
  }

  static unauthorized(
    message = 'Authentication required',
    code: AnyErrorCode = ERROR_CODES.UNAUTHORIZED,
  ): AppException {
    return new AppException(HttpStatus.UNAUTHORIZED, { code, message });
  }

  static forbidden(
    message = 'You do not have access to this resource',
    code: AnyErrorCode = ERROR_CODES.FORBIDDEN,
  ): AppException {
    return new AppException(HttpStatus.FORBIDDEN, { code, message });
  }

  static notFound(message: string, code: AnyErrorCode = ERROR_CODES.NOT_FOUND): AppException {
    return new AppException(HttpStatus.NOT_FOUND, { code, message });
  }

  static conflict(
    message: string,
    code: AnyErrorCode = ERROR_CODES.CONFLICT,
    details: ApiErrorDetail[] = [],
  ): AppException {
    return new AppException(HttpStatus.CONFLICT, { code, message, details });
  }

  static tooManyRequests(message = 'Too many requests, slow down'): AppException {
    return new AppException(HttpStatus.TOO_MANY_REQUESTS, {
      code: ERROR_CODES.TOO_MANY_REQUESTS,
      message,
    });
  }

  static serviceUnavailable(
    message: string,
    code: AnyErrorCode = ERROR_CODES.SERVICE_UNAVAILABLE,
  ): AppException {
    return new AppException(HttpStatus.SERVICE_UNAVAILABLE, { code, message });
  }

  static internal(
    message = 'Unexpected server error',
    code: AnyErrorCode = ERROR_CODES.INTERNAL_SERVER_ERROR,
  ): AppException {
    return new AppException(HttpStatus.INTERNAL_SERVER_ERROR, { code, message });
  }
}
