import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  TIMETABLE_DAY_NAMES,
  type FixedPeriodDto,
  type PlacementOptionDto,
  type TeacherUnavailabilityDto,
  type TimetableFrameDto,
  type TimetableSlotDto,
  type TimetableStatsDto,
  type TimetableVersionDto,
} from '@pvh/shared';
import { assertPermission, can } from '../../common/guards/permission.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { defang } from '../../common/utils/defang.js';
import { parseId } from '../../common/utils/parse-id.js';
import { isUniqueViolation } from '../../common/utils/prisma-errors.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { SettingsService } from '../settings/settings.service.js';
import type {
  CreateVersionInput,
  FixedPeriodInput,
  MoveSlotInput,
  OptionsQuery,
  PlaceSlotInput,
  PublishInput,
  SetUnavailabilityInput,
  SlotsQuery,
  UnavailabilityQuery,
  VersionsQuery,
} from './dto/timetable.dto.js';
import { frameSchema, parseFrame, type FrameInput } from './frame.js';
import { supersededIds, vnToday } from './timetable-dates.js';
import { countGaps, evaluatePlacement, type PlacementContext, type PlacementResult } from './timetable-rules.js';

type Db = PrismaService | Prisma.TransactionClient;

const VERSION_INCLUDE = {
  semester: { include: { schoolYear: true } },
  publisher: { select: { fullName: true } },
  _count: { select: { slots: true } },
} satisfies Prisma.TimetableInclude;
type VersionRow = Prisma.TimetableGetPayload<{ include: typeof VERSION_INCLUDE }>;

const SLOT_INCLUDE = {
  class: true,
  assignment: { include: { subject: true } },
  teacher: { select: { fullName: true } },
  room: true,
} satisfies Prisma.TimetableSlotInclude;
type SlotRow = Prisma.TimetableSlotGetPayload<{ include: typeof SLOT_INCLUDE }>;

const dayText = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const vnDate = (iso: string) => iso.split('-').reverse().join('/');
const CONCURRENT = 'Vừa có người khác xếp trùng tiết này, hãy tải lại lưới rồi thử lại';

// Thời khoá biểu (bước 17): khung tiết, phiên bản, xếp tiết trên lưới, tiết cố định, tiết bận, công bố.
// Xem: `timetable:read` (chỉ BGH, bước 28); xếp/công bố: `timetable:manage` (chỉ BGH). Trùng giáo viên/lớp/phòng bị CSDL chặn
// bằng ràng buộc duy nhất; service kiểm tra trước để báo lý do dễ hiểu, và bắt lỗi ràng buộc khi hai người sửa cùng lúc.
@Injectable()
export class TimetableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ───────────── Khung tiết ─────────────

  async getFrame(): Promise<TimetableFrameDto> {
    return parseFrame(await this.settings.effective('timetable.frame'));
  }

  // BGH (timetable:manage) và ADMIN (setting:manage) sửa được. Không cho thu hẹp khung khi đang có tiết xếp ngoài khung mới.
  async setFrame(actor: AuthUser, input: FrameInput, ip?: string): Promise<TimetableFrameDto> {
    if (!can(actor, 'timetable:manage') && !can(actor, 'setting:manage')) assertPermission(actor, 'timetable:manage');
    const frame = frameSchema.parse(input);
    const maxPeriod = Math.max(...frame.periods.map((p) => p.no));
    const outside = await this.prisma.timetableSlot.count({
      where: {
        timetable: { status: { not: 'ARCHIVED' } },
        OR: [{ period: { gt: maxPeriod } }, { day: { notIn: frame.days } }],
      },
    });
    if (outside > 0) {
      throw new ConflictException(`Đang có ${outside} tiết đã xếp nằm ngoài khung mới (tiết hoặc ngày bị bỏ), hãy gỡ chúng trước`);
    }
    const value = JSON.stringify(frame);
    await this.prisma.systemSetting.upsert({
      where: { key: 'timetable.frame' },
      update: { value, updatedBy: BigInt(actor.id) },
      create: { key: 'timetable.frame', value, updatedBy: BigInt(actor.id) },
    });
    await this.record(actor, 'timetable.frame.update', 'setting', null, ip, { periods: frame.periods.length, days: frame.days });
    return frame;
  }

  // ───────────── Phiên bản ─────────────

  async listVersions(actor: AuthUser, query: VersionsQuery): Promise<TimetableVersionDto[]> {
    assertPermission(actor, 'timetable:read');
    await this.archiveSuperseded();
    const rows = await this.prisma.timetable.findMany({
      where: { semesterId: query.semesterId ? parseId(query.semesterId) : undefined },
      include: VERSION_INCLUDE,
      orderBy: [{ semesterId: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toVersionDto);
  }

  async createVersion(actor: AuthUser, input: CreateVersionInput, ip?: string): Promise<TimetableVersionDto> {
    assertPermission(actor, 'timetable:manage');
    const semester = await this.prisma.semester.findUnique({ where: { id: parseId(input.semesterId) } });
    if (!semester) throw new NotFoundException('Không tìm thấy học kỳ');
    const source = input.copyFromId
      ? await this.prisma.timetable.findUnique({ where: { id: parseId(input.copyFromId) }, include: { semester: true } })
      : null;
    if (input.copyFromId && !source) throw new NotFoundException('Không tìm thấy phiên bản để sao chép');
    if (source && source.semester.schoolYearId !== semester.schoolYearId) {
      throw new BadRequestException('Chỉ sao chép giữa các phiên bản cùng năm học');
    }

    const id = await this.prisma.$transaction(async (tx) => {
      const version = await tx.timetable.create({
        data: { semesterId: semester.id, name: input.name, createdBy: BigInt(actor.id) },
      });
      if (source) {
        // Lấy giáo viên hiện tại của phân công (có thể đã đổi từ lúc xếp) và bỏ qua tiết sẽ gây trùng.
        const slots = await tx.timetableSlot.findMany({
          where: { timetableId: source.id, assignment: { OR: [{ semesterId: null }, { semesterId: semester.id }] } },
          include: { assignment: true },
          orderBy: [{ day: 'asc' }, { period: 'asc' }],
        });
        const usedTeacher = new Set<string>();
        const usedRoom = new Set<string>();
        const data: Prisma.TimetableSlotCreateManyInput[] = [];
        for (const s of slots) {
          const teacherKey = `${s.assignment.teacherId}:${s.day}:${s.period}`;
          const roomKey = s.roomId ? `${s.roomId}:${s.day}:${s.period}` : null;
          if (usedTeacher.has(teacherKey) || (roomKey && usedRoom.has(roomKey))) continue;
          usedTeacher.add(teacherKey);
          if (roomKey) usedRoom.add(roomKey);
          data.push({
            timetableId: version.id,
            day: s.day,
            period: s.period,
            classId: s.classId,
            assignmentId: s.assignmentId,
            teacherId: s.assignment.teacherId,
            roomId: s.roomId,
          });
        }
        if (data.length > 0) await tx.timetableSlot.createMany({ data });
      }
      return version.id;
    });
    await this.record(actor, 'timetable.create', 'timetable', id, ip, { name: input.name, copiedFrom: input.copyFromId ?? null });
    return toVersionDto(await this.versionOrThrow(id.toString()));
  }

  async deleteVersion(actor: AuthUser, id: string, ip?: string): Promise<void> {
    assertPermission(actor, 'timetable:manage');
    const version = await this.versionOrThrow(id);
    if (version.status !== 'DRAFT') throw new ConflictException('Chỉ xoá được bản nháp (bản đã công bố được giữ làm lịch sử)');
    await this.prisma.timetable.delete({ where: { id: version.id } });
    await this.record(actor, 'timetable.delete', 'timetable', version.id, ip, { name: version.name });
  }

  // ───────────── Lưới và tiết đã xếp ─────────────

  async getSlots(actor: AuthUser, versionId: string, query: SlotsQuery): Promise<TimetableSlotDto[]> {
    assertPermission(actor, 'timetable:read');
    const version = await this.versionOrThrow(versionId);
    const rows = await this.prisma.timetableSlot.findMany({
      where: {
        timetableId: version.id,
        classId: query.classId ? parseId(query.classId) : undefined,
        teacherId: query.teacherId ? parseId(query.teacherId) : undefined,
        roomId: query.roomId ? parseId(query.roomId) : undefined,
      },
      include: SLOT_INCLUDE,
      orderBy: [{ day: 'asc' }, { period: 'asc' }],
    });
    return rows.map(toSlotDto);
  }

  async placeSlot(actor: AuthUser, versionId: string, input: PlaceSlotInput, ip?: string): Promise<TimetableSlotDto> {
    assertPermission(actor, 'timetable:manage');
    const version = await this.draftOrThrow(versionId);
    const assignment = await this.assignmentOrThrow(input.assignmentId);
    const roomId = await this.roomIdOf(input.roomId);

    try {
      const { slot, warnings } = await this.prisma.$transaction(async (tx) => {
        const ctx = await this.context(tx, version, assignment, roomId, null);
        const result = evaluatePlacement(ctx, input.day, input.period);
        this.assertPlaceable(result, input.confirmUnavailable);
        const created = await tx.timetableSlot.create({
          data: {
            timetableId: version.id,
            day: input.day,
            period: input.period,
            classId: assignment.classId,
            assignmentId: assignment.id,
            teacherId: assignment.teacherId,
            roomId,
          },
          include: SLOT_INCLUDE,
        });
        return { slot: created, warnings: result.warnings };
      });
      await this.record(actor, 'timetable.place', 'timetable', version.id, ip, {
        class: slot.class.name,
        subject: slot.assignment.subject.code,
        day: slot.day,
        period: slot.period,
      });
      if (warnings.length > 0) await this.recordOverride(actor, version, slot, warnings, ip);
      return toSlotDto(slot);
    } catch (err) {
      throw isUniqueViolation(err) ? new ConflictException(CONCURRENT) : err;
    }
  }

  async moveSlot(actor: AuthUser, slotId: string, input: MoveSlotInput, ip?: string): Promise<TimetableSlotDto> {
    assertPermission(actor, 'timetable:manage');
    const current = await this.slotOrThrow(slotId);
    const version = await this.draftOrThrow(current.timetableId.toString());
    const assignment = await this.assignmentOrThrow(current.assignmentId.toString());
    const roomId = input.roomId === undefined ? current.roomId : await this.roomIdOf(input.roomId);

    try {
      const { slot, warnings } = await this.prisma.$transaction(async (tx) => {
        const ctx = await this.context(tx, version, assignment, roomId, current.id);
        const result = evaluatePlacement(ctx, input.day, input.period);
        this.assertPlaceable(result, input.confirmUnavailable);
        const updated = await tx.timetableSlot.update({
          where: { id: current.id },
          data: { day: input.day, period: input.period, roomId },
          include: SLOT_INCLUDE,
        });
        return { slot: updated, warnings: result.warnings };
      });
      await this.record(actor, 'timetable.move', 'timetable', version.id, ip, {
        class: slot.class.name,
        subject: slot.assignment.subject.code,
        from: { day: current.day, period: current.period },
        to: { day: slot.day, period: slot.period },
      });
      if (warnings.length > 0) await this.recordOverride(actor, version, slot, warnings, ip);
      return toSlotDto(slot);
    } catch (err) {
      throw isUniqueViolation(err) ? new ConflictException(CONCURRENT) : err;
    }
  }

  async deleteSlot(actor: AuthUser, slotId: string, ip?: string): Promise<void> {
    assertPermission(actor, 'timetable:manage');
    const slot = await this.slotOrThrow(slotId);
    const version = await this.draftOrThrow(slot.timetableId.toString());
    await this.prisma.timetableSlot.delete({ where: { id: slot.id } });
    await this.record(actor, 'timetable.unplace', 'timetable', version.id, ip, {
      class: slot.class.name,
      subject: slot.assignment.subject.code,
      day: slot.day,
      period: slot.period,
    });
  }

  // Khi chọn một phân công: mọi ô của lưới đặt được không và vì sao không (kể cả cảnh báo giáo viên bận).
  async options(actor: AuthUser, versionId: string, query: OptionsQuery): Promise<PlacementOptionDto[]> {
    assertPermission(actor, 'timetable:read');
    const version = await this.versionOrThrow(versionId);
    const assignment = await this.assignmentOrThrow(query.assignmentId);
    const roomId = await this.roomIdOf(query.roomId);
    const ctx = await this.context(this.prisma, version, assignment, roomId, null);
    const out: PlacementOptionDto[] = [];
    for (const day of ctx.frame.days) {
      for (const p of ctx.frame.periods) {
        const r = evaluatePlacement(ctx, day, p.no);
        out.push({ day, period: p.no, ok: r.blocking.length === 0, blocking: r.blocking, warnings: r.warnings });
      }
    }
    return out;
  }

  // Lớp còn thiếu tiết môn nào; giáo viên mỗi ngày dạy mấy tiết và có bao nhiêu tiết trống xen kẽ.
  async stats(actor: AuthUser, versionId: string): Promise<TimetableStatsDto> {
    assertPermission(actor, 'timetable:read');
    const version = await this.versionOrThrow(versionId);
    const [assignments, slots] = await Promise.all([
      this.applicableAssignments(this.prisma, version),
      this.prisma.timetableSlot.findMany({ where: { timetableId: version.id }, include: { teacher: { select: { fullName: true } } } }),
    ]);
    const placed = new Map<string, number>();
    for (const s of slots) placed.set(s.assignmentId.toString(), (placed.get(s.assignmentId.toString()) ?? 0) + 1);

    const byClass = new Map<string, TimetableStatsDto['classes'][number]>();
    for (const a of assignments) {
      const missing = a.periodsPerWeek - (placed.get(a.id.toString()) ?? 0);
      if (missing <= 0) continue;
      const key = a.classId.toString();
      const entry = byClass.get(key) ?? { classId: key, className: a.class.name, missing: [] };
      entry.missing.push({ assignmentId: a.id.toString(), subjectName: a.subject.name, missing });
      byClass.set(key, entry);
    }

    const byTeacher = new Map<string, { name: string; days: Map<number, number[]> }>();
    for (const s of slots) {
      const key = s.teacherId.toString();
      const entry = byTeacher.get(key) ?? { name: s.teacher.fullName, days: new Map() };
      entry.days.set(s.day, [...(entry.days.get(s.day) ?? []), s.period]);
      byTeacher.set(key, entry);
    }
    return {
      classes: [...byClass.values()].sort((a, b) => a.className.localeCompare(b.className, 'vi')),
      teachers: [...byTeacher.entries()]
        .map(([teacherId, e]) => ({
          teacherId,
          teacherName: e.name,
          days: [...e.days.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([day, periods]) => ({ day, periods: periods.length, gaps: countGaps(periods) })),
          total: [...e.days.values()].reduce((sum, p) => sum + p.length, 0),
        }))
        .sort((a, b) => a.teacherName.localeCompare(b.teacherName, 'vi')),
    };
  }

  // ───────────── Công bố ─────────────

  // Kiểm tra lại toàn bộ (còn thiếu tiết thì từ chối) rồi công bố với ngày hiệu lực. Bản cũ vẫn có hiệu lực tới ngày hiệu lực của
  // bản mới và chỉ chuyển ARCHIVED khi bản mới bắt đầu có hiệu lực (xem archiveSuperseded).
  async publish(actor: AuthUser, versionId: string, input: PublishInput, ip?: string): Promise<TimetableVersionDto> {
    assertPermission(actor, 'timetable:manage');
    const version = await this.versionOrThrow(versionId);
    if (version.status !== 'DRAFT') throw new ConflictException('Phiên bản này đã được công bố');
    const today = vnToday();
    if (input.effectiveDate < today) throw new BadRequestException('Ngày hiệu lực không được ở quá khứ');
    const semesterEnd = dayText(version.semester.endDate)!;
    if (input.effectiveDate > semesterEnd) throw new BadRequestException(`Ngày hiệu lực phải trong học kỳ (đến ${vnDate(semesterEnd)})`);

    const stats = await this.stats(actor, versionId);
    const issues = stats.classes.flatMap((c) => c.missing.map((m) => `${c.className} ${m.subjectName}: thiếu ${m.missing} tiết`));
    if (version._count.slots === 0) issues.unshift('Chưa xếp tiết nào');
    if (issues.length > 0) {
      const shown = issues.slice(0, 8).join('; ');
      throw new ConflictException(`Chưa thể công bố, còn ${issues.length} vấn đề: ${shown}${issues.length > 8 ? '…' : ''}`);
    }

    const clash = await this.prisma.timetable.findFirst({
      where: { semesterId: version.semesterId, status: { not: 'DRAFT' }, effectiveDate: new Date(`${input.effectiveDate}T00:00:00Z`) },
    });
    if (clash) throw new ConflictException(`Đã có phiên bản "${clash.name}" áp dụng từ ${vnDate(input.effectiveDate)}, hãy chọn ngày khác`);

    // Phiên bản đang có hiệu lực vào ngày này (để báo cả giáo viên bị bỏ tiết).
    const previous = await this.prisma.timetable.findFirst({
      where: { semesterId: version.semesterId, status: { not: 'DRAFT' }, effectiveDate: { lte: new Date(`${input.effectiveDate}T00:00:00Z`) } },
      orderBy: { effectiveDate: 'desc' },
    });
    try {
      await this.prisma.timetable.updateMany({
        where: { id: version.id, status: 'DRAFT' },
        data: {
          status: 'PUBLISHED',
          effectiveDate: new Date(`${input.effectiveDate}T00:00:00Z`),
          publishedBy: BigInt(actor.id),
          publishedAt: new Date(),
        },
      });
    } catch (err) {
      throw isUniqueViolation(err) ? new ConflictException('Đã có phiên bản khác áp dụng từ ngày này') : err;
    }
    await this.archiveSuperseded();
    await this.record(actor, 'timetable.publish', 'timetable', version.id, ip, {
      name: version.name,
      effectiveDate: input.effectiveDate,
      slots: version._count.slots,
    });

    const teacherIds = new Set<bigint>(
      (await this.prisma.timetableSlot.findMany({ where: { timetableId: version.id }, select: { teacherId: true }, distinct: ['teacherId'] })).map((s) => s.teacherId),
    );
    if (previous) {
      for (const s of await this.prisma.timetableSlot.findMany({ where: { timetableId: previous.id }, select: { teacherId: true }, distinct: ['teacherId'] })) {
        teacherIds.add(s.teacherId);
      }
    }
    await this.notifications.notify(
      [...teacherIds].map((userId) => ({
        userId,
        title: 'Thời khoá biểu mới',
        body: `Thời khoá biểu "${defang(version.name)}" đã được công bố, áp dụng từ ${vnDate(input.effectiveDate)}. Xem lịch dạy của bạn ở mục Thời khoá biểu.`,
      })),
    );
    return toVersionDto(await this.versionOrThrow(versionId));
  }

  // Chuyển ARCHIVED các bản đã công bố bị bản mới hơn thay thế khi bản mới đã bắt đầu có hiệu lực. Chạy lúc truy vấn/công bố (idempotent).
  async archiveSuperseded(): Promise<number> {
    const published = await this.prisma.timetable.findMany({
      where: { status: 'PUBLISHED' },
      select: { id: true, semesterId: true, status: true, effectiveDate: true },
    });
    const ids = supersededIds(
      published.map((v) => ({ id: v.id.toString(), semesterId: v.semesterId.toString(), status: v.status, effectiveDate: dayText(v.effectiveDate) })),
      vnToday(),
    );
    if (ids.length === 0) return 0;
    const { count } = await this.prisma.timetable.updateMany({
      where: { id: { in: ids.map((i) => BigInt(i)) }, status: 'PUBLISHED' },
      data: { status: 'ARCHIVED' },
    });
    return count;
  }

  // ───────────── Tiết cố định ─────────────

  async listFixed(): Promise<FixedPeriodDto[]> {
    const rows = await this.prisma.fixedPeriod.findMany({ orderBy: [{ day: 'asc' }, { period: 'asc' }, { gradeLevel: 'asc' }] });
    return rows.map(toFixedDto);
  }

  async createFixed(actor: AuthUser, input: FixedPeriodInput, ip?: string): Promise<FixedPeriodDto> {
    assertPermission(actor, 'timetable:manage');
    const frame = await this.getFrame();
    if (!frame.days.includes(input.day) || !frame.periods.some((p) => p.no === input.period)) {
      throw new BadRequestException('Tiết cố định phải nằm trong khung tiết học');
    }
    // Không đặt tiết cố định lên tiết đã có môn xếp trong bản nháp/bản đã công bố.
    const occupied = await this.prisma.timetableSlot.count({
      where: {
        day: input.day,
        period: input.period,
        timetable: { status: { not: 'ARCHIVED' } },
        class: input.gradeLevel ? { grade: { level: input.gradeLevel } } : undefined,
      },
    });
    if (occupied > 0) throw new ConflictException(`Đang có ${occupied} tiết đã xếp ở ${TIMETABLE_DAY_NAMES[input.day]} tiết ${input.period}, hãy gỡ trước`);
    try {
      const row = await this.prisma.fixedPeriod.create({
        data: { name: input.name, kind: input.kind, day: input.day, period: input.period, gradeLevel: input.gradeLevel ?? null },
      });
      await this.record(actor, 'timetable.fixed.create', 'fixed_period', row.id, ip, { name: row.name, day: row.day, period: row.period, gradeLevel: row.gradeLevel });
      return toFixedDto(row);
    } catch (err) {
      throw isUniqueViolation(err) ? new ConflictException('Đã có tiết cố định ở thứ/tiết này') : err;
    }
  }

  async deleteFixed(actor: AuthUser, id: string, ip?: string): Promise<void> {
    assertPermission(actor, 'timetable:manage');
    const row = await this.prisma.fixedPeriod.findUnique({ where: { id: parseId(id) } });
    if (!row) throw new NotFoundException('Không tìm thấy tiết cố định');
    await this.prisma.fixedPeriod.delete({ where: { id: row.id } });
    await this.record(actor, 'timetable.fixed.delete', 'fixed_period', row.id, ip, { name: row.name });
  }

  // ───────────── Tiết bận của giáo viên (chỉ để BGH tham khảo) ─────────────

  async listUnavailability(actor: AuthUser, query: UnavailabilityQuery): Promise<TeacherUnavailabilityDto[]> {
    assertPermission(actor, 'timetable:read');
    const rows = await this.prisma.teacherUnavailability.findMany({
      where: { teacherId: query.teacherId ? parseId(query.teacherId) : undefined },
      include: { teacher: { select: { fullName: true } } },
      orderBy: [{ teacherId: 'asc' }, { day: 'asc' }, { period: 'asc' }],
    });
    return rows.map((r) => ({ teacherId: r.teacherId.toString(), teacherName: r.teacher.fullName, day: r.day, period: r.period, note: r.note }));
  }

  async myUnavailability(actor: AuthUser): Promise<TeacherUnavailabilityDto[]> {
    const rows = await this.prisma.teacherUnavailability.findMany({
      where: { teacherId: BigInt(actor.id) },
      orderBy: [{ day: 'asc' }, { period: 'asc' }],
    });
    return rows.map((r) => ({ teacherId: r.teacherId.toString(), teacherName: actor.fullName, day: r.day, period: r.period, note: r.note }));
  }

  // Giáo viên tự đăng ký (thay thế toàn bộ danh sách tiết bận của mình). Không chặn BGH xếp lịch: chỉ cảnh báo.
  async setMyUnavailability(actor: AuthUser, input: SetUnavailabilityInput, ip?: string): Promise<TeacherUnavailabilityDto[]> {
    const profile = await this.prisma.teacherProfile.findUnique({ where: { userId: BigInt(actor.id) } });
    if (!profile) throw new ForbiddenException('Chỉ giáo viên mới đăng ký tiết bận');
    const frame = await this.getFrame();
    for (const s of input.slots) {
      if (!frame.days.includes(s.day) || !frame.periods.some((p) => p.no === s.period)) {
        throw new BadRequestException(`${TIMETABLE_DAY_NAMES[s.day]} tiết ${s.period} không nằm trong khung tiết học`);
      }
    }
    await this.prisma.$transaction([
      this.prisma.teacherUnavailability.deleteMany({ where: { teacherId: profile.userId } }),
      this.prisma.teacherUnavailability.createMany({
        data: input.slots.map((s) => ({ teacherId: profile.userId, day: s.day, period: s.period, note: s.note || null })),
      }),
    ]);
    await this.record(actor, 'timetable.unavailability.set', 'user', profile.userId, ip, { count: input.slots.length });
    return this.myUnavailability(actor);
  }

  // ───────────── Hỗ trợ (dùng chung với TimetableViewService và TeachingService) ─────────────

  async versionOrThrow(id: string): Promise<VersionRow> {
    const v = await this.prisma.timetable.findUnique({ where: { id: parseId(id) }, include: VERSION_INCLUDE });
    if (!v) throw new NotFoundException('Không tìm thấy phiên bản thời khoá biểu');
    return v;
  }

  private async draftOrThrow(id: string): Promise<VersionRow> {
    const v = await this.versionOrThrow(id);
    if (v.status !== 'DRAFT') throw new ConflictException('Chỉ sửa được bản nháp: hãy tạo bản nháp mới từ bản đã công bố rồi công bố lại');
    return v;
  }

  private async slotOrThrow(id: string): Promise<SlotRow> {
    const s = await this.prisma.timetableSlot.findUnique({ where: { id: parseId(id) }, include: SLOT_INCLUDE });
    if (!s) throw new NotFoundException('Không tìm thấy tiết');
    return s;
  }

  private async assignmentOrThrow(id: string) {
    const a = await this.prisma.teachingAssignment.findUnique({
      where: { id: parseId(id) },
      include: { class: { include: { grade: true } }, subject: true, teacher: { select: { fullName: true, status: true } } },
    });
    if (!a) throw new NotFoundException('Không tìm thấy phân công');
    return a;
  }

  private async roomIdOf(id: string | null | undefined): Promise<bigint | null> {
    if (!id) return null;
    const room = await this.prisma.room.findUnique({ where: { id: parseId(id) } });
    if (!room) throw new BadRequestException('Phòng không tồn tại');
    return room.id;
  }

  private applicableAssignments(db: Db, version: VersionRow) {
    return db.teachingAssignment.findMany({
      where: {
        schoolYearId: version.semester.schoolYearId,
        OR: [{ semesterId: null }, { semesterId: version.semesterId }],
      },
      include: { class: true, subject: true },
    });
  }

  private assertPlaceable(result: PlacementResult, confirmUnavailable: boolean | undefined): void {
    if (result.blocking.length > 0) throw new ConflictException(result.blocking.join('; '));
    if (result.warnings.length > 0 && !confirmUnavailable) {
      throw new ConflictException(`${result.warnings.join('; ')}. Gửi confirmUnavailable=true để xác nhận xếp đè lên tiết bận.`);
    }
  }

  private async context(
    db: Db,
    version: VersionRow,
    assignment: Awaited<ReturnType<TimetableService['assignmentOrThrow']>>,
    roomId: bigint | null,
    ignoreSlotId: bigint | null,
  ): Promise<PlacementContext> {
    const notIgnored = ignoreSlotId ? { id: { not: ignoreSlotId } } : {};
    const [frame, fixed, classSlots, teacherSlots, placedCount, homeroom, unavailable, room] = await Promise.all([
      this.getFrame(),
      db.fixedPeriod.findMany(),
      db.timetableSlot.findMany({
        where: { timetableId: version.id, classId: assignment.classId, ...notIgnored },
        include: { assignment: { include: { subject: true } } },
      }),
      db.timetableSlot.findMany({
        where: { timetableId: version.id, teacherId: assignment.teacherId, ...notIgnored },
        include: { class: true, assignment: { include: { subject: true } } },
      }),
      db.timetableSlot.count({ where: { timetableId: version.id, assignmentId: assignment.id, ...notIgnored } }),
      db.schoolClass.findMany({
        where: { homeroomTeacherId: assignment.teacherId, schoolYearId: assignment.schoolYearId },
        include: { grade: true },
      }),
      db.teacherUnavailability.findMany({ where: { teacherId: assignment.teacherId } }),
      roomId
        ? db.room.findUnique({
            where: { id: roomId },
            include: { timetableSlots: { where: { timetableId: version.id, ...notIgnored }, include: { class: true } } },
          })
        : null,
    ]);
    return {
      frame,
      assignmentInSemester:
        assignment.schoolYearId === version.semester.schoolYearId &&
        (assignment.semesterId === null || assignment.semesterId === version.semesterId),
      className: assignment.class.name,
      gradeLevel: assignment.class.grade.level,
      sessions: assignment.class.sessions,
      teacherName: assignment.teacher.fullName,
      subjectName: assignment.subject.name,
      periodsPerWeek: assignment.periodsPerWeek,
      placedCount,
      fixed: fixed.map((f) => ({ name: f.name, kind: f.kind, day: f.day, period: f.period, gradeLevel: f.gradeLevel })),
      classSlots: classSlots.map((s) => ({ day: s.day, period: s.period, subjectName: s.assignment.subject.name })),
      teacherSlots: teacherSlots.map((s) => ({ day: s.day, period: s.period, className: s.class.name, subjectName: s.assignment.subject.name })),
      homeroomClasses: homeroom.map((c) => ({ className: c.name, gradeLevel: c.grade.level })),
      room: room ? { name: room.name, slots: room.timetableSlots.map((s) => ({ day: s.day, period: s.period, className: s.class.name })) } : null,
      unavailable: unavailable.map((u) => ({ day: u.day, period: u.period, note: u.note })),
    };
  }

  // BGH xếp đè lên tiết giáo viên báo bận: ghi nhật ký riêng để truy vết.
  private recordOverride(actor: AuthUser, version: VersionRow, slot: SlotRow, warnings: string[], ip?: string): Promise<void> {
    return this.audit.record({
      userId: actor.id,
      channel: 'web',
      action: 'timetable.override_unavailable',
      targetType: 'timetable',
      targetId: version.id.toString(),
      params: { teacher: slot.teacher.fullName, class: slot.class.name, day: slot.day, period: slot.period, warnings },
      ok: true,
      ip,
    });
  }

  private record(
    actor: AuthUser,
    action: string,
    targetType: string,
    targetId: bigint | null,
    ip: string | undefined,
    params: unknown,
  ): Promise<void> {
    return this.audit.record({
      userId: actor.id,
      channel: 'web',
      action,
      targetType,
      targetId: targetId?.toString(),
      params,
      ok: true,
      ip,
    });
  }
}

export function toVersionDto(v: VersionRow): TimetableVersionDto {
  return {
    id: v.id.toString(),
    semesterId: v.semesterId.toString(),
    semesterName: v.semester.name,
    schoolYearName: v.semester.schoolYear.name,
    name: v.name,
    status: v.status,
    effectiveDate: dayText(v.effectiveDate),
    publishedAt: v.publishedAt?.toISOString() ?? null,
    publishedByName: v.publisher?.fullName ?? null,
    createdAt: v.createdAt.toISOString(),
    slotCount: v._count.slots,
  };
}

export function toSlotDto(s: SlotRow): TimetableSlotDto {
  return {
    id: s.id.toString(),
    timetableId: s.timetableId.toString(),
    day: s.day,
    period: s.period,
    classId: s.classId.toString(),
    className: s.class.name,
    assignmentId: s.assignmentId.toString(),
    subjectId: s.assignment.subjectId.toString(),
    subjectCode: s.assignment.subject.code,
    subjectName: s.assignment.subject.name,
    teacherId: s.teacherId.toString(),
    teacherName: s.teacher.fullName,
    roomId: s.roomId?.toString() ?? null,
    roomName: s.room?.name ?? null,
  };
}

function toFixedDto(f: { id: bigint; name: string; kind: 'SCHOOL' | 'CLASS_MEETING'; day: number; period: number; gradeLevel: number | null }): FixedPeriodDto {
  return { id: f.id.toString(), name: f.name, kind: f.kind, day: f.day, period: f.period, gradeLevel: f.gradeLevel };
}
