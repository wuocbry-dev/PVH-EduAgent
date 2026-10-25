import { Module } from '@nestjs/common';
import { PostsModule } from '../posts/posts.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { DailyReportProcessor } from './daily-report.processor.js';
import { DeadlineReminderProcessor } from './deadline-reminder.processor.js';
import { PublishPostProcessor } from './publish-post.processor.js';
import { SchedulerService } from './scheduler.service.js';

// Bộ lập lịch (A05, A06, A09) dùng Redis + BullMQ:
// - publish-post.processor.ts       đăng bài hẹn giờ khi đến publish_at (retry 3 lần) và quét bù mỗi phút
// - deadline-reminder.processor.ts  đánh dấu OVERDUE và nhắc hạn trước X giờ, không nhắc trùng
// - daily-report.processor.ts       báo cáo hằng ngày cho ADMIN/BGH
// Kết quả ghi vào notifications và audit_logs (channel = scheduler); gửi qua Telegram ở bước 8.
@Module({
  imports: [PostsModule, SettingsModule],
  providers: [
    PublishPostProcessor,
    DeadlineReminderProcessor,
    DailyReportProcessor,
    SchedulerService,
  ],
  exports: [PublishPostProcessor, DeadlineReminderProcessor, DailyReportProcessor, SchedulerService],
})
export class SchedulerModule {}
