import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { AppConfigService } from '../config/app-config.service';
import { REDIS_CLIENT } from './redis.constants';

/**
 * Thin JSON cache over Redis.
 *
 * Every method fails **open**: a Redis outage degrades performance, never
 * correctness — reads return `null`/recompute and writes are dropped with a log.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: AppConfigService,
  ) {}

  get client(): Redis {
    return this.redis;
  }

  get defaultTtl(): number {
    return this.config.redis.defaultTtlSeconds;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      if (raw === null) {
        return null;
      }
      return JSON.parse(raw) as T;
    } catch (error) {
      this.logger.warn(`cache get failed for "${key}": ${this.describe(error)}`);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number = this.defaultTtl): Promise<void> {
    try {
      const payload = JSON.stringify(value);
      if (ttlSeconds > 0) {
        await this.redis.set(key, payload, 'EX', Math.floor(ttlSeconds));
      } else {
        await this.redis.set(key, payload);
      }
    } catch (error) {
      this.logger.warn(`cache set failed for "${key}": ${this.describe(error)}`);
    }
  }

  async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) {
      return 0;
    }
    try {
      return await this.redis.unlink(...keys);
    } catch (error) {
      this.logger.warn(`cache del failed for "${keys.join(', ')}": ${this.describe(error)}`);
      return 0;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      return (await this.redis.exists(key)) === 1;
    } catch (error) {
      this.logger.warn(`cache exists failed for "${key}": ${this.describe(error)}`);
      return false;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      return await this.redis.ttl(key);
    } catch (error) {
      this.logger.warn(`cache ttl failed for "${key}": ${this.describe(error)}`);
      return -2;
    }
  }

  /**
   * Read-through cache: returns the cached value or computes, stores and
   * returns a fresh one. `null`/`undefined` results are not cached.
   */
  async wrap<T>(key: string, ttlSeconds: number, factory: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    if (value !== null && value !== undefined) {
      await this.set(key, value, ttlSeconds);
    }
    return value;
  }

  /**
   * Deletes every key matching a glob pattern using a cursor based `SCAN`
   * (never `KEYS`, which blocks the server) and `UNLINK` batches.
   */
  async delByPattern(pattern: string, batchSize = 250): Promise<number> {
    let cursor = '0';
    let removed = 0;

    try {
      do {
        const [nextCursor, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          batchSize,
        );
        cursor = nextCursor;

        if (keys.length > 0) {
          removed += await this.redis.unlink(...keys);
        }
      } while (cursor !== '0');
    } catch (error) {
      this.logger.warn(`cache delByPattern failed for "${pattern}": ${this.describe(error)}`);
    }

    return removed;
  }

  /** Atomic counter used by rate limiting (`ratelimit:{scope}:{id}`). */
  async increment(key: string, ttlSeconds: number): Promise<number> {
    try {
      const count = await this.redis.incr(key);
      if (count === 1 && ttlSeconds > 0) {
        await this.redis.expire(key, Math.floor(ttlSeconds));
      }
      return count;
    } catch (error) {
      this.logger.warn(`cache increment failed for "${key}": ${this.describe(error)}`);
      return 0;
    }
  }

  /** Best-effort distributed lock (`lock:{resource}`). Returns false if held. */
  async acquireLock(key: string, ttlSeconds: number, token: string): Promise<boolean> {
    try {
      const result = await this.redis.set(key, token, 'EX', Math.floor(ttlSeconds), 'NX');
      return result === 'OK';
    } catch (error) {
      this.logger.warn(`cache acquireLock failed for "${key}": ${this.describe(error)}`);
      return false;
    }
  }

  async ping(): Promise<string> {
    return this.redis.ping();
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
