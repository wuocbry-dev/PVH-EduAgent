import { Module } from '@nestjs/common';
import { UserSessionsService } from './user-sessions.service.js';
import { UsersAdminService } from './users-admin.service.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [UsersController],
  providers: [UsersService, UsersAdminService, UserSessionsService],
  exports: [UsersService],
})
export class UsersModule {}
