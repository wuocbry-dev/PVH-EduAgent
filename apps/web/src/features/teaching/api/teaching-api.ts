import type {
  ClassDto,
  CopyAssignmentsResultDto,
  MyTeachingDto,
  SchoolYearDto,
  SemesterDto,
  SubjectDto,
  PeriodQuotasDto,
  TeachingAssignmentDto,
  TeachingSummaryDto,
} from "@pvh/shared";
import { api, apiFetch, parseResponse } from "@/shared/lib/api-client";

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export interface Scope {
  schoolYearId: string;
  semesterId: string; // '' = cả năm học
}

const query = (scope: Scope) => {
  const p = new URLSearchParams();
  if (scope.schoolYearId) p.set("schoolYearId", scope.schoolYearId);
  if (scope.semesterId) p.set("semesterId", scope.semesterId);
  return p.toString();
};

export const getSummary = (scope: Scope) => api<TeachingSummaryDto>(`/teaching/summary?${query(scope)}`);
export const getAssignments = (scope: Scope) => api<TeachingAssignmentDto[]>(`/teaching/assignments?${query({ ...scope, semesterId: "" })}`);
export const getQuotas = (schoolYearId: string) =>
  api<PeriodQuotasDto>(`/teaching/quotas${schoolYearId ? `?schoolYearId=${schoolYearId}` : ""}`);

export const createAssignment = (body: {
  classId: string;
  subjectId: string;
  teacherId: string;
  periodsPerWeek: number;
  semesterId?: string | null;
  confirmCrossDepartment?: boolean;
}) => api<TeachingAssignmentDto>("/teaching/assignments", json("POST", body));

export const updateAssignment = (
  id: string,
  body: { teacherId?: string; periodsPerWeek?: number; confirmCrossDepartment?: boolean },
) => api<TeachingAssignmentDto>(`/teaching/assignments/${id}`, json("PATCH", body));

export const deleteAssignment = (id: string) => api<void>(`/teaching/assignments/${id}`, json("DELETE"));

export const setGradeQuota = (body: { schoolYearId: string; gradeLevel: number; subjectId: string; periodsPerWeek: number | null }) =>
  api<PeriodQuotasDto>("/teaching/quotas", json("PUT", body));

export const setClassQuota = (body: { classId: string; subjectId: string; periodsPerWeek: number | null }) =>
  api<PeriodQuotasDto>("/teaching/quotas/class", json("PUT", body));

export const setTeacherQuota = (userId: string, weeklyQuota: number | null) =>
  api<void>(`/teaching/teachers/${userId}/quota`, json("PUT", { weeklyQuota }));

export const copyAssignments = (body: { from: { schoolYearId: string; semesterId: string | null }; to: { schoolYearId: string; semesterId: string | null } }) =>
  api<CopyAssignmentsResultDto>("/teaching/assignments/copy", json("POST", body));

export const getMyTeaching = () => api<MyTeachingDto>("/teaching/mine");

// Danh mục dùng chung từ phần học vụ (cần quyền academic:manage; BGH và ADMIN đều có).
export const listYears = () => api<SchoolYearDto[]>("/academic/school-years");
export const listSemesterOptions = (schoolYearId: string) => api<SemesterDto[]>(`/academic/semesters?schoolYearId=${schoolYearId}`);
export const listClassOptions = (schoolYearId: string) => api<ClassDto[]>(`/academic/classes?schoolYearId=${schoolYearId}`);
export const listSubjectOptions = () => api<SubjectDto[]>("/academic/subjects");

// Tải file Excel về máy (cần cookie đăng nhập nên không dùng liên kết thường).
export async function downloadSummary(scope: Scope): Promise<void> {
  const res = await apiFetch(`/teaching/summary/export?${query(scope)}`);
  if (!res.ok) await parseResponse<never>(res);
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = "phan-cong-giang-day.xlsx";
  link.click();
  URL.revokeObjectURL(url);
}
