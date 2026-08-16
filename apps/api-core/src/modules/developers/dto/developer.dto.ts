import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
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

export class ListDevelopersDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Free-text match on the developer name' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  q?: string;

  @ApiPropertyOptional({ description: 'Only developers flagged as featured' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isFeatured?: boolean;
}

export class CreateDeveloperDto {
  @ApiPropertyOptional({ example: 'Palm Hills Developments' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Developer name is required' })
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ example: 'بالم هيلز للتطوير' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Arabic name is required' })
  @MaxLength(160)
  nameAr!: string;

  @ApiPropertyOptional({ description: 'Overrides the slug generated from `name`' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'logoUrl must be a valid URL' })
  logoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'coverUrl must be a valid URL' })
  coverUrl?: string;

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

  @ApiPropertyOptional({ example: 1997, minimum: 1800 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1800)
  @Max(2100)
  foundedYear?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'website must be a valid URL' })
  website?: string;

  @ApiPropertyOptional({ example: '+20226180000' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateDeveloperDto extends PartialType(CreateDeveloperDto) {}
