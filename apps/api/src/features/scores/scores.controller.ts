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
  assessmentsQuerySchema,
  createAssessmentSchema,
  exemptionSchema,
  progressQuerySchema,
  saveScoresSchema,
  updateAssessmentSchema,
  type AssessmentsQuery,
  type CreateAssessmentInput,
  type ExemptionInput,
  type ProgressQuery,
  type SaveScoresInput,
  type UpdateAssessmentInput,
} from './dto/scores.dto.js';
import { ScoresImportService } from './scores-import.service.js';
import { ScoresService } from './scores.service.js';

// Đợt thi và nhập điểm (bước 18). Quyền và phạm vi phân công kiểm tra trong ScoresService.
@Controller('scores')
export class ScoresController {
  constructor(
    private readonly scores: ScoresService,
    private readonly importer: ScoresImportService,
  ) {}

  @Get('context')
  context(@CurrentUser() user: AuthUser) {
    return this.scores.context(user);
  }

  @Get('progress')
  progress(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(progressQuerySchema)) query: ProgressQuery) {
    return this.scores.progress(user, query);
  }

  @Get('assessments')
  list(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(assessmentsQuerySchema)) query: AssessmentsQuery) {
    return this.scores.list(user, query);
  }

  @Post('assessments')
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createAssessmentSchema)) body: CreateAssessmentInput,
    @Req() req: Request,
  ) {
    return this.scores.create(user, body, req.ip);
  }

  @Patch('assessments/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAssessmentSchema)) body: UpdateAssessmentInput,
    @Req() req: Request,
  ) {
    return this.scores.update(user, id, body, req.ip);
  }

  @Delete('assessments/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    return this.scores.remove(user, id, req.ip);
  }

  @Get('assessments/:id/classes/:classId')
  sheet(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('classId') classId: string) {
    return this.scores.sheet(user, id, classId);
  }

  @Put('assessments/:id/classes/:classId')
  save(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('classId') classId: string,
    @Body(new ZodValidationPipe(saveScoresSchema)) body: SaveScoresInput,
    @Req() req: Request,
  ) {
    return this.scores.save(user, id, classId, body, req.ip);
  }

  @Post('assessments/:id/classes/:classId/publish')
  @HttpCode(200)
  publish(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('classId') classId: string, @Req() req: Request) {
    return this.scores.publish(user, id, classId, req.ip);
  }

  @Put('assessments/:id/classes/:classId/exemptions/:studentId')
  exempt(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('classId') classId: string,
    @Param('studentId') studentId: string,
    @Body(new ZodValidationPipe(exemptionSchema)) body: ExemptionInput,
    @Req() req: Request,
  ) {
    return this.scores.setExemption(user, id, classId, studentId, body, req.ip);
  }

  @Get('assessments/:id/classes/:classId/template')
  async template(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('classId') classId: string) {
    const { file, filename } = await this.importer.template(user, id, classId);
    return new StreamableFile(file, { type: XLSX_MIME, disposition: `attachment; filename="${filename}"` });
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('assessments/:id/classes/:classId/import/preview')
  @HttpCode(200)
  async preview(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('classId') classId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Kiểm tra quyền/phạm vi trước khi đọc file.
    await this.importer.checkAccess(user, id, classId);
    const file = await readLimitedBody(req, res, ROSTER_MAX_BYTES);
    if (file.length === 0) throw new BadRequestException('Chưa chọn file Excel');
    return this.importer.preview(user, id, classId, file, req.ip);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('import/:previewId/confirm')
  @HttpCode(200)
  confirm(@CurrentUser() user: AuthUser, @Param('previewId') previewId: string, @Req() req: Request) {
    return this.importer.confirm(user, previewId, req.ip);
  }
}
