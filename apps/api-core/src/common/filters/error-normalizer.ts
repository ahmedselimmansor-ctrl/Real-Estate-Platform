import { HttpException, HttpStatus } from '@nestjs/common';

import { AppException } from '../errors/app.exception';
import { ERROR_CODES, ErrorCode, errorCodeForStatus } from '../errors/error-codes';
import { ApiErrorDetail } from '../types/api-response';

export interface NormalizedError {
  status: number;
  code: string;
  message: string;
  details: ApiErrorDetail[];
  /** Set when the original error should be logged with its stack. */
  cause?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return typeof value === 'string' ? [value] : [];
};

// --------------------------------------------------------------------- prisma
interface PrismaKnownRequestErrorLike {
  code: string;
  clientVersion: string;
  message: string;
  meta?: Record<string, unknown>;
}

/**
 * Structural detection — deliberately avoids importing the generated Prisma
 * namespace so this module compiles before `prisma generate` has run.
 */
const isPrismaKnownRequestError = (error: unknown): error is PrismaKnownRequestErrorLike =>
  isRecord(error) &&
  typeof error.code === 'string' &&
  /^P\d{4}$/.test(error.code) &&
  typeof error.clientVersion === 'string';

const isPrismaErrorNamed = (error: unknown, name: string): boolean =>
  isRecord(error) && error.name === name && typeof error.clientVersion === 'string';

const prismaTargetFields = (meta: Record<string, unknown> | undefined): string[] =>
  asStringArray(meta?.target);

function normalizePrismaKnownError(error: PrismaKnownRequestErrorLike): NormalizedError {
  const fields = prismaTargetFields(error.meta);
  const fieldList = fields.length > 0 ? fields.join(', ') : 'value';

  switch (error.code) {
    case 'P2000':
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: ERROR_CODES.VALIDATION_ERROR,
        message: `The provided value for ${fieldList} is too long`,
        details: fields.map((field) => ({ field, message: 'value too long', rule: 'maxLength' })),
      };
    case 'P2002':
      return {
        status: HttpStatus.CONFLICT,
        code: ERROR_CODES.DUPLICATE_RESOURCE,
        message: `A record with this ${fieldList} already exists`,
        details: fields.map((field) => ({ field, message: 'must be unique', rule: 'unique' })),
      };
    case 'P2003':
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: ERROR_CODES.RELATED_RESOURCE_NOT_FOUND,
        message: 'A referenced record does not exist',
        details: fields.map((field) => ({
          field,
          message: 'unknown reference',
          rule: 'foreignKey',
        })),
      };
    case 'P2011':
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: ERROR_CODES.VALIDATION_ERROR,
        message: `${fieldList} must not be null`,
        details: fields.map((field) => ({ field, message: 'must not be null', rule: 'required' })),
      };
    case 'P2014':
      return {
        status: HttpStatus.CONFLICT,
        code: ERROR_CODES.RESOURCE_IN_USE,
        message: 'The change would break a required relation between records',
        details: [],
      };
    case 'P2025': {
      const cause = error.meta ? error.meta.cause : undefined;
      return {
        status: HttpStatus.NOT_FOUND,
        code: ERROR_CODES.NOT_FOUND,
        message: typeof cause === 'string' ? cause : 'The record was not found',
        details: [],
      };
    }
    default:
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        code: ERROR_CODES.DATABASE_ERROR,
        message: 'Database request failed',
        details: [],
        cause: error,
      };
  }
}

// -------------------------------------------------------------------- mongoose
interface MongooseValidationErrorLike {
  name: string;
  errors: Record<string, { path?: string; message?: string; kind?: string }>;
}

const isMongooseValidationError = (error: unknown): error is MongooseValidationErrorLike =>
  isRecord(error) && error.name === 'ValidationError' && isRecord(error.errors);

const isMongooseCastError = (
  error: unknown,
): error is { name: string; path?: string; value?: unknown; message: string } =>
  isRecord(error) && error.name === 'CastError';

const isMongoDuplicateKeyError = (
  error: unknown,
): error is { code: number; keyValue?: Record<string, unknown> } =>
  isRecord(error) && error.code === 11000;

// ------------------------------------------------------------------------ zod
const isZodError = (error: unknown): error is { name: string; issues: unknown[] } =>
  isRecord(error) && error.name === 'ZodError' && Array.isArray(error.issues);

// ------------------------------------------------------------------------ jwt
const JWT_ERROR_NAMES = new Set(['TokenExpiredError', 'JsonWebTokenError', 'NotBeforeError']);

// --------------------------------------------------------------- http exception
function normalizeHttpException(exception: HttpException): NormalizedError {
  const status = exception.getStatus();
  const response = exception.getResponse();

  if (exception instanceof AppException) {
    return {
      status,
      code: exception.code,
      message: exception.message,
      details: exception.details,
      cause: status >= 500 ? exception : undefined,
    };
  }

  if (typeof response === 'string') {
    return {
      status,
      code: errorCodeForStatus(status),
      message: response,
      details: [],
      cause: status >= 500 ? exception : undefined,
    };
  }

  if (isRecord(response)) {
    const code = typeof response.code === 'string' ? response.code : errorCodeForStatus(status);
    const rawMessage = response.message;
    const details: ApiErrorDetail[] = Array.isArray(response.details)
      ? (response.details as ApiErrorDetail[])
      : Array.isArray(rawMessage)
        ? asStringArray(rawMessage).map((message) => ({ message }))
        : [];

    const message = Array.isArray(rawMessage)
      ? 'Request validation failed'
      : typeof rawMessage === 'string'
        ? rawMessage
        : exception.message;

    return {
      status,
      code:
        Array.isArray(rawMessage) && code === errorCodeForStatus(status)
          ? ERROR_CODES.VALIDATION_ERROR
          : code,
      message,
      details,
      cause: status >= 500 ? exception : undefined,
    };
  }

  return {
    status,
    code: errorCodeForStatus(status),
    message: exception.message,
    details: [],
    cause: status >= 500 ? exception : undefined,
  };
}

/**
 * Maps any thrown value onto the CONTRACT §4 error envelope fields.
 * Never throws — an unrecognised value becomes a 500 INTERNAL_SERVER_ERROR.
 */
export function normalizeException(exception: unknown): NormalizedError {
  if (exception instanceof HttpException) {
    return normalizeHttpException(exception);
  }

  if (isPrismaKnownRequestError(exception)) {
    return normalizePrismaKnownError(exception);
  }

  if (isPrismaErrorNamed(exception, 'PrismaClientValidationError')) {
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'The database query was rejected because the payload is invalid',
      details: [],
      cause: exception,
    };
  }

  if (
    isPrismaErrorNamed(exception, 'PrismaClientInitializationError') ||
    isPrismaErrorNamed(exception, 'PrismaClientRustPanicError')
  ) {
    return {
      status: HttpStatus.SERVICE_UNAVAILABLE,
      code: ERROR_CODES.DATABASE_UNAVAILABLE,
      message: 'The database is unavailable, please retry shortly',
      details: [],
      cause: exception,
    };
  }

  if (isMongooseValidationError(exception)) {
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Document validation failed',
      details: Object.entries(exception.errors).map(([field, error]) => ({
        field: error?.path ?? field,
        message: error?.message ?? 'is invalid',
        rule: error?.kind,
      })),
    };
  }

  if (isMongoDuplicateKeyError(exception)) {
    const fields = Object.keys(exception.keyValue ?? {});
    return {
      status: HttpStatus.CONFLICT,
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      message:
        fields.length > 0
          ? `A record with this ${fields.join(', ')} already exists`
          : 'A record with these values already exists',
      details: fields.map((field) => ({ field, message: 'must be unique', rule: 'unique' })),
    };
  }

  if (isMongooseCastError(exception)) {
    return {
      status: HttpStatus.BAD_REQUEST,
      code: ERROR_CODES.INVALID_IDENTIFIER,
      message: exception.path
        ? `The value provided for "${exception.path}" is not valid`
        : 'The provided identifier is not valid',
      details: exception.path ? [{ field: exception.path, message: 'invalid value' }] : [],
    };
  }

  if (isRecord(exception) && exception.name === 'DocumentNotFoundError') {
    return {
      status: HttpStatus.NOT_FOUND,
      code: ERROR_CODES.NOT_FOUND,
      message: 'The record was not found',
      details: [],
    };
  }

  if (isZodError(exception)) {
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Request validation failed',
      details: exception.issues.map((issue) => {
        const entry = isRecord(issue) ? issue : {};
        const path = Array.isArray(entry.path) ? entry.path.join('.') : undefined;
        return {
          field: path && path.length > 0 ? path : undefined,
          message: typeof entry.message === 'string' ? entry.message : 'is invalid',
          rule: typeof entry.code === 'string' ? entry.code : undefined,
        };
      }),
    };
  }

  if (
    isRecord(exception) &&
    typeof exception.name === 'string' &&
    JWT_ERROR_NAMES.has(exception.name)
  ) {
    const expired = exception.name === 'TokenExpiredError';
    return {
      status: HttpStatus.UNAUTHORIZED,
      code: expired ? ERROR_CODES.TOKEN_EXPIRED : ERROR_CODES.INVALID_TOKEN,
      message: expired ? 'The access token has expired' : 'The provided token is not valid',
      details: [],
    };
  }

  // express / body-parser style errors carry a numeric status
  if (isRecord(exception)) {
    const status =
      typeof exception.status === 'number'
        ? exception.status
        : typeof exception.statusCode === 'number'
          ? exception.statusCode
          : undefined;

    if (status && status >= 400 && status < 600) {
      const code: ErrorCode =
        exception.type === 'entity.parse.failed'
          ? ERROR_CODES.BAD_REQUEST
          : errorCodeForStatus(status);
      return {
        status,
        code,
        message:
          exception.type === 'entity.parse.failed'
            ? 'Malformed JSON body'
            : typeof exception.message === 'string'
              ? exception.message
              : 'Request failed',
        details: [],
        cause: status >= 500 ? exception : undefined,
      };
    }
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: ERROR_CODES.INTERNAL_SERVER_ERROR,
    message: 'Unexpected server error',
    details: [],
    cause: exception,
  };
}
