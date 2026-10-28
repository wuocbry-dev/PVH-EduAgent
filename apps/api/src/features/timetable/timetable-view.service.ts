import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TIMETABLE_DAY_NAMES, type ViewSlotDto, type WeekDayDto, type WeekViewDto } from '@pvh/shared';
import ExcelJS from 'exceljs';
import { assertPermission, can } from '../../common/guards/permission.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { parseId } from '../../common/utils/parse-id.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { safeCell } from '../roster/excel.js';
import type { ExportQuery } from './dto/timetable.dto.js';
import { pickEffective, vnToday, weekDates, weekStart, type VersionLike } from './timetable-dates.js';
import { TimetableService } from './timetable.service.js';

const dayText = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

type Scope = { kind: 'class'; classId: bigint; title: string } | { kind: 'teacher'; teacherId: bigint; title: string };

// Xem thời khoá biểu đã công bố theo tuần (lớp, giáo viên, của tôi) và xuất Excel.
// Ngày D dùng phiên bản đã công bố có ngày hiệu lực lớn nhất <= D, nên tuần sau thấy lịch mới còn tuần này vẫn thấy lịch cũ.
@Injectable()
export class TimetableViewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timetable: TimetableService,
  ) {}

  // Lịch của chính mình: giáo viên thấy các tiết mình dạy, học sinh thấy lịch lớp mình (năm học hiện hành).
  async mine(actor: AuthUser, date?: string): Promise<WeekViewDto> {
    const userId = BigInt(actor.id);
    if (await this.prisma.teacherProfile.findUnique({ where: { userId } })) {
      return this.build({ kind: 'teacher', teacherId: userId, title: `Lịch dạy của ${actor.fullName}` }, date);
    }
    const enrollment = await this.prisma.classEnrollment.findFirst({
      where: { studentId: userId, schoolYear: { isCurrent: true } },
      include: { class: true },
    });
    if (enrollment) return this.build({ kind: 'class', classId: enrollment.classId, title: `Thời khoá biểu lớp ${enrollment.class.name}` }, date);
    return this.build(null, date, 'Chưa có thời khoá biểu');
  }

  async classWeek(actor: AuthUser, classId: string, date?: string): Promise<WeekViewDto> {
    const cls = await this.prisma.schoolClass.findUnique({ where: { id: parseId(classId) } });
    if (!cls) throw new NotFoundException('Không tìm thấy lớp');
    if (!(await this.canViewClass(actor, cls.id))) {
      throw new ForbiddenException('Bạn chỉ xem được thời khoá biểu của lớp mình học hoặc dạy');
    }
    return this.build({ kind: 'class', classId: cls.id, title: `Thời khoá biểu lớp ${cls.name}` }, date);
  }

  async teacherWeek(actor: AuthUser, teacherId: string, date?: string): Promise<WeekViewDto> {
    const id = parseId(teacherId);
    if (!can(actor, 'timetable:read') && actor.id !== id.toString()) {
      throw new ForbiddenException('Bạn chỉ xem được lịch dạy của chính mình');
    }
    const teacher = await this.prisma.user.findFirst({ where: { id, teacherProfile: { isNot: null } }, select: { fullName: true } });
    if (!teacher) throw new NotFoundException('Không tìm thấy giáo viên');
    return this.build({ kind: 'teacher', teacherId: id, title: `Lịch dạy của ${teacher.fullName}` }, date);
  }

  // BGH (timetable:read) xem mọi lớp; học sinh lớp mình học; giáo viên lớp mình dạy hoặc chủ nhiệm.
  async canViewClass(actor: AuthUser, classId: bigint): Promise<boolean> {
    if (can(actor, 'timetable:read')) return true;
    const userId = BigInt(actor.id);
    const [enrolled, teaches, homeroom] = await Promise.all([
      this.prisma.classEnrollment.count({ where: { studentId: userId, classId } }),
      this.prisma.teachingAssignment.count({ where: { teacherId: userId, classId } }),
      this.prisma.schoolClass.count({ where: { id: classId, homeroomTeacherId: userId } }),
    ]);
    return enrolled + teaches + homeroom > 0;
  }

  // Dựng lịch tuần chứa `date` (mặc định hôm nay): mỗi ngày dùng phiên bản có hiệu lực của ngày đó.
  private async build(scope: Scope | null, date?: string, emptyTitle = ''): Promise<WeekViewDto> {
    await this.timetable.archiveSuperseded();
    const today = vnToday();
    const frame = await this.timetable.getFrame();
    const dates = weekDates(date ?? today, frame.days);
    const empty = (d: { day: number; date: string }): WeekDayDto => ({ ...d, versionId: null, versionName: null, effectiveDate: null, slots: [] });
    if (!scope) return { title: emptyTitle, weekStart: weekStart(date ?? today), today, frame, days: dates.map(empty) };

    const [semesters, versions, fixed] = await Promise.all([
      this.prisma.semester.findMany(),
      this.prisma.timetable.findMany({ where: { status: { in: ['PUBLISHED', 'ARCHIVED'] } } }),
      this.prisma.fixedPeriod.findMany(),
    ]);
    const versionLikes: (VersionLike & { name: string })[] = versions.map((v) => ({
      id: v.id.toString(),
      semesterId: v.semesterId.toString(),
      status: v.status,
      effectiveDate: dayText(v.effectiveDate),
      name: v.name,
    }));

    // Thông tin lớp (khối) hoặc các lớp mà giáo viên chủ nhiệm, để gắn tiết cố định.
    let gradeLevel: number | null = null;
    let className = '';
    let homeroom: { name: string; gradeLevel: number }[] = [];
    if (scope.kind === 'class') {
      const cls = await this.prisma.schoolClass.findUniqueOrThrow({ where: { id: scope.classId }, include: { grade: true } });
      gradeLevel = cls.grade.level;
      className = cls.name;
    } else {
      const classes = await this.prisma.schoolClass.findMany({
        where: { homeroomTeacherId: scope.teacherId, schoolYear: { isCurrent: true } },
        include: { grade: true },
      });
      homeroom = classes.map((c) => ({ name: c.name, gradeLevel: c.grade.level }));
    }

    const days: WeekDayDto[] = [];
    const slotCache = new Map<string, Awaited<ReturnType<TimetableViewService['loadSlots']>>>();
    for (const d of dates) {
      const semester = semesters.filter((s) => dayText(s.startDate)! <= d.date && dayText(s.endDate)! >= d.date).sort((a, b) => Number(b.schoolYearId - a.schoolYearId))[0];
      const version = semester ? pickEffective(versionLikes.filter((v) => v.semesterId === semester.id.toString()), d.date) : null;
      const slots: ViewSlotDto[] = [];
      if (version) {
        let rows = slotCache.get(version.id);
        if (!rows) {
          rows = await this.loadSlots(BigInt(version.id), scope);
          slotCache.set(version.id, rows);
        }
        for (const s of rows.filter((r) => r.day === d.day)) {
          slots.push({
            period: s.period,
            className: s.class.name,
            subjectName: s.assignment.subject.name,
            teacherName: s.teacher.fullName,
            roomName: s.room?.name ?? null,
            fixedName: null,
          });
        }
      }
      // Tiết cố định hiện cả khi chưa có phiên bản: Chào cờ, Sinh hoạt lớp…
      for (const f of fixed.filter((x) => x.day === d.day)) {
        if (scope.kind === 'class') {
          if (f.gradeLevel === null || f.gradeLevel === gradeLevel) {
            slots.push({ period: f.period, className, subjectName: null, teacherName: null, roomName: null, fixedName: f.name });
          }
        } else if (f.kind === 'SCHOOL' && f.gradeLevel === null) {
          slots.push({ period: f.period, className: 'Cả trường', subjectName: null, teacherName: null, roomName: null, fixedName: f.name });
        } else if (f.kind === 'CLASS_MEETING') {
          for (const hc of homeroom.filter((h) => f.gradeLevel === null || f.gradeLevel === h.gradeLevel)) {
            slots.push({ period: f.period, className: hc.name, subjectName: null, teacherName: null, roomName: null, fixedName: f.name });
          }
        }
      }
      slots.sort((a, b) => a.period - b.period);
      days.push({
        day: d.day,
        date: d.date,
        versionId: version?.id ?? null,
        versionName: version?.name ?? null,
        effectiveDate: version?.effectiveDate ?? null,
        slots,
      });
    }
    return { title: scope.title, weekStart: weekStart(date ?? today), today, frame, days };
  }

  private loadSlots(timetableId: bigint, scope: Scope) {
    return this.prisma.timetableSlot.findMany({
      where: {
        timetableId,
        classId: scope.kind === 'class' ? scope.classId : undefined,
        teacherId: scope.kind === 'teacher' ? scope.teacherId : undefined,
      },
      include: { class: true, assignment: { include: { subject: true } }, teacher: { select: { fullName: true } }, room: true },
    });
  }

  // Tra cứu cho AI Agent (chỉ đọc): lịch của một giáo viên hoặc lớp trong một ngày, đúng phạm vi quyền của người hỏi.
  async lookup(actor: AuthUser, input: { teacherName?: string; className?: string; date?: string }) {
    const date = input.date ?? vnToday();
    let week: WeekViewDto;
    if (input.className) {
      // Ưu tiên lớp của năm học hiện hành; không có thì lớp cùng tên của năm học mới nhất.
      const byName = { name: { equals: input.className.trim(), mode: 'insensitive' as const } };
      const cls =
        (await this.prisma.schoolClass.findFirst({ where: { ...byName, schoolYear: { isCurrent: true } } })) ??
        (await this.prisma.schoolClass.findFirst({ where: byName, orderBy: { schoolYearId: 'desc' } }));
      if (!cls) throw new NotFoundException(`Không tìm thấy lớp ${input.className}`);
      week = await this.classWeek(actor, cls.id.toString(), date);
    } else if (input.teacherName) {
      const teachers = await this.prisma.user.findMany({
        where: { fullName: { contains: input.teacherName.trim(), mode: 'insensitive' }, teacherProfile: { isNot: null } },
        select: { id: true, fullName: true },
        take: 6,
      });
      if (teachers.length === 0) throw new NotFoundException(`Không tìm thấy giáo viên "${input.teacherName}"`);
      if (teachers.length > 1) return { candidates: teachers.map((t) => t.fullName), message: 'Có nhiều giáo viên khớp tên, hãy nêu rõ họ tên đầy đủ.' };
      week = await this.teacherWeek(actor, teachers[0]!.id.toString(), date);
    } else {
      week = await this.mine(actor, date);
    }
    const entry = week.days.find((d) => d.date === date);
    return {
      title: week.title,
      date,
      weekday: entry ? TIMETABLE_DAY_NAMES[entry.day] : 'Chủ nhật (không có tiết học)',
      version: entry?.versionName ?? null,
      periods: (entry?.slots ?? []).map((s) => {
        const p = week.frame.periods.find((x) => x.no === s.period);
        return {
          period: s.period,
          time: p ? `${p.start}–${p.end}` : null,
          class: s.className,
          subject: s.subjectName ?? s.fixedName,
          teacher: s.teacherName,
          room: s.roomName,
        };
      }),
    };
  }

  // ───────────── Xuất Excel ─────────────

  // Theo lớp, theo giáo viên hoặc toàn trường; mặc định dùng phiên bản đang có hiệu lực hôm nay (không có thì bản công bố mới nhất).
  async exportWorkbook(actor: AuthUser, query: ExportQuery): Promise<Buffer> {
    assertPermission(actor, 'timetable:read');
    await this.timetable.archiveSuperseded();
    const version = query.versionId
      ? await this.timetable.versionOrThrow(query.versionId)
      : await this.defaultVersion();
    if (!version) throw new NotFoundException('Chưa có thời khoá biểu nào được công bố');
    const frame = await this.timetable.getFrame();
    if (query.scope !== 'school' && !query.id) throw new BadRequestException('Thiếu mã lớp hoặc giáo viên cần xuất');
    const where =
      query.scope === 'class'
        ? { classId: parseId(query.id!) }
        : query.scope === 'teacher'
          ? { teacherId: parseId(query.id!) }
          : {};
    const slots = await this.prisma.timetableSlot.findMany({
      where: { timetableId: version.id, ...where },
      include: { class: true, assignment: { include: { subject: true } }, teacher: { select: { fullName: true } }, room: true },
      orderBy: [{ day: 'asc' }, { period: 'asc' }],
    });

    const wb = new ExcelJS.Workbook();
    const text = (v: string) => safeCell(v);
    const periodLabel = (no: number) => {
      const p = frame.periods.find((x) => x.no === no);
      return p ? `Tiết ${no} (${p.start}–${p.end})` : `Tiết ${no}`;
    };
    const grid = (name: string, rows: typeof slots, cell: (s: (typeof slots)[number]) => string) => {
      const sheet = wb.addWorksheet(name.slice(0, 31));
      sheet.addRow(['', ...frame.days.map((d) => TIMETABLE_DAY_NAMES[d] ?? `Thứ ${d}`)]);
      for (const p of frame.periods) {
        sheet.addRow([
          periodLabel(p.no),
          ...frame.days.map((d) =>
            rows
              .filter((s) => s.day === d && s.period === p.no)
              .map((s) => text(cell(s)))
              .join('\n'),
          ),
        ]);
      }
      sheet.getRow(1).font = { bold: true };
      sheet.getColumn(1).width = 22;
      for (let i = 2; i <= frame.days.length + 1; i++) sheet.getColumn(i).width = 24;
      return sheet;
    };

    if (query.scope === 'class') {
      grid(slots[0]?.class.name ?? 'Lớp', slots, (s) => `${s.assignment.subject.name}\n${s.teacher.fullName}${s.room ? `\n${s.room.name}` : ''}`);
    } else if (query.scope === 'teacher') {
      grid(slots[0]?.teacher.fullName ?? 'Giáo viên', slots, (s) => `${s.class.name} · ${s.assignment.subject.name}${s.room ? `\n${s.room.name}` : ''}`);
    } else {
      const list = wb.addWorksheet('Toàn trường');
      list.addRow(['Lớp', 'Thứ', 'Tiết', 'Giờ', 'Môn', 'Giáo viên', 'Phòng']);
      for (const s of slots) {
        const p = frame.periods.find((x) => x.no === s.period);
        list.addRow([
          text(s.class.name),
          TIMETABLE_DAY_NAMES[s.day] ?? s.day,
          s.period,
          p ? `${p.start}–${p.end}` : '',
          text(s.assignment.subject.name),
          text(s.teacher.fullName),
          text(s.room?.name ?? ''),
        ]);
      }
      list.getRow(1).font = { bold: true };
      const names = new Set<string>();
      for (const s of slots) names.add(s.class.name);
      for (const name of [...names].sort((a, b) => a.localeCompare(b, 'vi'))) {
        grid(`Lớp ${name}`, slots.filter((s) => s.class.name === name), (s) => `${s.assignment.subject.name}\n${s.teacher.fullName}`);
      }
    }
    return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
  }

  private async defaultVersion() {
    const today = vnToday();
    const versions = await this.prisma.timetable.findMany({ where: { status: { in: ['PUBLISHED', 'ARCHIVED'] } }, include: { semester: { include: { schoolYear: true } }, publisher: { select: { fullName: true } }, _count: { select: { slots: true } } } });
    const likes = versions.map((v) => ({ id: v.id.toString(), semesterId: v.semesterId.toString(), status: v.status, effectiveDate: dayText(v.effectiveDate) }));
    const semester = await this.prisma.semester.findFirst({ where: { startDate: { lte: new Date(`${today}T00:00:00Z`) }, endDate: { gte: new Date(`${today}T00:00:00Z`) } } });
    const effective = semester ? pickEffective(likes.filter((l) => l.semesterId === semester.id.toString()), today) : null;
    const chosen = effective ? versions.find((v) => v.id.toString() === effective.id) : versions.sort((a, b) => Number(b.id - a.id))[0];
    return chosen ?? null;
  }
}
