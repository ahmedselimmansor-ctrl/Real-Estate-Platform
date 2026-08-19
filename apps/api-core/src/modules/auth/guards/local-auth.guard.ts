import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { User } from '@prisma/client';

import { AppException } from '../../../common/errors/app.exception';
import { ERROR_CODES } from '../../../common/errors/error-codes';

/** Runs the local (email + password) strategy for `POST /auth/login`. */
@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
  override handleRequest<TUser = User>(err: unknown, user: TUser | false): TUser {
    // `AuthService.validateCredentials` already throws precise AppExceptions;
    // rethrow them untouched so the client sees the right error code.
    if (err instanceof AppException) {
      throw err;
    }
    if (err) {
      // Passport types this as `any`; rethrowing a non-Error loses the stack
      // and confuses every handler downstream.
      throw err instanceof Error ? err : new UnauthorizedException();
    }
    if (!user) {
      throw AppException.unauthorized(
        'Incorrect email or password',
        ERROR_CODES.INVALID_CREDENTIALS,
      );
    }
    return user;
  }

  override getRequest(context: ExecutionContext) {
    return context.switchToHttp().getRequest();
  }
}
