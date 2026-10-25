import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation.js';
import { AgentModule } from './features/agent/agent.module.js';
import { AuditLogModule } from './features/audit-log/audit-log.module.js';
import { AuthModule } from './features/auth/auth.module.js';
import { CategoriesModule } from './features/categories/categories.module.js';
import { EventsModule } from './features/events/events.module.js';
import { ContactsModule } from './features/contacts/contacts.module.js';
import { MediaModule } from './features/media/media.module.js';
import { PostsModule } from './features/posts/posts.module.js';
import { PublicSiteModule } from './features/public-site/public-site.module.js';
import { RolesModule } from './features/roles/roles.module.js';
import { SettingsModule } from './features/settings/settings.module.js';
import { SchedulerModule } from './features/scheduler/scheduler.module.js';
import { SystemModule } from './features/system/system.module.js';
import { TasksModule } from './features/tasks/tasks.module.js';
import { TelegramModule } from './features/telegram/telegram.module.js';
import { UsersModule } from './features/users/users.module.js';
import { DatabaseModule } from './infrastructure/database/database.module.js';
import { NotificationsModule } from './features/notifications/notifications.module.js';
import { QueueModule } from './infrastructure/queue/queue.module.js';
import { RevalidateModule } from './infrastructure/revalidate/revalidate.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
    RevalidateModule,
    QueueModule,
    NotificationsModule,
    AuditLogModule,
    AuthModule,
    UsersModule,
    RolesModule,
    PostsModule,
    CategoriesModule,
    MediaModule,
    PublicSiteModule,
    ContactsModule,
    EventsModule,
    SettingsModule,
    TasksModule,
    SystemModule,
    AgentModule,
    TelegramModule,
    SchedulerModule,
  ],
})
export class AppModule {}
