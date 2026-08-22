import { defineConfig } from 'vitest/config';

/**
 * These talk to a real, running, seeded stack over TLS — nothing is mocked.
 * Single-threaded on purpose: several specs assert against rate limits and
 * against counts that other specs would perturb if they ran concurrently.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['specs/**/*.spec.ts'],
    globalSetup: ['./setup/global-setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    pool: 'threads',
    poolOptions: { threads: { singleThread: true } },
    fileParallelism: false,
    passWithNoTests: false,
    reporters: process.env.CI ? ['default', 'junit'] : ['default'],
    outputFile: { junit: './results/junit.xml' },
  },
});
