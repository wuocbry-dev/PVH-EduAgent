import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  AccountSlipDto,
  RosterConfirmDto,
  RosterKind,
  RosterPreviewDto,
} from '@pvh/shared';
import { assertPermission, can } from '../../common/guards/permission.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { parseId } from '../../common/utils/parse-id.js';
import { isUniqueViolation } from '../../common/utils/prisma-errors.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { RedisService } from '../../infrastructure/queue/redis.service.js';
import { ActivationService, UNUSABLE_PASSWORD_HASH } from '../activation/activation.service.js';
import { isHomeroomOf } from '../academic/homeroom.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { normalizeHeader, readRoster, type RawRow } from './excel.js';
import { classKey, validateRows, type RosterContext, type ValidatedRow } from './roster-validate.js';

const PREVIEW_TTL_SEC = 30 * 60;

interface StoredPreview {
  kind: RosterKind;
  actorId: string;
  schoolYearId: string;
  raw: RawRow[];
}

// Nhập danh sách giáo viên/học sinh từ Excel (xem trước → xác nhận) và phát hành mã kích hoạt (bước 14).
// Quyền `student:import` (ADMIN). Cấp lại mã: ADMIN hoặc giáo viên chủ nhiệm đúng lớp của học sinh.
@Injectable()
export class RosterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly activation: ActivationService,
    private readonly audit: AuditLogService,
  ) {}

  // Bước 1: đọc và kiểm tra từng dòng, chưa ghi gì vào CSDL. Dữ liệu thô giữ trong Redis 30 phút (không ghi đĩa).
  async preview(actor: AuthUser, kind: RosterKind, file: Buffer, ip?: string): Promise<RosterPreviewDto> {
    assertPermission(actor, 'student:import');
    const client = this.redis.client;
    if (!client) throw new ServiceUnavailableException('Nhập danh sách cần Redis (REDIS_URL) để lưu bản xem trước');
    const year = await this.currentYear();
    const raw = await readRoster(file, kind);
    if (raw.length === 0) throw new BadRequestException('File không có dòng dữ liệu nào');

    const previewId = randomUUID();
    const stored: StoredPreview = { kind, actorId: actor.id, schoolYearId: year.id.toString(), raw };
    await client.set(this.redis.key('roster', 'preview', previewId), JSON.stringify(stored), 'EX', PREVIEW_TTL_SEC);

    const rows = (await this.validate(kind, year.id, raw)).map((v) => v.dto);
    const count = (s: string) => rows.filter((r) => r.status === s).length;
    await this.audit.record({
      userId: actor.id,
      channel: 'web',
      action: 'roster.preview',
      params: { kind, rows: rows.length, ok: count('ok'), skipped: count('skip'), errors: count('error') },
      ok: true,
      ip,
    });
    return {
      previewId,
      kind,
      total: rows.length,
      ok: count('ok'),
      skipped: count('skip'),
      errors: count('error'),
      rows,
      expiresAt: new Date(Date.now() + PREVIEW_TTL_SEC * 1000).toISOString(),
    };
  }

  // Bước 2: kiểm tra lại với CSDL hiện tại rồi tạo các dòng hợp lệ trong MỘT transaction. Mỗi bản xem trước chỉ dùng được một lần.
  async confirm(actor: AuthUser, previewId: string, ip?: string): Promise<RosterConfirmDto> {
    assertPermission(actor, 'student:import');
    const client = this.redis.client;
    if (!client) throw new ServiceUnavailableException('Nhập danh sách cần Redis (REDIS_URL)');
    if (!/^[0-9a-f-]{36}$/.test(previewId)) throw new NotFoundException('Bản xem trước không tồn tại hoặc đã hết hạn');

    const json = await client.getdel(this.redis.key('roster', 'preview', previewId));
    const stored = json ? (JSON.parse(json) as StoredPreview) : null;
    if (!stored || stored.actorId !== actor.id) {
      throw new NotFoundException('Bản xem trước không tồn tại hoặc đã hết hạn, hãy tải file lên lại');
    }

    const validated = await this.validate(stored.kind, BigInt(stored.schoolYearId), stored.raw);
    const okRows = validated.filter((v): v is Required<ValidatedRow> => v.data !== undefined);
    const skipped = validated.length - okRows.length;
    if (okRows.length === 0) return { created: 0, skipped, slips: [] };

    const role = await this.prisma.role.findUniqueOrThrow({ where: { code: stored.kind === 'STUDENT' ? 'STUDENT' : 'TEACHER' } });
    const yearId = BigInt(stored.schoolYearId);

    let slips: AccountSlipDto[];
    try {
      slips = await this.prisma.$transaction(
        async (tx) => {
          // Cấp sẵn id để nối các bảng con bằng createMany (nhanh hơn nhiều so với 800+ lần create lồng nhau).
          const ids = await tx.$queryRaw<{ id: bigint }[]>`
            SELECT nextval(pg_get_serial_sequence('users', 'id')) AS id FROM generate_series(1, ${okRows.length}::int)`;
          const userIds = ids.map((i) => BigInt(i.id));

          await tx.user.createMany({
            data: okRows.map((r, i) => ({
              id: userIds[i]!,
              email: r.data.email,
              fullName: r.data.fullName,
              phone: r.data.phone,
              passwordHash: UNUSABLE_PASSWORD_HASH,
              status: 'PENDING' as const,
            })),
          });
          await tx.userRole.createMany({ data: userIds.map((userId) => ({ userId, roleId: role.id })) });

          if (stored.kind === 'STUDENT') {
            await tx.studentProfile.createMany({
              data: okRows.map((r, i) => ({
                userId: userIds[i]!,
                studentCode: r.data.code,
                birthDate: r.data.birthDate,
                gender: r.data.gender,
              })),
            });
            await tx.classEnrollment.createMany({
              data: okRows.map((r, i) => ({ studentId: userIds[i]!, classId: r.data.classId!, schoolYearId: yearId })),
            });
          } else {
            await tx.teacherProfile.createMany({
              data: okRows.map((r, i) => ({ userId: userIds[i]!, teacherCode: r.data.code, departmentId: r.data.departmentId })),
            });
            for (const [i, r] of okRows.entries()) {
              if (!r.data.homeroomClassId) continue;
              const { count } = await tx.schoolClass.updateMany({
                where: { id: r.data.homeroomClassId, homeroomTeacherId: null },
                data: { homeroomTeacherId: userIds[i]! },
              });
              if (count !== 1) throw new ConflictException(`Lớp ${r.data.className} vừa được gán giáo viên chủ nhiệm khác, hãy tải file lên lại`);
            }
          }

          const issued = await this.activation.issueMany(tx, userIds, actor.id);
          return okRows
            .map((r, i): AccountSlipDto => ({
              userId: userIds[i]!.toString(),
              loginId: r.data.code,
              fullName: r.data.fullName,
              className: r.data.className,
              email: r.data.email,
              activationCode: issued[i]!.code,
              expiresAt: issued[i]!.expiresAt.toISOString(),
            }))
            .sort((a, b) => (a.className ?? '').localeCompare(b.className ?? '') || a.loginId.localeCompare(b.loginId));
        },
        { timeout: 120_000, maxWait: 10_000 },
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('Có mã hoặc email vừa được tạo ở nơi khác, hãy tải file lên lại để xem trước');
      }
      throw err;
    }

    // Chỉ ghi số lượng, không ghi danh sách học sinh vào nhật ký.
    await this.audit.record({
      userId: actor.id,
      channel: 'web',
      action: 'roster.import',
      params: { kind: stored.kind, created: slips.length, skipped },
      ok: true,
      ip,
    });
    return { created: slips.length, skipped, slips };
  }

  // Cấp lại mã kích hoạt cho một tài khoản (quên mật khẩu, mất phiếu). ADMIN: mọi học sinh/giáo viên;
  // giáo viên chủ nhiệm: học sinh thuộc lớp mình chủ nhiệm trong năm học hiện hành. Thu hồi mọi phiên đăng nhập.
  async reissue(actor: AuthUser, userId: string, ip?: string): Promise<AccountSlipDto> {
    const id = parseId(userId);
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        studentProfile: true,
        teacherProfile: true,
        enrollments: { where: { schoolYear: { isCurrent: true } }, include: { class: true } },
      },
    });
    if (!user || (!user.studentProfile && !user.teacherProfile)) {
      // Người không đủ quyền không phân biệt được "không tồn tại" với "không phải học sinh của lớp mình".
      if (!can(actor, 'student:import')) assertPermission(actor, 'student:import');
      throw new NotFoundException('Không tìm thấy học sinh hoặc giáo viên');
    }
    const enrollment = user.enrollments[0];
    if (!can(actor, 'student:import')) {
      const allowed = !!user.studentProfile && !!enrollment && (await isHomeroomOf(this.prisma, actor, enrollment.classId));
      if (!allowed) assertPermission(actor, 'student:import');
    }
    if (user.status === 'LOCKED') throw new ConflictException('Tài khoản đang bị khóa, hãy mở khóa trước khi cấp lại mã');

    const issued = await this.prisma.$transaction(async (tx) => {
      const result = await this.activation.issue(tx, id, actor.id);
      await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      return result;
    });
    await this.audit.record({
      userId: actor.id,
      channel: 'web',
      action: 'roster.reissue_code',
      targetType: 'user',
      targetId: user.id.toString(),
      params: { loginId: user.studentProfile?.studentCode ?? user.teacherProfile?.teacherCode },
      ok: true,
      ip,
    });
    return {
      userId: user.id.toString(),
      loginId: user.studentProfile?.studentCode ?? user.teacherProfile!.teacherCode,
      fullName: user.fullName,
      className: enrollment?.class.name ?? null,
      email: user.email,
      activationCode: issued.code,
      expiresAt: issued.expiresAt.toISOString(),
    };
  }

  // Phát hành phiếu cho cả lớp: chỉ học sinh còn CHỜ KÍCH HOẠT (không đụng tài khoản đã dùng).
  async issueForClass(actor: AuthUser, classId: string, ip?: string): Promise<AccountSlipDto[]> {
    assertPermission(actor, 'student:import');
    const cls = await this.prisma.schoolClass.findUnique({ where: { id: parseId(classId) } });
    if (!cls) throw new NotFoundException('Không tìm thấy lớp');
    const students = await this.prisma.classEnrollment.findMany({
      where: { classId: cls.id, student: { status: 'PENDING' } },
      include: { student: { include: { studentProfile: true } } },
    });
    const issued = await this.prisma.$transaction((tx) =>
      this.activation.issueMany(tx, students.map((s) => s.studentId), actor.id),
    );
    const codes = new Map(issued.map((i) => [i.userId, i]));
    await this.audit.record({
      userId: actor.id,
      channel: 'web',
      action: 'roster.issue_class_codes',
      targetType: 'class',
      targetId: cls.id.toString(),
      params: { class: cls.name, count: issued.length },
      ok: true,
      ip,
    });
    return students
      .filter((s) => s.student.studentProfile)
      .map((s): AccountSlipDto => ({
        userId: s.studentId.toString(),
        loginId: s.student.studentProfile!.studentCode,
        fullName: s.student.fullName,
        className: cls.name,
        email: s.student.email,
        activationCode: codes.get(s.studentId.toString())!.code,
        expiresAt: codes.get(s.studentId.toString())!.expiresAt.toISOString(),
      }))
      .sort((a, b) => a.loginId.localeCompare(b.loginId));
  }

  private async currentYear() {
    const year = await this.prisma.schoolYear.findFirst({ where: { isCurrent: true } });
    if (!year) throw new BadRequestException('Chưa có năm học hiện hành, hãy tạo năm học trước khi nhập danh sách');
    return year;
  }

  // Nạp từ CSDL đúng những mã/email/lớp/tổ có trong file rồi kiểm tra từng dòng.
  private async validate(kind: RosterKind, yearId: bigint, raw: RawRow[]): Promise<ValidatedRow[]> {
    const codes = [...new Set(raw.map((r) => (r.cells.code ?? '').trim().toUpperCase()).filter(Boolean))];
    const emails = [...new Set(raw.map((r) => (r.cells.email ?? '').trim().toLowerCase()).filter(Boolean))];
    const [classes, departments, students, teachers, users] = await Promise.all([
      this.prisma.schoolClass.findMany({ where: { schoolYearId: yearId } }),
      this.prisma.department.findMany(),
      this.prisma.studentProfile.findMany({ where: { studentCode: { in: codes } }, select: { studentCode: true } }),
      this.prisma.teacherProfile.findMany({ where: { teacherCode: { in: codes } }, select: { teacherCode: true } }),
      emails.length ? this.prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true } }) : [],
    ]);
    const ctx: RosterContext = {
      classes: new Map(
        classes.map((c) => [classKey(c.name), { id: c.id, name: c.name, homeroomTeacherId: c.homeroomTeacherId }]),
      ),
      departments: new Map(departments.map((d) => [normalizeHeader(d.name), { id: d.id, name: d.name }])),
      existingStudentCodes: new Set(students.map((s) => s.studentCode)),
      existingTeacherCodes: new Set(teachers.map((t) => t.teacherCode)),
      existingEmails: new Set(users.flatMap((u) => (u.email ? [u.email] : []))),
    };
    return validateRows(kind, raw, ctx);
  }
}
