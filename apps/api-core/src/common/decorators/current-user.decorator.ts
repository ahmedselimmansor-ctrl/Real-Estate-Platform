import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';

import { AuthenticatedUser } from '../types/authenticated-user';

/**
 * Injects the authenticated principal (or one of its fields):
 *
 * ```ts
 * findMine(@CurrentUser() user: AuthenticatedUser) {}
 * findMine(@CurrentUser('id') userId: string) {}
 * ```
 *
 * Returns `undefined` on public routes where no guard has run.
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      return undefined;
    }

    return field ? user[field] : user;
  },
);
