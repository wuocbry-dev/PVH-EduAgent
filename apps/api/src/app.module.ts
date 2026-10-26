import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { validateEnv } from './config/env.validation.js';
import { AcademicModule } from './features/academic/academic.module.js';
import { AgentActionsModule } from './features/agent-actions/agent-actions.module.js';
import { AgentModule } from './features/agent/agent.module.js';
import { AuditLogModule } from './features/audit-log/audit-log.module.js';
import { AuthModule } from './features/auth/auth.module.js';
import { CategoriesModule } from './features/categories/categories.module.js';
import { EventsModule } from './features/events/events.module.js';
import { ContactsModule } from './features/contacts/contacts.module.js';
import { MediaModule } from './features/media/media.module.js';
import { PostsModule } from './features/posts/posts.module.js';
import { PublicSiteModule } from './features/public-site/public-site.module.js';
import { RosterModule } from './features/roster/roster.module.js';
import { ScoresModule } from './features/scores/scores.module.js';
import { AnnouncementsModule } from './features/announcements/announcements.module.js';
import { RolesModule } from './features/roles/roles.module.js';
import { SettingsModule } from './features/settings/settings.module.js';
import { SchedulerModule } from './features/scheduler/scheduler.module.js';
import { SystemModule } from './features/system/system.module.js';
import { TasksModule } from './features/tasks/tasks.module.js';
import { TimetableModule } from './features/timetable/timetable.module.js';
import { TeachingModule } from './features/teaching/teaching.module.js';
import { TelegramModule } from './features/telegram/telegram.module.js';
import { UsersModule } from './features/users/users.module.js';
import { DatabaseModule } from './infrastructure/database/database.module.js';
import { NotificationsModule } from './features/notifications/notifications.module.js';
import { QueueModule } from './infrastructure/queue/queue.module.js';
import { StorageModule } from './infrastructure/storage/storage.module.js';
import { RateLimitModule } from './infrastructure/rate-limit/rate-limit.module.js';
import { RevalidateModule } from './infrastructure/revalidate/revalidate.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
    RevalidateModule,
    StorageModule,
    QueueModule,
    NotificationsModule,
    AuditLogModule,
    AuthModule,
    // Sau AuthModule để JwtAuthGuard chạy trước và hạn mức tính theo tài khoản đã đăng nhập.
    RateLimitModule,
    UsersModule,
    RolesModule,
    AcademicModule,
    RosterModule,
    TeachingModule,
    TimetableModule,
    ScoresModule,
    AnnouncementsModule,
    PostsModule,
    CategoriesModule,
    MediaModule,
    PublicSiteModule,
    ContactsModule,
    EventsModule,
    SettingsModule,
    TasksModule,
    SystemModule,
    AgentActionsModule,
    AgentModule,
    TelegramModule,
    SchedulerModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
