import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import {
  FINISHING_TYPES,
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  SALE_TYPES,
} from '../../../common/enums';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return value;
};

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

// ------------------------------------------------------------------ querying

/**
 * Basic filters only — anything richer (facets, geo radius, relevance ranking,
 * amenities) belongs to `search-svc` per CONTRACT §1.
 */
export class ListPropertiesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PROPERTY_TYPES, isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsIn(PROPERTY_TYPES as unknown as string[], { each: true })
  propertyType?: string[];

  @ApiPropertyOptional({ enum: SALE_TYPES })
  @IsOptional()
  @IsIn(SALE_TYPES as unknown as string[])
  saleType?: string;

  @ApiPropertyOptional({ enum: PROPERTY_STATUSES })
  @IsOptional()
  @IsIn(PROPERTY_STATUSES as unknown as string[])
  status?: string;

  @ApiPropertyOptional({ enum: FINISHING_TYPES, isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsIn(FINISHING_TYPES as unknown as string[], { each: true })
  finishing?: string[];

  @ApiPropertyOptional({ example: 2000000 })
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

  @ApiPropertyOptional({ isArray: true, example: [3] })
  @IsOptional()
  @Transform(({ value }) => {
    const list = toArray({ value });
    return Array.isArray(list) ? list.map((entry) => Number(entry)) : list;
  })
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  bedrooms?: number[];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  areaId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  compoundId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  developerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({
    description:
      'Substring match on the reference number, slug or either title. This is for ' +
      'the staff catalogue, where a listing is looked up by the reference printed ' +
      'on a contract — not a replacement for /api/search, which is the analysed ' +
      'index behind the storefront.',
    example: 'TC-1042',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  q?: string;
}

// -------------------------------------------------------------- nested types

export class LocalizedTextDto {
  @ApiProperty({ example: '3 Bedroom Apartment in Palm Hills New Cairo' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'English text is required' })
  @MaxLength(4000)
  en!: string;

  @ApiProperty({ example: 'شقة 3 غرف في بالم هيلز القاهرة الجديدة' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Arabic text is required' })
  @MaxLength(4000)
  ar!: string;
}

export class PriceDto {
  @ApiProperty({ example: 8500000, description: 'EGP, integer' })
  @Type(() => Number)
  @IsInt({ message: 'price.amount must be an integer number of EGP' })
  @Min(0)
  amount!: number;

  @ApiPropertyOptional({ default: 'EGP', enum: ['EGP'] })
  @IsOptional()
  @IsIn(['EGP'])
  currency?: 'EGP';

  @ApiPropertyOptional({
    example: 47222,
    description: 'Derived from amount / specs.areaSqm when omitted',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  pricePerMeter?: number;
}

export class PaymentPlanDto {
  @ApiProperty({ example: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  downPaymentPercent!: number;

  @ApiProperty({ example: 8 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(30)
  installmentYears!: number;

  @ApiPropertyOptional({
    example: 88541,
    description: 'Derived from the price and plan when omitted',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  monthlyInstallment?: number;

  @ApiProperty({ example: '2027-06-30' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'deliveryDate must be YYYY-MM-DD' })
  deliveryDate!: string;
}

export class SpecsDto {
  @ApiProperty({ example: 3 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(50)
  bedrooms!: number;

  @ApiProperty({ example: 3 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(50)
  bathrooms!: number;

  @ApiProperty({ example: 180 })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'specs.areaSqm must be at least 1' })
  areaSqm!: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  gardenSqm?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  floor?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  parkingSpots?: number;
}

export class GeoDto {
  @ApiProperty({ example: 30.0304 })
  @Type(() => Number)
  @IsLatitude({ message: 'lat must be a valid latitude' })
  lat!: number;

  @ApiProperty({ example: 31.4913 })
  @Type(() => Number)
  @IsLongitude({ message: 'lng must be a valid longitude' })
  lng!: number;
}

export class LocationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID(undefined, { message: 'location.areaId must be a UUID' })
  areaId!: string;

  @ApiPropertyOptional({ example: '90th North St.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  address?: string;

  @ApiProperty({ type: GeoDto })
  @ValidateNested()
  @Type(() => GeoDto)
  geo!: GeoDto;
}

export class PropertyImageDto {
  @ApiProperty()
  @IsUrl({ require_tld: false }, { message: 'image url must be valid' })
  url!: string;

  @ApiPropertyOptional({ description: 'S3 object key' })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  key?: string;

  @ApiPropertyOptional({ default: 1600 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  width?: number;

  @ApiPropertyOptional({ default: 900 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  height?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  order?: number;
}

export class FloorPlanDto {
  @ApiProperty()
  @IsUrl({ require_tld: false }, { message: 'floor plan url must be valid' })
  url!: string;

  @ApiPropertyOptional({ example: 'Type A' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  label?: string;
}

export class MediaDto {
  @ApiPropertyOptional({ type: [PropertyImageDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => PropertyImageDto)
  images?: PropertyImageDto[];

  @ApiPropertyOptional({ type: [FloorPlanDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => FloorPlanDto)
  floorPlans?: FloorPlanDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  videoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  tourUrl?: string;
}

// --------------------------------------------------------------- write DTOs

export class CreatePropertyDto {
  @ApiPropertyOptional({ description: 'Generated from `title.en` when omitted' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  slug?: string;

  @ApiPropertyOptional({ description: 'Auto-assigned (TC-####) when omitted' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  referenceNo?: string;

  @ApiProperty({ type: LocalizedTextDto })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  title!: LocalizedTextDto;

  @ApiProperty({ type: LocalizedTextDto })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  description!: LocalizedTextDto;

  @ApiProperty({ enum: PROPERTY_TYPES })
  @IsIn(PROPERTY_TYPES as unknown as string[])
  propertyType!: string;

  @ApiProperty({ enum: SALE_TYPES })
  @IsIn(SALE_TYPES as unknown as string[])
  saleType!: string;

  @ApiPropertyOptional({ enum: PROPERTY_STATUSES, default: 'available' })
  @IsOptional()
  @IsIn(PROPERTY_STATUSES as unknown as string[])
  status?: string;

  @ApiProperty({ enum: FINISHING_TYPES })
  @IsIn(FINISHING_TYPES as unknown as string[])
  finishing!: string;

  @ApiProperty({ type: PriceDto })
  @ValidateNested()
  @Type(() => PriceDto)
  price!: PriceDto;

  @ApiProperty({ type: PaymentPlanDto })
  @ValidateNested()
  @Type(() => PaymentPlanDto)
  paymentPlan!: PaymentPlanDto;

  @ApiProperty({ type: SpecsDto })
  @ValidateNested()
  @Type(() => SpecsDto)
  specs!: SpecsDto;

  @ApiProperty({ type: LocationDto })
  @ValidateNested()
  @Type(() => LocationDto)
  location!: LocationDto;

  @ApiProperty({ format: 'uuid', description: 'Compound this unit belongs to' })
  @IsUUID(undefined, { message: 'compoundId must be a UUID' })
  compoundId!: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Amenity slugs (e.g. `pool`, `gym`)',
  })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  amenities?: string[];

  @ApiPropertyOptional({ type: MediaDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MediaDto)
  media?: MediaDto;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({ description: 'ISO timestamp; defaults to now on create' })
  @IsOptional()
  @IsDateString({}, { message: 'publishedAt must be an ISO date string' })
  publishedAt?: string;
}

export class UpdatePropertyDto extends PartialType(CreatePropertyDto) {}
