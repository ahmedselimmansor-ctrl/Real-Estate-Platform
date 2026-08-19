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
import type { Developer } from '@prisma/client';

import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { PaginatedResult } from '../../common/types/api-response';
import { assertUuid } from '../shared/identifier.util';
import { DeveloperDetail, DevelopersService } from './developers.service';
import { CreateDeveloperDto, ListDevelopersDto, UpdateDeveloperDto } from './dto/developer.dto';

@ApiTags('developers')
@Controller('developers')
export class DevelopersController {
  constructor(private readonly developers: DevelopersService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List developers' })
  list(@Query() query: ListDevelopersDto): Promise<PaginatedResult<Developer>> {
    return this.developers.list(query);
  }

  @Public()
  @Get(':idOrSlug')
  @ApiParam({ name: 'idOrSlug', example: 'palm-hills' })
  @ApiOperation({ summary: 'Developer detail with project and listing counts' })
  findOne(@Param('idOrSlug') idOrSlug: string): Promise<DeveloperDetail> {
    return this.developers.findOne(idOrSlug);
  }

  @Roles('admin')
  @ApiBearerAuth()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a developer' })
  create(@Body() dto: CreateDeveloperDto): Promise<Developer> {
    return this.developers.create(dto);
  }

  @Roles('admin')
  @ApiBearerAuth()
  @Patch(':id')
  @ApiOperation({ summary: 'Update a developer' })
  update(@Param('id') id: string, @Body() dto: UpdateDeveloperDto): Promise<Developer> {
    return this.developers.update(assertUuid(id), dto);
  }

  @Roles('admin')
  @ApiBearerAuth()
  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a developer',
    description: 'Developers with compounds are deactivated rather than removed.',
  })
  remove(@Param('id') id: string): Promise<{ id: string; deleted: true }> {
    return this.developers.remove(assertUuid(id));
  }
}
