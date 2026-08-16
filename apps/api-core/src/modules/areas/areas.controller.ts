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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Area } from '@prisma/client';

import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { PaginatedResult } from '../../common/types/api-response';
import { assertUuid } from '../shared/identifier.util';
import { AreaDetail, AreasService } from './areas.service';
import { CreateAreaDto, ListAreasDto, UpdateAreaDto } from './dto/area.dto';

@ApiTags('areas')
@Controller('areas')
export class AreasController {
  constructor(private readonly areas: AreasService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List areas' })
  list(@Query() query: ListAreasDto): Promise<PaginatedResult<Area>> {
    return this.areas.list(query);
  }

  @Public()
  @Get(':idOrSlug')
  @ApiParam({ name: 'idOrSlug', example: 'new-cairo' })
  @ApiOperation({ summary: 'Area detail with compound counts and price range' })
  findOne(@Param('idOrSlug') idOrSlug: string): Promise<AreaDetail> {
    return this.areas.findOne(idOrSlug);
  }

  @Roles('admin')
  @ApiBearerAuth()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an area' })
  create(@Body() dto: CreateAreaDto): Promise<Area> {
    return this.areas.create(dto);
  }

  @Roles('admin')
  @ApiBearerAuth()
  @Patch(':id')
  @ApiOperation({ summary: 'Update an area' })
  update(@Param('id') id: string, @Body() dto: UpdateAreaDto): Promise<Area> {
    return this.areas.update(assertUuid(id), dto);
  }

  @Roles('admin')
  @ApiBearerAuth()
  @Delete(':id')
  @ApiOperation({
    summary: 'Delete an area',
    description: 'Areas with compounds are deactivated rather than removed.',
  })
  remove(@Param('id') id: string): Promise<{ id: string; deleted: true }> {
    return this.areas.remove(assertUuid(id));
  }
}
