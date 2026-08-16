/**
 * `class-transformer` helpers for query strings.
 *
 * The global pipe runs with `enableImplicitConversion: false`, so every query
 * DTO converts its own scalars explicitly — which keeps `?isFeatured=false`
 * from silently becoming `true`.
 */

const TRUTHY = new Set(['true', '1', 'yes', 'on']);
const FALSY = new Set(['false', '0', 'no', 'off']);

export const toBooleanValue = ({ value }: { value: unknown }): unknown => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (TRUTHY.has(normalized)) {
      return true;
    }
    if (FALSY.has(normalized)) {
      return false;
    }
  }
  return value;
};

export const toTrimmedString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export const toLowerCaseString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** `?amenities=pool,gym` and `?amenities=pool&amenities=gym` both work. */
export const toStringArray = ({ value }: { value: unknown }): unknown => {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return value;
};
