import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ASSESSMENT_TYPE_NAMES, SCORE_IMPORT_MAX_ROWS, type ScoreImportPreviewDto } from '@pvh/shared';
import ExcelJS from 'exceljs';
import type { AuthUser } from '../../common/types/auth-user.js';
import { RedisService } from '../../infrastructure/queue/redis.service.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { readSheet, safeCell, type RawRow } from '../roster/excel.js';
import { SCORE_COLUMNS, validateScoreRows, type ImportStudent } from './score-import.js';
import { byVietnameseName, ScoresService, type SheetAccess } from './scores.service.js';

const PREVIEW_TTL_SEC = 30 * 60;

interface StoredPreview {
  actorId: string;
  assessmentId: string;
  classId: string;
  raw: RawRow[];
}

// Nhập điểm từ Excel (bước 18): tải mẫu đã điền mã + tên học sinh của lớp → xem trước → xác nhận.
// Cùng cơ chế với nhập danh sách (bước 14): dữ liệu thô giữ trong Redis 30 phút, kiểm tra lại lúc xác nhận.
@Injectable()
export class ScoresImportService {
  constructor(
    private readonly scores: ScoresService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditLogService,
  ) {}

  async template(actor: AuthUser, assessmentId: string, classId: string): Promise<{ file: Buffer; filename: string }> {
    const ctx = await this.scores.access(actor, assessmentId, classId);
    if (!ctx.inScope) throw new ForbiddenException('Chỉ giáo viên được phân công lớp–môn này mới nhập điểm');
    const { assessment, class: cls } = ctx.ac;
    const students = [...(await this.scores.classStudents(ctx.ac.classId)).values()].sort((a, b) => byVietnameseName(a.fullName, b.fullName));

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Điểm');
    sheet.addRow(['STT', ...SCORE_COLUMNS.map((c) => c.label)]);
    sheet.getRow(1).font = { bold: true };
    for (const [i, s] of students.entries()) sheet.addRow([i + 1, safeCell(s.code), safeCell(s.fullName), '', '']);
    [6, 16, 30, 10, 36].forEach((w, i) => (sheet.getColumn(i + 1).width = w));
    sheet.getColumn(4).numFmt = '0.00';

    const info = workbook.addWorksheet('Thông tin');
    info.addRows(
      [
        ['Mã đợt thi', assessment.code],
        ['Loại', ASSESSMENT_TYPE_NAMES[assessment.type]],
        ['Môn', assessment.subject.name],
        ['Lớp', cls.name],
        ['Học kỳ', `${assessment.semester.name} – ${assessment.semester.schoolYear.name}`],
        ['Ngày kiểm tra', assessment.testDate.toISOString().slice(0, 10)],
        ['Hướng dẫn', 'Điểm từ 0 đến 10, dùng dấu phẩy hoặc chấm (8,5). Ô trống được giữ nguyên. Vắng có lý do: để trống điểm, ghi lý do vào cột Ghi chú.'],
      ].map((r) => r.map(safeCell)),
    );
    info.getColumn(1).width = 16;
    info.getColumn(2).width = 60;

    const out = await workbook.xlsx.writeBuffer();
    return { file: Buffer.from(out as ArrayBuffer), filename: `diem-${assessment.code}-${cls.name}.xlsx`.replace(/[^\w.-]/g, '_') };
  }

  async preview(actor: AuthUser, assessmentId: string, classId: string, file: Buffer, ip?: string): Promise<ScoreImportPreviewDto> {
    const ctx = await this.scores.access(actor, assessmentId, classId);
    this.scores.assertCanEdit(ctx);
    const client = this.redis.client;
    if (!client) throw new ServiceUnavailableException('Nhập điểm từ Excel cần Redis (REDIS_URL) để lưu bản xem trước');
    const raw = await readSheet(file, SCORE_COLUMNS, SCORE_IMPORT_MAX_ROWS);
    if (raw.length === 0) throw new BadRequestException('File không có dòng dữ liệu nào');

    const previewId = randomUUID();
    const stored: StoredPreview = { actorId: actor.id, assessmentId: ctx.ac.assessmentId.toString(), classId: ctx.ac.classId.toString(), raw };
    await client.set(this.redis.key('scores', 'preview', previewId), JSON.stringify(stored), 'EX', PREVIEW_TTL_SEC);

    const rows = (await this.validate(ctx, raw)).map((v) => v.dto);
    const count = (s: string) => rows.filter((r) => r.status === s).length;
    await this.audit.record({
      userId: actor.id,
      channel: 'web',
      action: 'score.import_preview',
      targetType: 'assessment',
      targetId: stored.assessmentId,
      params: { code: ctx.ac.assessment.code, class: ctx.ac.class.name, rows: rows.length, ok: count('ok'), errors: count('error') },
      ok: true,
      ip,
    });
    return {
      previewId,
      assessmentId: stored.assessmentId,
      classId: stored.classId,
      total: rows.length,
      ok: count('ok'),
      skipped: count('skip'),
      errors: count('error'),
      rows,
      expiresAt: new Date(Date.now() + PREVIEW_TTL_SEC * 1000).toISOString(),
    };
  }

  // Mỗi bản xem trước dùng một lần; kiểm tra lại quyền, hạn nhập và danh sách lớp với CSDL hiện tại.
  async confirm(actor: AuthUser, previewId: string, ip?: string) {
    const client = this.redis.client;
    if (!client) throw new ServiceUnavailableException('Nhập điểm từ Excel cần Redis (REDIS_URL)');
    if (!/^[0-9a-f-]{36}$/.test(previewId)) throw new NotFoundException('Bản xem trước không tồn tại hoặc đã hết hạn');
    // Chỉ người tải lên mới dùng được; người khác đoán được id cũng không làm mất bản xem trước của họ.
    const key = this.redis.key('scores', 'preview', previewId);
    const peek = await client.get(key);
    const owner = peek ? (JSON.parse(peek) as StoredPreview).actorId : null;
    const json = owner === actor.id ? await client.getdel(key) : null;
    const stored = json ? (JSON.parse(json) as StoredPreview) : null;
    if (!stored) throw new NotFoundException('Bản xem trước không tồn tại hoặc đã hết hạn, hãy tải file lên lại');
    const ctx = await this.scores.access(actor, stored.assessmentId, stored.classId);
    this.scores.assertCanEdit(ctx);
    await this.scores.limitWrites(actor);

    const validated = await this.validate(ctx, stored.raw);
    const entries = validated.flatMap((v) =>
      v.entry ? [{ studentId: BigInt(v.entry.studentId), desired: { value: v.entry.value, status: v.entry.status, note: v.entry.note } }] : [],
    );
    const result = await this.scores.apply(actor, ctx, entries, 'EXCEL');
    const skipped = validated.length - entries.length;
    await this.audit.record({
      userId: actor.id,
      channel: 'web',
      action: 'score.import',
      targetType: 'assessment',
      targetId: stored.assessmentId,
      params: { code: ctx.ac.assessment.code, class: ctx.ac.class.name, ...result, skipped },
      ok: true,
      ip,
    });
    return { ...result, skipped, sheet: await this.scores.buildSheet(actor, ctx) };
  }

  private async validate(ctx: SheetAccess, raw: RawRow[]) {
    const [students, exempt] = await Promise.all([
      this.scores.classStudents(ctx.ac.classId),
      this.prisma.score.findMany({ where: { assessmentId: ctx.ac.assessmentId, status: 'EXEMPT' }, select: { studentId: true } }),
    ]);
    const exemptIds = new Set(exempt.map((e) => e.studentId.toString()));
    const byCode = new Map<string, ImportStudent>(
      [...students.values()]
        .filter((s) => s.code)
        .map((s) => [s.code.toUpperCase(), { id: s.id.toString(), fullName: s.fullName, exempt: exemptIds.has(s.id.toString()) }]),
    );
    return validateScoreRows(raw, byCode);
  }
}
