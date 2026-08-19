import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Module,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import type { Prisma, SavedSearch } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AppException } from '../../common/errors/app.exception';
import { ERROR_CODES } from '../../common/errors/error-codes';
import type { PaginatedResult } from '../../common/types/api-response';
import { paginate } from '../../common/utils/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { assertUuid } from '../shared/identifier.util';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** A user may not hoard unlimited alert subscriptions. */
const MAX_SAVED_SEARCHES = 50;

export class CreateSavedSearchDto {
  @ApiPropertyOptional({ example: '3-bed apartments in New Cairo under 12M' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({
    description: 'The search-svc query params to replay',
    example: { propertyType: ['apartment'], bedrooms: [3], areaId: ['…'], maxPrice: 12000000 },
  })
  @IsObject({ message: 'criteria must be an object' })
  criteria!: Record<string, unknown>;

  @ApiPropertyOptional({ default: false, description: 'Email when new matches appear' })
  @IsOptional()
  @IsBoolean()
  alertEnabled?: boolean;
}

export class UpdateSavedSearchDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  criteria?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  alertEnabled?: boolean;
}

@Injectable()
export class SavedSearchesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, query: PaginationQueryDto): Promise<PaginatedResult<SavedSearch>> {
    const where = { userId };

    const [data, total] = await Promise.all([
      this.prisma.savedSearch.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.savedSearch.count({ where }),
    ]);

    return paginate(data, total, query);
  }

  async create(userId: string, dto: CreateSavedSearchDto): Promise<SavedSearch> {
    const count = await this.prisma.savedSearch.count({ where: { userId } });

    if (count >= MAX_SAVED_SEARCHES) {
      throw AppException.badRequest(
        `You can save at most ${MAX_SAVED_SEARCHES} searches — delete one first`,
        ERROR_CODES.BAD_REQUEST,
      );
    }

    return this.prisma.savedSearch.create({
      data: {
        userId,
        name: dto.name,
        criteria: dto.criteria as Prisma.InputJsonValue,
        alertEnabled: dto.alertEnabled ?? false,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateSavedSearchDto): Promise<SavedSearch> {
    await this.ensureOwned(userId, id);

    return this.prisma.savedSearch.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.criteria !== undefined ? { criteria: dto.criteria as Prisma.InputJsonValue } : {}),
        ...(dto.alertEnabled !== undefined ? { alertEnabled: dto.alertEnabled } : {}),
      },
    });
  }

  async remove(userId: string, id: string): Promise<{ id: string; deleted: true }> {
    await this.ensureOwned(userId, id);
    await this.prisma.savedSearch.delete({ where: { id } });
    return { id, deleted: true };
  }

  /** 404 rather than 403 for someone else's search — do not confirm it exists. */
  private async ensureOwned(userId: string, id: string): Promise<void> {
    const owned = await this.prisma.savedSearch.count({ where: { id, userId } });
    if (owned === 0) {
      throw AppException.notFound(
        `Saved search "${id}" was not found`,
        ERROR_CODES.SAVED_SEARCH_NOT_FOUND,
      );
    }
  }
}

@ApiTags('saved-searches')
@ApiBearerAuth()
@Controller('saved-searches')
export class SavedSearchesController {
  constructor(private readonly savedSearches: SavedSearchesService) {}

  @Get()
  @ApiOperation({ summary: 'Your saved searches' })
  list(
    @CurrentUser('id') userId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<SavedSearch>> {
    return this.savedSearches.list(userId, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Save a filter set, optionally with alerts' })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateSavedSearchDto,
  ): Promise<SavedSearch> {
    return this.savedSearches.create(userId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename a saved search or toggle its alert' })
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSavedSearchDto,
  ): Promise<SavedSearch> {
    return this.savedSearches.update(userId, assertUuid(id), dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a saved search' })
  remove(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<{ id: string; deleted: true }> {
    return this.savedSearches.remove(userId, assertUuid(id));
  }
}

@Module({
  controllers: [SavedSearchesController],
  providers: [SavedSearchesService],
  exports: [SavedSearchesService],
})
export class SavedSearchesModule {}
