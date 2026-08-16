import { Controller, Get, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import type { AuditLog } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import type { PaginatedResult } from '../../common/types/api-response';
import { AdminService, type AdminStats } from './admin.service';
import { AuditService } from './audit.service';

class ListActivityDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'property.updated' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(80)
  action?: string;

  @ApiPropertyOptional({ example: 'property' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(60)
  entityType?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  userId?: string;
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly audit: AuditService,
  ) {}

  @Get('stats')
  @ApiOperation({
    summary: 'Dashboard KPIs',
    description:
      'Portfolio value, listing/user/lead counts, engagement totals, top areas and developers, ' +
      'and a 12-month listings-vs-leads series. Cached for 60 seconds.',
  })
  stats(): Promise<AdminStats> {
    return this.admin.stats();
  }

  @Get('activity')
  @ApiOperation({ summary: 'Audit trail of administrative mutations' })
  activity(@Query() query: ListActivityDto): Promise<PaginatedResult<AuditLog>> {
    return this.audit.list(query);
  }
}

@Module({
  controllers: [AdminController],
  providers: [AdminService, AuditService],
  exports: [AdminService, AuditService],
})
export class AdminModule {}
