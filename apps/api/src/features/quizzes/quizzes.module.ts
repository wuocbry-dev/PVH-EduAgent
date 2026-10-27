import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module.js';
import { QuizAttemptsService } from './quiz-attempts.service.js';
import { QuizImportService } from './quiz-import.service.js';
import { QuizzesController } from './quizzes.controller.js';
import { QuizzesService } from './quizzes.service.js';

// Trắc nghiệm ôn tập (bước 22). Không có tool AI Agent (học sinh không dùng Agent). Không phụ thuộc module điểm.
@Module({
  imports: [MediaModule],
  controllers: [QuizzesController],
  providers: [QuizzesService, QuizAttemptsService, QuizImportService],
})
export class QuizzesModule {}
