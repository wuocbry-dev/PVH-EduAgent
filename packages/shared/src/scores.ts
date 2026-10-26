// Đợt thi/kiểm tra và nhập điểm (bước 18). Điểm là dữ liệu nhạy cảm: ADMIN, AI Agent, Telegram không đọc/ghi điểm.

export const ASSESSMENT_TYPES = ['THUONG_XUYEN', 'GIUA_KY', 'CUOI_KY'] as const;
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];
export const ASSESSMENT_TYPE_NAMES: Record<AssessmentType, string> = {
  THUONG_XUYEN: 'Thường xuyên',
  GIUA_KY: 'Giữa kỳ',
  CUOI_KY: 'Cuối kỳ',
};
// Tiền tố của mã đợt thi: KT-2026-HK1-TOAN-10A1-003, GK-2026-HK1-TOAN-K10.
export const ASSESSMENT_CODE_PREFIX: Record<AssessmentType, string> = { THUONG_XUYEN: 'KT', GIUA_KY: 'GK', CUOI_KY: 'CK' };
export const ASSESSMENT_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,39}$/;

export const ASSESSMENT_CLASS_STATUSES = ['DRAFT', 'PUBLISHED'] as const;
export type AssessmentClassStatus = (typeof ASSESSMENT_CLASS_STATUSES)[number];
export const ASSESSMENT_CLASS_STATUS_NAMES: Record<AssessmentClassStatus, string> = {
  DRAFT: 'Nháp',
  PUBLISHED: 'Đã công bố',
};

// GRADED: có điểm. ABSENT: vắng vì lý do ngoài ý muốn (ốm, tai nạn…), giáo viên ghi kèm lý do, không tính là 0.
// EXEMPT: miễn, chỉ Ban giám hiệu đặt. Hai trạng thái sau không có điểm.
export const SCORE_STATUSES = ['GRADED', 'ABSENT', 'EXEMPT'] as const;
export type ScoreStatus = (typeof SCORE_STATUSES)[number];
export const SCORE_STATUS_NAMES: Record<ScoreStatus, string> = { GRADED: 'Có điểm', ABSENT: 'Vắng (có lý do)', EXEMPT: 'Miễn' };

export const SCORE_NOTE_MAX = 200;
export const SCORE_IMPORT_MAX_ROWS = 200;

export type ParsedScore = { ok: true; value: number | null } | { ok: false; error: string };

// Chuẩn hoá điểm nhập vào: chấp nhận dấu phẩy hoặc chấm ("8,5" = 8.5), tối đa 2 chữ số thập phân, 0–10.
// Chuỗi rỗng = chưa có điểm (value null). Dùng chung cho lưới nhập (web) và API.
export function parseScore(input: string | number | null | undefined): ParsedScore {
  if (input === null || input === undefined) return { ok: true, value: null };
  const text = String(input).trim().replace(',', '.');
  if (text === '') return { ok: true, value: null };
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(text)) return { ok: false, error: 'Điểm phải là số từ 0 đến 10' };
  const value = Number(text);
  if (value < 0) return { ok: false, error: 'Điểm không được âm' };
  if (value > 10) return { ok: false, error: 'Điểm tối đa là 10' };
  if (/\.\d{3,}$/.test(text)) return { ok: false, error: 'Điểm có tối đa 2 chữ số thập phân' };
  return { ok: true, value: value + 0 }; // "-0" → 0
}

// Hiển thị điểm theo kiểu Việt Nam: 8.5 → "8,5".
export const formatScore = (value: string | number | null): string =>
  value === null || value === '' ? '' : String(Number(value)).replace('.', ',');

export interface AssessmentClassDto {
  classId: string;
  className: string;
  status: AssessmentClassStatus;
  publishedAt: string | null;
  students: number;
  entered: number; // số học sinh đã có điểm hoặc ghi chú vắng/miễn
}

export interface AssessmentDto {
  id: string;
  code: string;
  type: AssessmentType;
  semesterId: string;
  semesterName: string;
  schoolYearName: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  gradeLevel: number | null; // đợt chung của BGH cho một khối
  testDate: string; // YYYY-MM-DD
  description: string | null;
  entryDeadline: string | null; // ISO; quá hạn thì giáo viên không sửa được (điều chỉnh sau hạn: bước 19)
  createdById: string;
  createdByName: string;
  createdAt: string;
  classes: AssessmentClassDto[];
}

export interface ScoreRowDto {
  studentId: string;
  studentCode: string;
  fullName: string;
  value: string | null; // "8.5"
  status: ScoreStatus | null; // null = chưa nhập
  note: string | null;
  updatedAt: string | null;
}

export interface ScoreSheetDto {
  assessment: AssessmentDto;
  classId: string;
  className: string;
  status: AssessmentClassStatus;
  publishedAt: string | null;
  deadlinePassed: boolean;
  canEdit: boolean; // giáo viên được phân công, chưa quá hạn
  canExempt: boolean; // BGH (assessment:manage)
  canPublish: boolean;
  rows: ScoreRowDto[];
  counts: { students: number; graded: number; absent: number; exempt: number; missing: number };
}

export interface ScoreEntryInput {
  studentId: string;
  value: string | number | null; // "8,5" | 8.5 | null (xoá điểm)
  status?: 'GRADED' | 'ABSENT';
  note?: string | null;
}

export interface ScoreSaveResultDto {
  created: number;
  updated: number;
  deleted: number;
  unchanged: number;
  sheet: ScoreSheetDto;
}

export type ScoreImportRowStatus = 'ok' | 'skip' | 'error';
export interface ScoreImportRowDto {
  row: number;
  studentCode: string;
  fullName: string;
  value: string | null;
  note: string | null;
  status: ScoreImportRowStatus;
  message: string | null;
}

export interface ScoreImportPreviewDto {
  previewId: string;
  assessmentId: string;
  classId: string;
  total: number;
  ok: number;
  skipped: number;
  errors: number;
  rows: ScoreImportRowDto[];
  expiresAt: string;
}

// Ngữ cảnh trang nhập điểm: học kỳ của năm hiện hành và các lớp–môn giáo viên được phân công.
export interface ScoreTeachingPairDto {
  classId: string;
  className: string;
  gradeLevel: number;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  semesterId: string | null; // null = phân công cả năm
}

export interface ScoreContextDto {
  schoolYearId: string | null;
  schoolYearName: string | null;
  semesters: { id: string; number: number; name: string; startDate: string; endDate: string }[];
  currentSemesterId: string | null;
  pairs: ScoreTeachingPairDto[]; // rỗng với người không phải giáo viên
  subjects: { id: string; code: string; name: string }[]; // môn tính điểm (cho BGH tạo đợt chung)
  canManage: boolean;
}

export interface ScoreProgressClassDto extends AssessmentClassDto {
  teacherName: string | null;
}

export interface ScoreProgressDto {
  assessments: (Omit<AssessmentDto, 'classes'> & { classes: ScoreProgressClassDto[] })[];
  totals: { assessments: number; classes: number; complete: number; published: number };
}
