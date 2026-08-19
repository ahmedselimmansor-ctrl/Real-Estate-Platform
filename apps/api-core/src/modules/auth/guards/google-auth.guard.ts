import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Observable } from 'rxjs';

import { AppException } from '../../../common/errors/app.exception';
import { ERROR_CODES } from '../../../common/errors/error-codes';
import { AppConfigService } from '../../../config/app-config.service';
import type { GoogleProfile } from '../auth.service';

/**
 * Guards both Google routes. When OAuth credentials are absent the strategy was
 * never registered, so fail with an explicit 503 instead of passport's opaque
 * "Unknown authentication strategy" error.
 */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private readonly config: AppConfigService) {
    super({ session: false, accessType: 'offline', prompt: 'select_account' });
  }

  override canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    if (!this.config.google.enabled) {
      throw AppException.serviceUnavailable(
        'Google sign-in is not configured on this deployment',
        ERROR_CODES.OAUTH_NOT_CONFIGURED,
      );
    }
    return super.canActivate(context);
  }

  override handleRequest<TUser = GoogleProfile>(err: unknown, user: TUser | false): TUser {
    if (err || !user) {
      throw AppException.unauthorized(
        'Google sign-in failed or was cancelled',
        ERROR_CODES.OAUTH_FAILED,
      );
    }
    return user;
  }
}
