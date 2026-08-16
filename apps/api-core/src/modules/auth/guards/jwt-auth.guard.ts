import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Observable } from 'rxjs';

import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { AppException } from '../../../common/errors/app.exception';
import { ERROR_CODES } from '../../../common/errors/error-codes';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';

/**
 * Registered as an `APP_GUARD`, so **every** route requires a valid access token
 * unless it carries `@Public()`.
 *
 * Public routes still attempt authentication: a valid token populates
 * `request.user` (so e.g. `/properties` can personalise), while a missing or
 * invalid one is silently ignored.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }
    return super.canActivate(context);
  }

  override handleRequest<TUser = AuthenticatedUser>(
    err: unknown,
    user: TUser | false,
    info: unknown,
    context: ExecutionContext,
  ): TUser {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return (user || undefined) as TUser;
    }

    if (err) {
      throw err;
    }

    if (!user) {
      const reason = info instanceof Error ? info.message : '';
      const expired = reason.toLowerCase().includes('expired');

      throw AppException.unauthorized(
        expired ? 'Access token has expired' : 'Authentication required',
        expired ? ERROR_CODES.TOKEN_EXPIRED : ERROR_CODES.UNAUTHORIZED,
      );
    }

    return user;
  }
}
