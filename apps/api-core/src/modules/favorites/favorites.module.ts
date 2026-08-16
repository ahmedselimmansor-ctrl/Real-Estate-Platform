import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Module,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AppException } from '../../common/errors/app.exception';
import { ERROR_CODES } from '../../common/errors/error-codes';
import type { PaginatedResult } from '../../common/types/api-response';
import { paginate } from '../../common/utils/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import type { Property } from '../../mongo/schemas/property.schema';
import { PropertiesModule } from '../properties/properties.module';
import { PropertiesService } from '../properties/properties.service';
import { assertUuid } from '../shared/identifier.util';

export interface FavoriteEntry {
  propertyId: string;
  createdAt: Date;
  property: Property | null;
}

/**
 * Favourites live in Postgres (`favorites`, unique on user+property) while the
 * denormalised counter lives on the Mongo listing. Both are kept in step here.
 */
@Injectable()
export class FavoritesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly properties: PropertiesService,
  ) {}

  async list(userId: string, query: PaginationQueryDto): Promise<PaginatedResult<FavoriteEntry>> {
    const where = { userId };

    const [rows, total] = await Promise.all([
      this.prisma.favorite.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.favorite.count({ where }),
    ]);

    // Hydrate from Mongo; a listing removed since favouriting yields `null`
    // rather than breaking the whole page.
    const entries = await Promise.all(
      rows.map(async (row) => ({
        propertyId: row.propertyId,
        createdAt: row.createdAt,
        property: await this.properties.findOne(row.propertyId).catch(() => null),
      })),
    );

    return paginate(entries, total, query);
  }

  /** Just the ids — what the client store needs to render heart icons. */
  async listIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.favorite.findMany({
      where: { userId },
      select: { propertyId: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => row.propertyId);
  }

  async add(userId: string, propertyId: string): Promise<{ propertyId: string; added: boolean }> {
    const exists = await this.prisma.propertyIndex.count({
      where: { id: propertyId, deletedAt: null },
    });

    if (exists === 0) {
      throw AppException.notFound(
        `Property "${propertyId}" was not found`,
        ERROR_CODES.PROPERTY_NOT_FOUND,
      );
    }

    const already = await this.prisma.favorite.count({ where: { userId, propertyId } });
    if (already > 0) {
      // Idempotent: favouriting twice is not an error the UI should surface.
      return { propertyId, added: false };
    }

    await this.prisma.favorite.create({ data: { userId, propertyId } });
    await this.properties.adjustFavoriteCount(propertyId, 1);

    return { propertyId, added: true };
  }

  async remove(
    userId: string,
    propertyId: string,
  ): Promise<{ propertyId: string; removed: boolean }> {
    const { count } = await this.prisma.favorite.deleteMany({ where: { userId, propertyId } });

    if (count === 0) {
      return { propertyId, removed: false };
    }

    await this.properties.adjustFavoriteCount(propertyId, -1);
    return { propertyId, removed: true };
  }
}

@ApiTags('favorites')
@ApiBearerAuth()
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  @ApiOperation({ summary: 'Your saved listings' })
  list(
    @CurrentUser('id') userId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<FavoriteEntry>> {
    return this.favorites.list(userId, query);
  }

  @Get('ids')
  @ApiOperation({ summary: 'Just the favourited listing ids' })
  ids(@CurrentUser('id') userId: string): Promise<string[]> {
    return this.favorites.listIds(userId);
  }

  @Post(':propertyId')
  @HttpCode(HttpStatus.CREATED)
  @ApiParam({ name: 'propertyId', format: 'uuid' })
  @ApiOperation({ summary: 'Save a listing (idempotent)' })
  add(
    @CurrentUser('id') userId: string,
    @Param('propertyId') propertyId: string,
  ): Promise<{ propertyId: string; added: boolean }> {
    return this.favorites.add(userId, assertUuid(propertyId, 'propertyId'));
  }

  @Delete(':propertyId')
  @ApiParam({ name: 'propertyId', format: 'uuid' })
  @ApiOperation({ summary: 'Remove a saved listing (idempotent)' })
  remove(
    @CurrentUser('id') userId: string,
    @Param('propertyId') propertyId: string,
  ): Promise<{ propertyId: string; removed: boolean }> {
    return this.favorites.remove(userId, assertUuid(propertyId, 'propertyId'));
  }
}

@Module({
  imports: [PropertiesModule],
  controllers: [FavoritesController],
  providers: [FavoritesService],
  exports: [FavoritesService],
})
export class FavoritesModule {}
