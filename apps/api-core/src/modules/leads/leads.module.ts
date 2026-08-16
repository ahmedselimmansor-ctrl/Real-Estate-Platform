import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Module,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { LeadStatusValue } from '../../common/enums';
import type { PaginatedResult } from '../../common/types/api-response';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PropertiesModule } from '../properties/properties.module';
import { assertUuid } from '../shared/identifier.util';
import { CreateLeadDto, ListLeadsDto, UpdateLeadDto } from './dto/lead.dto';
import { LeadRecord, LeadsService } from './leads.service';

@ApiTags('leads')
@Controller('leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Public()
  @Throttle({ leads: { limit: 5, ttl: 60_000 } })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Submit an enquiry',
    description:
      'Public and rate limited. Requests that fill the `company` honeypot are accepted and dropped.',
  })
  create(
    @Body() dto: CreateLeadDto,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ): Promise<{ id: string | null; received: true }> {
    return this.leads.create(dto, { userId: user?.id });
  }

  @Roles('agent', 'admin')
  @ApiBearerAuth()
  @Get()
  @ApiOperation({ summary: 'List enquiries' })
  list(@Query() query: ListLeadsDto): Promise<PaginatedResult<LeadRecord>> {
    return this.leads.list(query);
  }

  @Roles('agent', 'admin')
  @ApiBearerAuth()
  @Get('status-counts')
  @ApiOperation({ summary: 'Lead counts per status for the pipeline board' })
  statusCounts(): Promise<Record<LeadStatusValue, number>> {
    return this.leads.statusCounts();
  }

  @Roles('agent', 'admin')
  @ApiBearerAuth()
  @Get(':id')
  @ApiOperation({ summary: 'Enquiry detail' })
  findOne(@Param('id') id: string): Promise<LeadRecord> {
    return this.leads.findOne(assertUuid(id));
  }

  @Roles('agent', 'admin')
  @ApiBearerAuth()
  @Patch(':id')
  @ApiOperation({
    summary: 'Update an enquiry',
    description: 'Status changes are validated against the pipeline transitions.',
  })
  update(@Param('id') id: string, @Body() dto: UpdateLeadDto): Promise<LeadRecord> {
    return this.leads.update(assertUuid(id), dto);
  }

  @Roles('admin')
  @ApiBearerAuth()
  @Delete(':id')
  @ApiOperation({ summary: 'Delete an enquiry' })
  remove(@Param('id') id: string): Promise<{ id: string; deleted: true }> {
    return this.leads.remove(assertUuid(id));
  }
}

@Module({
  imports: [PropertiesModule],
  controllers: [LeadsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
