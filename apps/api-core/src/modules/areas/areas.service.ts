import { Injectable } from '@nestjs/common';
import type { Area, Prisma } from '@prisma/client';

import { AppException } from '../../common/errors/app.exception';
import { ERROR_CODES } from '../../common/errors/error-codes';
import type { PaginatedResult } from '../../common/types/api-response';
import { paginate, parseSort, toPrismaOrderBy } from '../../common/utils/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';
import { CACHE_TTL, cacheKeys } from '../../redis/cache-keys';
import { isUuid } from '../shared/identifier.util';
import { buildUniqueSlug } from '../shared/slug.util';
import type { CreateAreaDto, ListAreasDto, UpdateAreaDto } from './dto/area.dto';

const SORTABLE = ['nameEn', 'city', 'propertyCount', 'avgPricePerMeter', 'createdAt'] as const;

export interface AreaDetail extends Area {
  compoundCount: number;
  developerCount: number;
  priceRange: { min: number; max: number } | null;
}

@Injectable()
export class AreasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async list(query: ListAreasDto): Promise<PaginatedResult<Area>> {
    const key = cacheKeys.list({ entity: 'areas', ...query });

    return this.cache.wrap(key, CACHE_TTL.list, async () => {
      const where: Prisma.AreaWhereInput = {
        isActive: true,
        ...(query.city ? { city: { equals: query.city, mode: 'insensitive' } } : {}),
        ...(query.governorate
          ? { governorate: { equals: query.governorate, mode: 'insensitive' } }
          : {}),
        ...(query.q
          ? {
              OR: [
                { nameEn: { contains: query.q, mode: 'insensitive' } },
                { nameAr: { contains: query.q } },
              ],
            }
          : {}),
      };

      const sort = parseSort(query.sort, SORTABLE, { field: 'propertyCount', direction: 'desc' });

      const [data, total] = await Promise.all([
        this.prisma.area.findMany({
          where,
          orderBy: toPrismaOrderBy(sort),
          skip: query.skip,
          take: query.take,
        }),
        this.prisma.area.count({ where }),
      ]);

      return paginate(data, total, query);
    });
  }

  async findOne(idOrSlug: string): Promise<AreaDetail> {
    const area = await this.prisma.area.findFirst({
      where: isUuid(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug },
    });

    if (!area) {
      throw AppException.notFound(`Area "${idOrSlug}" was not found`, ERROR_CODES.AREA_NOT_FOUND);
    }

    const [compoundCount, developers, prices] = await Promise.all([
      this.prisma.compound.count({ where: { areaId: area.id, isActive: true } }),
      this.prisma.compound.findMany({
        where: { areaId: area.id, isActive: true },
        select: { developerId: true },
        distinct: ['developerId'],
      }),
      this.prisma.propertyIndex.aggregate({
        where: { areaId: area.id, deletedAt: null },
        _min: { priceMin: true },
        _max: { priceMin: true },
      }),
    ]);

    return {
      ...area,
      compoundCount,
      developerCount: developers.length,
      priceRange:
        prices._min.priceMin !== null && prices._max.priceMin !== null
          ? { min: prices._min.priceMin, max: prices._max.priceMin }
          : null,
    };
  }

  async create(dto: CreateAreaDto): Promise<Area> {
    const slug = await buildUniqueSlug(
      dto.slug ?? dto.nameEn,
      async (candidate) => (await this.prisma.area.count({ where: { slug: candidate } })) > 0,
      'area',
    );

    const area = await this.prisma.area.create({
      data: {
        slug,
        nameEn: dto.nameEn,
        nameAr: dto.nameAr,
        city: dto.city,
        governorate: dto.governorate,
        descriptionEn: dto.descriptionEn ?? null,
        descriptionAr: dto.descriptionAr ?? null,
        lat: dto.lat,
        lng: dto.lng,
        heroImage: dto.heroImage ?? null,
        avgPricePerMeter: dto.avgPricePerMeter ?? null,
        isActive: dto.isActive ?? true,
      },
    });

    await this.invalidate();
    return area;
  }

  async update(id: string, dto: UpdateAreaDto): Promise<Area> {
    await this.ensureExists(id);

    const slug =
      dto.slug !== undefined || dto.nameEn !== undefined
        ? await buildUniqueSlug(
            dto.slug ?? dto.nameEn!,
            async (candidate) =>
              (await this.prisma.area.count({ where: { slug: candidate, NOT: { id } } })) > 0,
            'area',
          )
        : undefined;

    const area = await this.prisma.area.update({
      where: { id },
      data: {
        ...(slug ? { slug } : {}),
        ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
        ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
        ...(dto.city !== undefined ? { city: dto.city } : {}),
        ...(dto.governorate !== undefined ? { governorate: dto.governorate } : {}),
        ...(dto.descriptionEn !== undefined ? { descriptionEn: dto.descriptionEn } : {}),
        ...(dto.descriptionAr !== undefined ? { descriptionAr: dto.descriptionAr } : {}),
        ...(dto.lat !== undefined ? { lat: dto.lat } : {}),
        ...(dto.lng !== undefined ? { lng: dto.lng } : {}),
        ...(dto.heroImage !== undefined ? { heroImage: dto.heroImage } : {}),
        ...(dto.avgPricePerMeter !== undefined ? { avgPricePerMeter: dto.avgPricePerMeter } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    await this.invalidate();
    return area;
  }

  async remove(id: string): Promise<{ id: string; deleted: true }> {
    await this.ensureExists(id);

    const compounds = await this.prisma.compound.count({ where: { areaId: id } });
    if (compounds > 0) {
      await this.prisma.area.update({ where: { id }, data: { isActive: false } });
    } else {
      await this.prisma.area.delete({ where: { id } });
    }

    await this.invalidate();
    return { id, deleted: true };
  }

  /** Recomputes `propertyCount` — called after listing writes and by the seeder. */
  async syncPropertyCount(areaId: string): Promise<void> {
    const propertyCount = await this.prisma.propertyIndex.count({
      where: { areaId, deletedAt: null },
    });
    await this.prisma.area.update({ where: { id: areaId }, data: { propertyCount } });
    await this.invalidate();
  }

  private async ensureExists(id: string): Promise<void> {
    if ((await this.prisma.area.count({ where: { id } })) === 0) {
      throw AppException.notFound(`Area "${id}" was not found`, ERROR_CODES.AREA_NOT_FOUND);
    }
  }

  private async invalidate(): Promise<void> {
    await this.cache.delByPattern(cacheKeys.listPattern());
  }
}
