import { Injectable } from '@nestjs/common';
import type { HealthIndicatorResult } from '@nestjs/terminus';

import { withTimeout } from '../../common/utils/with-timeout';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * `SELECT 1` against the `nawy` PostgreSQL database.
 *
 * Resolves with a `down` result instead of throwing so the health controller
 * can always render the full CONTRACT §4 `deps` map.
 */
@Injectable()
export class PostgresHealthIndicator {
  constructor(private readonly prisma: PrismaService) {}

  async isHealthy(key = 'postgres', timeoutMs = 2_000): Promise<HealthIndicatorResult> {
    const startedAt = Date.now();

    try {
      await withTimeout(this.prisma.ping(), timeoutMs, 'postgres ping');
      return { [key]: { status: 'up', responseTimeMs: Date.now() - startedAt } };
    } catch (error) {
      return {
        [key]: {
          status: 'down',
          message: error instanceof Error ? error.message : 'unknown error',
        },
      };
    }
  }
}
