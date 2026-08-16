/**
 * Filesystem helpers for the seed generator.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path of the `seed/` directory, regardless of cwd. */
export const SEED_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Write pretty-printed, newline-terminated JSON. Object key order is insertion
 * order, so output is stable across runs.
 * @returns {number} number of bytes written
 */
export function writeJson(fileName, payload) {
  const target = resolve(SEED_DIR, fileName);
  mkdirSync(dirname(target), { recursive: true });
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  writeFileSync(target, body, 'utf8');
  return Buffer.byteLength(body, 'utf8');
}
