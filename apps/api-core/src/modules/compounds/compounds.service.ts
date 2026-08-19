import { Injectable } from '@nestjs/common';
import type { Amenity, Area, Compound, Developer, PaymentPlan, Prisma } from '@prisma/client';

import { AppException } from '../../common/errors/app.exception';
import { ERROR_CODES } from '../../common/errors/error-codes';
import type { PaginatedResult } from '../../common/types/api-response';
import { paginate, parseSort, toPrismaOrderBy } from '../../common/utils/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';
import { CACHE_TTL, cacheKeys } from '../../redis/cache-keys';
import { DevelopersService } from '../developers/developers.service';
import { isUuid } from '../shared/identifier.util';
import { buildUniqueSlug } from '../shared/slug.util';
import type { CreateCompoundDto, ListCompoundsDto, UpdateCompoundDto } from './dto/compound.dto';

const SORTABLE = ['name', 'startingPrice', 'deliveryYear', 'createdAt'] as const;

/** What the compound cards on the listing page need. */
export type CompoundListItem = Compound & {
  developer: Pick<Developer, 'id' | 'slug' | 'name' | 'nameAr' | 'logoUrl'>;
  area: Pick<Area, 'id' | 'slug' | 'nameEn' | 'nameAr' | 'city'>;
};

export type CompoundDetail = CompoundListItem & {
  amenities: Amenity[];
  paymentPlans: PaymentPlan[];
  propertyCount: number;
  priceRange: { min: number; max: number } | null;
};

// `nameAr` travels with the ref so the Arabic UI can name the developer
// without a second request.
const DEVELOPER_SELECT = {
  id: true,
  slug: true,
  name: true,
  nameAr: true,
  logoUrl: true,
} as const;
const AREA_SELECT = { id: true, slug: true, nameEn: true, nameAr: true, city: true } as const;

@Injectable()
export class CompoundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly developers: DevelopersService,
  ) {}

  async list(query: ListCompoundsDto): Promise<PaginatedResult<CompoundListItem>> {
    const key = cacheKeys.list({ entity: 'compounds', ...query });

    return this.cache.wrap(key, CACHE_TTL.list, async () => {
      const where: Prisma.CompoundWhereInput = {
        isActive: true,
        ...(query.developerId ? { developerId: query.developerId } : {}),
        ...(query.areaId ? { areaId: query.areaId } : {}),
        ...(query.isFeatured !== undefined ? { isFeatured: query.isFeatured } : {}),
        ...(query.unitTypes?.length ? { unitTypes: { hasSome: query.unitTypes } } : {}),
        ...(query.minPrice !== undefined || query.maxPrice !== undefined
          ? {
              startingPrice: {
                ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
                ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
              },
            }
          : {}),
        ...(query.q
          ? {
              OR: [
                { name: { contains: query.q, mode: 'insensitive' } },
                { nameAr: { contains: query.q } },
              ],
            }
          : {}),
      };

      const sort = parseSort(query.sort, SORTABLE, { field: 'name', direction: 'asc' });

      const [data, total] = await Promise.all([
        this.prisma.compound.findMany({
          where,
          orderBy: toPrismaOrderBy(sort),
          skip: query.skip,
          take: query.take,
          include: {
            developer: { select: DEVELOPER_SELECT },
            area: { select: AREA_SELECT },
          },
        }),
        this.prisma.compound.count({ where }),
      ]);

      return paginate(data, total, query);
    });
  }

  async findOne(idOrSlug: string): Promise<CompoundDetail> {
    const compound = await this.prisma.compound.findFirst({
      where: isUuid(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug },
      include: {
        developer: { select: DEVELOPER_SELECT },
        area: { select: AREA_SELECT },
        amenities: { include: { amenity: true } },
        paymentPlans: { orderBy: [{ isDefault: 'desc' }, { installmentYears: 'asc' }] },
      },
    });

    if (!compound) {
      throw AppException.notFound(
        `Compound "${idOrSlug}" was not found`,
        ERROR_CODES.COMPOUND_NOT_FOUND,
      );
    }

    const [propertyCount, prices] = await Promise.all([
      this.prisma.propertyIndex.count({ where: { compoundId: compound.id, deletedAt: null } }),
      this.prisma.propertyIndex.aggregate({
        where: { compoundId: compound.id, deletedAt: null },
        _min: { priceMin: true },
        _max: { priceMin: true },
      }),
    ]);

    const { amenities, ...rest } = compound;

    return {
      ...rest,
      amenities: amenities.map((link) => link.amenity),
      propertyCount,
      priceRange:
        prices._min.priceMin !== null && prices._max.priceMin !== null
          ? { min: prices._min.priceMin, max: prices._max.priceMin }
          : null,
    };
  }

  async create(dto: CreateCompoundDto): Promise<CompoundDetail> {
    await this.assertRelationsExist(dto.developerId, dto.areaId);

    const slug = await buildUniqueSlug(
      dto.slug ?? dto.name,
      async (candidate) => (await this.prisma.compound.count({ where: { slug: candidate } })) > 0,
      'compound',
    );

    const created = await this.prisma.compound.create({
      data: {
        slug,
        name: dto.name,
        nameAr: dto.nameAr,
        developerId: dto.developerId,
        areaId: dto.areaId,
        descriptionEn: dto.descriptionEn ?? null,
        descriptionAr: dto.descriptionAr ?? null,
        startingPrice: dto.startingPrice ?? null,
        maxPrice: dto.maxPrice ?? null,
        minAreaSqm: dto.minAreaSqm ?? null,
        maxAreaSqm: dto.maxAreaSqm ?? null,
        deliveryYear: dto.deliveryYear ?? null,
        installmentYears: dto.installmentYears ?? null,
        downPaymentPercent: dto.downPaymentPercent ?? null,
        images: dto.images ?? [],
        masterPlanUrl: dto.masterPlanUrl ?? null,
        lat: dto.lat,
        lng: dto.lng,
        unitTypes: dto.unitTypes ?? [],
        isFeatured: dto.isFeatured ?? false,
        isActive: dto.isActive ?? true,
        ...(dto.amenityIds?.length
          ? {
              amenities: {
                create: dto.amenityIds.map((amenityId) => ({ amenityId })),
              },
            }
          : {}),
      },
    });

    await this.developers.syncProjectsCount(dto.developerId);
    await this.invalidate();

    return this.findOne(created.id);
  }

  async update(id: string, dto: UpdateCompoundDto): Promise<CompoundDetail> {
    const existing = await this.prisma.compound.findUnique({
      where: { id },
      select: { id: true, developerId: true },
    });

    if (!existing) {
      throw AppException.notFound(`Compound "${id}" was not found`, ERROR_CODES.COMPOUND_NOT_FOUND);
    }

    if (dto.developerId || dto.areaId) {
      await this.assertRelationsExist(dto.developerId, dto.areaId);
    }

    const slug =
      dto.slug !== undefined || dto.name !== undefined
        ? await buildUniqueSlug(
            dto.slug ?? dto.name!,
            async (candidate) =>
              (await this.prisma.compound.count({ where: { slug: candidate, NOT: { id } } })) > 0,
            'compound',
          )
        : undefined;

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.compound.update({
        where: { id },
        data: {
          ...(slug ? { slug } : {}),
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
          ...(dto.developerId !== undefined ? { developerId: dto.developerId } : {}),
          ...(dto.areaId !== undefined ? { areaId: dto.areaId } : {}),
          ...(dto.descriptionEn !== undefined ? { descriptionEn: dto.descriptionEn } : {}),
          ...(dto.descriptionAr !== undefined ? { descriptionAr: dto.descriptionAr } : {}),
          ...(dto.startingPrice !== undefined ? { startingPrice: dto.startingPrice } : {}),
          ...(dto.maxPrice !== undefined ? { maxPrice: dto.maxPrice } : {}),
          ...(dto.minAreaSqm !== undefined ? { minAreaSqm: dto.minAreaSqm } : {}),
          ...(dto.maxAreaSqm !== undefined ? { maxAreaSqm: dto.maxAreaSqm } : {}),
          ...(dto.deliveryYear !== undefined ? { deliveryYear: dto.deliveryYear } : {}),
          ...(dto.installmentYears !== undefined ? { installmentYears: dto.installmentYears } : {}),
          ...(dto.downPaymentPercent !== undefined
            ? { downPaymentPercent: dto.downPaymentPercent }
            : {}),
          ...(dto.images !== undefined ? { images: dto.images } : {}),
          ...(dto.masterPlanUrl !== undefined ? { masterPlanUrl: dto.masterPlanUrl } : {}),
          ...(dto.lat !== undefined ? { lat: dto.lat } : {}),
          ...(dto.lng !== undefined ? { lng: dto.lng } : {}),
          ...(dto.unitTypes !== undefined ? { unitTypes: dto.unitTypes } : {}),
          ...(dto.isFeatured !== undefined ? { isFeatured: dto.isFeatured } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });

      // Amenities are replaced wholesale — a PATCH that supplies the array is
      // stating the full desired set.
      if (dto.amenityIds !== undefined) {
        await tx.compoundAmenity.deleteMany({ where: { compoundId: id } });
        if (dto.amenityIds.length > 0) {
          await tx.compoundAmenity.createMany({
            data: dto.amenityIds.map((amenityId) => ({ compoundId: id, amenityId })),
            skipDuplicates: true,
          });
        }
      }
    });

    await this.developers.syncProjectsCount(dto.developerId ?? existing.developerId);
    if (dto.developerId && dto.developerId !== existing.developerId) {
      await this.developers.syncProjectsCount(existing.developerId);
    }
    await this.invalidate();

    return this.findOne(id);
  }

  async remove(id: string): Promise<{ id: string; deleted: true }> {
    const existing = await this.prisma.compound.findUnique({
      where: { id },
      select: { id: true, developerId: true },
    });

    if (!existing) {
      throw AppException.notFound(`Compound "${id}" was not found`, ERROR_CODES.COMPOUND_NOT_FOUND);
    }

    const listings = await this.prisma.propertyIndex.count({
      where: { compoundId: id, deletedAt: null },
    });

    if (listings > 0) {
      // Listings still point here; deactivate so the catalogue stays consistent.
      await this.prisma.compound.update({ where: { id }, data: { isActive: false } });
    } else {
      await this.prisma.compound.delete({ where: { id } });
    }

    await this.developers.syncProjectsCount(existing.developerId);
    await this.invalidate();

    return { id, deleted: true };
  }

  private async assertRelationsExist(developerId?: string, areaId?: string): Promise<void> {
    if (developerId) {
      const developer = await this.prisma.developer.count({ where: { id: developerId } });
      if (developer === 0) {
        throw AppException.badRequest(
          `Developer "${developerId}" does not exist`,
          ERROR_CODES.RELATED_RESOURCE_NOT_FOUND,
          [{ field: 'developerId', message: 'unknown developer', rule: 'exists' }],
        );
      }
    }

    if (areaId) {
      const area = await this.prisma.area.count({ where: { id: areaId } });
      if (area === 0) {
        throw AppException.badRequest(
          `Area "${areaId}" does not exist`,
          ERROR_CODES.RELATED_RESOURCE_NOT_FOUND,
          [{ field: 'areaId', message: 'unknown area', rule: 'exists' }],
        );
      }
    }
  }

  private async invalidate(): Promise<void> {
    await this.cache.delByPattern(cacheKeys.listPattern());
  }
}
