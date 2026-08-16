import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { PaginatedResult } from '../../common/types/api-response';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type { Property } from '../../mongo/schemas/property.schema';
import { assertUuid } from '../shared/identifier.util';
import {
  CreatePropertyDto,
  ListPropertiesDto,
  UpdatePropertyDto,
} from './dto/property.dto';
import { PropertiesService } from './properties.service';

@ApiTags('properties')
@Controller('properties')
export class PropertiesController {
  constructor(private readonly properties: PropertiesService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'List properties',
    description:
      'Basic filters only. Full-text relevance, facets, geo radius and amenity filtering live on `GET /api/search`.',
  })
  list(@Query() query: ListPropertiesDto): Promise<PaginatedResult<Property>> {
    return this.properties.list(query);
  }

  @Public()
  @Get(':idOrSlug')
  @ApiParam({
    name: 'idOrSlug',
    description: 'Listing UUID, Mongo ObjectId or slug',
    example: 'palm-hills-new-cairo-3br-apartment-a12',
  })
  @ApiOperation({ summary: 'Full listing document' })
  findOne(@Param('idOrSlug') idOrSlug: string): Promise<Property> {
    return this.properties.findOne(idOrSlug);
  }

  @Public()
  @Get(':idOrSlug/similar')
  @ApiQuery({ name: 'limit', required: false, example: 8 })
  @ApiOperation({ summary: 'Comparable listings nearby and in the same price band' })
  similar(
    @Param('idOrSlug') idOrSlug: string,
    @Query('limit') limit?: string,
  ): Promise<Property[]> {
    const parsed = Number.parseInt(limit ?? '8', 10);
    return this.properties.similar(idOrSlug, Math.min(24, Math.max(1, parsed || 8)));
  }

  @Public()
  @Throttle({ views: { limit: 60, ttl: 60_000 } })
  @Post(':idOrSlug/view')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Record a listing view',
    description: 'De-duplicated per viewer for 30 minutes. Always returns 202.',
  })
  recordView(
    @Param('idOrSlug') idOrSlug: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Req() req: Request,
  ): Promise<{ counted: boolean }> {
    return this.properties.recordView(idOrSlug, {
      userId: user?.id,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
      referrer: req.get('referer') ?? undefined,
    });
  }

  @Roles('agent', 'admin')
  @ApiBearerAuth()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a listing (MongoDB + relational mirror)' })
  create(@Body() dto: CreatePropertyDto): Promise<Property> {
    return this.properties.create(dto);
  }

  @Roles('agent', 'admin')
  @ApiBearerAuth()
  @Patch(':id')
  @ApiParam({ name: 'id', description: 'Listing UUID', format: 'uuid' })
  @ApiOperation({ summary: 'Update a listing' })
  update(@Param('id') id: string, @Body() dto: UpdatePropertyDto): Promise<Property> {
    return this.properties.update(assertUuid(id), dto);
  }

  @Roles('admin')
  @ApiBearerAuth()
  @Delete(':id')
  @ApiParam({ name: 'id', description: 'Listing UUID', format: 'uuid' })
  @ApiOperation({ summary: 'Soft-delete a listing and drop it from the search index' })
  remove(@Param('id') id: string): Promise<{ id: string; deleted: true }> {
    return this.properties.remove(assertUuid(id));
  }
}
