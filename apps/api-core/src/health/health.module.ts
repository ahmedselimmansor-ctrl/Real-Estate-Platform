import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { HealthController } from './health.controller';
import { MongoHealthIndicator } from './indicators/mongo.health';
import { PostgresHealthIndicator } from './indicators/postgres.health';
import { RedisHealthIndicator } from './indicators/redis.health';

/**
 * Health probes. Prisma, Mongoose and Redis providers come from the global
 * persistence modules, so only the indicators are declared here.
 */
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [PostgresHealthIndicator, MongoHealthIndicator, RedisHealthIndicator],
  exports: [PostgresHealthIndicator, MongoHealthIndicator, RedisHealthIndicator],
})
export class HealthModule {}
