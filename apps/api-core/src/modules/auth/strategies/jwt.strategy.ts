import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptionsWithoutRequest } from 'passport-jwt';

import { AppException } from '../../../common/errors/app.exception';
import { ERROR_CODES } from '../../../common/errors/error-codes';
import type {
  AccessTokenPayload,
  AuthenticatedUser,
} from '../../../common/types/authenticated-user';
import { authenticatedUserFromPayload } from '../../../common/types/authenticated-user';
import { AppConfigService } from '../../../config/app-config.service';
import { CacheService } from '../../../redis/cache.service';
import { cacheKeys } from '../../../redis/cache-keys';

/**
 * CONTRACT §5 — validates the access token locally: signature, `iss`, `aud`,
 * `exp`, then the Redis denylist. No database round-trip on the hot path.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: AppConfigService,
    private readonly cache: CacheService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.jwt.accessSecret,
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
      algorithms: ['HS256'],
    } satisfies StrategyOptionsWithoutRequest);
  }

  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    if (!payload?.sub || !payload.jti) {
      throw AppException.unauthorized('Malformed access token', ERROR_CODES.INVALID_TOKEN);
    }

    if (await this.cache.exists(cacheKeys.authDenylist(payload.jti))) {
      throw AppException.unauthorized('Session has been revoked', ERROR_CODES.INVALID_TOKEN);
    }

    return authenticatedUserFromPayload(payload);
  }
}
