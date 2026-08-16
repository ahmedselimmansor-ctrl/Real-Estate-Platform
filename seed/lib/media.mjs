/**
 * Media URL builders.
 *
 * Listing photography is **real**: `seed/fetch-images.mjs` downloads a curated
 * set from Unsplash into `apps/web/public/properties/`, and the manifest it
 * writes is read here. Photos are picked deterministically from the pool that
 * suits each property type (a chalet gets coastal shots, an office gets
 * workspaces), so a given listing always shows the same gallery.
 *
 * If the manifest is missing — someone cloned the repo without running the
 * fetch script — every builder falls back to seeded picsum.photos URLs so the
 * dataset still generates.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, '..', '..', 'apps', 'web', 'public', 'properties', 'manifest.json');

const PICSUM_BASE = 'https://picsum.photos/seed';
const fallback = (key, width, height) => `${PICSUM_BASE}/${key}/${width}/${height}`;

/** @type {{file: string, category: string, label: string}[]} */
const MANIFEST = existsSync(MANIFEST_PATH)
  ? JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
  : [];

export const hasRealPhotos = MANIFEST.length > 0;

const byCategory = (category) => MANIFEST.filter((entry) => entry.category === category);

const POOLS = {
  interior: [...byCategory('living'), ...byCategory('bedroom'), ...byCategory('kitchen'), ...byCategory('bathroom')],
  living: byCategory('living'),
  bedroom: byCategory('bedroom'),
  kitchen: byCategory('kitchen'),
  bathroom: byCategory('bathroom'),
  exterior: byCategory('exterior'),
  villa: byCategory('villa'),
  coastal: byCategory('coastal'),
  office: byCategory('office'),
  pool: byCategory('pool'),
  garden: byCategory('garden'),
};

/**
 * Which pools a gallery draws from, in order, per CONTRACT §3 `propertyType`.
 * The first entry is the hero shot.
 */
const GALLERY_PLAN = {
  apartment: ['exterior', 'living', 'bedroom', 'kitchen', 'bathroom', 'living'],
  studio: ['living', 'bedroom', 'kitchen', 'bathroom', 'exterior', 'living'],
  duplex: ['exterior', 'living', 'bedroom', 'kitchen', 'bathroom', 'living'],
  penthouse: ['exterior', 'living', 'bedroom', 'bathroom', 'kitchen', 'living'],
  villa: ['villa', 'living', 'pool', 'bedroom', 'garden', 'kitchen', 'bathroom'],
  townhouse: ['villa', 'living', 'garden', 'bedroom', 'kitchen', 'bathroom'],
  twinhouse: ['villa', 'living', 'garden', 'bedroom', 'kitchen', 'bathroom'],
  chalet: ['coastal', 'living', 'bedroom', 'pool', 'kitchen', 'coastal'],
  office: ['office', 'office', 'office', 'exterior', 'office'],
  retail: ['office', 'exterior', 'office', 'office'],
  clinic: ['office', 'exterior', 'office', 'bathroom'],
};

/** Stable 32-bit hash so the same slug always yields the same gallery. */
function hash(value) {
  let h = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    h ^= value.charCodeAt(index);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick(poolName, slug, offset) {
  const pool = POOLS[poolName]?.length ? POOLS[poolName] : POOLS.interior;
  if (!pool || pool.length === 0) return null;
  return pool[(hash(`${slug}:${poolName}:${offset}`) + offset) % pool.length];
}

export const photo = (key, width, height) => fallback(key, width, height);

export const developerLogo = (slug) => fallback(`nawy-dev-${slug}-logo`, 320, 320);
export const developerCover = (slug) =>
  pick('exterior', `dev-${slug}`, 0)?.file ?? fallback(`nawy-dev-${slug}-cover`, 1600, 600);
export const areaHero = (slug) =>
  pick('exterior', `area-${slug}`, 1)?.file ?? fallback(`nawy-area-${slug}`, 1600, 900);
export const compoundImage = (slug, index) =>
  pick(index === 1 ? 'exterior' : 'living', `compound-${slug}`, index)?.file ??
  fallback(`nawy-compound-${slug}-${index}`, 1600, 900);
export const compoundMasterPlan = (slug) => fallback(`nawy-masterplan-${slug}`, 1600, 1200);

/**
 * The gallery for one listing: `count` distinct photos, hero first, chosen from
 * the pools that suit `propertyType`.
 */
export function propertyGallery(slug, propertyType, count) {
  const plan = GALLERY_PLAN[propertyType] ?? GALLERY_PLAN.apartment;
  const chosen = [];
  const used = new Set();

  for (let index = 0; chosen.length < count && index < plan.length * 3; index += 1) {
    const entry = pick(plan[index % plan.length], slug, index);
    if (!entry) break;
    if (used.has(entry.file)) continue;
    used.add(entry.file);
    chosen.push(entry.file);
  }

  // Pools exhausted (or no manifest): top up with deterministic placeholders.
  while (chosen.length < count) {
    chosen.push(fallback(`nawy-prop-${slug}-${chosen.length + 1}`, 1600, 900));
  }

  return chosen;
}

export const propertyImage = (slug, index) => fallback(`nawy-prop-${slug}-${index}`, 1600, 900);
export const propertyFloorPlan = (slug, index) =>
  fallback(`nawy-plan-${slug}-${index}`, 1200, 1200);

/** S3-style object key mirrored in `media.images[].key` (see CONTRACT §3). */
export const propertyImageKey = (slug, index) => `properties/${slug}/${index}.jpg`;
export const propertyFloorPlanKey = (slug, index) => `properties/${slug}/floorplan-${index}.jpg`;
