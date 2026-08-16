import { INestApplication, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { AppConfigService } from '../config/app-config.service';

/**
 * PostgreSQL access for the `nawy` database (CONTRACT §2 — owned by api-core).
 *
 * Connects eagerly on boot so a misconfigured `DATABASE_URL` fails fast, and
 * disconnects on shutdown so `docker compose down` drains cleanly.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: AppConfigService) {
    super({
      datasourceUrl: config.database.url,
      errorFormat: config.isProduction ? 'minimal' : 'pretty',
      log: config.isProduction ? ['warn', 'error'] : ['info', 'warn', 'error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Disconnected from PostgreSQL');
  }

  /**
   * Closes the Nest application when the Prisma process exits. Nest's own
   * `app.enableShutdownHooks()` covers SIGTERM/SIGINT; this covers the engine.
   */
  enableShutdownHooks(app: INestApplication): void {
    process.once('beforeExit', () => {
      void app.close();
    });
  }

  /** Lightweight liveness probe used by the health controller. */
  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }
}
