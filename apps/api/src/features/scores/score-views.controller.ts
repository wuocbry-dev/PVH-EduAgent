import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Req, StreamableFile } from '@nestjs/common';
import { XLSX_MIME } from '@pvh/shared';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import {
  adjustmentsQuerySchema,
  classSummaryQuerySchema,
  createAdjustmentSchema,
  deadlineSchema,
  gradebookQuerySchema,
  lockSchema,
  reviewAdjustmentSchema,
  statsQuerySchema,
  type AdjustmentsQuery,
  type ClassSummaryQuery,
  type CreateAdjustmentInput,
  type DeadlineInput,
  type GradebookQuery,
  type LockInput,
  type ReviewAdjustmentInput,
  type StatsQuery,
} from './dto/score-views.dto.js';
import { ScoreAdjustmentsService } from './score-adjustments.service.js';
import { ScoreCalendarService } from './score-calendar.service.js';
import { formulaSchema, type FormulaInput } from './score-formula.js';
import { ScoreViewsService } from './score-views.service.js';

const xlsx = ({ file, filename }: { file: Buffer; filename: string }) =>
  new StreamableFile(file, { type: XLSX_MIME, disposition: `attachment; filename="${filename}"` });

// Xem điểm, thống kê, hạn nhập/khoá sổ, công thức ĐTB, điều chỉnh điểm sau hạn (bước 19). Quyền và phạm vi kiểm tra trong service.
@Controller('scores')
export class ScoreViewsController {
  constructor(
    private readonly views: ScoreViewsService,
    private readonly calendar: ScoreCalendarService,
    private readonly adjustments: ScoreAdjustmentsService,
  ) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.views.myReport(user);
  }

  @Get('students/:studentId/report')
  studentReport(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string) {
    return this.views.studentReport(user, studentId);
  }

  @Get('gradebook')
  gradebook(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(gradebookQuerySchema)) query: GradebookQuery) {
    return this.views.gradebook(user, query);
  }

  @Get('gradebook/export')
  async exportGradebook(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(gradebookQuerySchema)) query: GradebookQuery,
    @Req() req: Request,
  ) {
    return xlsx(await this.views.exportGradebook(user, query, req.ip));
  }

  @Get('classes/:classId/summary')
  classSummary(
    @CurrentUser() user: AuthUser,
    @Param('classId') classId: string,
    @Query(new ZodValidationPipe(classSummaryQuerySchema)) query: ClassSummaryQuery,
  ) {
    return this.views.classSummary(user, classId, query);
  }

  @Get('classes/:classId/summary/export')
  async exportClassSummary(
    @CurrentUser() user: AuthUser,
    @Param('classId') classId: string,
    @Query(new ZodValidationPipe(classSummaryQuerySchema)) query: ClassSummaryQuery,
    @Req() req: Request,
  ) {
    return xlsx(await this.views.exportClassSummary(user, classId, query, req.ip));
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(statsQuerySchema)) query: StatsQuery) {
    return this.views.stats(user, query);
  }

  @Get('formula')
  formula() {
    return this.calendar.formulaDto();
  }

  @Put('formula')
  setFormula(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(formulaSchema)) body: FormulaInput, @Req() req: Request) {
    return this.calendar.setFormula(user, body, req.ip);
  }

  @Get('locks')
  locks(@CurrentUser() user: AuthUser) {
    return this.calendar.locks(user);
  }

  @Put('deadlines')
  setDeadline(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(deadlineSchema)) body: DeadlineInput, @Req() req: Request) {
    return this.calendar.setDeadline(user, body, req.ip);
  }

  @Put('locks/:semesterId')
  setLock(
    @CurrentUser() user: AuthUser,
    @Param('semesterId') semesterId: string,
    @Body(new ZodValidationPipe(lockSchema)) body: LockInput,
    @Req() req: Request,
  ) {
    return this.calendar.setLock(user, semesterId, body, req.ip);
  }

  @Get('adjustments')
  listAdjustments(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(adjustmentsQuerySchema)) query: AdjustmentsQuery) {
    return this.adjustments.list(user, query);
  }

  @Post('adjustments')
  createAdjustment(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createAdjustmentSchema)) body: CreateAdjustmentInput,
    @Req() req: Request,
  ) {
    return this.adjustments.create(user, body, req.ip);
  }

  @Post('adjustments/:id/approve')
  @HttpCode(200)
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reviewAdjustmentSchema)) body: ReviewAdjustmentInput,
    @Req() req: Request,
  ) {
    return this.adjustments.approve(user, id, body, req.ip);
  }

  @Post('adjustments/:id/reject')
  @HttpCode(200)
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reviewAdjustmentSchema)) body: ReviewAdjustmentInput,
    @Req() req: Request,
  ) {
    return this.adjustments.reject(user, id, body, req.ip);
  }

  @Post('adjustments/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    return this.adjustments.cancel(user, id, req.ip);
  }
}
