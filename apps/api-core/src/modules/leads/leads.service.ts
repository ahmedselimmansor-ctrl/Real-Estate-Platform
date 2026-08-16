import { Injectable, Logger } from '@nestjs/common';
import type { Lead, LeadStatus, Prisma } from '@prisma/client';

import { AppException } from '../../common/errors/app.exception';
import { ERROR_CODES } from '../../common/errors/error-codes';
import type { LeadStatusValue } from '../../common/enums';
import type { PaginatedResult } from '../../common/types/api-response';
import { paginate, parseSort, toPrismaOrderBy } from '../../common/utils/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { PropertiesService } from '../properties/properties.service';
import type { CreateLeadDto, ListLeadsDto, UpdateLeadDto } from './dto/lead.dto';

const SORTABLE = ['createdAt', 'updatedAt', 'status', 'name'] as const;

/**
 * Allowed status moves. A lead may always be marked `lost`, and `won`/`lost` are
 * terminal — reopening means creating a new enquiry.
 */
const TRANSITIONS: Readonly<Record<LeadStatusValue, readonly LeadStatusValue[]>> = {
  new: ['contacted', 'qualified', 'lost'],
  contacted: ['qualified', 'viewing', 'lost'],
  qualified: ['viewing', 'negotiating', 'lost'],
  viewing: ['negotiating', 'won', 'lost'],
  negotiating: ['won', 'lost'],
  won: [],
  lost: [],
};

const LEAD_INCLUDE = {
  property: { select: { id: true, slug: true, priceMin: true, status: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
  user: { select: { id: true, name: true, email: true } },
  // Sell enquiries carry no property, so the area and compound are the only
  // thing that locates the unit an agent is about to call about.
  area: { select: { id: true, slug: true, nameEn: true, nameAr: true, city: true } },
  compound: { select: { id: true, slug: true, name: true, nameAr: true } },
} satisfies Prisma.LeadInclude;

export type LeadRecord = Prisma.LeadGetPayload<{ include: typeof LEAD_INCLUDE }>;

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly properties: PropertiesService,
  ) {}

  /**
   * Public enquiry submission. Returns the same shape whether or not the
   * honeypot tripped, so a bot cannot tell it was filtered.
   */
  async create(
    dto: CreateLeadDto,
    submitter?: { userId?: string },
  ): Promise<{ id: string | null; received: true }> {
    if (dto.company && dto.company.trim().length > 0) {
      this.logger.debug(`honeypot tripped for lead from ${dto.email ?? dto.phone} — dropped`);
      return { id: null, received: true };
    }

    if (dto.propertyId) {
      const exists = await this.prisma.propertyIndex.count({
        where: { id: dto.propertyId, deletedAt: null },
      });

      if (exists === 0) {
        throw AppException.badRequest(
          `Property "${dto.propertyId}" does not exist`,
          ERROR_CODES.RELATED_RESOURCE_NOT_FOUND,
          [{ field: 'propertyId', message: 'unknown property', rule: 'exists' }],
        );
      }
    }

    await this.assertCatalogRefsExist(dto.areaId, dto.compoundId);

    const lead = await this.prisma.lead.create({
      data: {
        propertyId: dto.propertyId ?? null,
        userId: submitter?.userId ?? null,
        name: dto.name,
        phone: dto.phone,
        email: dto.email ?? null,
        message: dto.message ?? null,
        source: dto.source ?? 'website',
        areaId: dto.areaId ?? null,
        compoundId: dto.compoundId ?? null,
        propertyType: dto.propertyType ?? null,
        status: 'new',
      },
    });

    if (dto.propertyId) {
      await this.properties.incrementLeadCount(dto.propertyId);
    }

    return { id: lead.id, received: true };
  }

  /**
   * A seller names an area and a compound rather than a listing. Both are
   * optional, but a value that is supplied has to resolve, otherwise the
   * enquiry reaches an agent pointing at nothing.
   */
  private async assertCatalogRefsExist(areaId?: string, compoundId?: string): Promise<void> {
    if (areaId) {
      const found = await this.prisma.area.count({ where: { id: areaId } });
      if (found === 0) {
        throw AppException.badRequest(
          `Area "${areaId}" does not exist`,
          ERROR_CODES.RELATED_RESOURCE_NOT_FOUND,
          [{ field: 'areaId', message: 'unknown area', rule: 'exists' }],
        );
      }
    }

    if (compoundId) {
      const found = await this.prisma.compound.count({ where: { id: compoundId } });
      if (found === 0) {
        throw AppException.badRequest(
          `Compound "${compoundId}" does not exist`,
          ERROR_CODES.RELATED_RESOURCE_NOT_FOUND,
          [{ field: 'compoundId', message: 'unknown compound', rule: 'exists' }],
        );
      }
    }
  }

  async list(query: ListLeadsDto): Promise<PaginatedResult<LeadRecord>> {
    const where: Prisma.LeadWhereInput = {
      ...(query.status ? { status: query.status as LeadStatus } : {}),
      ...(query.propertyId ? { propertyId: query.propertyId } : {}),
      ...(query.assignedToId ? { assignedToId: query.assignedToId } : {}),
      ...(query.compoundId ? { compoundId: query.compoundId } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q, mode: 'insensitive' } },
              { phone: { contains: query.q } },
            ],
          }
        : {}),
    };

    const sort = parseSort(query.sort, SORTABLE, { field: 'createdAt', direction: 'desc' });

    const [data, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        orderBy: toPrismaOrderBy(sort),
        skip: query.skip,
        take: query.take,
        include: LEAD_INCLUDE,
      }),
      this.prisma.lead.count({ where }),
    ]);

    return paginate(data, total, query);
  }

  async findOne(id: string): Promise<LeadRecord> {
    const lead = await this.prisma.lead.findUnique({ where: { id }, include: LEAD_INCLUDE });

    if (!lead) {
      throw AppException.notFound(`Lead "${id}" was not found`, ERROR_CODES.LEAD_NOT_FOUND);
    }

    return lead;
  }

  async update(id: string, dto: UpdateLeadDto): Promise<LeadRecord> {
    const existing = await this.prisma.lead.findUnique({
      where: { id },
      select: { id: true, status: true, contactedAt: true },
    });

    if (!existing) {
      throw AppException.notFound(`Lead "${id}" was not found`, ERROR_CODES.LEAD_NOT_FOUND);
    }

    if (dto.status !== undefined && dto.status !== existing.status) {
      this.assertTransition(existing.status as LeadStatusValue, dto.status as LeadStatusValue);
    }

    if (dto.assignedToId) {
      const agent = await this.prisma.user.count({
        where: { id: dto.assignedToId, role: { in: ['agent', 'admin', 'superadmin'] } },
      });

      if (agent === 0) {
        throw AppException.badRequest(
          'Leads can only be assigned to an agent or administrator',
          ERROR_CODES.RELATED_RESOURCE_NOT_FOUND,
          [{ field: 'assignedToId', message: 'not an agent', rule: 'exists' }],
        );
      }
    }

    const movingToContacted =
      dto.status === 'contacted' && existing.contactedAt === null ? new Date() : undefined;

    return this.prisma.lead.update({
      where: { id },
      data: {
        ...(dto.status !== undefined ? { status: dto.status as LeadStatus } : {}),
        ...(dto.assignedToId !== undefined ? { assignedToId: dto.assignedToId } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(movingToContacted ? { contactedAt: movingToContacted } : {}),
      },
      include: LEAD_INCLUDE,
    });
  }

  async remove(id: string): Promise<{ id: string; deleted: true }> {
    const exists = await this.prisma.lead.count({ where: { id } });
    if (exists === 0) {
      throw AppException.notFound(`Lead "${id}" was not found`, ERROR_CODES.LEAD_NOT_FOUND);
    }

    await this.prisma.lead.delete({ where: { id } });
    return { id, deleted: true };
  }

  /** Counts per status — powers the admin kanban column headers. */
  async statusCounts(): Promise<Record<LeadStatusValue, number>> {
    const grouped = await this.prisma.lead.groupBy({ by: ['status'], _count: { _all: true } });

    const counts = Object.fromEntries(
      Object.keys(TRANSITIONS).map((status) => [status, 0]),
    ) as Record<LeadStatusValue, number>;

    for (const row of grouped) {
      counts[row.status as LeadStatusValue] = row._count._all;
    }

    return counts;
  }

  private assertTransition(from: LeadStatusValue, to: LeadStatusValue): void {
    if (!TRANSITIONS[from].includes(to)) {
      throw AppException.badRequest(
        `A lead cannot move from "${from}" to "${to}"` +
          (TRANSITIONS[from].length > 0
            ? `. Allowed: ${TRANSITIONS[from].join(', ')}`
            : ' — this status is final.'),
        ERROR_CODES.BAD_REQUEST,
        [{ field: 'status', message: `invalid transition from ${from}`, rule: 'transition' }],
      );
    }
  }
}

export { TRANSITIONS as LEAD_TRANSITIONS };
