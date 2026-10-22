import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { UsersModule } from '../users/users.module.js';
import { DevAuthGuard } from './dev-auth.guard.js';

@Module({
  imports: [UsersModule],
  providers: [{ provide: APP_GUARD, useClass: DevAuthGuard }],
})
export class AuthModule {}
