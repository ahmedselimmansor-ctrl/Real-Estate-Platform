import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { PROPERTY_TYPES } from '../../../common/enums';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return value;
};

/** `?unitTypes=villa&unitTypes=townhouse` and `?unitTypes=villa,townhouse` both work. */
const toArray = ({ value }: { value: unknown }): unknown => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return value;
};

export class ListCompoundsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Free-text match on the compound name' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  q?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID(undefined, { message: 'developerId must be a UUID' })
  developerId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID(undefined, { message: 'areaId must be a UUID' })
  areaId?: string;

  @ApiPropertyOptional({ example: 5000000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ example: 30000000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ enum: PROPERTY_TYPES, isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsIn(PROPERTY_TYPES as unknown as string[], { each: true })
  unitTypes?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isFeatured?: boolean;
}

export class CreateCompoundDto {
  @ApiPropertyOptional({ example: 'Palm Hills New Cairo' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Compound name is required' })
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ example: 'بالم هيلز القاهرة الجديدة' })
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

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID(undefined, { message: 'developerId must be a UUID' })
  developerId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID(undefined, { message: 'areaId must be a UUID' })
  areaId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(6000)
  descriptionEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(6000)
  descriptionAr?: string;

  @ApiPropertyOptional({ example: 6500000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  startingPrice?: number;

  @ApiPropertyOptional({ example: 48000000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ example: 120 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minAreaSqm?: number;

  @ApiPropertyOptional({ example: 480 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxAreaSqm?: number;

  @ApiPropertyOptional({ example: 2027 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  deliveryYear?: number;

  @ApiPropertyOptional({ example: 8 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(30)
  installmentYears?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  downPaymentPercent?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(20)
  @IsUrl({ require_tld: false }, { each: true, message: 'each image must be a valid URL' })
  images?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'masterPlanUrl must be a valid URL' })
  masterPlanUrl?: string;

  @ApiPropertyOptional({ example: 30.0304 })
  @Type(() => Number)
  @IsLatitude({ message: 'lat must be a valid latitude' })
  lat!: number;

  @ApiPropertyOptional({ example: 31.4913 })
  @Type(() => Number)
  @IsLongitude({ message: 'lng must be a valid longitude' })
  lng!: number;

  @ApiPropertyOptional({ enum: PROPERTY_TYPES, isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsIn(PROPERTY_TYPES as unknown as string[], { each: true })
  unitTypes?: string[];

  @ApiPropertyOptional({ type: [String], format: 'uuid', description: 'Amenity UUIDs' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(40)
  @IsUUID(undefined, { each: true, message: 'each amenityId must be a UUID' })
  amenityIds?: string[];

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

export class UpdateCompoundDto extends PartialType(CreateCompoundDto) {}
