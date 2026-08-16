import { Injectable, Logger } from '@nestjs/common';
import type { AuditLog, Prisma } from '@prisma/client';

import type { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import type { PaginatedResult } from '../../common/types/api-response';
import { paginate } from '../../common/utils/pagination';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEntry {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export interface ListAuditDto extends PaginationQueryDto {
  action?: string;
  entityType?: string;
  userId?: string;
}

/** Fields that must never reach the audit trail. */
const REDACTED_FIELDS = new Set([
  'password',
  'passwordHash',
  'currentPassword',
  'newPassword',
  'token',
  'accessToken',
  'refreshToken',
  'resetTokenHash',
  'secret',
]);

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records an administrative mutation. Never throws — losing an audit row must
   * not fail the operation being audited (it is logged loudly instead).
   */
  async record(entry: AuditEntry): Promise<void> {
    try {
      const diff = this.diff(entry.before, entry.after);

      await this.prisma.auditLog.create({
        data: {
          userId: entry.actorId ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          metadata: (diff ? { changes: diff } : {}) as Prisma.InputJsonValue,
          ipAddress: entry.ipAddress ?? null,
          userAgent: entry.userAgent ?? null,
          requestId: entry.requestId ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `could not write audit entry ${entry.action} ${entry.entityType}: ${String(error)}`,
      );
    }
  }

  async list(query: ListAuditDto): Promise<PaginatedResult<AuditLog>> {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return paginate(data, total, query);
  }

  /**
   * Shallow field-level diff, with sensitive keys redacted. Returns `null` when
   * nothing changed so unchanged saves do not create noise.
   */
  private diff(
    before: unknown,
    after: unknown,
  ): Record<string, { from: unknown; to: unknown }> | null {
    if (!after || typeof after !== 'object') {
      return null;
    }

    const previous = (before ?? {}) as Record<string, unknown>;
    const next = after as Record<string, unknown>;
    const changes: Record<string, { from: unknown; to: unknown }> = {};

    for (const key of new Set([...Object.keys(previous), ...Object.keys(next)])) {
      if (REDACTED_FIELDS.has(key)) {
        continue;
      }

      const from = previous[key];
      const to = next[key];

      if (JSON.stringify(from) !== JSON.stringify(to)) {
        changes[key] = { from: this.truncate(from), to: this.truncate(to) };
      }
    }

    return Object.keys(changes).length > 0 ? changes : null;
  }

  /** Keeps individual audit values from bloating the JSONB column. */
  private truncate(value: unknown): unknown {
    if (typeof value === 'string' && value.length > 500) {
      return `${value.slice(0, 500)}…`;
    }
    return value;
  }
}
