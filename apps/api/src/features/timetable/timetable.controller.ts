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
  createVersionSchema,
  exportQuerySchema,
  fixedPeriodSchema,
  moveSlotSchema,
  optionsQuerySchema,
  placeSlotSchema,
  publishSchema,
  setUnavailabilitySchema,
  slotsQuerySchema,
  unavailabilityQuerySchema,
  versionsQuerySchema,
  weekQuerySchema,
  type CreateVersionInput,
  type ExportQuery,
  type FixedPeriodInput,
  type MoveSlotInput,
  type OptionsQuery,
  type PlaceSlotInput,
  type PublishInput,
  type SetUnavailabilityInput,
  type SlotsQuery,
  type UnavailabilityQuery,
  type VersionsQuery,
  type WeekQuery,
} from './dto/timetable.dto.js';
import { frameSchema, type FrameInput } from './frame.js';
import { TimetableViewService } from './timetable-view.service.js';
import { TimetableService } from './timetable.service.js';

// Thời khoá biểu (bước 17). Quyền kiểm tra trong service; xem lịch theo phạm vi của người hỏi (TimetableViewService).
@Controller('timetable')
export class TimetableController {
  constructor(
    private readonly timetable: TimetableService,
    private readonly views: TimetableViewService,
  ) {}

  // ── Khung tiết (ai đăng nhập cũng xem được; sửa cần timetable:manage hoặc setting:manage)
  @Get('frame')
  frame() {
    return this.timetable.getFrame();
  }

  @Put('frame')
  setFrame(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(frameSchema)) body: FrameInput, @Req() req: Request) {
    return this.timetable.setFrame(user, body, req.ip);
  }

  // ── Phiên bản
  @Get('versions')
  versions(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(versionsQuerySchema)) query: VersionsQuery) {
    return this.timetable.listVersions(user, query);
  }

  @Post('versions')
  createVersion(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createVersionSchema)) body: CreateVersionInput,
    @Req() req: Request,
  ) {
    return this.timetable.createVersion(user, body, req.ip);
  }

  @Delete('versions/:id')
  @HttpCode(204)
  async deleteVersion(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    await this.timetable.deleteVersion(user, id, req.ip);
  }

  @Post('versions/:id/publish')
  @HttpCode(200)
  publish(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(publishSchema)) body: PublishInput,
    @Req() req: Request,
  ) {
    return this.timetable.publish(user, id, body, req.ip);
  }

  @Get('versions/:id/slots')
  slots(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query(new ZodValidationPipe(slotsQuerySchema)) query: SlotsQuery,
  ) {
    return this.timetable.getSlots(user, id, query);
  }

  @Post('versions/:id/slots')
  placeSlot(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(placeSlotSchema)) body: PlaceSlotInput,
    @Req() req: Request,
  ) {
    return this.timetable.placeSlot(user, id, body, req.ip);
  }

  @Get('versions/:id/options')
  options(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query(new ZodValidationPipe(optionsQuerySchema)) query: OptionsQuery,
  ) {
    return this.timetable.options(user, id, query);
  }

  @Get('versions/:id/stats')
  stats(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.timetable.stats(user, id);
  }

  // ── Từng tiết
  @Patch('slots/:id')
  moveSlot(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(moveSlotSchema)) body: MoveSlotInput,
    @Req() req: Request,
  ) {
    return this.timetable.moveSlot(user, id, body, req.ip);
  }

  @Delete('slots/:id')
  @HttpCode(204)
  async deleteSlot(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    await this.timetable.deleteSlot(user, id, req.ip);
  }

  // ── Tiết cố định
  @Get('fixed')
  fixed() {
    return this.timetable.listFixed();
  }

  @Post('fixed')
  createFixed(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(fixedPeriodSchema)) body: FixedPeriodInput,
    @Req() req: Request,
  ) {
    return this.timetable.createFixed(user, body, req.ip);
  }

  @Delete('fixed/:id')
  @HttpCode(204)
  async deleteFixed(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    await this.timetable.deleteFixed(user, id, req.ip);
  }

  // ── Tiết bận của giáo viên (chỉ để BGH tham khảo)
  @Get('unavailability/mine')
  myUnavailability(@CurrentUser() user: AuthUser) {
    return this.timetable.myUnavailability(user);
  }

  @Put('unavailability/mine')
  setMyUnavailability(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(setUnavailabilitySchema)) body: SetUnavailabilityInput,
    @Req() req: Request,
  ) {
    return this.timetable.setMyUnavailability(user, body, req.ip);
  }

  @Get('unavailability')
  unavailability(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(unavailabilityQuerySchema)) query: UnavailabilityQuery,
  ) {
    return this.timetable.listUnavailability(user, query);
  }

  // ── Xem lịch theo tuần (phiên bản có hiệu lực theo từng ngày)
  @Get('view/mine')
  viewMine(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(weekQuerySchema)) query: WeekQuery) {
    return this.views.mine(user, query.date);
  }

  @Get('view/class/:classId')
  viewClass(
    @CurrentUser() user: AuthUser,
    @Param('classId') classId: string,
    @Query(new ZodValidationPipe(weekQuerySchema)) query: WeekQuery,
  ) {
    return this.views.classWeek(user, classId, query.date);
  }

  @Get('view/teacher/:teacherId')
  viewTeacher(
    @CurrentUser() user: AuthUser,
    @Param('teacherId') teacherId: string,
    @Query(new ZodValidationPipe(weekQuerySchema)) query: WeekQuery,
  ) {
    return this.views.teacherWeek(user, teacherId, query.date);
  }

  // ── Xuất Excel
  @Get('export')
  async export(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(exportQuerySchema)) query: ExportQuery) {
    return new StreamableFile(await this.views.exportWorkbook(user, query), {
      type: XLSX_MIME,
      disposition: `attachment; filename="thoi-khoa-bieu-${query.scope}.xlsx"`,
    });
  }
}
