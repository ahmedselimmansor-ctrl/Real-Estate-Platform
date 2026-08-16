import { Injectable, Logger } from '@nestjs/common';
import type { Prisma, User } from '@prisma/client';
import * as argon2 from 'argon2';

import { AppException } from '../../common/errors/app.exception';
import { ERROR_CODES } from '../../common/errors/error-codes';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';
import { randomToken, sha256Hex } from '../shared/hash.util';
import { secondsFromNow } from '../shared/duration.util';
import { MailerService } from './mailer.service';
import { IssuedTokens, SessionContext, TokenService, TokenSubject } from './token.service';
import type {
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
} from './dto/auth.dto';

/**
 * Argon2id parameters — OWASP's 2024 baseline for interactive logins.
 * `raw: false` pins the overload that returns an encoded string rather than a
 * Buffer, which is what the `password_hash` column stores.
 */
const ARGON2_OPTIONS: argon2.HashOptions & { raw: false } = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
  raw: false,
};

const RESET_TOKEN_TTL_MINUTES = 60;

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: User['role'];
  phone: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
  locale: string;
  createdAt: Date;
}

export interface AuthResult {
  user: PublicUser;
  tokens: IssuedTokens;
}

export interface GoogleProfile {
  providerAccountId: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  accessToken?: string;
  refreshToken?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly mailer: MailerService,
  ) {}

  // ------------------------------------------------------------- registration

  async register(dto: RegisterDto, context: SessionContext): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });

    if (existing) {
      throw AppException.conflict(
        'An account with this email already exists',
        ERROR_CODES.EMAIL_ALREADY_EXISTS,
        [{ field: 'email', message: 'already registered', rule: 'unique' }],
      );
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        phone: dto.phone ?? null,
        passwordHash: await argon2.hash(dto.password, ARGON2_OPTIONS),
        role: 'user',
      },
    });

    await this.mailer.sendWelcome({ to: user.email, name: user.name });

    return this.completeLogin(user, context);
  }

  // -------------------------------------------------------------------- login

  /** Used by the Passport local strategy — never leaks *which* factor failed. */
  async validateCredentials(dto: LoginDto): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    // Hash even when the user is missing so response time does not reveal
    // whether an address is registered.
    const hash = user?.passwordHash ?? (await this.dummyHash());
    const matches = await argon2.verify(hash, dto.password).catch(() => false);

    if (!user || !user.passwordHash || !matches) {
      throw AppException.unauthorized(
        'Incorrect email or password',
        ERROR_CODES.INVALID_CREDENTIALS,
      );
    }

    if (!user.isActive) {
      throw AppException.forbidden(
        'This account has been disabled',
        ERROR_CODES.ACCOUNT_DISABLED,
      );
    }

    return user;
  }

  async login(user: User, context: SessionContext): Promise<AuthResult> {
    return this.completeLogin(user, context);
  }

  private async completeLogin(user: User, context: SessionContext): Promise<AuthResult> {
    const tokens = await this.tokens.issueTokens(this.toSubject(user), context);

    await this.prisma.user
      .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
      .catch(() => undefined);

    return { user: this.toPublicUser(user), tokens };
  }

  // ------------------------------------------------------------------ refresh

  async refresh(refreshToken: string, context: SessionContext): Promise<AuthResult> {
    const payload = await this.tokens.verifyRefreshToken(refreshToken);

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw AppException.unauthorized('Session no longer exists', ERROR_CODES.INVALID_TOKEN);
    }
    if (!user.isActive) {
      throw AppException.forbidden('This account has been disabled', ERROR_CODES.ACCOUNT_DISABLED);
    }

    const tokens = await this.tokens.rotate(this.toSubject(user), payload, context);
    return { user: this.toPublicUser(user), tokens };
  }

  // ------------------------------------------------------------------- logout

  async logout(principal: AuthenticatedUser | undefined, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      const payload = await this.tokens
        .verifyRefreshToken(refreshToken)
        .catch(() => null);

      if (payload) {
        await this.tokens.revokeRefreshJti(payload.sub, payload.jti, payload.exp);
      }
    }

    if (principal) {
      // The access token's own `exp` is not on the principal, so denylist it for
      // a full access-token lifetime — an upper bound on what remains.
      await this.tokens.revokeAccessJti(
        principal.jti,
        Math.floor(Date.now() / 1000) + this.tokens.accessTtlSeconds,
      );
    }
  }

  // --------------------------------------------------------------------- me

  async me(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw AppException.notFound('User not found', ERROR_CODES.USER_NOT_FOUND);
    }
    return this.toPublicUser(user);
  }

  // ----------------------------------------------------------- password reset

  /**
   * Always resolves successfully — responding differently for unknown addresses
   * would turn this into an account-enumeration oracle.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (!user || !user.isActive) {
      this.logger.debug(`password reset requested for unknown/inactive address ${dto.email}`);
      return;
    }

    const token = randomToken(32);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetTokenHash: sha256Hex(token),
        resetTokenExpiresAt: secondsFromNow(RESET_TOKEN_TTL_MINUTES * 60),
      },
    });

    await this.mailer.sendPasswordReset({
      to: user.email,
      name: user.name,
      resetUrl: this.mailer.resetUrl(token),
      expiresInMinutes: RESET_TOKEN_TTL_MINUTES,
    });
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const tokenHash = sha256Hex(dto.token);

    const user = await this.prisma.user.findFirst({
      where: { resetTokenHash: tokenHash, resetTokenExpiresAt: { gt: new Date() } },
    });

    if (!user) {
      throw AppException.badRequest(
        'This reset link is invalid or has expired',
        ERROR_CODES.PASSWORD_RESET_INVALID,
      );
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await argon2.hash(dto.password, ARGON2_OPTIONS),
        resetTokenHash: null,
        resetTokenExpiresAt: null,
      },
    });

    // A password change invalidates every existing session.
    await this.tokens.revokeAllSessions(user.id);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw AppException.notFound('User not found', ERROR_CODES.USER_NOT_FOUND);
    }

    if (!user.passwordHash) {
      throw AppException.badRequest(
        'This account signs in with Google and has no password set',
        ERROR_CODES.INVALID_CREDENTIALS,
      );
    }

    const matches = await argon2.verify(user.passwordHash, currentPassword).catch(() => false);
    if (!matches) {
      throw AppException.unauthorized(
        'Current password is incorrect',
        ERROR_CODES.INVALID_CREDENTIALS,
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await argon2.hash(newPassword, ARGON2_OPTIONS) },
    });

    await this.tokens.revokeAllSessions(userId);
  }

  // ------------------------------------------------------------ google oauth

  /**
   * Upserts the Google identity. An existing local account with the same email
   * gets the Google identity linked rather than a duplicate user created.
   */
  async validateGoogleUser(profile: GoogleProfile, context: SessionContext): Promise<AuthResult> {
    const linked = await this.prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: 'google',
          providerAccountId: profile.providerAccountId,
        },
      },
      include: { user: true },
    });

    if (linked) {
      if (!linked.user.isActive) {
        throw AppException.forbidden(
          'This account has been disabled',
          ERROR_CODES.ACCOUNT_DISABLED,
        );
      }
      return this.completeLogin(linked.user, context);
    }

    const user = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.user.findUnique({ where: { email: profile.email } });

      const record =
        existing ??
        (await tx.user.create({
          data: {
            email: profile.email,
            name: profile.name,
            avatarUrl: profile.avatarUrl ?? null,
            // Google has already verified the address; no local password exists.
            isVerified: true,
            passwordHash: null,
            role: 'user',
          },
        }));

      await tx.account.create({
        data: {
          userId: record.id,
          provider: 'google',
          providerAccountId: profile.providerAccountId,
          type: 'oauth',
          accessToken: profile.accessToken ?? null,
          refreshToken: profile.refreshToken ?? null,
        },
      });

      if (existing && !existing.isVerified) {
        return tx.user.update({ where: { id: existing.id }, data: { isVerified: true } });
      }

      return record;
    });

    if (!user.isActive) {
      throw AppException.forbidden('This account has been disabled', ERROR_CODES.ACCOUNT_DISABLED);
    }

    return this.completeLogin(user, context);
  }

  // ------------------------------------------------------------------ mapping

  toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      isVerified: user.isVerified,
      locale: user.locale,
      createdAt: user.createdAt,
    };
  }

  private toSubject(user: User): TokenSubject {
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }

  /** Cached dummy hash so the "user not found" path costs the same as a real verify. */
  private dummyHashValue: string | null = null;
  private async dummyHash(): Promise<string> {
    if (this.dummyHashValue === null) {
      this.dummyHashValue = await argon2.hash('nawy-timing-equalizer', ARGON2_OPTIONS);
    }
    return this.dummyHashValue;
  }
}
