import { Injectable } from '@nestjs/common';
import type { Prisma, UserRole } from '@prisma/client';

import { AppException } from '../../common/errors/app.exception';
import { ERROR_CODES } from '../../common/errors/error-codes';
import type { UserRoleValue } from '../../common/enums';
import type { PaginatedResult } from '../../common/types/api-response';
import { paginate, parseSort, toPrismaOrderBy } from '../../common/utils/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenService } from '../auth/token.service';
import type { AdminUpdateUserDto, ListUsersDto, UpdateProfileDto } from './dto/user.dto';

const SORTABLE = ['createdAt', 'name', 'email', 'lastLoginAt'] as const;

/** Never expose `passwordHash` or the reset-token columns. */
const PUBLIC_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  phone: true,
  avatarUrl: true,
  isVerified: true,
  isActive: true,
  locale: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export type UserRecord = Prisma.UserGetPayload<{ select: typeof PUBLIC_SELECT }>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  async findById(id: string): Promise<UserRecord> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: PUBLIC_SELECT });

    if (!user) {
      throw AppException.notFound(`User "${id}" was not found`, ERROR_CODES.USER_NOT_FOUND);
    }

    return user;
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<UserRecord> {
    await this.ensureExists(id);

    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
        ...(dto.locale !== undefined ? { locale: dto.locale } : {}),
      },
      select: PUBLIC_SELECT,
    });
  }

  // ------------------------------------------------------------------- admin

  async list(query: ListUsersDto): Promise<PaginatedResult<UserRecord>> {
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role as UserRole } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const sort = parseSort(query.sort, SORTABLE, { field: 'createdAt', direction: 'desc' });

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: toPrismaOrderBy(sort),
        skip: query.skip,
        take: query.take,
        select: PUBLIC_SELECT,
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginate(data, total, query);
  }

  /**
   * Administrative edit. Role changes are restricted to superadmins, and an
   * account that is deactivated or demoted has its sessions revoked so the
   * change takes effect before the current access token expires.
   */
  async adminUpdate(
    id: string,
    dto: AdminUpdateUserDto,
    actor: { id: string; role: UserRoleValue },
  ): Promise<UserRecord> {
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, isActive: true },
    });

    if (!target) {
      throw AppException.notFound(`User "${id}" was not found`, ERROR_CODES.USER_NOT_FOUND);
    }

    if (dto.role !== undefined && dto.role !== target.role) {
      if (actor.role !== 'superadmin') {
        throw AppException.forbidden(
          'Only a superadmin can change user roles',
          ERROR_CODES.INSUFFICIENT_ROLE,
        );
      }
      if (actor.id === id) {
        throw AppException.badRequest(
          'You cannot change your own role',
          ERROR_CODES.BAD_REQUEST,
        );
      }
    }

    if (dto.isActive === false && actor.id === id) {
      throw AppException.badRequest(
        'You cannot deactivate your own account',
        ERROR_CODES.BAD_REQUEST,
      );
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
        ...(dto.locale !== undefined ? { locale: dto.locale } : {}),
        ...(dto.role !== undefined ? { role: dto.role as UserRole } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.isVerified !== undefined ? { isVerified: dto.isVerified } : {}),
      },
      select: PUBLIC_SELECT,
    });

    const revoke =
      (dto.role !== undefined && dto.role !== target.role) || dto.isActive === false;

    if (revoke) {
      await this.tokens.revokeAllSessions(id);
    }

    return user;
  }

  /**
   * Soft delete: the account is deactivated and anonymised rather than removed,
   * because leads, reviews and audit entries reference it.
   */
  async remove(id: string, actorId: string): Promise<{ id: string; deleted: true }> {
    if (id === actorId) {
      throw AppException.badRequest(
        'You cannot delete your own account',
        ERROR_CODES.BAD_REQUEST,
      );
    }

    await this.ensureExists(id);

    await this.prisma.user.update({
      where: { id },
      data: {
        isActive: false,
        email: `deleted+${id}@nawy.invalid`,
        name: 'Deleted user',
        phone: null,
        avatarUrl: null,
        passwordHash: null,
        resetTokenHash: null,
        resetTokenExpiresAt: null,
      },
    });

    await this.prisma.account.deleteMany({ where: { userId: id } });
    await this.tokens.revokeAllSessions(id);

    return { id, deleted: true };
  }

  private async ensureExists(id: string): Promise<void> {
    if ((await this.prisma.user.count({ where: { id } })) === 0) {
      throw AppException.notFound(`User "${id}" was not found`, ERROR_CODES.USER_NOT_FOUND);
    }
  }
}
