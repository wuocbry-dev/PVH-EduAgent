import { Module } from '@nestjs/common';

// Bộ lập lịch (A05, A06, A09) dùng Redis + BullMQ — sẽ gồm:
// - publish-post.processor.ts       đăng bài đã duyệt khi đến publishAt, retry 3 lần
// - deadline-reminder.processor.ts  nhắc hạn trước X giờ, báo quá hạn
// - daily-report.processor.ts       báo cáo 7h sáng qua Telegram
@Module({})
export class SchedulerModule {}
