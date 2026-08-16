import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../constants';

/**
 * CONTRACT §4 pagination query params:
 * `page` (1-based, default 1), `limit` (default 20, max 100),
 * `sort` (e.g. `-price`, `createdAt`).
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: DEFAULT_PAGE, description: '1-based page number' })
  @Type(() => Number)
  @IsInt({ message: 'page must be an integer' })
  @Min(1, { message: 'page must be 1 or greater' })
  @IsOptional()
  page: number = DEFAULT_PAGE;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
    default: DEFAULT_PAGE_SIZE,
    description: `Items per page (max ${MAX_PAGE_SIZE})`,
  })
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer' })
  @Min(1, { message: 'limit must be 1 or greater' })
  @Max(MAX_PAGE_SIZE, { message: `limit must not exceed ${MAX_PAGE_SIZE}` })
  @IsOptional()
  limit: number = DEFAULT_PAGE_SIZE;

  @ApiPropertyOptional({
    description: 'Sort field, prefix with `-` for descending (e.g. `-price`, `createdAt`)',
    example: '-price',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/^-?[A-Za-z][A-Za-z0-9_.]*$/, {
    message: 'sort must be a field name, optionally prefixed with "-"',
  })
  @IsOptional()
  sort?: string;

  /** Offset derived from `page`/`limit`. */
  get skip(): number {
    return (this.page - 1) * this.limit;
  }

  /** Alias used by Prisma / Mongo query builders. */
  get take(): number {
    return this.limit;
  }
}
