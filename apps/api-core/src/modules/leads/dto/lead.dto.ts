import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { LEAD_STATUSES, PROPERTY_TYPES } from '../../../common/enums';
import { PHONE_PATTERN } from '../../auth/dto/auth.dto';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateLeadDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'The listing being enquired about' })
  @IsOptional()
  @IsUUID(undefined, { message: 'propertyId must be a UUID' })
  propertyId?: string;

  @ApiProperty({ example: 'Ahmed Hassan' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  @MaxLength(160)
  name!: string;

  @ApiProperty({ example: '+201001234567' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Phone is required' })
  @Matches(PHONE_PATTERN, { message: 'Phone must be a valid number' })
  @MaxLength(32)
  phone!: string;

  @ApiPropertyOptional({ example: 'ahmed@example.com' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'A valid email address is required' })
  @MaxLength(320)
  email?: string;

  @ApiPropertyOptional({ example: 'I would like to schedule a viewing this weekend.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  message?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Area the seller\u2019s unit sits in. Sell enquiries only.',
  })
  @IsOptional()
  @IsUUID(undefined, { message: 'areaId must be a UUID' })
  areaId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Compound the seller\u2019s unit sits in. Sell enquiries only.',
  })
  @IsOptional()
  @IsUUID(undefined, { message: 'compoundId must be a UUID' })
  compoundId?: string;

  @ApiPropertyOptional({ enum: PROPERTY_TYPES, example: 'apartment' })
  @IsOptional()
  @IsIn(PROPERTY_TYPES as unknown as string[], { message: 'Unknown property type' })
  propertyType?: string;

  @ApiPropertyOptional({
    example: 'property_detail',
    description: 'Where the enquiry came from (property_detail, chatbot, contact_page, sell_page…)',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  source?: string;

  /**
   * Honeypot. Real users never see this field, so anything in it means a bot —
   * the request is accepted and silently dropped.
   */
  @ApiPropertyOptional({ description: 'Leave empty — spam trap', deprecated: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string;
}

export class ListLeadsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: LEAD_STATUSES })
  @IsOptional()
  @IsIn(LEAD_STATUSES as unknown as string[])
  status?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  compoundId?: string;

  @ApiPropertyOptional({
    example: 'sell_page',
    description: 'Isolate one intake channel, e.g. every seller enquiry',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  source?: string;

  @ApiPropertyOptional({ description: 'Matches name, phone or email' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ description: 'ISO date — leads created on or after' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date — leads created on or before' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class UpdateLeadDto {
  @ApiPropertyOptional({ enum: LEAD_STATUSES })
  @IsOptional()
  @IsIn(LEAD_STATUSES as unknown as string[])
  status?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Agent handling this lead' })
  @IsOptional()
  @IsUUID(undefined, { message: 'assignedToId must be a UUID' })
  assignedToId?: string | null;

  @ApiPropertyOptional({ example: 'Called — viewing booked for Saturday 11:00.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  notes?: string;
}
