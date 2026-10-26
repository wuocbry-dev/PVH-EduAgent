import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module.js';
import { ScoreAdjustmentsService } from './score-adjustments.service.js';
import { ScoreCalendarService } from './score-calendar.service.js';
import { ScoreViewsController } from './score-views.controller.js';
import { ScoreViewsService } from './score-views.service.js';
import { ScoresController } from './scores.controller.js';
import { ScoresImportService } from './scores-import.service.js';
import { ScoresService } from './scores.service.js';

// Không có tool AI Agent và không có đường Telegram nào cho điểm: module này không export gì.
// Thông báo về điểm (công bố, điều chỉnh) chỉ ghi kênh `web` của bảng notifications, không bao giờ gửi qua Telegram.
@Module({
  imports: [SettingsModule],
  controllers: [ScoresController, ScoreViewsController],
  providers: [ScoresService, ScoresImportService, ScoreCalendarService, ScoreViewsService, ScoreAdjustmentsService],
})
export class ScoresModule {}
