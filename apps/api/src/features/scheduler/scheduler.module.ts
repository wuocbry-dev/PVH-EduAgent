import { Module } from '@nestjs/common';
import { AgentActionsModule } from '../agent-actions/agent-actions.module.js';
import { MediaModule } from '../media/media.module.js';
import { MonitoringModule } from '../monitoring/monitoring.module.js';
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
// - hàng đợi media-cleanup          mỗi 15 phút xoá bản ghi media chờ quá 1 giờ chưa hoàn tất và object mồ côi (F13)
// - hàng đợi agent-action           mỗi phút chuyển hành động agent chờ xác nhận quá 10 phút sang EXPIRED (A08)
// - hàng đợi monitoring (bước 26)  kiểm tra sức khoẻ mỗi phút, đo dung lượng kho mỗi giờ, dọn dữ liệu giám sát mỗi ngày
// Mọi job thất bại hẳn được ghi vào system_errors (thất bại liên tiếp thì cảnh báo ADMIN).
// Kết quả ghi vào notifications (bot Telegram gửi cho người đã liên kết) và audit_logs (channel = scheduler).
@Module({
  imports: [PostsModule, SettingsModule, AgentActionsModule, MediaModule, MonitoringModule],
  providers: [
    PublishPostProcessor,
    DeadlineReminderProcessor,
    DailyReportProcessor,
    SchedulerService,
  ],
  exports: [PublishPostProcessor, DeadlineReminderProcessor, DailyReportProcessor, SchedulerService],
})
export class SchedulerModule {}
