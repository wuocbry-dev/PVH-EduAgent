// Trắc nghiệm ôn tập (bước 22): giáo viên soạn, học sinh làm, chấm ở server. Kết quả KHÔNG tính vào điểm học tập.

export const QUIZ_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type QuizStatus = (typeof QUIZ_STATUSES)[number];
export const QUIZ_STATUS_NAMES: Record<QuizStatus, string> = { DRAFT: 'Nháp', PUBLISHED: 'Đang mở', ARCHIVED: 'Đã ẩn' };

// Đối tượng làm bài: toàn trường, một số khối, một số lớp (giáo viên chỉ chọn khối/lớp mình dạy môn đó).
export const QUIZ_AUDIENCES = ['ALL', 'GRADE', 'CLASS'] as const;
export type QuizAudience = (typeof QUIZ_AUDIENCES)[number];

export const QUIZ_RESULT_NOTE = 'Kết quả ôn tập, không tính vào điểm học tập.';

export const QUIZ_TITLE_MAX = 200;
export const QUIZ_QUESTION_MAX = 5000;
export const QUIZ_OPTION_MAX = 1000;
export const QUIZ_MAX_QUESTIONS = 200;
export const QUIZ_MIN_OPTIONS = 2;
export const QUIZ_MAX_OPTIONS = 6;
export const QUIZ_OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
// Nộp trễ hơn hạn quá ngần này giây (độ trễ mạng) thì không nhận câu trả lời mới, chỉ chấm phần đã lưu.
export const QUIZ_SUBMIT_GRACE_SEC = 15;
// Số lần bắt đầu làm bài mỗi 10 phút, số lần lưu/nộp mỗi phút (mỗi học sinh).
export const QUIZ_STARTS_PER_10_MIN = 20;
export const QUIZ_WRITES_PER_MINUTE = 120;

export interface QuizOptionInput {
  content: string;
  correct: boolean;
}
export interface QuizQuestionInput {
  content: string; // HTML (đã làm sạch ở server; ảnh chỉ từ kho media của hệ thống)
  explanation: string | null;
  options: QuizOptionInput[];
}

export interface QuizSummaryDto {
  id: string;
  title: string;
  description: string | null;
  subjectId: string;
  subjectName: string;
  gradeLevel: number;
  audience: QuizAudience;
  audienceLabel: string;
  durationMinutes: number | null;
  maxAttempts: number | null;
  questionCount: number;
  status: QuizStatus;
  libraryItemId: string | null;
  libraryItemTitle: string | null;
  createdByName: string;
  updatedAt: string;
}

// Bản đầy đủ cho người soạn (có đáp án đúng).
export interface QuizEditDto extends QuizSummaryDto {
  gradeLevels: number[];
  classIds: string[];
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showAnswers: boolean;
  attemptCount: number;
  questions: (QuizQuestionInput & { id: string; options: (QuizOptionInput & { id: string })[] })[];
}

export interface QuizFormOptionsDto {
  canManage: boolean;
  // Môn được soạn (giáo viên: môn mình dạy năm học hiện hành), kèm khối/lớp được giao cho môn đó.
  subjects: { id: string; name: string; grades: number[]; classes: { id: string; name: string; gradeLevel: number }[] }[];
  libraryItems: { id: string; title: string }[];
}

// Học sinh: quiz được làm, kèm các lần đã làm.
export interface QuizAvailableDto extends QuizSummaryDto {
  attempts: { id: string; startedAt: string; submittedAt: string | null; score: number | null }[];
  inProgressId: string | null;
  attemptsLeft: number | null; // null = không giới hạn
}

// Đề khi đang làm: KHÔNG có đáp án đúng.
export interface QuizAttemptQuestionDto {
  id: string;
  content: string;
  multiple: boolean; // có nhiều đáp án đúng (để hiện ô chọn nhiều) – không nói đáp án nào
  options: { id: string; content: string }[];
  selected: string[];
}

export interface QuizResultQuestionDto {
  id: string;
  content: string;
  multiple: boolean;
  options: { id: string; content: string; correct?: boolean }[]; // `correct` chỉ có khi quiz cho xem đáp án
  selected: string[];
  isCorrect: boolean;
  explanation?: string | null;
}

export interface QuizAttemptDto {
  id: string;
  quizId: string;
  quizTitle: string;
  startedAt: string;
  deadline: string | null;
  serverNow: string; // để đồng hồ đếm ngược trên máy học sinh khớp giờ server
  submittedAt: string | null;
  autoSubmitted: boolean;
  // Đang làm:
  questions?: QuizAttemptQuestionDto[];
  // Đã nộp:
  score?: number;
  correctCount?: number;
  totalCount?: number;
  showAnswers?: boolean;
  results?: QuizResultQuestionDto[];
}

export interface QuizStatsDto {
  attempts: number; // số lần đã nộp
  students: number;
  average: number | null;
  distribution: number[]; // số lần theo khoảng điểm [0,2) [2,4) [4,6) [6,8) [8,10]
  questions: { id: string; position: number; content: string; answered: number; wrong: number; wrongRate: number }[]; // sắp xếp sai nhiều nhất trước
}

export interface QuizImportRowDto {
  row: number;
  status: 'OK' | 'ERROR';
  message: string | null;
  question: string;
  optionCount: number;
  correct: string; // vd "A, C"
}

export interface QuizImportPreviewDto {
  previewId: string;
  expiresAt: string;
  rows: QuizImportRowDto[];
  okCount: number;
  errorCount: number;
}

export const QUIZ_IMPORT_MAX_ROWS = 200;

// Chấm một câu: đúng khi chọn ĐỦ các đáp án đúng và KHÔNG chọn đáp án sai (câu nhiều đáp án cũng đúng hết mới được điểm).
export function isAnswerCorrect(selected: readonly string[], correct: readonly string[]): boolean {
  const s = new Set(selected);
  return s.size === correct.length && correct.every((c) => s.has(c));
}

// Điểm thang 10, làm tròn 2 chữ số.
export const quizScore = (correct: number, total: number): number => (total === 0 ? 0 : Math.round((correct / total) * 1000) / 100);

// "A, C" ↔ [0, 2]
export function parseCorrectLetters(text: string, optionCount: number): number[] | null {
  const letters = text.toUpperCase().split(/[\s,;/]+/).filter(Boolean);
  if (letters.length === 0) return null;
  const idx = letters.map((l) => (QUIZ_OPTION_LETTERS as readonly string[]).indexOf(l));
  if (idx.some((i) => i < 0 || i >= optionCount)) return null;
  return [...new Set(idx)].sort((a, b) => a - b);
}
