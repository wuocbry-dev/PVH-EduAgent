import { formatScore, parseScore } from '@pvh/shared';
import type { RawRow } from '../roster/excel.js';
import { validateScoreRows, type ImportStudent } from './score-import.js';
import { assignmentCovers, buildAssessmentCode, codePart, diffScore, type AssignmentScope, type CodeInput } from './score-rules.js';

describe('chuẩn hoá điểm (parseScore)', () => {
  it('chấp nhận dấu phẩy hoặc chấm, khoảng trắng, số nguyên, tối đa 2 chữ số thập phân', () => {
    expect(parseScore('8,5')).toEqual({ ok: true, value: 8.5 });
    expect(parseScore('8.5')).toEqual({ ok: true, value: 8.5 });
    expect(parseScore(' 10 ')).toEqual({ ok: true, value: 10 });
    expect(parseScore('0')).toEqual({ ok: true, value: 0 });
    expect(parseScore('7,25')).toEqual({ ok: true, value: 7.25 });
    expect(parseScore(',5')).toEqual({ ok: true, value: 0.5 });
    expect(parseScore(9)).toEqual({ ok: true, value: 9 });
  });

  it('chuỗi rỗng / null là chưa có điểm', () => {
    expect(parseScore('')).toEqual({ ok: true, value: null });
    expect(parseScore('   ')).toEqual({ ok: true, value: null });
    expect(parseScore(null)).toEqual({ ok: true, value: null });
  });

  it('chặn ngoài khoảng 0–10, số âm, chữ, quá 2 chữ số thập phân', () => {
    expect(parseScore('10.5')).toEqual({ ok: false, error: 'Điểm tối đa là 10' });
    expect(parseScore('11')).toEqual({ ok: false, error: 'Điểm tối đa là 10' });
    expect(parseScore('-1')).toEqual({ ok: false, error: 'Điểm không được âm' });
    expect(parseScore('abc')).toMatchObject({ ok: false });
    expect(parseScore('8,5,1')).toMatchObject({ ok: false });
    expect(parseScore('1e1')).toMatchObject({ ok: false });
    expect(parseScore('8.555')).toEqual({ ok: false, error: 'Điểm có tối đa 2 chữ số thập phân' });
    expect(parseScore(Number.NaN)).toMatchObject({ ok: false });
  });

  it('hiển thị kiểu Việt Nam', () => {
    expect(formatScore('8.5')).toBe('8,5');
    expect(formatScore('10')).toBe('10');
    expect(formatScore(null)).toBe('');
  });
});

describe('sinh mã đợt thi', () => {
  const tx: CodeInput = {
    type: 'THUONG_XUYEN',
    schoolYearName: '2026-2027',
    semesterNumber: 1,
    subjectCode: 'toan',
    scope: { className: '10A1' },
  };

  it('đợt thường xuyên: KT-năm-HK-môn-lớp-số thứ tự 3 chữ số, tăng theo mã đã có', () => {
    expect(buildAssessmentCode(tx, [])).toBe('KT-2026-HK1-TOAN-10A1-001');
    expect(buildAssessmentCode(tx, ['KT-2026-HK1-TOAN-10A1-001', 'KT-2026-HK1-TOAN-10A1-002'])).toBe('KT-2026-HK1-TOAN-10A1-003');
    // Số thứ tự lấy lớn nhất + 1 (đợt giữa bị xoá không làm trùng mã).
    expect(buildAssessmentCode(tx, ['KT-2026-HK1-TOAN-10A1-005'])).toBe('KT-2026-HK1-TOAN-10A1-006');
    // Mã của lớp khác có cùng tiền tố không được tính.
    expect(buildAssessmentCode(tx, ['KT-2026-HK1-TOAN-10A1X-009'])).toBe('KT-2026-HK1-TOAN-10A1-001');
  });

  it('đợt chung của BGH: GK/CK-năm-HK-môn-khối, thêm số khi trùng', () => {
    const gk: CodeInput = { ...tx, type: 'GIUA_KY', semesterNumber: 2, scope: { gradeLevel: 10 } };
    expect(buildAssessmentCode(gk, [])).toBe('GK-2026-HK2-TOAN-K10');
    expect(buildAssessmentCode(gk, ['GK-2026-HK2-TOAN-K10'])).toBe('GK-2026-HK2-TOAN-K10-2');
    expect(buildAssessmentCode({ ...gk, type: 'CUOI_KY' }, ['GK-2026-HK2-TOAN-K10'])).toBe('CK-2026-HK2-TOAN-K10');
  });

  it('bỏ dấu và ký tự lạ trong phần mã', () => {
    expect(codePart('Ngữ văn')).toBe('NGUVAN');
    expect(codePart('Đ-10/A 1')).toBe('D10A1');
  });
});

describe('phạm vi phân công', () => {
  const scopes: AssignmentScope[] = [
    { teacherId: 't1', classId: 'c1', subjectId: 's1', schoolYearId: 'y1', semesterId: null }, // cả năm
    { teacherId: 't1', classId: 'c2', subjectId: 's1', schoolYearId: 'y1', semesterId: 'hk1' }, // chỉ HK1
  ];
  const target = { teacherId: 't1', classId: 'c1', subjectId: 's1', schoolYearId: 'y1', semesterId: 'hk1' };

  it('phân công cả năm áp cho mọi học kỳ; phân công học kỳ chỉ áp cho học kỳ đó', () => {
    expect(assignmentCovers(scopes, target)).toBe(true);
    expect(assignmentCovers(scopes, { ...target, semesterId: 'hk2' })).toBe(true);
    expect(assignmentCovers(scopes, { ...target, classId: 'c2' })).toBe(true);
    expect(assignmentCovers(scopes, { ...target, classId: 'c2', semesterId: 'hk2' })).toBe(false);
  });

  it('khác lớp, khác môn, khác năm học, khác giáo viên đều không được', () => {
    expect(assignmentCovers(scopes, { ...target, classId: 'c3' })).toBe(false);
    expect(assignmentCovers(scopes, { ...target, subjectId: 's2' })).toBe(false);
    expect(assignmentCovers(scopes, { ...target, schoolYearId: 'y2' })).toBe(false);
    expect(assignmentCovers(scopes, { ...target, teacherId: 't2' })).toBe(false);
    expect(assignmentCovers([], target)).toBe(false);
  });
});

describe('thay đổi một ô điểm', () => {
  it('tạo, sửa, xoá, không đổi', () => {
    expect(diffScore(null, { value: 8, status: 'GRADED', note: null })).toBe('CREATE');
    expect(diffScore(null, null)).toBeNull();
    expect(diffScore({ value: 8, status: 'GRADED', note: null }, { value: 8, status: 'GRADED', note: null })).toBeNull();
    expect(diffScore({ value: 8, status: 'GRADED', note: null }, { value: 8.5, status: 'GRADED', note: null })).toBe('UPDATE');
    expect(diffScore({ value: 8, status: 'GRADED', note: null }, { value: 8, status: 'GRADED', note: 'chép lại' })).toBe('UPDATE');
    expect(diffScore({ value: 8, status: 'GRADED', note: null }, { value: null, status: 'ABSENT', note: 'Ốm' })).toBe('UPDATE');
    expect(diffScore({ value: 8, status: 'GRADED', note: null }, null)).toBe('DELETE');
  });
});

describe('kiểm tra file điểm Excel', () => {
  const students = new Map<string, ImportStudent>([
    ['HS01', { id: '1', fullName: 'An', exempt: false }],
    ['HS02', { id: '2', fullName: 'Bình', exempt: false }],
    ['HS03', { id: '3', fullName: 'Chi', exempt: true }],
  ]);
  const row = (n: number, cells: Record<string, string>, formula = false): RawRow => ({ row: n, cells, formula });

  it('báo đúng dòng lỗi: mã không thuộc lớp, điểm ngoài khoảng, chữ, trùng mã, công thức, học sinh được miễn', () => {
    const result = validateScoreRows(
      [
        row(2, { code: 'hs01', value: '8,5' }),
        row(3, { code: 'HS99', value: '7' }),
        row(4, { code: 'HS02', value: '10.5' }),
        row(5, { code: 'HS01', value: '9' }),
        row(6, { code: 'HS02', value: '' }, true),
        row(7, { code: 'HS03', value: '6' }),
        row(8, { code: '', value: '6' }),
      ],
      students,
    );
    expect(result.map((r) => [r.dto.row, r.dto.status, r.dto.message])).toEqual([
      [2, 'ok', null],
      [3, 'error', 'Mã học sinh không thuộc lớp này'],
      [4, 'error', 'Điểm tối đa là 10'],
      [5, 'error', 'Trùng mã học sinh với dòng 2'],
      [6, 'error', 'Ô chứa công thức, hãy nhập giá trị'],
      [7, 'error', 'Học sinh được Ban giám hiệu miễn, không nhập điểm'],
      [8, 'error', 'Thiếu mã học sinh'],
    ]);
    expect(result[0]!.entry).toEqual({ studentId: '1', value: 8.5, status: 'GRADED', note: null });
    expect(result[0]!.dto.value).toBe('8.5');
    expect(validateScoreRows([row(2, { code: 'HS02', value: 'tám' })], students)[0]!.dto.status).toBe('error');
  });

  it('ô trống được bỏ qua; ô trống có ghi chú là vắng có lý do', () => {
    const [skip, absent] = validateScoreRows(
      [row(2, { code: 'HS01', value: '' }), row(3, { code: 'HS02', value: '', note: 'Ốm, có giấy' })],
      students,
    );
    expect(skip!.dto.status).toBe('skip');
    expect(skip!.entry).toBeUndefined();
    expect(absent!.entry).toEqual({ studentId: '2', value: null, status: 'ABSENT', note: 'Ốm, có giấy' });
  });
});
