import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import type { Amenity } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';
import { CACHE_TTL, cacheKeys } from '../../redis/cache-keys';

class ListAmenitiesDto {
  @ApiPropertyOptional({
    description: 'Filter by category',
    enum: ['lifestyle', 'security', 'wellness', 'family', 'services'],
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(60)
  category?: string;
}

export interface AmenityGroup {
  category: string;
  amenities: Amenity[];
}

/**
 * Amenities are a small, near-static reference set consumed by the filter
 * sidebar, so the whole list is returned unpaginated (CONTRACT §6 has no
 * pagination on `GET /amenities`) and cached aggressively.
 */
@Injectable()
export class AmenitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async list(category?: string): Promise<Amenity[]> {
    return this.cache.wrap(
      cacheKeys.list({ entity: 'amenities', category: category ?? null }),
      CACHE_TTL.list,
      () =>
        this.prisma.amenity.findMany({
          where: category ? { category } : undefined,
          orderBy: [{ category: 'asc' }, { nameEn: 'asc' }],
        }),
    );
  }

  /** The same set grouped by category — what the UI actually renders. */
  async grouped(): Promise<AmenityGroup[]> {
    const amenities = await this.list();
    const byCategory = new Map<string, Amenity[]>();

    for (const amenity of amenities) {
      const bucket = byCategory.get(amenity.category);
      if (bucket) {
        bucket.push(amenity);
      } else {
        byCategory.set(amenity.category, [amenity]);
      }
    }

    return [...byCategory.entries()].map(([category, items]) => ({
      category,
      amenities: items,
    }));
  }
}

@ApiTags('amenities')
@Controller('amenities')
export class AmenitiesController {
  constructor(private readonly amenities: AmenitiesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'All amenities, optionally filtered by category' })
  list(@Query() query: ListAmenitiesDto): Promise<Amenity[]> {
    return this.amenities.list(query.category);
  }

  @Public()
  @Get('grouped')
  @ApiOperation({ summary: 'Amenities grouped by category for the filter sidebar' })
  grouped(): Promise<AmenityGroup[]> {
    return this.amenities.grouped();
  }
}

@Module({
  controllers: [AmenitiesController],
  providers: [AmenitiesService],
  exports: [AmenitiesService],
})
export class AmenitiesModule {}
