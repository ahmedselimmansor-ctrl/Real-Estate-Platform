import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return value;
};

export class ListAreasDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Free-text match on the area name' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  q?: string;

  @ApiPropertyOptional({ example: 'Cairo' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiPropertyOptional({ example: 'Cairo' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  governorate?: string;
}

export class CreateAreaDto {
  @ApiPropertyOptional({ example: 'New Cairo' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'English name is required' })
  @MaxLength(160)
  nameEn!: string;

  @ApiPropertyOptional({ example: 'القاهرة الجديدة' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Arabic name is required' })
  @MaxLength(160)
  nameAr!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  slug?: string;

  @ApiPropertyOptional({ example: 'Cairo' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'City is required' })
  @MaxLength(120)
  city!: string;

  @ApiPropertyOptional({ example: 'Cairo' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Governorate is required' })
  @MaxLength(120)
  governorate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  descriptionEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  descriptionAr?: string;

  // Required, and now documented as such. `areas.lat` and `areas.lng` are NOT
  // NULL in Postgres and the validator has always enforced them, but these
  // carried @ApiPropertyOptional — so the published spec said they could be
  // omitted, and a client that believed it got a 422 naming a field the
  // documentation called optional.
  @ApiProperty({ example: 30.0304 })
  @Type(() => Number)
  @IsLatitude({ message: 'lat must be a valid latitude' })
  lat!: number;

  @ApiProperty({ example: 31.4913 })
  @Type(() => Number)
  @IsLongitude({ message: 'lng must be a valid longitude' })
  lng!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'heroImage must be a valid URL' })
  heroImage?: string;

  @ApiPropertyOptional({ example: 47222 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  avgPricePerMeter?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAreaDto extends PartialType(CreateAreaDto) {}
