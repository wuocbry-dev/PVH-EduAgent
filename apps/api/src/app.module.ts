import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation.js';
import { AgentModule } from './features/agent/agent.module.js';
import { AuditLogModule } from './features/audit-log/audit-log.module.js';
import { AuthModule } from './features/auth/auth.module.js';
import { PostsModule } from './features/posts/posts.module.js';
import { RolesModule } from './features/roles/roles.module.js';
import { SchedulerModule } from './features/scheduler/scheduler.module.js';
import { SystemModule } from './features/system/system.module.js';
import { TasksModule } from './features/tasks/tasks.module.js';
import { TelegramModule } from './features/telegram/telegram.module.js';
import { UsersModule } from './features/users/users.module.js';
import { DatabaseModule } from './infrastructure/database/database.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
    AuditLogModule,
    AuthModule,
    UsersModule,
    RolesModule,
    PostsModule,
    TasksModule,
    SystemModule,
    AgentModule,
    TelegramModule,
    SchedulerModule,
  ],
})
export class AppModule {}
