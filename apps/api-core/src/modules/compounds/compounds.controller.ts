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

import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { PaginatedResult } from '../../common/types/api-response';
import { assertUuid } from '../shared/identifier.util';
import {
  CompoundDetail,
  CompoundListItem,
  CompoundsService,
} from './compounds.service';
import { CreateCompoundDto, ListCompoundsDto, UpdateCompoundDto } from './dto/compound.dto';

@ApiTags('compounds')
@Controller('compounds')
export class CompoundsController {
  constructor(private readonly compounds: CompoundsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List compounds with their developer and area' })
  list(@Query() query: ListCompoundsDto): Promise<PaginatedResult<CompoundListItem>> {
    return this.compounds.list(query);
  }

  @Public()
  @Get(':idOrSlug')
  @ApiParam({ name: 'idOrSlug', example: 'palm-hills-new-cairo' })
  @ApiOperation({ summary: 'Compound detail with amenities, payment plans and price range' })
  findOne(@Param('idOrSlug') idOrSlug: string): Promise<CompoundDetail> {
    return this.compounds.findOne(idOrSlug);
  }

  @Roles('admin')
  @ApiBearerAuth()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a compound' })
  create(@Body() dto: CreateCompoundDto): Promise<CompoundDetail> {
    return this.compounds.create(dto);
  }

  @Roles('admin')
  @ApiBearerAuth()
  @Patch(':id')
  @ApiOperation({
    summary: 'Update a compound',
    description: 'Supplying `amenityIds` replaces the entire amenity set.',
  })
  update(@Param('id') id: string, @Body() dto: UpdateCompoundDto): Promise<CompoundDetail> {
    return this.compounds.update(assertUuid(id), dto);
  }

  @Roles('admin')
  @ApiBearerAuth()
  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a compound',
    description: 'Compounds with live listings are deactivated rather than removed.',
  })
  remove(@Param('id') id: string): Promise<{ id: string; deleted: true }> {
    return this.compounds.remove(assertUuid(id));
  }
}
