import { ExecutionContext, Injectable } from '@nestjs/common';
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
      throw err;
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
