import { Module } from '@nestjs/common';
import { AgentActionsModule } from '../agent-actions/agent-actions.module.js';
import { AgentModule } from '../agent/agent.module.js';
import { SystemModule } from '../system/system.module.js';
import { MediaModule } from '../media/media.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { UsersModule } from '../users/users.module.js';
import { TelegramAlbumService } from './telegram-album.service.js';
import { TelegramBotService } from './telegram-bot.service.js';
import { TelegramContextService } from './telegram-context.service.js';
import { TelegramFileService } from './telegram-file.service.js';
import { TelegramLinkService } from './telegram-link.service.js';
import { TelegramNotifierService } from './telegram-notifier.service.js';
import { TelegramRateLimiter } from './telegram-rate-limiter.js';
import { TelegramController } from './telegram.controller.js';

// A01–A04 – bot Telegram:
// - telegram-link.service.ts      OTP liên kết (Redis, băm, 5 phút), /unlink và huỷ liên kết trên web
// - telegram-bot.service.ts       grammY: /start /help /status /deadline /unlink, tin tự do → AgentService
// - telegram-file/album/context  nhận ảnh/video (tải file, gom album, ngữ cảnh soạn bài 30 phút trong Redis)
// - telegram-notifier.service.ts  gửi bảng notifications cho người đã liên kết rồi đặt sent_at
// - telegram.controller.ts        webhook @Public() (header secret) và API liên kết cho CMS
@Module({
  imports: [UsersModule, SystemModule, TasksModule, AgentModule, AgentActionsModule, MediaModule],
  controllers: [TelegramController],
  providers: [
    TelegramBotService,
    TelegramLinkService,
    TelegramNotifierService,
    TelegramRateLimiter,
    TelegramContextService,
    TelegramAlbumService,
    TelegramFileService,
  ],
})
export class TelegramModule {}
