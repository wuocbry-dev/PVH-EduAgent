import { BadRequestException } from '@nestjs/common';
import { ROSTER_MAX_ROWS, type RosterKind } from '@pvh/shared';
import ExcelJS from 'exceljs';

// Giới hạn phần giải nén: một file .xlsx (zip) 2 MB có thể phình rất lớn trong bộ nhớ.
const MAX_UNCOMPRESSED_BYTES = 30 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 200;

export const INVALID_XLSX = 'File không phải bảng tính Excel (.xlsx) hợp lệ';

// Đọc thư mục trung tâm của zip để biết tổng dung lượng giải nén TRƯỚC khi đưa cho thư viện đọc.
export function assertZipSafe(buffer: Buffer): void {
  if (buffer.length < 22 || buffer.readUInt32LE(0) !== 0x04034b50) throw new BadRequestException(INVALID_XLSX);
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 65535); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new BadRequestException(INVALID_XLSX);
  const entries = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  if (entries > MAX_ZIP_ENTRIES || offset === 0xffffffff) throw new BadRequestException(INVALID_XLSX);

  let total = 0;
  for (let n = 0; n < entries; n++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) throw new BadRequestException(INVALID_XLSX);
    const size = buffer.readUInt32LE(offset + 24);
    total += size === 0xffffffff ? MAX_UNCOMPRESSED_BYTES : size;
    if (total > MAX_UNCOMPRESSED_BYTES) throw new BadRequestException('File Excel quá lớn sau khi giải nén');
    offset += 46 + buffer.readUInt16LE(offset + 28) + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
  }
}

export type RawRow = { row: number; cells: Record<string, string>; formula: boolean };

interface ColumnSpec {
  key: string;
  label: string;
  aliases: string[];
  required: boolean;
}

export const STUDENT_COLUMNS: ColumnSpec[] = [
  { key: 'code', label: 'Mã học sinh', aliases: ['mahocsinh', 'mahs'], required: true },
  { key: 'fullName', label: 'Họ và tên', aliases: ['hovaten', 'hoten', 'hovatenhocsinh'], required: true },
  { key: 'className', label: 'Lớp', aliases: ['lop'], required: true },
  { key: 'birthDate', label: 'Ngày sinh', aliases: ['ngaysinh'], required: false },
  { key: 'gender', label: 'Giới tính', aliases: ['gioitinh'], required: false },
];

export const TEACHER_COLUMNS: ColumnSpec[] = [
  { key: 'code', label: 'Mã giáo viên', aliases: ['magiaovien', 'magv'], required: true },
  { key: 'fullName', label: 'Họ và tên', aliases: ['hovaten', 'hoten', 'hovatengiaovien'], required: true },
  { key: 'email', label: 'Email', aliases: ['email', 'thudientu'], required: true },
  { key: 'department', label: 'Tổ chuyên môn', aliases: ['tochuyenmon', 'to'], required: true },
  { key: 'phone', label: 'Số điện thoại', aliases: ['sodienthoai', 'dienthoai', 'sdt'], required: false },
  { key: 'homeroomClass', label: 'Lớp chủ nhiệm', aliases: ['lopchunhiem', 'chunhiem'], required: false },
];

export const columnsOf = (kind: RosterKind): ColumnSpec[] => (kind === 'STUDENT' ? STUDENT_COLUMNS : TEACHER_COLUMNS);

// Bỏ dấu, chữ thường, chỉ giữ chữ-số: "Họ và tên" → "hovaten".
export function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replaceAll('đ', 'd')
    .replaceAll('Đ', 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

type CellText = { text: string; formula: boolean };

function cellText(value: ExcelJS.CellValue): CellText {
  if (value === null || value === undefined) return { text: '', formula: false };
  if (typeof value === 'string') return { text: value.trim(), formula: false };
  if (typeof value === 'number' || typeof value === 'boolean') return { text: String(value), formula: false };
  if (value instanceof Date) return { text: value.toISOString().slice(0, 10), formula: false };
  // Công thức không được đánh giá: coi như ô không hợp lệ.
  if (typeof value === 'object' && ('formula' in value || 'sharedFormula' in value)) return { text: '', formula: true };
  if (typeof value === 'object' && 'richText' in value) {
    return { text: value.richText.map((r) => r.text).join('').trim(), formula: false };
  }
  if (typeof value === 'object' && 'text' in value) return { text: String(value.text).trim(), formula: false };
  return { text: '', formula: false };
}

// Đọc sheet đầu tiên: dòng 1 là tiêu đề, bỏ dòng trống. Quá số dòng cho phép hoặc thiếu cột bắt buộc thì từ chối cả file.
export async function readRoster(buffer: Buffer, kind: RosterKind): Promise<RawRow[]> {
  assertZipSafe(buffer);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new BadRequestException(INVALID_XLSX);
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new BadRequestException('File Excel không có trang tính nào');
  if (sheet.rowCount > ROSTER_MAX_ROWS + 1) {
    throw new BadRequestException(`File có quá nhiều dòng (tối đa ${ROSTER_MAX_ROWS} dòng dữ liệu)`);
  }

  const spec = columnsOf(kind);
  const byColumn = new Map<number, string>();
  sheet.getRow(1).eachCell((cell, col) => {
    const header = normalizeHeader(cellText(cell.value).text);
    const column = spec.find((c) => c.aliases.includes(header));
    if (column && ![...byColumn.values()].includes(column.key)) byColumn.set(col, column.key);
  });
  const missing = spec.filter((c) => c.required && ![...byColumn.values()].includes(c.key));
  if (missing.length > 0) {
    throw new BadRequestException(`Thiếu cột bắt buộc ở dòng tiêu đề: ${missing.map((c) => c.label).join(', ')}`);
  }

  const rows: RawRow[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const cells: Record<string, string> = {};
    let formula = false;
    let any = false;
    for (const [col, key] of byColumn) {
      const { text, formula: isFormula } = cellText(sheet.getRow(r).getCell(col).value);
      cells[key] = text;
      formula ||= isFormula;
      any ||= text !== '' || isFormula;
    }
    if (any) rows.push({ row: r, cells, formula });
  }
  return rows;
}

// Chống CSV/Excel injection khi XUẤT file: ô văn bản bắt đầu bằng = + - @ (hoặc tab/CR) bị Excel coi là công thức.
export function safeCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export async function buildTemplate(kind: RosterKind): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(kind === 'STUDENT' ? 'Học sinh' : 'Giáo viên');
  const spec = columnsOf(kind);
  sheet.addRow(spec.map((c) => safeCell(c.label)));
  sheet.getRow(1).font = { bold: true };
  for (const [i, column] of spec.entries()) sheet.getColumn(i + 1).width = Math.max(16, column.label.length + 6);
  const samples =
    kind === 'STUDENT'
      ? [
          ['MAU0001', 'Nguyễn Văn Mẫu', '10A1', '2010-05-12', 'Nam'],
          ['MAU0002', 'Trần Thị Thử', '10A1', '2010-09-03', 'Nữ'],
          ['MAU0003', 'Lê Minh Giả', '10A2', '', ''],
        ]
      : [
          ['GVMAU01', 'Phạm Văn Mẫu', 'giaovien.mau1@example.invalid', 'Tổ Toán – Tin', '0900000001', '10A1'],
          ['GVMAU02', 'Võ Thị Thử', 'giaovien.mau2@example.invalid', 'Tổ Ngữ văn', '', ''],
        ];
  for (const row of samples) sheet.addRow(row.map(safeCell));
  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
