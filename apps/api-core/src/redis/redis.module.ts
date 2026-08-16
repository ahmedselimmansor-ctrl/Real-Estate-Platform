import { Global, Inject, Logger, Module, OnApplicationShutdown, Provider } from '@nestjs/common';
import { Redis } from 'ioredis';

import { AppConfigService } from '../config/app-config.service';
import { CacheService } from './cache.service';
import { REDIS_CLIENT } from './redis.constants';

const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [AppConfigService],
  useFactory: (config: AppConfigService): Redis => {
    const logger = new Logger('RedisModule');

    const client = new Redis(config.redis.url, {
      connectionName: 'api-core',
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      enableOfflineQueue: true,
      keepAlive: 10_000,
      connectTimeout: 10_000,
      retryStrategy: (attempt: number) => Math.min(attempt * 200, 5_000),
    });

    client.on('ready', () => logger.log('Connected to Redis'));
    client.on('end', () => logger.warn('Redis connection closed'));
    client.on('error', (error: Error) => logger.error(`Redis error: ${error.message}`));

    return client;
  },
};

/** Global Redis access: raw client (`REDIS_CLIENT`) plus the JSON `CacheService`. */
@Global()
@Module({
  providers: [redisProvider, CacheService],
  exports: [REDIS_CLIENT, CacheService],
})
export class RedisModule implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisModule.name);

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    try {
      await this.client.quit();
      this.logger.log('Redis connection drained');
    } catch {
      this.client.disconnect();
    }
  }
}
