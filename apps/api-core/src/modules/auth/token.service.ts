import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuidv4 } from 'uuid';

import { AppConfigService } from '../../config/app-config.service';
import { AppException } from '../../common/errors/app.exception';
import { ERROR_CODES } from '../../common/errors/error-codes';
import { UserRoleValue } from '../../common/enums';
import type {
  AccessTokenPayload,
  RefreshTokenPayload,
} from '../../common/types/authenticated-user';
import { CacheService } from '../../redis/cache.service';
import { cacheKeys } from '../../redis/cache-keys';
import { PrismaService } from '../../prisma/prisma.service';
import { durationToSeconds, secondsFromNow, secondsUntilExpiry } from '../shared/duration.util';
import { sha256Hex } from '../shared/hash.util';

export interface TokenSubject {
  id: string;
  email: string;
  name: string;
  role: UserRoleValue;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  /** Access token lifetime in seconds — handed to the client for scheduling. */
  expiresIn: number;
  /** Refresh cookie lifetime in seconds. */
  refreshExpiresIn: number;
}

export interface SessionContext {
  userAgent?: string | null;
  ipAddress?: string | null;
}

/**
 * Issues, verifies and rotates the CONTRACT §5 token pair.
 *
 * Refresh tokens are **rotating and single use**. Every issued `jti` is tracked
 * in Redis (`auth:refresh:{userId}:{jti}`) *and* Postgres (`refresh_tokens`);
 * on use the old `jti` moves to `auth:denylist:{jti}` for the remainder of its
 * natural life. Presenting an already-rotated token is treated as theft: the
 * whole family is revoked.
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  readonly accessTtlSeconds: number;
  readonly refreshTtlSeconds: number;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    private readonly cache: CacheService,
    private readonly prisma: PrismaService,
  ) {
    this.accessTtlSeconds = durationToSeconds(this.config.jwt.accessTtl);
    this.refreshTtlSeconds = durationToSeconds(this.config.jwt.refreshTtl);
  }

  // --------------------------------------------------------------- issuing --

  /** Mints a fresh access + refresh pair and records the refresh `jti`. */
  async issueTokens(user: TokenSubject, context: SessionContext = {}): Promise<IssuedTokens> {
    const { issuer, audience, accessSecret, refreshSecret } = this.config.jwt;

    const accessJti = uuidv4();
    const refreshJti = uuidv4();

    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        jti: accessJti,
      },
      {
        secret: accessSecret,
        expiresIn: this.accessTtlSeconds,
        issuer,
        audience,
      },
    );

    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, jti: refreshJti },
      {
        secret: refreshSecret,
        expiresIn: this.refreshTtlSeconds,
        issuer,
        audience,
      },
    );

    await this.rememberRefreshToken(user.id, refreshJti, refreshToken, context);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessTtlSeconds,
      refreshExpiresIn: this.refreshTtlSeconds,
    };
  }

  // -------------------------------------------------------------- verifying --

  /** Verifies an access token's signature, `iss`, `aud` and denylist status. */
  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    const payload = await this.decode<AccessTokenPayload>(token, this.config.jwt.accessSecret);

    if (await this.isDenied(payload.jti)) {
      throw AppException.unauthorized('Session has been revoked', ERROR_CODES.INVALID_TOKEN);
    }

    return payload;
  }

  /**
   * Verifies a refresh token and confirms it is the *current* one for its
   * family. Reuse of a rotated token revokes every session for that user.
   */
  async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    const payload = await this.decode<RefreshTokenPayload>(token, this.config.jwt.refreshSecret);

    if (await this.isDenied(payload.jti)) {
      this.logger.warn(
        `refresh token reuse detected for user ${payload.sub} (jti ${payload.jti}) — revoking all sessions`,
      );
      await this.revokeAllSessions(payload.sub);
      throw AppException.unauthorized(
        'Refresh token has already been used',
        ERROR_CODES.REFRESH_TOKEN_REUSED,
      );
    }

    const active = await this.cache.exists(cacheKeys.authRefresh(payload.sub, payload.jti));
    if (!active && !(await this.isKnownInDatabase(payload.sub, payload.jti))) {
      throw AppException.unauthorized(
        'Refresh token is no longer valid',
        ERROR_CODES.INVALID_TOKEN,
      );
    }

    return payload;
  }

  private async decode<T extends { exp: number; jti: string }>(
    token: string,
    secret: string,
  ): Promise<T> {
    try {
      return await this.jwt.verifyAsync<T>(token, {
        secret,
        issuer: this.config.jwt.issuer,
        audience: this.config.jwt.audience,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const expired = message.toLowerCase().includes('expired');
      throw AppException.unauthorized(
        expired ? 'Token has expired' : 'Token is invalid',
        expired ? ERROR_CODES.TOKEN_EXPIRED : ERROR_CODES.INVALID_TOKEN,
      );
    }
  }

  // --------------------------------------------------------------- rotation --

  /**
   * Consumes `oldJti` and mints a new pair. The old token is denylisted for the
   * remainder of its lifetime so a replay is detectable.
   */
  async rotate(
    user: TokenSubject,
    oldPayload: RefreshTokenPayload,
    context: SessionContext = {},
  ): Promise<IssuedTokens> {
    const issued = await this.issueTokens(user, context);
    const newJti = (await this.jwt.decode(issued.refreshToken)) as RefreshTokenPayload | null;

    await this.revokeRefreshJti(oldPayload.sub, oldPayload.jti, oldPayload.exp, newJti?.jti);

    return issued;
  }

  // ------------------------------------------------------------- revocation --

  /** Ends one session: denylists the refresh `jti` and drops its Redis marker. */
  async revokeRefreshJti(
    userId: string,
    jti: string,
    expUnixSeconds: number,
    replacedByJti?: string,
  ): Promise<void> {
    const remaining = secondsUntilExpiry(expUnixSeconds);

    if (remaining > 0) {
      await this.cache.set(cacheKeys.authDenylist(jti), { userId, revokedAt: Date.now() }, remaining);
    }
    await this.cache.del(cacheKeys.authRefresh(userId, jti));

    await this.prisma.refreshToken
      .updateMany({
        where: { jti, revokedAt: null },
        data: { revokedAt: new Date(), replacedByJti: replacedByJti ?? null },
      })
      .catch((error: unknown) => {
        this.logger.warn(`could not mark refresh token ${jti} revoked: ${String(error)}`);
      });
  }

  /** Denylists an access token `jti` for its remaining life (logout). */
  async revokeAccessJti(jti: string, expUnixSeconds: number): Promise<void> {
    const remaining = secondsUntilExpiry(expUnixSeconds);
    if (remaining > 0) {
      await this.cache.set(cacheKeys.authDenylist(jti), { revokedAt: Date.now() }, remaining);
    }
  }

  /** Nuclear option — used on refresh-token reuse and on password reset. */
  async revokeAllSessions(userId: string): Promise<void> {
    await this.cache.delByPattern(cacheKeys.authRefreshPattern(userId));

    const live = await this.prisma.refreshToken
      .findMany({
        where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
        select: { jti: true, expiresAt: true },
      })
      .catch(() => []);

    await Promise.all(
      live.map((token) =>
        this.cache.set(
          cacheKeys.authDenylist(token.jti),
          { userId, revokedAt: Date.now() },
          Math.max(1, Math.floor((token.expiresAt.getTime() - Date.now()) / 1000)),
        ),
      ),
    );

    await this.prisma.refreshToken
      .updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
      .catch((error: unknown) => {
        this.logger.warn(`could not revoke sessions for ${userId}: ${String(error)}`);
      });
  }

  // ---------------------------------------------------------------- helpers --

  private async isDenied(jti: string): Promise<boolean> {
    return this.cache.exists(cacheKeys.authDenylist(jti));
  }

  private async isKnownInDatabase(userId: string, jti: string): Promise<boolean> {
    const record = await this.prisma.refreshToken
      .findUnique({ where: { jti }, select: { userId: true, revokedAt: true, expiresAt: true } })
      .catch(() => null);

    return Boolean(
      record &&
        record.userId === userId &&
        record.revokedAt === null &&
        record.expiresAt.getTime() > Date.now(),
    );
  }

  private async rememberRefreshToken(
    userId: string,
    jti: string,
    token: string,
    context: SessionContext,
  ): Promise<void> {
    const expiresAt = secondsFromNow(this.refreshTtlSeconds);

    await this.cache.set(
      cacheKeys.authRefresh(userId, jti),
      { issuedAt: Date.now() },
      this.refreshTtlSeconds,
    );

    await this.prisma.refreshToken
      .create({
        data: {
          userId,
          jti,
          tokenHash: sha256Hex(token),
          userAgent: context.userAgent ?? null,
          ipAddress: context.ipAddress ?? null,
          expiresAt,
        },
      })
      .catch((error: unknown) => {
        // Redis remains the fast path; a Postgres hiccup must not block login.
        this.logger.warn(`could not persist refresh token ${jti}: ${String(error)}`);
      });
  }

  /** Housekeeping for the scheduled cleanup job. */
  async purgeExpiredRefreshTokens(): Promise<number> {
    const { count } = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return count;
  }
}
