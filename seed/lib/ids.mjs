/**
 * Deterministic identifier helpers.
 *
 * Every id in the seed dataset is derived from a stable, human-readable key
 * (usually `<entity>:<slug>`) via RFC 4122 v5 (SHA-1, namespaced) UUIDs.
 * Re-running the generator therefore produces byte-identical ids, which is what
 * lets Postgres, MongoDB, Elasticsearch and pgvector all agree on the same rows.
 *
 * NEVER use crypto.randomUUID() here.
 */
import { createHash } from 'node:crypto';

/** Fixed private namespace for the TopChoice seed dataset. Do not change. */
export const TOPCHOICE_SEED_NAMESPACE = '6f2a1c8e-3b47-5d19-9a0e-7c5d4b3a2f10';

const HEX32 = /^[0-9a-f]{32}$/;

function namespaceBytes(namespace) {
  const hex = namespace.replace(/-/g, '').toLowerCase();
  if (!HEX32.test(hex)) throw new Error(`Invalid UUID namespace: ${namespace}`);
  return Buffer.from(hex, 'hex');
}

/**
 * RFC 4122 version 5 UUID (SHA-1 based).
 * @param {string} name  stable key, e.g. "area:new-cairo"
 * @param {string} [namespace]
 * @returns {string} canonical lowercase UUID
 */
export function uuidV5(name, namespace = TOPCHOICE_SEED_NAMESPACE) {
  const digest = createHash('sha1')
    .update(Buffer.concat([namespaceBytes(namespace), Buffer.from(String(name), 'utf8')]))
    .digest();

  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant

  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/**
 * Deterministic 24-character hex string, shaped like a MongoDB ObjectId.
 * Used for `properties[].mongoId` so api-core can insert the seed document with
 * a real ObjectId `_id` while Postgres `property_index.mongo_id` stores the same
 * value and `property_index.id` stores the UUID `id`.
 */
export function objectIdHex(name) {
  return createHash('sha256').update(`objectid:${name}`, 'utf8').digest('hex').slice(0, 24);
}

export const amenityId = (slug) => uuidV5(`amenity:${slug}`);
export const areaId = (slug) => uuidV5(`area:${slug}`);
export const developerId = (slug) => uuidV5(`developer:${slug}`);
export const compoundId = (slug) => uuidV5(`compound:${slug}`);
export const propertyId = (slug) => uuidV5(`property:${slug}`);
export const faqId = (key) => uuidV5(`faq:${key}`);
