import { AppException } from '../../common/errors/app.exception';
import { ERROR_CODES } from '../../common/errors/error-codes';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

/** RFC 4122 UUID (any version 1-8). */
export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_PATTERN.test(value);

/** 24 character hex string — a MongoDB ObjectId. */
export const isObjectIdHex = (value: unknown): value is string =>
  typeof value === 'string' && OBJECT_ID_PATTERN.test(value);

/**
 * Guards a path parameter that must be a UUID. Malformed identifiers are a
 * client mistake, not a validation failure of a body — hence 400 (CONTRACT §4).
 */
export function assertUuid(value: string, field = 'id'): string {
  if (!isUuid(value)) {
    throw AppException.badRequest(
      `"${field}" must be a valid UUID`,
      ERROR_CODES.INVALID_IDENTIFIER,
      [{ field, message: 'must be a valid UUID', rule: 'uuid' }],
    );
  }
  return value;
}
