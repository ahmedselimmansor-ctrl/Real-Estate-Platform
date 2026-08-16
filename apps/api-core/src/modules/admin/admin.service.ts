import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import type { LeadStatusValue, UserRoleValue } from '../../common/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';
import { cacheKeys } from '../../redis/cache-keys';
import { Property, PropertyDocument } from '../../mongo/schemas/property.schema';

const STATS_TTL_SECONDS = 60;
const TREND_MONTHS = 12;

export interface AdminStats {
  properties: {
    total: number;
    available: number;
    sold: number;
    reserved: number;
    featured: number;
    newThisMonth: number;
    soldThisMonth: number;
    portfolioValue: number;
    avgPrice: number;
    avgPricePerMeter: number;
  };
  users: { total: number; byRole: Record<UserRoleValue, number>; newThisMonth: number };
  leads: { total: number; byStatus: Record<LeadStatusValue, number>; newThisMonth: number };
  engagement: { totalViews: number; totalFavorites: number; totalLeads: number };
  topAreas: { areaId: string; areaName: string; count: number; avgPrice: number }[];
  topDevelopers: { developerId: string; developerName: string; count: number }[];
  trend: { month: string; listings: number; leads: number }[];
}

interface PropertyFacets {
  totals?: { count: number; portfolioValue: number; avgPrice: number; avgPpm: number }[];
  byStatus?: { _id: string; count: number }[];
  featured?: { count: number }[];
  newThisMonth?: { count: number }[];
  engagement?: { views: number; favorites: number; leads: number }[];
  topAreas?: { _id: string; areaName: string; count: number; avgPrice: number }[];
  topDevelopers?: { _id: string; developerName: string; count: number }[];
  listingTrend?: { _id: string; count: number }[];
}

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(Property.name) private readonly propertyModel: Model<PropertyDocument>,
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /** Dashboard KPIs. Cached for a minute — this is a heavy multi-store read. */
  async stats(): Promise<AdminStats> {
    return this.cache.wrap(cacheKeys.list({ entity: 'admin-stats' }), STATS_TTL_SECONDS, () =>
      this.computeStats(),
    );
  }

  private async computeStats(): Promise<AdminStats> {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const trendStart = new Date(monthStart);
    trendStart.setUTCMonth(trendStart.getUTCMonth() - (TREND_MONTHS - 1));

    const [facets, userGroups, newUsers, leadGroups, newLeads, leadTrend] = await Promise.all([
      this.propertyFacets(monthStart, trendStart),
      this.prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
      this.prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
      this.prisma.lead.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.lead.count({ where: { createdAt: { gte: monthStart } } }),
      this.leadTrend(trendStart),
    ]);

    const totals = facets.totals?.[0] ?? {
      count: 0,
      portfolioValue: 0,
      avgPrice: 0,
      avgPpm: 0,
    };
    const byStatus = new Map((facets.byStatus ?? []).map((row) => [row._id, row.count]));
    const engagement = facets.engagement?.[0] ?? { views: 0, favorites: 0, leads: 0 };

    const byRole = Object.fromEntries(
      (['user', 'agent', 'admin', 'superadmin'] as UserRoleValue[]).map((role) => [role, 0]),
    ) as Record<UserRoleValue, number>;
    for (const row of userGroups) {
      byRole[row.role as UserRoleValue] = row._count._all;
    }

    const byLeadStatus = Object.fromEntries(
      (
        ['new', 'contacted', 'qualified', 'viewing', 'negotiating', 'won', 'lost'] as LeadStatusValue[]
      ).map((status) => [status, 0]),
    ) as Record<LeadStatusValue, number>;
    for (const row of leadGroups) {
      byLeadStatus[row.status as LeadStatusValue] = row._count._all;
    }

    const listingsByMonth = new Map(
      (facets.listingTrend ?? []).map((row) => [row._id, row.count]),
    );
    const leadsByMonth = new Map(leadTrend.map((row) => [row.month, row.count]));

    return {
      properties: {
        total: totals.count,
        available: byStatus.get('available') ?? 0,
        sold: byStatus.get('sold') ?? 0,
        reserved: byStatus.get('reserved') ?? 0,
        featured: facets.featured?.[0]?.count ?? 0,
        newThisMonth: facets.newThisMonth?.[0]?.count ?? 0,
        soldThisMonth: await this.soldThisMonth(monthStart),
        portfolioValue: Math.round(totals.portfolioValue),
        avgPrice: Math.round(totals.avgPrice),
        avgPricePerMeter: Math.round(totals.avgPpm),
      },
      users: { total: userGroups.reduce((n, r) => n + r._count._all, 0), byRole, newThisMonth: newUsers },
      leads: {
        total: leadGroups.reduce((n, r) => n + r._count._all, 0),
        byStatus: byLeadStatus,
        newThisMonth: newLeads,
      },
      engagement: {
        totalViews: engagement.views,
        totalFavorites: engagement.favorites,
        totalLeads: engagement.leads,
      },
      topAreas: (facets.topAreas ?? []).map((row) => ({
        areaId: row._id,
        areaName: row.areaName,
        count: row.count,
        avgPrice: Math.round(row.avgPrice),
      })),
      topDevelopers: (facets.topDevelopers ?? []).map((row) => ({
        developerId: row._id,
        developerName: row.developerName,
        count: row.count,
      })),
      trend: this.monthKeys(trendStart).map((month) => ({
        month,
        listings: listingsByMonth.get(month) ?? 0,
        leads: leadsByMonth.get(month) ?? 0,
      })),
    };
  }

  /** One `$facet` pass over the listings collection — eight metrics, one scan. */
  private async propertyFacets(monthStart: Date, trendStart: Date): Promise<PropertyFacets> {
    const [result] = await this.propertyModel
      .aggregate<PropertyFacets>([
        { $match: { deletedAt: null } },
        {
          $facet: {
            totals: [
              {
                $group: {
                  _id: null,
                  count: { $sum: 1 },
                  portfolioValue: { $sum: '$price.amount' },
                  avgPrice: { $avg: '$price.amount' },
                  avgPpm: { $avg: '$price.pricePerMeter' },
                },
              },
              { $project: { _id: 0, count: 1, portfolioValue: 1, avgPrice: 1, avgPpm: 1 } },
            ],
            byStatus: [
              { $group: { _id: '$status', count: { $sum: 1 } } },
              { $project: { _id: 1, count: 1 } },
            ],
            featured: [
              { $match: { isFeatured: true } },
              { $count: 'count' },
            ],
            newThisMonth: [
              { $match: { createdAt: { $gte: monthStart } } },
              { $count: 'count' },
            ],
            engagement: [
              {
                $group: {
                  _id: null,
                  views: { $sum: '$stats.views' },
                  favorites: { $sum: '$stats.favorites' },
                  leads: { $sum: '$stats.leads' },
                },
              },
              { $project: { _id: 0, views: 1, favorites: 1, leads: 1 } },
            ],
            topAreas: [
              {
                $group: {
                  _id: '$location.areaId',
                  areaName: { $first: '$location.areaName' },
                  count: { $sum: 1 },
                  avgPrice: { $avg: '$price.amount' },
                },
              },
              { $sort: { count: -1 } },
              { $limit: 5 },
            ],
            topDevelopers: [
              {
                $group: {
                  _id: '$developer.id',
                  developerName: { $first: '$developer.name' },
                  count: { $sum: 1 },
                },
              },
              { $sort: { count: -1 } },
              { $limit: 5 },
            ],
            listingTrend: [
              { $match: { createdAt: { $gte: trendStart } } },
              {
                $group: {
                  _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
                  count: { $sum: 1 },
                },
              },
            ],
          },
        },
      ])
      .exec();

    return result ?? {};
  }

  private async soldThisMonth(monthStart: Date): Promise<number> {
    return this.propertyModel
      .countDocuments({ deletedAt: null, status: 'sold', updatedAt: { $gte: monthStart } })
      .exec();
  }

  private async leadTrend(since: Date): Promise<{ month: string; count: number }[]> {
    const rows = await this.prisma.$queryRaw<{ month: string; count: bigint }[]>`
      SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
             count(*)::bigint AS count
      FROM leads
      WHERE created_at >= ${since}
      GROUP BY 1
      ORDER BY 1
    `;

    return rows.map((row) => ({ month: row.month, count: Number(row.count) }));
  }

  /** `['2025-09', … , '2026-08']` — every bucket present, even empty ones. */
  private monthKeys(start: Date): string[] {
    const keys: string[] = [];
    const cursor = new Date(start);

    for (let index = 0; index < TREND_MONTHS; index += 1) {
      keys.push(
        `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`,
      );
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }

    return keys;
  }
}
