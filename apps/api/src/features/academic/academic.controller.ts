import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { AcademicService } from './academic.service.js';
import {
  classQuerySchema,
  classSchema,
  departmentSchema,
  roomSchema,
  schoolYearSchema,
  semesterQuerySchema,
  semesterSchema,
  subjectSchema,
  transferStudentSchema,
  updateClassSchema,
  updateRoomSchema,
  updateSchoolYearSchema,
  updateSemesterSchema,
  updateSubjectSchema,
  type ClassInput,
  type ClassQuery,
  type DepartmentInput,
  type RoomInput,
  type SchoolYearInput,
  type SemesterInput,
  type SemesterQuery,
  type SubjectInput,
  type TransferStudentInput,
  type UpdateClassInput,
  type UpdateRoomInput,
  type UpdateSchoolYearInput,
  type UpdateSemesterInput,
  type UpdateSubjectInput,
} from './dto/academic.dto.js';

// Dữ liệu học vụ gốc (bước 14). Quyền kiểm tra trong AcademicService.
@Controller('academic')
export class AcademicController {
  constructor(private readonly academic: AcademicService) {}

  // ── Năm học & học kỳ
  @Get('school-years')
  listSchoolYears(@CurrentUser() user: AuthUser) {
    return this.academic.listSchoolYears(user);
  }

  @Post('school-years')
  createSchoolYear(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(schoolYearSchema)) body: SchoolYearInput,
    @Req() req: Request,
  ) {
    return this.academic.createSchoolYear(user, body, req.ip);
  }

  @Patch('school-years/:id')
  updateSchoolYear(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSchoolYearSchema)) body: UpdateSchoolYearInput,
    @Req() req: Request,
  ) {
    return this.academic.updateSchoolYear(user, id, body, req.ip);
  }

  @Delete('school-years/:id')
  @HttpCode(204)
  async deleteSchoolYear(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    await this.academic.deleteSchoolYear(user, id, req.ip);
  }

  @Get('semesters')
  listSemesters(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(semesterQuerySchema)) query: SemesterQuery,
  ) {
    return this.academic.listSemesters(user, query);
  }

  @Post('semesters')
  createSemester(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(semesterSchema)) body: SemesterInput,
    @Req() req: Request,
  ) {
    return this.academic.createSemester(user, body, req.ip);
  }

  @Patch('semesters/:id')
  updateSemester(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSemesterSchema)) body: UpdateSemesterInput,
    @Req() req: Request,
  ) {
    return this.academic.updateSemester(user, id, body, req.ip);
  }

  @Delete('semesters/:id')
  @HttpCode(204)
  async deleteSemester(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    await this.academic.deleteSemester(user, id, req.ip);
  }

  // ── Khối, tổ, môn, phòng
  @Get('grades')
  listGrades(@CurrentUser() user: AuthUser) {
    return this.academic.listGrades(user);
  }

  @Get('departments')
  listDepartments(@CurrentUser() user: AuthUser) {
    return this.academic.listDepartments(user);
  }

  @Post('departments')
  createDepartment(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(departmentSchema)) body: DepartmentInput,
    @Req() req: Request,
  ) {
    return this.academic.createDepartment(user, body, req.ip);
  }

  @Patch('departments/:id')
  updateDepartment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(departmentSchema)) body: DepartmentInput,
    @Req() req: Request,
  ) {
    return this.academic.updateDepartment(user, id, body, req.ip);
  }

  @Delete('departments/:id')
  @HttpCode(204)
  async deleteDepartment(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    await this.academic.deleteDepartment(user, id, req.ip);
  }

  @Get('subjects')
  listSubjects(@CurrentUser() user: AuthUser) {
    return this.academic.listSubjects(user);
  }

  @Post('subjects')
  createSubject(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(subjectSchema)) body: SubjectInput,
    @Req() req: Request,
  ) {
    return this.academic.createSubject(user, body, req.ip);
  }

  @Patch('subjects/:id')
  updateSubject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSubjectSchema)) body: UpdateSubjectInput,
    @Req() req: Request,
  ) {
    return this.academic.updateSubject(user, id, body, req.ip);
  }

  @Delete('subjects/:id')
  @HttpCode(204)
  async deleteSubject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    await this.academic.deleteSubject(user, id, req.ip);
  }

  @Get('rooms')
  listRooms(@CurrentUser() user: AuthUser) {
    return this.academic.listRooms(user);
  }

  @Post('rooms')
  createRoom(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(roomSchema)) body: RoomInput,
    @Req() req: Request,
  ) {
    return this.academic.createRoom(user, body, req.ip);
  }

  @Patch('rooms/:id')
  updateRoom(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateRoomSchema)) body: UpdateRoomInput,
    @Req() req: Request,
  ) {
    return this.academic.updateRoom(user, id, body, req.ip);
  }

  @Delete('rooms/:id')
  @HttpCode(204)
  async deleteRoom(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    await this.academic.deleteRoom(user, id, req.ip);
  }

  // ── Lớp
  @Get('teachers')
  teacherOptions(@CurrentUser() user: AuthUser) {
    return this.academic.teacherOptions(user);
  }

  @Get('classes')
  listClasses(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(classQuerySchema)) query: ClassQuery,
  ) {
    return this.academic.listClasses(user, query);
  }

  @Post('classes')
  createClass(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(classSchema)) body: ClassInput,
    @Req() req: Request,
  ) {
    return this.academic.createClass(user, body, req.ip);
  }

  @Patch('classes/:id')
  updateClass(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateClassSchema)) body: UpdateClassInput,
    @Req() req: Request,
  ) {
    return this.academic.updateClass(user, id, body, req.ip);
  }

  @Delete('classes/:id')
  @HttpCode(204)
  async deleteClass(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    await this.academic.deleteClass(user, id, req.ip);
  }

  @Get('classes/:id/students')
  listClassStudents(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.academic.listClassStudents(user, id);
  }

  @Post('students/:userId/transfer')
  @HttpCode(204)
  async transferStudent(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(transferStudentSchema)) body: TransferStudentInput,
    @Req() req: Request,
  ) {
    await this.academic.transferStudent(user, userId, body.classId, req.ip);
  }
}
