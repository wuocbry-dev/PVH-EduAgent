import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { parseScore, type ScoreAdjustmentDto, type ScoreStatus } from '@pvh/shared';
import { assertPermission, can } from '../../common/guards/permission.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { parseId } from '../../common/utils/parse-id.js';
import { isUniqueViolation } from '../../common/utils/prisma-errors.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { AdjustmentsQuery, CreateAdjustmentInput, ReviewAdjustmentInput } from './dto/score-views.dto.js';
import { diffScore, type DesiredScore } from './score-rules.js';
import { ScoresService } from './scores.service.js';

const INCLUDE = {
  assessment: { include: { subject: true, semester: true } },
  class: true,
  student: { select: { fullName: true, studentProfile: { select: { studentCode: true } } } },
  requester: { select: { fullName: true } },
  reviewer: { select: { fullName: true } },
} satisfies Prisma.ScoreAdjustmentInclude;
type AdjustmentRow = Prisma.ScoreAdjustmentGetPayload<{ include: typeof INCLUDE }>;

const num = (v: Prisma.Decimal | null) => (v === null ? null : Number(v));
const text = (v: Prisma.Decimal | null) => (v === null ? null : String(Number(v)));
const sameScore = (a: { value: number | null; status: ScoreStatus | null }, b: { value: number | null; status: ScoreStatus | null }) =>
  a.value === b.value && a.status === b.status;

// Điều chỉnh điểm sau hạn (bước 19). Khi đợt đã quá hạn hoặc học kỳ đã khoá sổ, giáo viên được phân công không sửa trực tiếp
// mà gửi đề nghị (điểm mới + lý do bắt buộc); Ban giám hiệu (assessment:manage) duyệt thì điểm mới được ghi vào scores và
// score_history (source ADJUST, changed_by = giáo viên, approved_by = BGH). audit_logs không chứa giá trị điểm.
@Injectable()
export class ScoreAdjustmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly scores: ScoresService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(actor: AuthUser, input: CreateAdjustmentInput, ip?: string): Promise<ScoreAdjustmentDto> {
    assertPermission(actor, 'score:enter');
    const ctx = await this.scores.access(actor, input.assessmentId, input.classId);
    if (!ctx.inScope) throw new ForbiddenException('Chỉ giáo viên được phân công lớp–môn này mới đề nghị điều chỉnh điểm');
    if (!ctx.deadlinePassed) throw new ConflictException('Đợt thi còn trong hạn nhập điểm, hãy sửa trực tiếp trên bảng điểm');
    await this.scores.limitWrites(actor);

    const students = await this.scores.classStudents(ctx.ac.classId);
    const student = students.get(input.studentId);
    if (!student) throw new BadRequestException('Học sinh không thuộc lớp của đợt thi này');
    const current = await this.prisma.score.findUnique({
      where: { assessmentId_studentId: { assessmentId: ctx.ac.assessmentId, studentId: student.id } },
    });
    if (current?.status === 'EXEMPT') throw new ConflictException('Học sinh được Ban giám hiệu miễn, không đề nghị điều chỉnh được');

    const desired = this.desired(input, student.code);
    const stored = current ? { value: num(current.value), status: current.status, note: current.note } : null;
    if (!diffScore(stored, desired)) throw new BadRequestException('Điểm đề nghị giống điểm hiện tại');

    let row: AdjustmentRow;
    try {
      row = await this.prisma.scoreAdjustment.create({
        data: {
          assessmentId: ctx.ac.assessmentId,
          studentId: student.id,
          classId: ctx.ac.classId,
          oldValue: current?.value ?? null,
          oldStatus: current?.status ?? null,
          newValue: desired?.value ?? null,
          newStatus: desired?.status ?? null,
          newNote: desired?.note ?? null,
          reason: input.reason,
          requestedBy: BigInt(actor.id),
        },
        include: INCLUDE,
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('Học sinh này đã có một đề nghị điều chỉnh đang chờ duyệt cho đợt thi');
      throw err;
    }
    await this.record(actor, 'score.adjust.request', row, ip);
    await this.notifyManagers(row);
    return this.toDto(row);
  }

  // BGH (assessment:manage): mọi đề nghị. Giáo viên: đề nghị của chính mình.
  async list(actor: AuthUser, query: AdjustmentsQuery): Promise<ScoreAdjustmentDto[]> {
    const manager = can(actor, 'assessment:manage');
    if (!manager) assertPermission(actor, 'score:enter');
    const rows = await this.prisma.scoreAdjustment.findMany({
      where: { status: query.status, requestedBy: manager ? undefined : BigInt(actor.id) },
      include: INCLUDE,
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
      take: 200,
    });
    return rows.map((r) => this.toDto(r));
  }

  // Duyệt: kiểm tra điểm hiện tại vẫn đúng như lúc gửi đề nghị rồi ghi điểm mới, tất cả trong một transaction.
  async approve(actor: AuthUser, id: string, input: ReviewAdjustmentInput, ip?: string): Promise<ScoreAdjustmentDto> {
    assertPermission(actor, 'assessment:manage');
    await this.scores.limitWrites(actor);
    const adjId = parseId(id);
    await this.prisma.$transaction(async (tx) => {
      const adj = await tx.scoreAdjustment.findUnique({ where: { id: adjId } });
      if (!adj) throw new NotFoundException('Đề nghị điều chỉnh không tồn tại');
      if (adj.status !== 'PENDING') throw new ConflictException('Đề nghị đã được xử lý');
      const current = await tx.score.findUnique({ where: { assessmentId_studentId: { assessmentId: adj.assessmentId, studentId: adj.studentId } } });
      if (!sameScore({ value: num(current?.value ?? null), status: current?.status ?? null }, { value: num(adj.oldValue), status: adj.oldStatus })) {
        throw new ConflictException('Điểm đã thay đổi kể từ khi gửi đề nghị; hãy từ chối để giáo viên gửi lại');
      }
      if (current?.status === 'EXEMPT') throw new ConflictException('Học sinh được miễn, không áp dụng được đề nghị');

      const desired: DesiredScore = adj.newStatus ? { value: num(adj.newValue), status: adj.newStatus as 'GRADED' | 'ABSENT', note: adj.newNote } : null;
      const stored = current ? { value: num(current.value), status: current.status, note: current.note } : null;
      const change = diffScore(stored, desired);
      if (change === 'DELETE') {
        await tx.score.delete({ where: { id: current!.id } });
      } else if (change) {
        const data = { value: desired!.value, status: desired!.status, note: desired!.note, enteredBy: adj.requestedBy, classId: adj.classId };
        if (change === 'CREATE') await tx.score.create({ data: { ...data, assessmentId: adj.assessmentId, studentId: adj.studentId } });
        else await tx.score.update({ where: { id: current!.id }, data });
      }
      if (change) {
        await tx.scoreHistory.create({
          data: {
            assessmentId: adj.assessmentId,
            studentId: adj.studentId,
            action: change,
            oldValue: current?.value ?? null,
            newValue: desired?.value ?? null,
            oldStatus: current?.status ?? null,
            newStatus: desired?.status ?? null,
            note: desired?.note ?? null,
            reason: adj.reason,
            source: 'ADJUST',
            changedBy: adj.requestedBy,
            approvedBy: BigInt(actor.id),
          },
        });
      }
      // Cập nhật có điều kiện: hai người duyệt cùng lúc thì chỉ một người thành công.
      const done = await tx.scoreAdjustment.updateMany({
        where: { id: adjId, status: 'PENDING' },
        data: { status: 'APPROVED', reviewedBy: BigInt(actor.id), reviewedAt: new Date(), reviewNote: input.note?.trim() || null },
      });
      if (done.count === 0) throw new ConflictException('Đề nghị đã được xử lý');
    });
    return this.finish(actor, adjId, 'score.adjust.approve', ip, 'đã được duyệt');
  }

  async reject(actor: AuthUser, id: string, input: ReviewAdjustmentInput, ip?: string): Promise<ScoreAdjustmentDto> {
    assertPermission(actor, 'assessment:manage');
    const note = input.note?.trim();
    if (!note) throw new BadRequestException('Cần ghi lý do từ chối');
    const adjId = parseId(id);
    await this.pendingOrThrow(adjId);
    const done = await this.prisma.scoreAdjustment.updateMany({
      where: { id: adjId, status: 'PENDING' },
      data: { status: 'REJECTED', reviewedBy: BigInt(actor.id), reviewedAt: new Date(), reviewNote: note },
    });
    if (done.count === 0) throw new ConflictException('Đề nghị đã được xử lý');
    return this.finish(actor, adjId, 'score.adjust.reject', ip, 'bị từ chối');
  }

  // Giáo viên rút lại đề nghị của chính mình khi còn chờ duyệt.
  async cancel(actor: AuthUser, id: string, ip?: string): Promise<ScoreAdjustmentDto> {
    assertPermission(actor, 'score:enter');
    const adjId = parseId(id);
    const adj = await this.prisma.scoreAdjustment.findUnique({ where: { id: adjId } });
    if (!adj || adj.requestedBy.toString() !== actor.id) throw new ForbiddenException('Bạn chỉ huỷ được đề nghị do mình gửi');
    const done = await this.prisma.scoreAdjustment.updateMany({ where: { id: adjId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
    if (done.count === 0) throw new ConflictException('Đề nghị đã được xử lý');
    const row = await this.prisma.scoreAdjustment.findUniqueOrThrow({ where: { id: adjId }, include: INCLUDE });
    await this.record(actor, 'score.adjust.cancel', row, ip);
    return this.toDto(row);
  }

  // ───────────── Nội bộ ─────────────

  private desired(input: CreateAdjustmentInput, studentCode: string): DesiredScore {
    const note = input.note?.trim() || null;
    if (input.status === 'ABSENT') {
      if (input.value !== null && String(input.value).trim() !== '') throw new BadRequestException(`${studentCode}: học sinh vắng thì để trống điểm`);
      if (!note) throw new BadRequestException(`${studentCode}: cần ghi lý do vắng`);
      return { value: null, status: 'ABSENT', note };
    }
    const parsed = parseScore(input.value);
    if (!parsed.ok) throw new BadRequestException(`${studentCode}: ${parsed.error}`);
    return parsed.value === null ? null : { value: parsed.value, status: 'GRADED', note };
  }

  private async pendingOrThrow(id: bigint) {
    const adj = await this.prisma.scoreAdjustment.findUnique({ where: { id } });
    if (!adj) throw new NotFoundException('Đề nghị điều chỉnh không tồn tại');
    if (adj.status !== 'PENDING') throw new ConflictException('Đề nghị đã được xử lý');
    return adj;
  }

  private async finish(actor: AuthUser, id: bigint, action: string, ip: string | undefined, verb: string): Promise<ScoreAdjustmentDto> {
    const row = await this.prisma.scoreAdjustment.findUniqueOrThrow({ where: { id }, include: INCLUDE });
    await this.record(actor, action, row, ip);
    // Báo giáo viên trong cổng (kênh web, không qua Telegram), không kèm giá trị điểm.
    await this.notifications.notify(
      [
        {
          userId: row.requestedBy,
          title: `Đề nghị điều chỉnh điểm ${verb}`,
          body: `Đợt ${row.assessment.code}, lớp ${row.class.name}, học sinh ${row.student.studentProfile?.studentCode ?? ''}${row.reviewNote ? `. Ghi chú: ${row.reviewNote}` : ''}`,
        },
      ],
      'web',
    );
    return this.toDto(row);
  }

  private async notifyManagers(row: AdjustmentRow): Promise<void> {
    const managers = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', roles: { some: { role: { permissions: { some: { permission: { code: 'assessment:manage' } } } } } } },
      select: { id: true },
    });
    await this.notifications.notify(
      managers.map((m) => ({
        userId: m.id,
        title: 'Có đề nghị điều chỉnh điểm chờ duyệt',
        body: `${row.requester.fullName} đề nghị điều chỉnh điểm đợt ${row.assessment.code}, lớp ${row.class.name}.`,
      })),
      'web',
    );
  }

  private record(actor: AuthUser, action: string, row: AdjustmentRow, ip: string | undefined) {
    return this.audit.record({
      userId: actor.id,
      channel: 'web',
      action,
      targetType: 'score_adjustment',
      targetId: row.id.toString(),
      params: { code: row.assessment.code, class: row.class.name, student: row.student.studentProfile?.studentCode ?? null },
      ok: true,
      ip,
    });
  }

  private toDto(r: AdjustmentRow): ScoreAdjustmentDto {
    return {
      id: r.id.toString(),
      status: r.status,
      assessmentId: r.assessmentId.toString(),
      assessmentCode: r.assessment.code,
      assessmentType: r.assessment.type,
      subjectName: r.assessment.subject.name,
      semesterName: r.assessment.semester.name,
      classId: r.classId.toString(),
      className: r.class.name,
      studentId: r.studentId.toString(),
      studentCode: r.student.studentProfile?.studentCode ?? '',
      studentName: r.student.fullName,
      oldValue: text(r.oldValue),
      oldStatus: r.oldStatus,
      newValue: text(r.newValue),
      newStatus: r.newStatus,
      newNote: r.newNote,
      reason: r.reason,
      requestedById: r.requestedBy.toString(),
      requestedByName: r.requester.fullName,
      requestedAt: r.requestedAt.toISOString(),
      reviewedByName: r.reviewer?.fullName ?? null,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      reviewNote: r.reviewNote,
    };
  }
}
