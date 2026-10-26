import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ActivationModule } from '../activation/activation.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { LoginRateLimiter } from './login-rate-limiter.js';
import { TokenService } from './token.service.js';

@Module({
  imports: [UsersModule, ActivationModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    LoginRateLimiter,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AuthModule {}
