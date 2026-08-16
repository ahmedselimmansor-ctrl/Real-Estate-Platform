import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { TokenService } from './token.service';

/**
 * Expired refresh tokens are harmless (they fail verification) but they bloat
 * the table, so sweep them nightly. Redis entries expire on their own TTL.
 */
@Injectable()
export class AuthCleanupService {
  private readonly logger = new Logger(AuthCleanupService.name);

  constructor(private readonly tokens: TokenService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'purge-expired-refresh-tokens' })
  async purgeExpiredRefreshTokens(): Promise<void> {
    try {
      const removed = await this.tokens.purgeExpiredRefreshTokens();
      if (removed > 0) {
        this.logger.log(`purged ${removed} expired refresh token(s)`);
      }
    } catch (error) {
      this.logger.warn(`refresh token purge failed: ${String(error)}`);
    }
  }
}
