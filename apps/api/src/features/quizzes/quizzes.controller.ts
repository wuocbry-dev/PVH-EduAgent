import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ROSTER_MAX_BYTES, XLSX_MIME } from '@pvh/shared';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { readLimitedBody } from '../../common/utils/read-limited-body.js';
import {
  answerSchema,
  availableQuerySchema,
  imagePresignSchema,
  manageQuerySchema,
  questionsSchema,
  quizSchema,
  statusSchema,
  submitSchema,
  type AnswerInput,
  type AvailableQuery,
  type ImagePresignInput,
  type ManageQuery,
  type QuestionsInput,
  type QuizInput,
  type StatusInput,
  type SubmitInput,
} from './dto/quizzes.dto.js';
import { QuizAttemptsService } from './quiz-attempts.service.js';
import { QuizImportService } from './quiz-import.service.js';
import { QuizzesService } from './quizzes.service.js';

// Trắc nghiệm ôn tập (bước 22). Quyền và đối tượng kiểm tra trong service. Kết quả không tính vào điểm học tập.
@Controller('quizzes')
export class QuizzesController {
  constructor(
    private readonly quizzes: QuizzesService,
    private readonly attempts: QuizAttemptsService,
    private readonly importer: QuizImportService,
  ) {}

  // ── Học sinh ──

  @Get('available')
  available(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(availableQuerySchema)) query: AvailableQuery) {
    return this.attempts.available(user, query);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post(':id/attempts')
  @HttpCode(200)
  start(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.attempts.start(user, id);
  }

  @Get('attempts/:attemptId')
  attempt(@CurrentUser() user: AuthUser, @Param('attemptId') attemptId: string) {
    return this.attempts.view(user, attemptId);
  }

  @Put('attempts/:attemptId/answers')
  @HttpCode(204)
  async answer(@CurrentUser() user: AuthUser, @Param('attemptId') attemptId: string, @Body(new ZodValidationPipe(answerSchema)) body: AnswerInput) {
    await this.attempts.saveAnswer(user, attemptId, body);
  }

  @Post('attempts/:attemptId/submit')
  @HttpCode(200)
  submit(@CurrentUser() user: AuthUser, @Param('attemptId') attemptId: string, @Body(new ZodValidationPipe(submitSchema)) body: SubmitInput) {
    return this.attempts.submit(user, attemptId, body);
  }

  // ── Người soạn (quiz:create, môn mình dạy) và người quản lý (quiz:manage) ──

  @Get('form-options')
  formOptions(@CurrentUser() user: AuthUser) {
    return this.quizzes.formOptions(user);
  }

  @Get('manage')
  list(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(manageQuerySchema)) query: ManageQuery) {
    return this.quizzes.list(user, query);
  }

  @Get('import-template')
  async template(@CurrentUser() user: AuthUser) {
    await this.quizzes.formOptions(user); // kiểm tra quyền soạn
    return new StreamableFile(await this.importer.template(), { type: XLSX_MIME, disposition: 'attachment; filename="mau-cau-hoi-trac-nghiem.xlsx"' });
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post('images')
  @HttpCode(200)
  presignImage(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(imagePresignSchema)) body: ImagePresignInput, @Req() req: Request) {
    return this.quizzes.presignImage(user, body, req.ip);
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post('images/:mediaId/complete')
  @HttpCode(200)
  completeImage(@CurrentUser() user: AuthUser, @Param('mediaId') mediaId: string, @Req() req: Request) {
    return this.quizzes.completeImage(user, mediaId, req.ip);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(quizSchema)) body: QuizInput, @Req() req: Request) {
    return this.quizzes.create(user, body, req.ip);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.quizzes.get(user, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(quizSchema)) body: QuizInput, @Req() req: Request) {
    return this.quizzes.update(user, id, body, req.ip);
  }

  @Put(':id/questions')
  questions(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(questionsSchema)) body: QuestionsInput,
    @Req() req: Request,
  ) {
    return this.quizzes.setQuestions(user, id, body, req.ip);
  }

  @Post(':id/status')
  @HttpCode(200)
  status(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(statusSchema)) body: StatusInput, @Req() req: Request) {
    return this.quizzes.setStatus(user, id, body, req.ip);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    await this.quizzes.remove(user, id, req.ip);
  }

  @Get(':id/stats')
  stats(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.quizzes.stats(user, id);
  }

  // File .xlsx gửi thẳng làm nội dung request (không multipart), như nhập danh sách/điểm.
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post(':id/import/preview')
  @HttpCode(200)
  async importPreview(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.quizzes.editable(user, id); // kiểm tra quyền trước khi đọc file
    const file = await readLimitedBody(req, res, ROSTER_MAX_BYTES);
    if (file.length === 0) throw new BadRequestException('Chưa chọn file Excel');
    return this.importer.preview(user, id, file);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('import/:previewId/confirm')
  @HttpCode(200)
  importConfirm(@CurrentUser() user: AuthUser, @Param('previewId') previewId: string, @Req() req: Request) {
    return this.importer.confirm(user, previewId, req.ip);
  }
}
