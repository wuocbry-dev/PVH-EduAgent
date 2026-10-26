import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ASSESSMENT_TYPES,
  SCORE_FORMULA_NOTE,
  type AssessmentType,
  type ScoreFormula,
  type ScoreFormulaDto,
  type ScoreLockDto,
} from '@pvh/shared';
import { assertPermission, can } from '../../common/guards/permission.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { parseId } from '../../common/utils/parse-id.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { SettingsService } from '../settings/settings.service.js';
import type { DeadlineInput, LockInput } from './dto/score-views.dto.js';
import { formulaSchema, parseFormula, type FormulaInput } from './score-formula.js';

// Trạng thái khoá của các đợt trong một học kỳ: hạn chung theo loại đợt và khoá sổ thủ công.
export interface SemesterGate {
  locked: boolean;
  deadlines: Map<AssessmentType, Date>;
}

// Hạn có hiệu lực của một đợt: hạn riêng (assessments.entry_deadline) ưu tiên, không có thì hạn chung theo học kỳ–loại.
export function effectiveDeadline(
  a: { entryDeadline: Date | null; type: AssessmentType },
  gate: SemesterGate | undefined,
): Date | null {
  return a.entryDeadline ?? gate?.deadlines.get(a.type) ?? null;
}

// Điểm của đợt bị khoá (chỉ sửa qua đề nghị điều chỉnh có BGH duyệt) khi học kỳ đã khoá sổ hoặc đã qua hạn.
export function isLocked(a: { entryDeadline: Date | null; type: AssessmentType }, gate: SemesterGate | undefined, now = Date.now()): boolean {
  if (gate?.locked) return true;
  const deadline = effectiveDeadline(a, gate);
  return !!deadline && deadline.getTime() < now;
}

// Hạn nhập điểm theo học kỳ–loại đợt, khoá sổ học kỳ và công thức điểm trung bình (bước 19).
// Xem: mọi người có quyền điểm; đặt hạn, khoá/mở khoá sổ, sửa công thức: Ban giám hiệu (assessment:manage).
@Injectable()
export class ScoreCalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly settings: SettingsService,
  ) {}

  async gates(semesterIds: bigint[]): Promise<Map<string, SemesterGate>> {
    const ids = [...new Set(semesterIds)];
    const result = new Map<string, SemesterGate>(ids.map((id) => [id.toString(), { locked: false, deadlines: new Map() }]));
    if (ids.length === 0) return result;
    const [locks, deadlines] = await Promise.all([
      this.prisma.scoreLock.findMany({ where: { semesterId: { in: ids } }, select: { semesterId: true } }),
      this.prisma.scoreDeadline.findMany({ where: { semesterId: { in: ids } } }),
    ]);
    for (const l of locks) result.get(l.semesterId.toString())!.locked = true;
    for (const d of deadlines) result.get(d.semesterId.toString())!.deadlines.set(d.type, d.deadline);
    return result;
  }

  async formula(): Promise<ScoreFormula> {
    return parseFormula(await this.settings.effective('scores.formula'));
  }

  async formulaDto(): Promise<ScoreFormulaDto> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key: 'scores.formula' } });
    return { ...parseFormula(row?.value), isDefault: !row, note: SCORE_FORMULA_NOTE };
  }

  // BGH (assessment:manage) và ADMIN (setting:manage, như trang Cấu hình) sửa được; công thức không chứa điểm của ai.
  async setFormula(actor: AuthUser, input: FormulaInput, ip?: string): Promise<ScoreFormulaDto> {
    if (!can(actor, 'assessment:manage') && !can(actor, 'setting:manage')) assertPermission(actor, 'assessment:manage');
    const formula = formulaSchema.parse(input);
    const value = JSON.stringify(formula);
    await this.prisma.systemSetting.upsert({
      where: { key: 'scores.formula' },
      update: { value, updatedBy: BigInt(actor.id) },
      create: { key: 'scores.formula', value, updatedBy: BigInt(actor.id) },
    });
    await this.record(actor, 'score.formula.update', 'setting', null, ip, { formula });
    return this.formulaDto();
  }

  // Hạn và trạng thái khoá các học kỳ của năm hiện hành.
  async locks(actor: AuthUser): Promise<ScoreLockDto[]> {
    if (!can(actor, 'score:read:all') && !can(actor, 'assessment:manage')) assertPermission(actor, 'score:read:all');
    const year = await this.prisma.schoolYear.findFirst({ where: { isCurrent: true } });
    if (!year) return [];
    const semesters = await this.prisma.semester.findMany({
      where: { schoolYearId: year.id },
      orderBy: { number: 'asc' },
      include: { scoreLock: { include: { locker: { select: { fullName: true } } } }, scoreDeadlines: true },
    });
    return semesters.map((s) => ({
      semesterId: s.id.toString(),
      semesterName: `${s.name} – ${year.name}`,
      locked: !!s.scoreLock,
      lockedAt: s.scoreLock?.lockedAt.toISOString() ?? null,
      lockedByName: s.scoreLock?.locker.fullName ?? null,
      reason: s.scoreLock?.reason ?? null,
      deadlines: ASSESSMENT_TYPES.map((type) => ({
        type,
        deadline: s.scoreDeadlines.find((d) => d.type === type)?.deadline.toISOString() ?? null,
      })),
    }));
  }

  async setDeadline(actor: AuthUser, input: DeadlineInput, ip?: string): Promise<ScoreLockDto[]> {
    assertPermission(actor, 'assessment:manage');
    const semester = await this.semester(input.semesterId);
    if (input.deadline === null) {
      await this.prisma.scoreDeadline.deleteMany({ where: { semesterId: semester.id, type: input.type } });
    } else {
      const deadline = new Date(input.deadline);
      if (Number.isNaN(deadline.getTime())) throw new BadRequestException('Hạn nhập điểm không hợp lệ');
      await this.prisma.scoreDeadline.upsert({
        where: { semesterId_type: { semesterId: semester.id, type: input.type } },
        update: { deadline, updatedBy: BigInt(actor.id) },
        create: { semesterId: semester.id, type: input.type, deadline, updatedBy: BigInt(actor.id) },
      });
    }
    await this.record(actor, 'score.deadline.set', 'semester', semester.id, ip, { type: input.type, deadline: input.deadline });
    return this.locks(actor);
  }

  async setLock(actor: AuthUser, semesterId: string, input: LockInput, ip?: string): Promise<ScoreLockDto[]> {
    assertPermission(actor, 'assessment:manage');
    const semester = await this.semester(semesterId);
    if (input.locked) {
      await this.prisma.scoreLock.upsert({
        where: { semesterId: semester.id },
        update: {},
        create: { semesterId: semester.id, lockedBy: BigInt(actor.id), reason: input.reason?.trim() || null },
      });
    } else {
      await this.prisma.scoreLock.deleteMany({ where: { semesterId: semester.id } });
    }
    await this.record(actor, input.locked ? 'score.lock' : 'score.unlock', 'semester', semester.id, ip, {
      semester: semester.name,
      reason: input.reason?.trim() || null,
    });
    return this.locks(actor);
  }

  private async semester(id: string) {
    const semester = await this.prisma.semester.findUnique({ where: { id: parseId(id) } });
    if (!semester) throw new NotFoundException('Học kỳ không tồn tại');
    return semester;
  }

  private record(actor: AuthUser, action: string, targetType: string, targetId: bigint | null, ip: string | undefined, params: Record<string, unknown>) {
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
