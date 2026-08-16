import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { UserRoleValue } from '../../../common/enums';
import { AppException } from '../../../common/errors/app.exception';
import { ERROR_CODES } from '../../../common/errors/error-codes';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';

/**
 * Enforces `@Roles('agent', 'admin')`. `superadmin` implicitly satisfies every
 * requirement so an escalation never needs a second annotation.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRoleValue[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      throw AppException.unauthorized();
    }

    if (user.role === 'superadmin' || required.includes(user.role)) {
      return true;
    }

    throw AppException.forbidden(
      `This action requires one of: ${required.join(', ')}`,
      ERROR_CODES.INSUFFICIENT_ROLE,
    );
  }
}
