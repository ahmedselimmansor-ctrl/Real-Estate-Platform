import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

import {
  ALLOWED_CONTENT_TYPES,
  ALLOWED_FOLDERS,
} from '../storage/storage.driver';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class PresignUploadDto {
  @ApiProperty({ example: 'living-room.jpg', description: 'Original filename (for the extension)' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'filename is required' })
  @MaxLength(255)
  filename!: string;

  @ApiProperty({ enum: Object.keys(ALLOWED_CONTENT_TYPES), example: 'image/jpeg' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsIn(Object.keys(ALLOWED_CONTENT_TYPES), {
    message: `contentType must be one of: ${Object.keys(ALLOWED_CONTENT_TYPES).join(', ')}`,
  })
  contentType!: string;

  @ApiPropertyOptional({ enum: ALLOWED_FOLDERS, default: 'properties' })
  @Transform(trim)
  @IsIn(ALLOWED_FOLDERS as unknown as string[], {
    message: `folder must be one of: ${ALLOWED_FOLDERS.join(', ')}`,
  })
  folder: string = 'properties';
}

export class DeleteUploadDto {
  @ApiProperty({ example: 'properties/8f0c…-1.jpg' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'key is required' })
  @MaxLength(400)
  key!: string;
}
