import { Injectable } from '@nestjs/common';
import type { Developer, Prisma } from '@prisma/client';

import { AppException } from '../../common/errors/app.exception';
import { ERROR_CODES } from '../../common/errors/error-codes';
import type { PaginatedResult } from '../../common/types/api-response';
import { paginate, parseSort, toPrismaOrderBy } from '../../common/utils/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';
import { CACHE_TTL, cacheKeys } from '../../redis/cache-keys';
import { buildUniqueSlug } from '../shared/slug.util';
import { isUuid } from '../shared/identifier.util';
import type {
  CreateDeveloperDto,
  ListDevelopersDto,
  UpdateDeveloperDto,
} from './dto/developer.dto';

const SORTABLE = ['name', 'createdAt', 'projectsCount', 'foundedYear'] as const;

export interface DeveloperDetail extends Developer {
  compoundCount: number;
  propertyCount: number;
}

@Injectable()
export class DevelopersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async list(query: ListDevelopersDto): Promise<PaginatedResult<Developer>> {
    const key = cacheKeys.list({ entity: 'developers', ...query });

    return this.cache.wrap(key, CACHE_TTL.list, async () => {
      const where: Prisma.DeveloperWhereInput = {
        isActive: true,
        ...(query.isFeatured !== undefined ? { isFeatured: query.isFeatured } : {}),
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
        this.prisma.developer.findMany({
          where,
          orderBy: toPrismaOrderBy(sort),
          skip: query.skip,
          take: query.take,
        }),
        this.prisma.developer.count({ where }),
      ]);

      return paginate(data, total, query);
    });
  }

  /** Resolves by UUID or slug (CONTRACT §6 `:idOrSlug`). */
  async findOne(idOrSlug: string): Promise<DeveloperDetail> {
    const developer = await this.prisma.developer.findFirst({
      where: isUuid(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug },
    });

    if (!developer) {
      throw AppException.notFound(
        `Developer "${idOrSlug}" was not found`,
        ERROR_CODES.DEVELOPER_NOT_FOUND,
      );
    }

    const [compoundCount, propertyCount] = await Promise.all([
      this.prisma.compound.count({ where: { developerId: developer.id, isActive: true } }),
      this.prisma.propertyIndex.count({ where: { developerId: developer.id, deletedAt: null } }),
    ]);

    return { ...developer, compoundCount, propertyCount };
  }

  async create(dto: CreateDeveloperDto): Promise<Developer> {
    const slug = await buildUniqueSlug(
      dto.slug ?? dto.name,
      async (candidate) =>
        (await this.prisma.developer.count({ where: { slug: candidate } })) > 0,
      'developer',
    );

    const developer = await this.prisma.developer.create({
      data: {
        slug,
        name: dto.name,
        nameAr: dto.nameAr,
        logoUrl: dto.logoUrl ?? null,
        coverUrl: dto.coverUrl ?? null,
        descriptionEn: dto.descriptionEn ?? null,
        descriptionAr: dto.descriptionAr ?? null,
        foundedYear: dto.foundedYear ?? null,
        website: dto.website ?? null,
        phone: dto.phone ?? null,
        isFeatured: dto.isFeatured ?? false,
        isActive: dto.isActive ?? true,
      },
    });

    await this.invalidate();
    return developer;
  }

  async update(id: string, dto: UpdateDeveloperDto): Promise<Developer> {
    await this.ensureExists(id);

    const slug =
      dto.slug !== undefined || dto.name !== undefined
        ? await buildUniqueSlug(
            dto.slug ?? dto.name!,
            async (candidate) =>
              (await this.prisma.developer.count({
                where: { slug: candidate, NOT: { id } },
              })) > 0,
            'developer',
          )
        : undefined;

    const developer = await this.prisma.developer.update({
      where: { id },
      data: {
        ...(slug ? { slug } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
        ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl } : {}),
        ...(dto.coverUrl !== undefined ? { coverUrl: dto.coverUrl } : {}),
        ...(dto.descriptionEn !== undefined ? { descriptionEn: dto.descriptionEn } : {}),
        ...(dto.descriptionAr !== undefined ? { descriptionAr: dto.descriptionAr } : {}),
        ...(dto.foundedYear !== undefined ? { foundedYear: dto.foundedYear } : {}),
        ...(dto.website !== undefined ? { website: dto.website } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.isFeatured !== undefined ? { isFeatured: dto.isFeatured } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    await this.invalidate();
    return developer;
  }

  /**
   * Soft delete. Compounds reference developers with `onDelete: Restrict`, so a
   * hard delete would fail anyway once a developer has projects.
   */
  async remove(id: string): Promise<{ id: string; deleted: true }> {
    await this.ensureExists(id);

    const compounds = await this.prisma.compound.count({ where: { developerId: id } });
    if (compounds > 0) {
      await this.prisma.developer.update({ where: { id }, data: { isActive: false } });
    } else {
      await this.prisma.developer.delete({ where: { id } });
    }

    await this.invalidate();
    return { id, deleted: true };
  }

  /** Refreshes the denormalised `projectsCount` after compound changes. */
  async syncProjectsCount(developerId: string): Promise<void> {
    const projectsCount = await this.prisma.compound.count({
      where: { developerId, isActive: true },
    });
    await this.prisma.developer.update({ where: { id: developerId }, data: { projectsCount } });
    await this.invalidate();
  }

  private async ensureExists(id: string): Promise<void> {
    const exists = await this.prisma.developer.count({ where: { id } });
    if (exists === 0) {
      throw AppException.notFound(
        `Developer "${id}" was not found`,
        ERROR_CODES.DEVELOPER_NOT_FOUND,
      );
    }
  }

  private async invalidate(): Promise<void> {
    await this.cache.delByPattern(cacheKeys.listPattern());
  }
}
