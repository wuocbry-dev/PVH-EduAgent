import { parseScore, SCORE_NOTE_MAX, type ScoreImportRowDto } from '@pvh/shared';
import type { ColumnSpec, RawRow } from '../roster/excel.js';

export const SCORE_COLUMNS: ColumnSpec[] = [
  { key: 'code', label: 'Mã học sinh', aliases: ['mahocsinh', 'mahs'], required: true },
  { key: 'fullName', label: 'Họ và tên', aliases: ['hovaten', 'hoten'], required: false },
  { key: 'value', label: 'Điểm', aliases: ['diem', 'diemso'], required: true },
  { key: 'note', label: 'Ghi chú', aliases: ['ghichu'], required: false },
];

export interface ImportStudent {
  id: string;
  fullName: string;
  exempt: boolean;
}

export interface ValidatedScoreRow {
  dto: ScoreImportRowDto;
  // Có khi dòng hợp lệ: điểm (GRADED) hoặc vắng có lý do (ABSENT, điểm trống + ghi chú).
  entry?: { studentId: string; value: number | null; status: 'GRADED' | 'ABSENT'; note: string | null };
}

// Kiểm tra từng dòng của file điểm với danh sách học sinh của lớp (theo mã học sinh). Ô điểm trống không ghi chú
// = bỏ qua (giữ nguyên điểm đang có); không bao giờ xoá điểm từ Excel.
export function validateScoreRows(raw: readonly RawRow[], students: ReadonlyMap<string, ImportStudent>): ValidatedScoreRow[] {
  const seen = new Map<string, number>();
  return raw.map((r): ValidatedScoreRow => {
    const code = (r.cells.code ?? '').trim().toUpperCase();
    const valueText = (r.cells.value ?? '').trim();
    const note = (r.cells.note ?? '').trim() || null;
    const student = students.get(code);
    const base = {
      row: r.row,
      studentCode: code,
      fullName: student?.fullName ?? (r.cells.fullName ?? '').trim(),
      value: valueText || null,
      note,
    };
    const error = (message: string): ValidatedScoreRow => ({ dto: { ...base, status: 'error', message } });
    const skip = (message: string): ValidatedScoreRow => ({ dto: { ...base, status: 'skip', message } });

    if (r.formula) return error('Ô chứa công thức, hãy nhập giá trị');
    if (!code) return error('Thiếu mã học sinh');
    if (!student) return error('Mã học sinh không thuộc lớp này');
    const first = seen.get(code);
    if (first !== undefined) return error(`Trùng mã học sinh với dòng ${first}`);
    seen.set(code, r.row);
    if (note && note.length > SCORE_NOTE_MAX) return error(`Ghi chú tối đa ${SCORE_NOTE_MAX} ký tự`);

    if (!valueText) {
      if (!note) return skip('Để trống, giữ nguyên điểm hiện có');
      if (student.exempt) return skip('Học sinh được Ban giám hiệu miễn');
      return { dto: { ...base, status: 'ok', message: 'Vắng có lý do' }, entry: { studentId: student.id, value: null, status: 'ABSENT', note } };
    }
    const parsed = parseScore(valueText);
    if (!parsed.ok) return error(parsed.error);
    if (student.exempt) return error('Học sinh được Ban giám hiệu miễn, không nhập điểm');
    return {
      dto: { ...base, value: String(parsed.value), status: 'ok', message: null },
      entry: { studentId: student.id, value: parsed.value, status: 'GRADED', note },
    };
  });
}
