import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * Node environment, no jsdom: what is covered here is the pure logic the whole
 * app leans on — the URL <-> filter round trip behind every search link, and
 * the money/number formatting that renders in two locales. None of it needs a
 * DOM, and keeping it that way makes the suite fast enough to run on save.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: false,
  },
});
