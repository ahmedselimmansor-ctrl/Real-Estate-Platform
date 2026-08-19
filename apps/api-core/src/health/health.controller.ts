import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, HealthIndicatorResult } from '@nestjs/terminus';
import type { Response } from 'express';

import { SERVICE_NAME, SERVICE_VERSION } from '../common/constants';
import { Public } from '../common/decorators/public.decorator';
import { SkipResponseTransform } from '../common/decorators/skip-response-transform.decorator';
import { DependencyStatus, HealthResponse } from '../common/types/api-response';
import { MongoHealthIndicator } from './indicators/mongo.health';
import { PostgresHealthIndicator } from './indicators/postgres.health';
import { RedisHealthIndicator } from './indicators/redis.health';

const DEPENDENCIES = ['postgres', 'mongo', 'redis'] as const;

type DetailsMap = Record<string, { status?: string } | undefined>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * CONTRACT §4 health endpoints.
 *
 * Mounted **outside** the `api/v1` global prefix (see `main.ts`), so the docker
 * healthcheck can hit `http://localhost:4000/health` directly:
 *
 * ```json
 * { "status": "ok", "service": "api-core", "version": "1.0.0",
 *   "deps": { "postgres": "up", "mongo": "up", "redis": "up" } }
 * ```
 *
 * `GET /health`       — liveness: 200 as long as the process serves traffic.
 * `GET /health/ready` — readiness: 503 when any dependency is down.
 */
@ApiTags('health')
@Controller({ path: 'health' })
@SkipResponseTransform()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly postgres: PostgresHealthIndicator,
    private readonly mongo: MongoHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  @Get()
  @Public()
  @HealthCheck()
  @ApiOperation({ summary: 'Liveness probe with dependency snapshot' })
  @ApiOkResponse({ description: 'The service is running' })
  async liveness(): Promise<HealthResponse> {
    const deps = await this.collect();
    return { status: 'ok', service: SERVICE_NAME, version: SERVICE_VERSION, deps };
  }

  @Get('ready')
  @Public()
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe — 503 while a dependency is down' })
  @ApiOkResponse({ description: 'Every dependency is reachable' })
  @ApiServiceUnavailableResponse({ description: 'At least one dependency is down' })
  async readiness(@Res({ passthrough: true }) response: Response): Promise<HealthResponse> {
    const deps = await this.collect();
    const ready = Object.values(deps).every((status) => status === 'up');

    response.status(ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    return {
      status: ready ? 'ok' : 'error',
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      deps,
    };
  }

  /** Runs every indicator and always yields a complete `deps` map. */
  private async collect(): Promise<Record<string, DependencyStatus>> {
    const indicators: Array<() => Promise<HealthIndicatorResult>> = [
      () => this.postgres.isHealthy('postgres'),
      () => this.mongo.isHealthy('mongo'),
      () => this.redis.isHealthy('redis'),
    ];

    try {
      const result = await this.health.check(indicators);
      return this.toDeps(result.details as unknown as DetailsMap);
    } catch (error) {
      return this.toDeps(this.extractDetails(error));
    }
  }

  private toDeps(details: DetailsMap): Record<string, DependencyStatus> {
    return DEPENDENCIES.reduce<Record<string, DependencyStatus>>((deps, name) => {
      deps[name] = details?.[name]?.status === 'up' ? 'up' : 'down';
      return deps;
    }, {});
  }

  /** Terminus reports failures by throwing a ServiceUnavailableException. */
  private extractDetails(error: unknown): DetailsMap {
    if (error instanceof Error && 'getResponse' in error) {
      const response = (error as { getResponse: () => unknown }).getResponse();
      if (isRecord(response) && isRecord(response.details)) {
        return response.details as DetailsMap;
      }
    }
    return {};
  }
}
