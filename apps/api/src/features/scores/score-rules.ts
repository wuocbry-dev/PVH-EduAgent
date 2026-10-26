import { ASSESSMENT_CODE_PREFIX, type AssessmentType } from '@pvh/shared';

// Phần của mã đợt thi: bỏ dấu, chữ hoa, chỉ giữ chữ-số ("10A1" → "10A1", "Toán" → "TOAN").
export function codePart(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replaceAll('đ', 'd')
    .replaceAll('Đ', 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

// Năm bắt đầu của năm học: "2026-2027" → "2026".
export const yearStartOf = (schoolYearName: string): string => /^\d{4}/.exec(schoolYearName)?.[0] ?? codePart(schoolYearName);

export interface CodeInput {
  type: AssessmentType;
  schoolYearName: string;
  semesterNumber: number;
  subjectCode: string;
  // Đợt thường xuyên: tên lớp; đợt chung của BGH: khối.
  scope: { className: string } | { gradeLevel: number };
}

// Phần cố định của mã: KT-2026-HK1-TOAN-10A1 / GK-2026-HK1-TOAN-K10.
export function codeStem(input: CodeInput): string {
  const scope = 'className' in input.scope ? codePart(input.scope.className) : `K${input.scope.gradeLevel}`;
  return [
    ASSESSMENT_CODE_PREFIX[input.type],
    yearStartOf(input.schoolYearName),
    `HK${input.semesterNumber}`,
    codePart(input.subjectCode),
    scope,
  ].join('-');
}

// Mã đầy đủ. Đợt thường xuyên luôn có số thứ tự 3 chữ số (…-10A1-003); đợt chung chỉ thêm số khi trùng (…-K10-2).
export function buildAssessmentCode(input: CodeInput, existing: readonly string[]): string {
  const stem = codeStem(input);
  const taken = new Set(existing);
  if (input.type === 'THUONG_XUYEN') {
    let seq = 1;
    for (const code of existing) {
      const m = new RegExp(`^${stem}-(\\d+)$`).exec(code);
      if (m) seq = Math.max(seq, Number(m[1]) + 1);
    }
    return `${stem}-${String(seq).padStart(3, '0')}`;
  }
  if (!taken.has(stem)) return stem;
  let n = 2;
  while (taken.has(`${stem}-${n}`)) n++;
  return `${stem}-${n}`;
}

export interface AssignmentScope {
  teacherId: string;
  classId: string;
  subjectId: string;
  schoolYearId: string;
  semesterId: string | null; // null = cả năm
}

// Giáo viên có được nhập điểm lớp–môn này ở học kỳ này không: phải có phân công đúng lớp, đúng môn,
// và phân công cả năm của đúng năm học hoặc phân công đúng học kỳ đó.
export function assignmentCovers(
  assignments: readonly AssignmentScope[],
  target: { teacherId: string; classId: string; subjectId: string; schoolYearId: string; semesterId: string },
): boolean {
  return assignments.some(
    (a) =>
      a.teacherId === target.teacherId &&
      a.classId === target.classId &&
      a.subjectId === target.subjectId &&
      a.schoolYearId === target.schoolYearId &&
      (a.semesterId === null || a.semesterId === target.semesterId),
  );
}

export type StoredScore = { value: number | null; status: 'GRADED' | 'ABSENT' | 'EXEMPT'; note: string | null };
export type DesiredScore = { value: number | null; status: 'GRADED' | 'ABSENT'; note: string | null } | null; // null = xoá

// Thay đổi cần làm với một ô điểm (so với bản đang lưu).
export function diffScore(current: StoredScore | null, next: DesiredScore): 'CREATE' | 'UPDATE' | 'DELETE' | null {
  if (!current) return next ? 'CREATE' : null;
  if (!next) return 'DELETE';
  const same = current.status === next.status && current.value === next.value && (current.note ?? null) === (next.note ?? null);
  return same ? null : 'UPDATE';
}
