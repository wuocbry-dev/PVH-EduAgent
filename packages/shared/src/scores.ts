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
  deadlinePassed: boolean; // quá hạn có hiệu lực hoặc học kỳ đã khoá sổ
  effectiveDeadline: string | null; // hạn riêng của đợt, không có thì hạn chung theo học kỳ–loại (bước 19)
  semesterLocked: boolean;
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
  canReadAll: boolean; // BGH (score:read:all)
  homeroomClasses: { id: string; name: string }[]; // lớp chủ nhiệm của giáo viên trong năm hiện hành (bước 19)
}

export interface ScoreProgressClassDto extends AssessmentClassDto {
  teacherName: string | null;
}

export interface ScoreProgressDto {
  assessments: (Omit<AssessmentDto, 'classes'> & { classes: ScoreProgressClassDto[] })[];
  totals: { assessments: number; classes: number; complete: number; published: number };
}

// ───────────────────────────── Bước 19: điểm trung bình, xem điểm, khoá sổ, điều chỉnh ─────────────────────────────

// Công thức điểm trung bình môn. Mặc định theo Thông tư 22/2021/TT-BGDĐT (THCS, THPT):
//   ĐTB môn học kỳ = (tổng điểm thường xuyên + 2 × giữa kỳ + 3 × cuối kỳ) / (số điểm thường xuyên + 5)
//   số điểm thường xuyên tối thiểu: 2 (môn 35 tiết/năm ≈ 1 tiết/tuần), 3 (70 tiết/năm ≈ 2 tiết/tuần), 4 (trên 70 tiết/năm)
//   ĐTB môn cả năm = (ĐTB học kỳ I + 2 × ĐTB học kỳ II) / 3, làm tròn 1 chữ số thập phân.
// Đây là MẶC ĐỊNH và cấu hình được (khoá `scores.formula`); nhà trường cần đối chiếu với văn bản hiện hành.
export interface ScoreFormula {
  weights: Record<AssessmentType, number>; // hệ số theo loại đợt
  regularMin: { maxPeriodsPerWeek: number; count: number }[]; // số cột thường xuyên tối thiểu theo số tiết/tuần (tăng dần)
  regularMinOther: number; // khi số tiết/tuần lớn hơn mọi mốc ở trên (hoặc chưa rõ số tiết)
  yearWeights: [number, number]; // hệ số học kỳ I, học kỳ II khi tính cả năm
  decimals: number; // số chữ số thập phân khi làm tròn (1 hoặc 2)
}

export const DEFAULT_SCORE_FORMULA: ScoreFormula = {
  weights: { THUONG_XUYEN: 1, GIUA_KY: 2, CUOI_KY: 3 },
  regularMin: [
    { maxPeriodsPerWeek: 1, count: 2 },
    { maxPeriodsPerWeek: 2, count: 3 },
  ],
  regularMinOther: 4,
  yearWeights: [1, 2],
  decimals: 1,
};

export const SCORE_FORMULA_NOTE =
  'Điểm trung bình tính theo công thức mặc định của Thông tư 22/2021/TT-BGDĐT (thường xuyên hệ số 1, giữa kỳ hệ số 2, cuối kỳ hệ số 3; cả năm = (HK I + 2 × HK II) / 3). Nhà trường cần đối chiếu với văn bản hiện hành; Ban giám hiệu chỉnh được công thức.';

export interface ScoreAverageEntry {
  type: AssessmentType;
  value: number | null;
  status: ScoreStatus;
}

// value: điểm trung bình (null = chưa có điểm nào để tính); provisional: còn thiếu cột bắt buộc → "tạm tính".
export interface ScoreAverageDto {
  value: number | null;
  provisional: boolean;
  missing: string[];
}

export function requiredRegularCount(formula: ScoreFormula, periodsPerWeek: number | null): number {
  if (periodsPerWeek === null) return formula.regularMinOther;
  const step = [...formula.regularMin]
    .sort((a, b) => a.maxPeriodsPerWeek - b.maxPeriodsPerWeek)
    .find((s) => periodsPerWeek <= s.maxPeriodsPerWeek);
  return step ? step.count : formula.regularMinOther;
}

// Làm tròn nửa lên (8,25 → 8,3), tránh lỗi số thực (8,249999…).
export function roundScore(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f + 1e-9) / f;
}

const TYPE_WORD: Record<AssessmentType, string> = { THUONG_XUYEN: 'thường xuyên', GIUA_KY: 'giữa kỳ', CUOI_KY: 'cuối kỳ' };

// ĐTB môn của một học sinh trong một học kỳ. GRADED: tính; ABSENT (vắng có lý do): chưa tính, chờ kiểm tra bù;
// EXEMPT (BGH miễn): bỏ khỏi cả tử và mẫu, không tính là thiếu.
export function subjectAverage(
  entries: ScoreAverageEntry[],
  periodsPerWeek: number | null,
  formula: ScoreFormula = DEFAULT_SCORE_FORMULA,
): ScoreAverageDto {
  const missing: string[] = [];
  const count = (type: AssessmentType, status: ScoreStatus) => entries.filter((e) => e.type === type && e.status === status).length;

  for (const type of ['GIUA_KY', 'CUOI_KY'] as const) {
    if (count(type, 'GRADED') > 0 || count(type, 'EXEMPT') > 0) continue;
    missing.push(count(type, 'ABSENT') > 0 ? `Vắng kiểm tra ${TYPE_WORD[type]} (chờ kiểm tra bù)` : `Chưa có điểm ${TYPE_WORD[type]}`);
  }
  const required = Math.max(0, requiredRegularCount(formula, periodsPerWeek) - count('THUONG_XUYEN', 'EXEMPT'));
  const regular = count('THUONG_XUYEN', 'GRADED');
  if (regular < required) missing.push(`Thiếu ${required - regular} điểm thường xuyên (cần tối thiểu ${required})`);

  // Cộng bằng số nguyên (phần trăm điểm) để không lệch do số thực.
  let num = 0;
  let den = 0;
  for (const e of entries) {
    if (e.status !== 'GRADED' || e.value === null) continue;
    const w = formula.weights[e.type];
    num += Math.round(e.value * 100) * w;
    den += w;
  }
  return { value: den === 0 ? null : roundScore(num / den / 100, formula.decimals), provisional: missing.length > 0, missing };
}

// ĐTB môn cả năm từ hai ĐTB học kỳ (đã làm tròn). Thiếu một học kỳ thì chưa tính.
export function yearAverage(
  hk1: ScoreAverageDto | null,
  hk2: ScoreAverageDto | null,
  formula: ScoreFormula = DEFAULT_SCORE_FORMULA,
): ScoreAverageDto {
  if (hk1?.value == null || hk2?.value == null) {
    const missing: string[] = [];
    if (hk1?.value == null) missing.push('Chưa có điểm trung bình học kỳ I');
    if (hk2?.value == null) missing.push('Chưa có điểm trung bình học kỳ II');
    return { value: null, provisional: true, missing };
  }
  const [w1, w2] = formula.yearWeights;
  const provisional = hk1.provisional || hk2.provisional;
  return {
    value: roundScore((w1 * hk1.value + w2 * hk2.value) / (w1 + w2), formula.decimals),
    provisional,
    missing: provisional ? ['Điểm trung bình học kỳ còn tạm tính'] : [],
  };
}

export interface ScoreFormulaDto extends ScoreFormula {
  isDefault: boolean;
  note: string;
}

// ── Sổ điểm một lớp–môn–học kỳ ──

// Ai đang xem: giáo viên bộ môn được phân công, giáo viên chủ nhiệm (chỉ điểm đã công bố), Ban giám hiệu.
export type ScoreView = 'TEACHER' | 'HOMEROOM' | 'PRINCIPAL';

export interface GradebookColumnDto {
  assessmentId: string;
  code: string;
  type: AssessmentType;
  testDate: string;
  status: AssessmentClassStatus;
  deadline: string | null; // hạn có hiệu lực: hạn riêng của đợt, không có thì hạn chung theo học kỳ–loại đợt
  locked: boolean; // quá hạn hoặc học kỳ đã khoá sổ: chỉ sửa qua đề nghị điều chỉnh
}

export interface GradebookCellDto {
  value: string | null;
  status: ScoreStatus | null;
  note: string | null;
  pendingAdjustmentId: string | null;
}

export interface GradebookRowDto {
  studentId: string;
  studentCode: string;
  fullName: string;
  cells: GradebookCellDto[]; // cùng thứ tự với columns
  average: ScoreAverageDto;
}

export interface GradebookDto {
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  semesterId: string;
  semesterName: string;
  schoolYearName: string;
  view: ScoreView;
  publishedOnly: boolean;
  periodsPerWeek: number | null;
  requiredRegular: number;
  semesterLocked: boolean;
  canRequestAdjustment: boolean;
  columns: GradebookColumnDto[];
  rows: GradebookRowDto[];
  formulaNote: string;
}

// ── Bảng điểm tổng hợp một lớp (mọi môn tính điểm) ──

export interface ClassSummaryDto {
  classId: string;
  className: string;
  schoolYearName: string;
  semesterId: string | null; // null = cả năm
  periodName: string;
  view: ScoreView;
  publishedOnly: boolean;
  subjects: { id: string; code: string; name: string }[];
  rows: { studentId: string; studentCode: string; fullName: string; averages: (ScoreAverageDto | null)[] }[];
  formulaNote: string;
}

// ── Kết quả học tập của một học sinh trong năm học hiện hành ──

export interface StudentScoreEntryDto {
  assessmentId: string;
  code: string;
  type: AssessmentType;
  testDate: string;
  value: string | null;
  status: ScoreStatus;
  note: string | null;
  published: boolean;
}

export interface StudentSubjectReportDto {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  gradingType: 'SCORE' | 'COMMENT';
  entries: StudentScoreEntryDto[];
  average: ScoreAverageDto | null; // null với môn đánh giá bằng nhận xét
}

export interface StudentReportDto {
  studentId: string;
  studentCode: string;
  fullName: string;
  className: string | null;
  schoolYearName: string | null;
  publishedOnly: boolean;
  semesters: { semesterId: string; semesterName: string; subjects: StudentSubjectReportDto[] }[];
  year: { subjectId: string; subjectName: string; average: ScoreAverageDto }[];
  formulaNote: string;
}

// ── Thống kê cho BGH: chỉ dùng điểm đã công bố ──

// Phổ điểm theo ĐTB môn học kỳ: [0; 3,5), [3,5; 5), [5; 6,5), [6,5; 8), [8; 10].
export const SCORE_BUCKETS = [
  { label: 'Dưới 3,5', min: 0 },
  { label: '3,5 – dưới 5', min: 3.5 },
  { label: '5 – dưới 6,5', min: 5 },
  { label: '6,5 – dưới 8', min: 6.5 },
  { label: 'Từ 8 trở lên', min: 8 },
] as const;

export function bucketOf(value: number): number {
  let index = 0;
  SCORE_BUCKETS.forEach((b, i) => {
    if (value >= b.min) index = i;
  });
  return index;
}

export interface ScoreStatGroupDto {
  key: string;
  label: string;
  gradeLevel: number | null;
  classId: string | null;
  subjectId: string | null;
  averaged: number; // số học sinh có ĐTB
  provisional: number; // trong đó còn tạm tính
  mean: number | null;
  below5: number;
  buckets: number[]; // theo SCORE_BUCKETS
}

export interface ScoreStatsDto {
  semesterId: string;
  semesterName: string;
  schoolYearName: string;
  byClassSubject: ScoreStatGroupDto[];
  bySubject: ScoreStatGroupDto[]; // theo môn trong từng khối
  byClass: ScoreStatGroupDto[]; // gộp mọi môn của lớp
  byGrade: ScoreStatGroupDto[];
}

// ── Hạn nhập điểm và khoá sổ ──

export interface ScoreLockDto {
  semesterId: string;
  semesterName: string;
  locked: boolean;
  lockedAt: string | null;
  lockedByName: string | null;
  reason: string | null;
  deadlines: { type: AssessmentType; deadline: string | null }[];
}

// ── Đề nghị điều chỉnh điểm sau hạn ──

export const SCORE_ADJUSTMENT_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export type ScoreAdjustmentStatus = (typeof SCORE_ADJUSTMENT_STATUSES)[number];
export const SCORE_ADJUSTMENT_STATUS_NAMES: Record<ScoreAdjustmentStatus, string> = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
  CANCELLED: 'Đã huỷ',
};
export const SCORE_REASON_MAX = 300;

export interface ScoreAdjustmentDto {
  id: string;
  status: ScoreAdjustmentStatus;
  assessmentId: string;
  assessmentCode: string;
  assessmentType: AssessmentType;
  subjectName: string;
  semesterName: string;
  classId: string;
  className: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  oldValue: string | null;
  oldStatus: ScoreStatus | null;
  newValue: string | null;
  newStatus: ScoreStatus | null; // null = xoá điểm
  newNote: string | null;
  reason: string;
  requestedById: string;
  requestedByName: string;
  requestedAt: string;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
}
