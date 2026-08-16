import { Injectable, Logger } from '@nestjs/common';

import { SERVICE_TOKEN_HEADER } from '../../common/constants';
import { AppConfigService } from '../../config/app-config.service';

const REQUEST_TIMEOUT_MS = 4_000;

/**
 * Fire-and-forget notifications to `search-svc` (CONTRACT §6 admin routes).
 *
 * Elasticsearch is a derived store: if the reindex call fails the listing is
 * still correct in MongoDB and Postgres, and `POST /api/search/reindex` will
 * heal the index. So every method here **swallows** transport errors and logs
 * them — a search outage must never fail a write.
 */
@Injectable()
export class SearchIndexClient {
  private readonly logger = new Logger(SearchIndexClient.name);

  constructor(private readonly config: AppConfigService) {}

  /** Upserts one listing into the search index. */
  async indexProperty(propertyId: string): Promise<void> {
    await this.call('POST', `/api/search/index/${encodeURIComponent(propertyId)}`);
  }

  /** Removes one listing from the search index (soft or hard delete). */
  async removeProperty(propertyId: string): Promise<void> {
    await this.call('DELETE', `/api/search/index/${encodeURIComponent(propertyId)}`);
  }

  /** Rebuilds the whole index, or just the supplied ids. */
  async reindex(ids?: string[]): Promise<void> {
    await this.call('POST', '/api/search/reindex', ids?.length ? { ids } : { full: true });
  }

  private async call(method: string, path: string, body?: unknown): Promise<void> {
    const url = `${this.config.services.search}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'content-type': 'application/json',
          [SERVICE_TOKEN_HEADER]: this.config.app.internalServiceToken,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(
          `search-svc ${method} ${path} responded ${response.status} — index may be stale`,
        );
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`search-svc ${method} ${path} unreachable (${reason}) — index may be stale`);
    } finally {
      clearTimeout(timer);
    }
  }
}
