import {
  MEDIA_IMAGE_MAX_BYTES,
  MEDIA_IMAGE_MIME_TYPES,
  XLSX_MIME,
  type MediaDto,
  type MediaPresignDto,
  type QuizAttemptDto,
  type QuizAudience,
  type QuizAvailableDto,
  type QuizEditDto,
  type QuizFormOptionsDto,
  type QuizImportPreviewDto,
  type QuizQuestionInput,
  type QuizStatsDto,
  type QuizStatus,
  type QuizSummaryDto,
} from "@pvh/shared";
import { api, apiFetch, parseResponse } from "@/shared/lib/api-client";
import { putUpload } from "@/shared/lib/put-upload";

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

export interface QuizInput {
  title: string;
  description: string | null;
  subjectId: string;
  gradeLevel: number;
  audience: QuizAudience;
  gradeLevels: number[];
  classIds: string[];
  durationMinutes: number | null;
  maxAttempts: number | null;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showAnswers: boolean;
  libraryItemId: string | null;
}

// ── Học sinh ──
export const listAvailable = (libraryItemId?: string) =>
  api<QuizAvailableDto[]>(libraryItemId ? `/quizzes/available?libraryItemId=${libraryItemId}` : "/quizzes/available");
export const startAttempt = (quizId: string) => api<QuizAttemptDto>(`/quizzes/${quizId}/attempts`, { method: "POST" });
export const getAttempt = (attemptId: string) => api<QuizAttemptDto>(`/quizzes/attempts/${attemptId}`);
export const saveAnswer = (attemptId: string, questionId: string, optionIds: string[]) =>
  api<void>(`/quizzes/attempts/${attemptId}/answers`, json("PUT", { questionId, optionIds }));
export const submitAttempt = (attemptId: string, answers: { questionId: string; optionIds: string[] }[]) =>
  api<QuizAttemptDto>(`/quizzes/attempts/${attemptId}/submit`, json("POST", { answers }));

// ── Người soạn, người quản lý ──
export const getFormOptions = () => api<QuizFormOptionsDto>("/quizzes/form-options");
export const listManaged = (scope: "mine" | "all") => api<QuizSummaryDto[]>(`/quizzes/manage?scope=${scope}`);
export const getQuiz = (id: string) => api<QuizEditDto>(`/quizzes/${id}`);
export const createQuiz = (input: QuizInput) => api<QuizEditDto>("/quizzes", json("POST", input));
export const updateQuiz = (id: string, input: QuizInput) => api<QuizEditDto>(`/quizzes/${id}`, json("PATCH", input));
export const saveQuestions = (id: string, questions: QuizQuestionInput[]) => api<QuizEditDto>(`/quizzes/${id}/questions`, json("PUT", { questions }));
export const setQuizStatus = (id: string, status: QuizStatus) => api<QuizEditDto>(`/quizzes/${id}/status`, json("POST", { status }));
export const deleteQuiz = (id: string) => api<void>(`/quizzes/${id}`, { method: "DELETE" });
export const getQuizStats = (id: string) => api<QuizStatsDto>(`/quizzes/${id}/stats`);

export const previewImport = (id: string, file: File) =>
  api<QuizImportPreviewDto>(`/quizzes/${id}/import/preview`, { method: "POST", body: file, headers: { "Content-Type": XLSX_MIME } });
export const confirmImport = (previewId: string) => api<QuizEditDto>(`/quizzes/import/${previewId}/confirm`, { method: "POST" });

// Tải file mẫu (cần cookie đăng nhập nên không dùng liên kết thường).
export async function downloadTemplate(): Promise<void> {
  const res = await apiFetch("/quizzes/import-template");
  if (!res.ok) await parseResponse<never>(res);
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = "mau-cau-hoi-trac-nghiem.xlsx";
  link.click();
  URL.revokeObjectURL(url);
}

// Ảnh trong câu hỏi: tải lên kho media công khai (3 bước như bước 11), trả MediaDto để chèn <img>.
export async function uploadQuestionImage(file: File): Promise<MediaDto> {
  if (!(MEDIA_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) throw new Error("Ảnh phải là JPEG, PNG, WebP hoặc GIF");
  if (file.size > MEDIA_IMAGE_MAX_BYTES) throw new Error("Ảnh quá lớn (tối đa 10 MB)");
  const presign = await api<MediaPresignDto>("/quizzes/images", json("POST", { mimeType: file.type, size: file.size }));
  await putUpload(file, presign);
  return api<MediaDto>(`/quizzes/images/${presign.id}/complete`, { method: "POST" });
}
