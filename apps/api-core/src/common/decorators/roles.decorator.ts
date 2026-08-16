import { SetMetadata } from '@nestjs/common';

import { UserRoleValue } from '../enums';

export const ROLES_KEY = 'roles';

/**
 * Restricts a handler (or controller) to the given CONTRACT §3 roles, e.g.
 * `@Roles('agent', 'admin')`. Enforced by `RolesGuard` (stage 2).
 */
export const Roles = (...roles: UserRoleValue[]) => SetMetadata(ROLES_KEY, roles);
