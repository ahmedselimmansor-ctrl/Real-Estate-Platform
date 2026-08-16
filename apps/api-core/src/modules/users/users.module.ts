import {
  Body,
  Controller,
  Delete,
  Get,
  Module,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { PaginatedResult } from '../../common/types/api-response';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { assertUuid } from '../shared/identifier.util';
import { AdminUpdateUserDto, ListUsersDto, UpdateProfileDto } from './dto/user.dto';
import { UserRecord, UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Your profile' })
  me(@CurrentUser('id') userId: string): Promise<UserRecord> {
    return this.users.findById(userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update your profile' })
  updateMe(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserRecord> {
    return this.users.updateProfile(userId, dto);
  }

  @Roles('admin')
  @Get()
  @ApiOperation({ summary: 'List users' })
  list(@Query() query: ListUsersDto): Promise<PaginatedResult<UserRecord>> {
    return this.users.list(query);
  }

  @Roles('admin')
  @Get(':id')
  @ApiOperation({ summary: 'Fetch one user' })
  findOne(@Param('id') id: string): Promise<UserRecord> {
    return this.users.findById(assertUuid(id));
  }

  @Roles('admin')
  @Patch(':id')
  @ApiOperation({
    summary: 'Update a user',
    description: 'Role changes require superadmin and revoke the target’s sessions.',
  })
  update(
    @Param('id') id: string,
    @Body() dto: AdminUpdateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserRecord> {
    return this.users.adminUpdate(assertUuid(id), dto, { id: actor.id, role: actor.role });
  }

  @Roles('admin')
  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a user',
    description: 'Deactivates and anonymises — related leads and audit entries are preserved.',
  })
  remove(
    @Param('id') id: string,
    @CurrentUser('id') actorId: string,
  ): Promise<{ id: string; deleted: true }> {
    return this.users.remove(assertUuid(id), actorId);
  }
}

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
