import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUrl, Matches, MaxLength } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { USER_ROLES } from '../../../common/enums';
import { PHONE_PATTERN } from '../../auth/dto/auth.dto';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return value;
};

export class ListUsersDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Matches name or email' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ enum: USER_ROLES })
  @IsOptional()
  @IsIn(USER_ROLES as unknown as string[])
  role?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;
}

/** What a user may change about themselves. */
export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Ahmed Hassan' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ example: '+201001234567' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(PHONE_PATTERN, { message: 'Phone must be a valid number' })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'avatarUrl must be a valid URL' })
  avatarUrl?: string;

  @ApiPropertyOptional({ enum: ['en', 'ar'] })
  @IsOptional()
  @IsIn(['en', 'ar'])
  locale?: string;
}

/** What an administrator may additionally change. */
export class AdminUpdateUserDto extends UpdateProfileDto {
  @ApiPropertyOptional({ enum: USER_ROLES, description: 'Changing a role requires superadmin' })
  @IsOptional()
  @IsIn(USER_ROLES as unknown as string[])
  role?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isVerified?: boolean;
}
