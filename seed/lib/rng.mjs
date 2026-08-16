/**
 * Seeded, dependency-free pseudo random number generator.
 *
 * The generator is a mulberry32 PRNG seeded from a SHA-256 hash of a string key,
 * so `makeRng('property:NWY-1042')` always yields the exact same sequence on any
 * machine and any Node version. All "random" choices in the seed dataset go
 * through this so `node generate.mjs` is byte-reproducible.
 */
import { createHash } from 'node:crypto';

/** 32-bit unsigned seed derived from an arbitrary string. */
export function seedFromString(key) {
  const digest = createHash('sha256').update(String(key), 'utf8').digest();
  return digest.readUInt32BE(0) >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {string} key stable seed key
 */
export function makeRng(key) {
  const next = mulberry32(seedFromString(key));

  const rng = {
    /** float in [0, 1) */
    next,

    /** float in [min, max) */
    float(min, max) {
      return min + next() * (max - min);
    },

    /** integer in [min, max] inclusive */
    int(min, max) {
      return Math.floor(min + next() * (max - min + 1));
    },

    /** integer in [min, max] snapped to a multiple of `step` */
    step(min, max, step) {
      const steps = Math.floor((max - min) / step);
      return min + rng.int(0, steps) * step;
    },

    /** true with probability p */
    bool(p = 0.5) {
      return next() < p;
    },

    /** uniform pick */
    pick(items) {
      if (!items.length) throw new Error('rng.pick: empty list');
      return items[rng.int(0, items.length - 1)];
    },

    /**
     * Weighted pick.
     * @param {[any, number][]} pairs  [value, weight] tuples
     */
    weighted(pairs) {
      const total = pairs.reduce((sum, [, weight]) => sum + weight, 0);
      let roll = next() * total;
      for (const [value, weight] of pairs) {
        roll -= weight;
        if (roll <= 0) return value;
      }
      return pairs[pairs.length - 1][0];
    },

    /** Fisher-Yates copy */
    shuffle(items) {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = rng.int(0, i);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },

    /** n distinct items, preserving the original relative order */
    sample(items, n) {
      const count = Math.max(0, Math.min(n, items.length));
      const chosen = new Set(rng.shuffle(items.map((_, i) => i)).slice(0, count));
      return items.filter((_, i) => chosen.has(i));
    },
  };

  return rng;
}
