import type { Gender, RosterKind, RosterPreviewRow } from '@pvh/shared';
import { normalizeHeader, type RawRow } from './excel.js';

export interface RosterClass {
  id: bigint;
  name: string;
  homeroomTeacherId: bigint | null;
}

// Dữ liệu tra cứu đã nạp sẵn từ CSDL (chỉ các mã xuất hiện trong file) để kiểm tra từng dòng không chạm CSDL.
export interface RosterContext {
  classes: Map<string, RosterClass>; // khoá: tên lớp viết hoa, bỏ khoảng trắng
  departments: Map<string, { id: bigint; name: string }>; // khoá: normalizeHeader(tên tổ)
  existingStudentCodes: Set<string>;
  existingTeacherCodes: Set<string>;
  existingEmails: Set<string>;
}

export interface RosterData {
  code: string;
  fullName: string;
  classId: bigint | null; // học sinh: lớp học; giáo viên: không dùng
  className: string | null;
  email: string | null;
  departmentId: bigint | null;
  phone: string | null;
  birthDate: Date | null;
  gender: Gender | null;
  homeroomClassId: bigint | null;
}

export interface ValidatedRow {
  dto: RosterPreviewRow;
  data?: RosterData; // chỉ có khi status = 'ok'
}

export const classKey = (name: string) => name.toUpperCase().replace(/\s+/g, '');

const CODE_RE = /^[A-Za-z0-9._-]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+() .-]{6,20}$/;
// Tên bắt đầu bằng = + - @ bị Excel/Sheets hiểu là công thức khi xuất ra file; ký tự điều khiển và <> không có trong tên người.
const BAD_NAME_START = /^[=+\-@]/;
// eslint-disable-next-line no-control-regex
const BAD_NAME_CHARS = /[\u0000-\u001f\u007f<>]/;

export function parseBirthDate(value: string): Date | null | 'invalid' {
  if (!value) return null;
  let y: number;
  let m: number;
  let d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value))) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    return 'invalid';
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  const real = date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  return real && y >= 1950 && y <= new Date().getUTCFullYear() ? date : 'invalid';
}

export function parseGender(value: string): Gender | null | 'invalid' {
  if (!value) return null;
  const v = normalizeHeader(value);
  if (['nam', 'm', 'male'].includes(v)) return 'MALE';
  if (['nu', 'f', 'female'].includes(v)) return 'FEMALE';
  return 'invalid';
}

// Kiểm tra từng dòng: hợp lệ (ok), bỏ qua vì đã có trong hệ thống (skip) hoặc lỗi kèm lý do tiếng Việt (error).
export function validateRows(kind: RosterKind, raw: RawRow[], ctx: RosterContext): ValidatedRow[] {
  const seenCodes = new Map<string, number>();
  const seenEmails = new Map<string, number>();
  const claimedHomerooms = new Map<bigint, number>();

  return raw.map((r) => {
    const messages: string[] = [];
    let skip = false;
    const code = (r.cells.code ?? '').trim();
    const fullName = (r.cells.fullName ?? '').replace(/\s+/g, ' ').trim();
    const classText = (kind === 'STUDENT' ? r.cells.className : r.cells.homeroomClass) ?? '';
    const email = kind === 'TEACHER' ? (r.cells.email ?? '').trim().toLowerCase() : '';
    const departmentText = (r.cells.department ?? '').trim();
    const phone = (r.cells.phone ?? '').trim();
    const upper = code.toUpperCase();

    if (r.formula) messages.push('Ô chứa công thức, hãy nhập giá trị thật');

    // Mã
    if (!code) messages.push(kind === 'STUDENT' ? 'Thiếu mã học sinh' : 'Thiếu mã giáo viên');
    else if (!CODE_RE.test(code)) messages.push('Mã chỉ gồm chữ, số, dấu . _ - (3–20 ký tự)');
    else {
      const first = seenCodes.get(upper);
      if (first) messages.push(`Trùng mã với dòng ${first} trong file`);
      else seenCodes.set(upper, r.row);
      const own = kind === 'STUDENT' ? ctx.existingStudentCodes : ctx.existingTeacherCodes;
      const other = kind === 'STUDENT' ? ctx.existingTeacherCodes : ctx.existingStudentCodes;
      if (other.has(upper)) messages.push('Mã đang được dùng cho loại tài khoản khác');
      else if (own.has(upper)) skip = true;
    }

    // Họ tên
    if (!fullName) messages.push('Thiếu họ tên');
    else if (fullName.length > 120) messages.push('Họ tên quá dài (tối đa 120 ký tự)');
    else if (BAD_NAME_START.test(fullName) || BAD_NAME_CHARS.test(fullName)) messages.push('Họ tên có ký tự không hợp lệ');

    // Lớp
    const cls = classText ? ctx.classes.get(classKey(classText)) : undefined;
    if (kind === 'STUDENT') {
      if (!classText) messages.push('Thiếu lớp');
      else if (!cls) messages.push(`Lớp "${classText}" không tồn tại trong năm học hiện hành`);
    } else if (classText) {
      if (!cls) messages.push(`Lớp chủ nhiệm "${classText}" không tồn tại trong năm học hiện hành`);
      else if (cls.homeroomTeacherId !== null && !skip) messages.push(`Lớp ${cls.name} đã có giáo viên chủ nhiệm`);
      else {
        const first = claimedHomerooms.get(cls.id);
        if (first) messages.push(`Lớp ${cls.name} đã được gán chủ nhiệm ở dòng ${first}`);
        else claimedHomerooms.set(cls.id, r.row);
      }
    }

    // Email, tổ, điện thoại (giáo viên)
    let departmentId: bigint | null = null;
    if (kind === 'TEACHER') {
      if (!email) messages.push('Thiếu email');
      else if (email.length > 150 || !EMAIL_RE.test(email)) messages.push('Email không hợp lệ');
      else {
        const first = seenEmails.get(email);
        if (first) messages.push(`Trùng email với dòng ${first} trong file`);
        else seenEmails.set(email, r.row);
        if (ctx.existingEmails.has(email) && !skip) messages.push('Email đã được dùng cho tài khoản khác');
      }
      const dep = ctx.departments.get(normalizeHeader(departmentText));
      if (!departmentText) messages.push('Thiếu tổ chuyên môn');
      else if (!dep) messages.push(`Tổ chuyên môn "${departmentText}" không tồn tại`);
      else departmentId = dep.id;
      if (phone && !PHONE_RE.test(phone)) messages.push('Số điện thoại không hợp lệ');
    }

    // Ngày sinh, giới tính (học sinh)
    let birthDate: Date | null = null;
    let gender: Gender | null = null;
    if (kind === 'STUDENT') {
      const b = parseBirthDate((r.cells.birthDate ?? '').trim());
      if (b === 'invalid') messages.push('Ngày sinh không hợp lệ (dùng YYYY-MM-DD hoặc DD/MM/YYYY)');
      else birthDate = b;
      const g = parseGender((r.cells.gender ?? '').trim());
      if (g === 'invalid') messages.push('Giới tính phải là Nam hoặc Nữ');
      else gender = g;
    }

    const status = messages.length > 0 ? 'error' : skip ? 'skip' : 'ok';
    const dto: RosterPreviewRow = {
      row: r.row,
      status,
      messages: status === 'skip' ? ['Đã có trong hệ thống, bỏ qua'] : messages,
      code: upper || code,
      fullName,
      className: cls?.name ?? (classText || null),
      email: email || null,
      department: departmentText || null,
    };
    if (status !== 'ok') return { dto };
    return {
      dto,
      data: {
        code: upper,
        fullName,
        classId: kind === 'STUDENT' ? (cls?.id ?? null) : null,
        className: cls?.name ?? null,
        email: email || null,
        departmentId,
        phone: phone || null,
        birthDate,
        gender,
        homeroomClassId: kind === 'TEACHER' ? (cls?.id ?? null) : null,
      },
    };
  });
}
