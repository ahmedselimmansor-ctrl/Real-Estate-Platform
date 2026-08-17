import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const normalizeEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * At least one lowercase, one uppercase and one digit. Length is enforced
 * separately so the error message can be specific about which rule failed.
 */
export const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;
export const PASSWORD_MESSAGE =
  'Password must contain at least one lowercase letter, one uppercase letter and one number';

/** Egyptian mobile numbers plus generic E.164 — kept permissive on purpose. */
export const PHONE_PATTERN = /^\+?[0-9][0-9\s-]{6,19}$/;

export class RegisterDto {
  @ApiProperty({ example: 'Ahmed Hassan', maxLength: 160 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  @MaxLength(160)
  name!: string;

  @ApiProperty({ example: 'ahmed@example.com' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'A valid email address is required' })
  @MaxLength(320)
  email!: string;

  @ApiProperty({ example: 'Password123!', minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128)
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGE })
  password!: string;

  @ApiPropertyOptional({ example: '+201001234567' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(PHONE_PATTERN, { message: 'Phone must be a valid number' })
  phone?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'user@topchoice.local' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'A valid email address is required' })
  email!: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MaxLength(128)
  password!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@topchoice.local' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'A valid email address is required' })
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Single-use token from the reset link' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Reset token is required' })
  token!: string;

  @ApiProperty({ example: 'NewPassword123!', minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128)
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGE })
  password!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Current password is required' })
  currentPassword!: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128)
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGE })
  newPassword!: string;
}
