import { Module } from '@nestjs/common';
import { AnnouncementsController } from './announcements.controller.js';
import { AnnouncementsService } from './announcements.service.js';

// Thông báo theo đối tượng (bước 20). Không có tool AI Agent: học sinh không dùng Agent, nhân sự gửi qua giao diện web.
@Module({
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService],
})
export class AnnouncementsModule {}
