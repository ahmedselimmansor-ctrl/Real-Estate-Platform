/**
 * Escape every character that means something to a regular expression.
 *
 * Anything that builds a `RegExp` out of a query parameter needs this. Without
 * it a caller controls the pattern, not just the term: `.*` matches the whole
 * collection, an unbalanced `(` throws a 500 out of the driver, and a nested
 * quantifier like `(a+)+$` is a denial of service against the database rather
 * than a search.
 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
