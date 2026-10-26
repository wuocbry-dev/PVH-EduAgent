import {
  XLSX_MIME,
  type AssessmentDto,
  type AssessmentType,
  type ClassSummaryDto,
  type GradebookDto,
  type ScoreAdjustmentDto,
  type ScoreAdjustmentStatus,
  type ScoreFormula,
  type ScoreFormulaDto,
  type ScoreLockDto,
  type ScoreStatsDto,
  type StudentReportDto,
  type ScoreContextDto,
  type ScoreEntryInput,
  type ScoreImportPreviewDto,
  type ScoreProgressDto,
  type ScoreSaveResultDto,
  type ScoreSheetDto,
} from "@pvh/shared";
import { api, apiFetch, parseResponse } from "@/shared/lib/api-client";

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

const qs = (params: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

const sheetPath = (assessmentId: string, classId: string) => `/scores/assessments/${assessmentId}/classes/${classId}`;

export const getScoreContext = () => api<ScoreContextDto>("/scores/context");

export const listAssessments = (q: { semesterId?: string; classId?: string; subjectId?: string; type?: AssessmentType }) =>
  api<AssessmentDto[]>(`/scores/assessments${qs(q)}`);

export const getProgress = (q: { semesterId?: string; type?: AssessmentType | ""; gradeLevel?: number | "" }) =>
  api<ScoreProgressDto>(`/scores/progress${qs({ semesterId: q.semesterId, type: q.type || undefined, gradeLevel: q.gradeLevel || undefined })}`);

export type CreateAssessmentBody =
  | { type: "THUONG_XUYEN"; semesterId: string; subjectId: string; classId: string; testDate: string; description?: string }
  | {
      type: "GIUA_KY" | "CUOI_KY";
      semesterId: string;
      subjectId: string;
      gradeLevel: number;
      classIds?: string[];
      testDate: string;
      description?: string;
      code?: string;
      entryDeadline?: string | null;
    };

export const createAssessment = (body: CreateAssessmentBody) => api<AssessmentDto>("/scores/assessments", json("POST", body));

export const updateAssessment = (id: string, body: { testDate?: string; description?: string | null; entryDeadline?: string | null }) =>
  api<AssessmentDto>(`/scores/assessments/${id}`, json("PATCH", body));

export const deleteAssessment = (id: string) => api<void>(`/scores/assessments/${id}`, json("DELETE"));

export const getSheet = ({ assessmentId, classId }: { assessmentId: string; classId: string }) =>
  api<ScoreSheetDto>(sheetPath(assessmentId, classId));

export const saveScores = (assessmentId: string, classId: string, entries: ScoreEntryInput[]) =>
  api<ScoreSaveResultDto>(sheetPath(assessmentId, classId), json("PUT", { entries }));

export const publishScores = (assessmentId: string, classId: string) =>
  api<ScoreSheetDto>(`${sheetPath(assessmentId, classId)}/publish`, json("POST"));

export const setExemption = (assessmentId: string, classId: string, studentId: string, body: { exempt: boolean; note?: string }) =>
  api<ScoreSheetDto>(`${sheetPath(assessmentId, classId)}/exemptions/${studentId}`, json("PUT", body));

// File .xlsx gửi thẳng làm nội dung request (không multipart), giống nhập danh sách (bước 14).
export const previewScoreImport = (assessmentId: string, classId: string, file: File) =>
  api<ScoreImportPreviewDto>(`${sheetPath(assessmentId, classId)}/import/preview`, {
    method: "POST",
    body: file,
    headers: { "Content-Type": XLSX_MIME },
  });

export const confirmScoreImport = (previewId: string) =>
  api<Omit<ScoreSaveResultDto, "unchanged"> & { unchanged: number; skipped: number }>(`/scores/import/${previewId}/confirm`, json("POST"));

// Tải file về máy (cần cookie đăng nhập nên không dùng liên kết thường).
async function download(path: string, filename: string): Promise<void> {
  const res = await apiFetch(path);
  if (!res.ok) await parseResponse<never>(res);
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export const downloadScoreTemplate = (assessmentId: string, classId: string, filename: string) =>
  download(`${sheetPath(assessmentId, classId)}/template`, filename);

// ───────────── Bước 19: xem điểm, thống kê, khoá sổ, điều chỉnh ─────────────

export type GradebookKey = { classId: string; subjectId: string; semesterId: string };

export const getMyScores = () => api<StudentReportDto>("/scores/me");

export const getStudentReport = (studentId: string) => api<StudentReportDto>(`/scores/students/${studentId}/report`);

export const getGradebook = (key: GradebookKey) => api<GradebookDto>(`/scores/gradebook${qs(key)}`);

export const downloadGradebook = (key: GradebookKey) =>
  download(`/scores/gradebook/export${qs(key)}`, `so-diem-${key.classId}-${key.subjectId}.xlsx`);

export const getClassSummary = ({ classId, semesterId }: { classId: string; semesterId: string }) =>
  api<ClassSummaryDto>(`/scores/classes/${classId}/summary${qs({ semesterId })}`);

export const downloadClassSummary = (classId: string, semesterId: string) =>
  download(`/scores/classes/${classId}/summary/export${qs({ semesterId })}`, `bang-diem-lop-${classId}.xlsx`);

export const getScoreStats = (q: { semesterId?: string; gradeLevel?: number | "" }) =>
  api<ScoreStatsDto>(`/scores/stats${qs({ semesterId: q.semesterId, gradeLevel: q.gradeLevel || undefined })}`);

export const getScoreFormula = () => api<ScoreFormulaDto>("/scores/formula");

export const setScoreFormula = (formula: ScoreFormula) => api<ScoreFormulaDto>("/scores/formula", json("PUT", formula));

export const getScoreLocks = () => api<ScoreLockDto[]>("/scores/locks");

export const setScoreDeadline = (body: { semesterId: string; type: AssessmentType; deadline: string | null }) =>
  api<ScoreLockDto[]>("/scores/deadlines", json("PUT", body));

export const setScoreLock = (semesterId: string, body: { locked: boolean; reason?: string }) =>
  api<ScoreLockDto[]>(`/scores/locks/${semesterId}`, json("PUT", body));

export const listAdjustments = (status?: ScoreAdjustmentStatus | "") =>
  api<ScoreAdjustmentDto[]>(`/scores/adjustments${qs({ status: status || undefined })}`);

export const createAdjustment = (body: {
  assessmentId: string;
  classId: string;
  studentId: string;
  value: string | null;
  status?: "GRADED" | "ABSENT";
  note?: string | null;
  reason: string;
}) => api<ScoreAdjustmentDto>("/scores/adjustments", json("POST", body));

export const approveAdjustment = (id: string, note?: string) =>
  api<ScoreAdjustmentDto>(`/scores/adjustments/${id}/approve`, json("POST", { note }));

export const rejectAdjustment = (id: string, note: string) =>
  api<ScoreAdjustmentDto>(`/scores/adjustments/${id}/reject`, json("POST", { note }));

export const cancelAdjustment = (id: string) => api<ScoreAdjustmentDto>(`/scores/adjustments/${id}/cancel`, json("POST"));
