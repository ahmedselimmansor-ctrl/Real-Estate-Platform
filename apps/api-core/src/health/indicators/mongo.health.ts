import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { HealthIndicatorResult } from '@nestjs/terminus';
import type { Connection } from 'mongoose';

import { withTimeout } from '../../common/utils/with-timeout';

/** `admin.ping()` against the `topchoice` MongoDB database. */
@Injectable()
export class MongoHealthIndicator {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async isHealthy(key = 'mongo', timeoutMs = 2_000): Promise<HealthIndicatorResult> {
    const startedAt = Date.now();

    try {
      // 1 === connected
      if ((this.connection.readyState as number) !== 1) {
        return {
          [key]: { status: 'down', message: `connection state ${this.connection.readyState}` },
        };
      }

      const db = this.connection.db;
      if (!db) {
        return { [key]: { status: 'down', message: 'database handle unavailable' } };
      }

      await withTimeout(db.admin().ping(), timeoutMs, 'mongo ping');
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
