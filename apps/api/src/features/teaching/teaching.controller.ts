import {
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
  StreamableFile,
} from '@nestjs/common';
import { XLSX_MIME } from '@pvh/shared';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import {
  assignmentsQuerySchema,
  copyAssignmentsSchema,
  createAssignmentSchema,
  quotasQuerySchema,
  setClassQuotaSchema,
  setGradeQuotaSchema,
  summaryQuerySchema,
  teacherQuotaSchema,
  updateAssignmentSchema,
  type AssignmentsQuery,
  type CopyAssignmentsInput,
  type CreateAssignmentInput,
  type QuotasQuery,
  type SetClassQuotaInput,
  type SetGradeQuotaInput,
  type SummaryQuery,
  type TeacherQuotaInput,
  type UpdateAssignmentInput,
} from './dto/teaching.dto.js';
import { TeachingService } from './teaching.service.js';

// Phân công giảng dạy (bước 16). Quyền kiểm tra trong TeachingService.
@Controller('teaching')
export class TeachingController {
  constructor(private readonly teaching: TeachingService) {}

  @Get('quotas')
  quotas(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(quotasQuerySchema)) query: QuotasQuery) {
    return this.teaching.getQuotas(user, query);
  }

  @Put('quotas')
  setGradeQuota(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(setGradeQuotaSchema)) body: SetGradeQuotaInput,
    @Req() req: Request,
  ) {
    return this.teaching.setGradeQuota(user, body, req.ip);
  }

  @Put('quotas/class')
  setClassQuota(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(setClassQuotaSchema)) body: SetClassQuotaInput,
    @Req() req: Request,
  ) {
    return this.teaching.setClassQuota(user, body, req.ip);
  }

  @Get('assignments')
  assignments(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(assignmentsQuerySchema)) query: AssignmentsQuery,
  ) {
    return this.teaching.listAssignments(user, query);
  }

  @Post('assignments')
  createAssignment(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createAssignmentSchema)) body: CreateAssignmentInput,
    @Req() req: Request,
  ) {
    return this.teaching.createAssignment(user, body, req.ip);
  }

  @Post('assignments/copy')
  @HttpCode(200)
  copyAssignments(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(copyAssignmentsSchema)) body: CopyAssignmentsInput,
    @Req() req: Request,
  ) {
    return this.teaching.copyAssignments(user, body, req.ip);
  }

  @Patch('assignments/:id')
  updateAssignment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAssignmentSchema)) body: UpdateAssignmentInput,
    @Req() req: Request,
  ) {
    return this.teaching.updateAssignment(user, id, body, req.ip);
  }

  @Delete('assignments/:id')
  @HttpCode(204)
  async deleteAssignment(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    await this.teaching.deleteAssignment(user, id, req.ip);
  }

  @Get('summary')
  summary(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(summaryQuerySchema)) query: SummaryQuery) {
    return this.teaching.summary(user, query);
  }

  @Get('summary/export')
  async exportSummary(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(summaryQuerySchema)) query: SummaryQuery) {
    return new StreamableFile(await this.teaching.exportSummary(user, query), {
      type: XLSX_MIME,
      disposition: 'attachment; filename="phan-cong-giang-day.xlsx"',
    });
  }

  // Lớp tôi dạy: chỉ phân công của chính mình.
  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.teaching.mine(user);
  }

  @Put('teachers/:userId/quota')
  @HttpCode(204)
  async setTeacherQuota(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(teacherQuotaSchema)) body: TeacherQuotaInput,
    @Req() req: Request,
  ) {
    await this.teaching.setTeacherQuota(user, userId, body, req.ip);
  }
}
