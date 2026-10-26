import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { assertZipSafe, buildTemplate, normalizeHeader, readRoster, safeCell, type RawRow } from './excel.js';
import { classKey, parseBirthDate, parseGender, validateRows, type RosterContext } from './roster-validate.js';

async function xlsx(rows: unknown[][], sheetName = 'Sheet1'): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(sheetName);
  for (const r of rows) sheet.addRow(r);
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

const STUDENT_HEADER = ['Mã học sinh', 'Họ và tên', 'Lớp', 'Ngày sinh', 'Giới tính'];

describe('đọc file Excel', () => {
  it('nhận tiêu đề tiếng Việt có dấu/không dấu, thứ tự cột tuỳ ý, bỏ dòng trống', async () => {
    const buf = await xlsx([
      ['ho va ten', 'LỚP', 'Mã HS'],
      ['Nguyễn Văn A', '10A1', 'hs001'],
      [],
      ['Trần Thị B', '10A2', 'hs002'],
    ]);
    const rows = await readRoster(buf, 'STUDENT');
    expect(rows).toEqual([
      { row: 2, cells: { fullName: 'Nguyễn Văn A', className: '10A1', code: 'hs001' }, formula: false },
      { row: 4, cells: { fullName: 'Trần Thị B', className: '10A2', code: 'hs002' }, formula: false },
    ]);
  });

  it('thiếu cột bắt buộc → lỗi nêu tên cột', async () => {
    const buf = await xlsx([['Mã học sinh', 'Họ và tên'], ['HS1', 'A']]);
    await expect(readRoster(buf, 'STUDENT')).rejects.toThrow(/Lớp/);
    await expect(readRoster(buf, 'TEACHER')).rejects.toThrow(/Mã giáo viên/);
  });

  it('ô công thức không được đánh giá, chỉ bị đánh dấu', async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('S');
    sheet.addRow(STUDENT_HEADER);
    sheet.addRow(['HS001', { formula: 'CONCATENATE("A","B")', result: 'AB' }, '10A1']);
    const rows = await readRoster(Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer), 'STUDENT');
    expect(rows[0]!.formula).toBe(true);
    expect(rows[0]!.cells.fullName).toBe('');
  });

  it('ngày trong ô ngày của Excel đọc ra YYYY-MM-DD', async () => {
    const buf = await xlsx([STUDENT_HEADER, ['HS001', 'A', '10A1', new Date(Date.UTC(2010, 4, 12)), 'Nam']]);
    const rows = await readRoster(buf, 'STUDENT');
    expect(rows[0]!.cells.birthDate).toBe('2010-05-12');
  });

  it('quá số dòng cho phép bị từ chối cả file', async () => {
    const data = Array.from({ length: 3001 }, (_, i) => [`HS${i}`, 'A', '10A1']);
    const buf = await xlsx([['Mã học sinh', 'Họ và tên', 'Lớp'], ...data]);
    await expect(readRoster(buf, 'STUDENT')).rejects.toThrow(/quá nhiều dòng/);
  });

  it('không phải .xlsx (văn bản, zip rỗng, file hỏng) → 400, không ném lỗi hệ thống', async () => {
    await expect(readRoster(Buffer.from('a,b,c\n1,2,3'), 'STUDENT')).rejects.toBeInstanceOf(BadRequestException);
    await expect(readRoster(Buffer.alloc(100), 'STUDENT')).rejects.toBeInstanceOf(BadRequestException);
    const good = await xlsx([STUDENT_HEADER, ['HS001', 'A', '10A1']]);
    await expect(readRoster(good.subarray(0, good.length - 40), 'STUDENT')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('zip khai báo dung lượng giải nén quá lớn bị chặn trước khi giải nén', () => {
    const good = Buffer.from('PK\x03\x04', 'latin1');
    expect(() => assertZipSafe(good)).toThrow(BadRequestException);

    // Dựng thư mục trung tâm giả: 1 entry khai báo 40 MB giải nén.
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt32LE(40 * 1024 * 1024, 24);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(4, 16); // central directory ngay sau 4 byte chữ ký đầu file
    expect(() => assertZipSafe(Buffer.concat([good, header, eocd]))).toThrow(/quá lớn/);
  });
});

describe('xuất file: chống Excel injection và file mẫu', () => {
  it('ô bắt đầu bằng = + - @ được thêm dấu nháy', () => {
    expect(safeCell('=HYPERLINK("http://x")')).toBe(`'=HYPERLINK("http://x")`);
    expect(safeCell('+1')).toBe("'+1");
    expect(safeCell('-2')).toBe("'-2");
    expect(safeCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(safeCell('\t=1')).toBe("'\t=1");
    expect(safeCell('Nguyễn Văn A')).toBe('Nguyễn Văn A');
  });

  it('file mẫu đọc lại được bằng chính bộ đọc nhập danh sách', async () => {
    const students = await readRoster(await buildTemplate('STUDENT'), 'STUDENT');
    expect(students.length).toBeGreaterThanOrEqual(2);
    expect(students[0]!.cells.code).toMatch(/^MAU/);
    const teachers = await readRoster(await buildTemplate('TEACHER'), 'TEACHER');
    expect(teachers[0]!.cells.email).toContain('@example.invalid');
  });

  it('normalizeHeader bỏ dấu, kể cả đ/Đ', () => {
    expect(normalizeHeader('Họ và tên')).toBe('hovaten');
    expect(normalizeHeader('Đồng ý')).toBe('dongy');
    expect(normalizeHeader('Tổ chuyên môn')).toBe('tochuyenmon');
  });
});

const ctx = (over: Partial<RosterContext> = {}): RosterContext => ({
  classes: new Map([
    [classKey('10A1'), { id: 1n, name: '10A1', homeroomTeacherId: null }],
    [classKey('10A2'), { id: 2n, name: '10A2', homeroomTeacherId: 99n }],
  ]),
  departments: new Map([[normalizeHeader('Tổ Toán'), { id: 5n, name: 'Tổ Toán' }]]),
  existingStudentCodes: new Set(),
  existingTeacherCodes: new Set(),
  existingEmails: new Set(),
  ...over,
});

const student = (row: number, cells: Record<string, string>): RawRow => ({ row, cells, formula: false });

describe('kiểm tra từng dòng học sinh', () => {
  it('dòng hợp lệ: chuẩn hoá mã viết hoa, lớp không phân biệt hoa thường/khoảng trắng', () => {
    const [r] = validateRows('STUDENT', [student(2, { code: 'hs001', fullName: '  Nguyễn   Văn A ', className: '10 a1', gender: 'nữ', birthDate: '12/05/2010' })], ctx());
    expect(r!.dto.status).toBe('ok');
    expect(r!.data).toMatchObject({ code: 'HS001', fullName: 'Nguyễn Văn A', classId: 1n, gender: 'FEMALE' });
    expect(r!.data!.birthDate!.toISOString()).toBe('2010-05-12T00:00:00.000Z');
  });

  it('báo từng lỗi kèm lý do tiếng Việt', () => {
    const rows = validateRows(
      'STUDENT',
      [
        student(2, { code: '', fullName: 'A', className: '10A1' }),
        student(3, { code: 'a b', fullName: 'A', className: '10A1' }),
        student(4, { code: 'HS004', fullName: '', className: '10A1' }),
        student(5, { code: 'HS005', fullName: '=cmd|calc', className: '10A1' }),
        student(6, { code: 'HS006', fullName: 'A<script>', className: '10A1' }),
        student(7, { code: 'HS007', fullName: 'A', className: '' }),
        student(8, { code: 'HS008', fullName: 'A', className: '99Z' }),
        student(9, { code: 'HS009', fullName: 'A', className: '10A1', birthDate: '31/02/2010' }),
        student(10, { code: 'HS010', fullName: 'A', className: '10A1', gender: 'khác' }),
      ],
      ctx(),
    );
    expect(rows.map((r) => r.dto.status)).toEqual(Array(9).fill('error'));
    expect(rows[0]!.dto.messages).toContain('Thiếu mã học sinh');
    expect(rows[1]!.dto.messages[0]).toMatch(/Mã chỉ gồm/);
    expect(rows[2]!.dto.messages).toContain('Thiếu họ tên');
    expect(rows[3]!.dto.messages).toContain('Họ tên có ký tự không hợp lệ');
    expect(rows[4]!.dto.messages).toContain('Họ tên có ký tự không hợp lệ');
    expect(rows[5]!.dto.messages).toContain('Thiếu lớp');
    expect(rows[6]!.dto.messages[0]).toMatch(/Lớp "99Z" không tồn tại/);
    expect(rows[7]!.dto.messages[0]).toMatch(/Ngày sinh không hợp lệ/);
    expect(rows[8]!.dto.messages[0]).toMatch(/Giới tính/);
    expect(rows.every((r) => r.data === undefined)).toBe(true);
  });

  it('trùng mã trong file: dòng thứ hai trở đi là lỗi; mã đã có trong hệ thống là bỏ qua', () => {
    const rows = validateRows(
      'STUDENT',
      [
        student(2, { code: 'HS001', fullName: 'A', className: '10A1' }),
        student(3, { code: 'hs001', fullName: 'B', className: '10A1' }),
        student(4, { code: 'HS002', fullName: 'C', className: '10A1' }),
        student(5, { code: 'GV001', fullName: 'D', className: '10A1' }),
      ],
      ctx({ existingStudentCodes: new Set(['HS002']), existingTeacherCodes: new Set(['GV001']) }),
    );
    expect(rows.map((r) => r.dto.status)).toEqual(['ok', 'error', 'skip', 'error']);
    expect(rows[1]!.dto.messages[0]).toBe('Trùng mã với dòng 2 trong file');
    expect(rows[3]!.dto.messages[0]).toMatch(/loại tài khoản khác/);
  });

  it('ô công thức là lỗi', () => {
    const [r] = validateRows('STUDENT', [{ row: 2, cells: { code: 'HS001', fullName: '', className: '10A1' }, formula: true }], ctx());
    expect(r!.dto.status).toBe('error');
    expect(r!.dto.messages[0]).toMatch(/công thức/);
  });
});

describe('kiểm tra từng dòng giáo viên', () => {
  const teacher = (row: number, over: Record<string, string> = {}): RawRow => ({
    row,
    formula: false,
    cells: { code: `GV${row}`, fullName: 'Phạm A', email: `gv${row}@example.invalid`, department: 'tổ toán', ...over },
  });

  it('hợp lệ: email viết thường, tổ tra theo tên không dấu, lớp chủ nhiệm còn trống', () => {
    const [r] = validateRows('TEACHER', [teacher(2, { email: 'GV@Example.Invalid', homeroomClass: '10A1', phone: '0900000000' })], ctx());
    expect(r!.dto.status).toBe('ok');
    expect(r!.data).toMatchObject({ code: 'GV2', email: 'gv@example.invalid', departmentId: 5n, homeroomClassId: 1n, phone: '0900000000' });
  });

  it('lỗi: email sai/trùng, tổ không có, lớp đã có chủ nhiệm, hai giáo viên cùng một lớp', () => {
    const rows = validateRows(
      'TEACHER',
      [
        teacher(2, { email: 'khong-phai-email' }),
        teacher(3, { email: 'a@example.invalid' }),
        teacher(4, { email: 'A@example.invalid' }),
        teacher(5, { department: 'Tổ Lạ' }),
        teacher(6, { homeroomClass: '10A2' }),
        teacher(7, { homeroomClass: '10A1' }),
        teacher(8, { homeroomClass: '10A1' }),
        teacher(9, { email: 'da.co@example.invalid' }),
        teacher(10, { phone: 'abc' }),
      ],
      ctx({ existingEmails: new Set(['da.co@example.invalid']) }),
    );
    expect(rows.map((r) => r.dto.status)).toEqual(['error', 'ok', 'error', 'error', 'error', 'ok', 'error', 'error', 'error']);
    expect(rows[2]!.dto.messages[0]).toBe('Trùng email với dòng 3 trong file');
    expect(rows[4]!.dto.messages[0]).toMatch(/đã có giáo viên chủ nhiệm/);
    expect(rows[6]!.dto.messages[0]).toMatch(/đã được gán chủ nhiệm ở dòng 7/);
    expect(rows[7]!.dto.messages[0]).toMatch(/Email đã được dùng/);
  });
});

describe('phân tích ngày sinh và giới tính', () => {
  it('ngày: nhiều định dạng, ngày không có thật hoặc năm vô lý là invalid', () => {
    expect(parseBirthDate('')).toBeNull();
    expect(parseBirthDate('2010-5-3')!).toEqual(new Date(Date.UTC(2010, 4, 3)));
    expect(parseBirthDate('03/05/2010')!).toEqual(new Date(Date.UTC(2010, 4, 3)));
    for (const bad of ['2010-02-30', '32/01/2010', '1800-01-01', '2999-01-01', 'hôm qua']) {
      expect(parseBirthDate(bad), bad).toBe('invalid');
    }
  });

  it('giới tính', () => {
    expect(parseGender('Nam')).toBe('MALE');
    expect(parseGender('NỮ')).toBe('FEMALE');
    expect(parseGender('')).toBeNull();
    expect(parseGender('khác')).toBe('invalid');
  });
});
