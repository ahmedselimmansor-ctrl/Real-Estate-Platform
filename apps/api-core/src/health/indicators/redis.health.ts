import { Injectable } from '@nestjs/common';
import type { HealthIndicatorResult } from '@nestjs/terminus';

import { withTimeout } from '../../common/utils/with-timeout';
import { CacheService } from '../../redis/cache.service';

/** `PING` against the shared Redis instance. */
@Injectable()
export class RedisHealthIndicator {
  constructor(private readonly cache: CacheService) {}

  async isHealthy(key = 'redis', timeoutMs = 2_000): Promise<HealthIndicatorResult> {
    const startedAt = Date.now();

    try {
      const pong = await withTimeout(this.cache.ping(), timeoutMs, 'redis ping');
      if (pong !== 'PONG') {
        return { [key]: { status: 'down', message: `unexpected reply "${pong}"` } };
      }
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
