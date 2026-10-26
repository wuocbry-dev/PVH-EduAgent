import {
  XLSX_MIME,
  type AssessmentDto,
  type AssessmentType,
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

// Tải file mẫu về máy (cần cookie đăng nhập nên không dùng liên kết thường).
export async function downloadScoreTemplate(assessmentId: string, classId: string, filename: string): Promise<void> {
  const res = await apiFetch(`${sheetPath(assessmentId, classId)}/template`);
  if (!res.ok) await parseResponse<never>(res);
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
