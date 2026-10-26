import { Module } from '@nestjs/common';
import { ScoresController } from './scores.controller.js';
import { ScoresImportService } from './scores-import.service.js';
import { ScoresService } from './scores.service.js';

// Không có tool AI Agent và không có đường Telegram nào cho điểm: module này không export gì.
@Module({
  controllers: [ScoresController],
  providers: [ScoresService, ScoresImportService],
})
export class ScoresModule {}
