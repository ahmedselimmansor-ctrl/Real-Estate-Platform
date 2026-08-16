/**
 * Slug helpers shared by every catalogue module.
 *
 * Slugs are ASCII only (Arabic names are transliterated away rather than
 * percent-encoded) so URLs stay copy-pasteable: `palm-hills-new-cairo`.
 */

const MAX_SLUG_LENGTH = 120;

/** `"Palm Hills — New Cairo!"` → `"palm-hills-new-cairo"`. */
export function slugify(value: string, fallback = 'item'): string {
  const slug = (value ?? '')
    .normalize('NFKD')
    // strip combining marks left behind by the decomposition
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');

  return slug.length > 0 ? slug : fallback;
}

/**
 * Returns `desired` slugified, appending `-2`, `-3`, … until `isTaken` reports
 * the candidate is free. Falls back to a timestamp suffix after `maxAttempts`.
 */
export async function buildUniqueSlug(
  desired: string,
  isTaken: (candidate: string) => Promise<boolean>,
  fallback = 'item',
  maxAttempts = 50,
): Promise<string> {
  const base = slugify(desired, fallback);

  if (!(await isTaken(base))) {
    return base;
  }

  for (let attempt = 2; attempt <= maxAttempts; attempt += 1) {
    const candidate = `${base}-${attempt}`;
    if (!(await isTaken(candidate))) {
      return candidate;
    }
  }

  return `${base}-${Date.now().toString(36)}`;
}
