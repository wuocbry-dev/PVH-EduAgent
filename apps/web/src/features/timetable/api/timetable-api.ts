import type {
  FixedPeriodDto,
  FixedPeriodKind,
  PlacementOptionDto,
  TeacherUnavailabilityDto,
  TimetableFrameDto,
  TimetableSlotDto,
  TimetableStatsDto,
  TimetableVersionDto,
  WeekViewDto,
} from "@pvh/shared";
import { api, apiFetch, parseResponse } from "@/shared/lib/api-client";

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

// ── Khung tiết, tiết cố định
export const getFrame = () => api<TimetableFrameDto>("/timetable/frame");
export const saveFrame = (frame: TimetableFrameDto) => api<TimetableFrameDto>("/timetable/frame", json("PUT", frame));
export const listFixed = () => api<FixedPeriodDto[]>("/timetable/fixed");
export const createFixed = (body: { name: string; kind: FixedPeriodKind; day: number; period: number; gradeLevel: number | null }) =>
  api<FixedPeriodDto>("/timetable/fixed", json("POST", body));
export const deleteFixed = (id: string) => api<void>(`/timetable/fixed/${id}`, json("DELETE"));

// ── Phiên bản
export const listVersions = () => api<TimetableVersionDto[]>("/timetable/versions");
export const createVersion = (body: { semesterId: string; name: string; copyFromId?: string }) =>
  api<TimetableVersionDto>("/timetable/versions", json("POST", body));
export const deleteVersion = (id: string) => api<void>(`/timetable/versions/${id}`, json("DELETE"));
export const publishVersion = (id: string, effectiveDate: string) =>
  api<TimetableVersionDto>(`/timetable/versions/${id}/publish`, json("POST", { effectiveDate }));

// ── Tiết đã xếp
export const getSlots = (versionId: string, filter: { classId?: string; teacherId?: string; roomId?: string } = {}) => {
  const p = new URLSearchParams(Object.entries(filter).filter(([, v]) => v) as [string, string][]);
  return api<TimetableSlotDto[]>(`/timetable/versions/${versionId}/slots?${p}`);
};
export const placeSlot = (
  versionId: string,
  body: { assignmentId: string; day: number; period: number; roomId?: string | null; confirmUnavailable?: boolean },
) => api<TimetableSlotDto>(`/timetable/versions/${versionId}/slots`, json("POST", body));
export const moveSlot = (id: string, body: { day: number; period: number; roomId?: string | null; confirmUnavailable?: boolean }) =>
  api<TimetableSlotDto>(`/timetable/slots/${id}`, json("PATCH", body));
export const deleteSlot = (id: string) => api<void>(`/timetable/slots/${id}`, json("DELETE"));
export const getOptions = (versionId: string, assignmentId: string, roomId?: string) =>
  api<PlacementOptionDto[]>(`/timetable/versions/${versionId}/options?assignmentId=${assignmentId}${roomId ? `&roomId=${roomId}` : ""}`);
export const getStats = (versionId: string) => api<TimetableStatsDto>(`/timetable/versions/${versionId}/stats`);

// ── Tiết bận
export const getMyUnavailability = () => api<TeacherUnavailabilityDto[]>("/timetable/unavailability/mine");
export const saveMyUnavailability = (slots: { day: number; period: number; note?: string }[]) =>
  api<TeacherUnavailabilityDto[]>("/timetable/unavailability/mine", json("PUT", { slots }));
export const listUnavailability = () => api<TeacherUnavailabilityDto[]>("/timetable/unavailability");

// ── Xem lịch theo tuần
const dateQuery = (date: string) => (date ? `?date=${date}` : "");
export const getMyWeek = (date: string) => api<WeekViewDto>(`/timetable/view/mine${dateQuery(date)}`);
export const getClassWeek = (classId: string, date: string) => api<WeekViewDto>(`/timetable/view/class/${classId}${dateQuery(date)}`);
export const getTeacherWeek = (teacherId: string, date: string) => api<WeekViewDto>(`/timetable/view/teacher/${teacherId}${dateQuery(date)}`);

// Tải Excel về máy (cần cookie đăng nhập nên không dùng liên kết thường).
export async function downloadExport(scope: "class" | "teacher" | "school", id?: string, versionId?: string): Promise<void> {
  const p = new URLSearchParams({ scope });
  if (id) p.set("id", id);
  if (versionId) p.set("versionId", versionId);
  const res = await apiFetch(`/timetable/export?${p}`);
  if (!res.ok) await parseResponse<never>(res);
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `thoi-khoa-bieu-${scope}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

// Danh mục từ phần học vụ/phân công (BGH và ADMIN đều đọc được).
import type { ClassDto, RoomDto, SemesterDto, TeacherOptionDto, TeachingAssignmentDto } from "@pvh/shared";
export const listSemesters = () => api<SemesterDto[]>("/academic/semesters");
export const listClasses = (schoolYearId?: string) => api<ClassDto[]>(`/academic/classes${schoolYearId ? `?schoolYearId=${schoolYearId}` : ""}`);
export const listRooms = () => api<RoomDto[]>("/academic/rooms");
export const listTeachers = () => api<TeacherOptionDto[]>("/academic/teachers");
export const listClassAssignments = (classId: string, schoolYearId: string) =>
  api<TeachingAssignmentDto[]>(`/teaching/assignments?classId=${classId}&schoolYearId=${schoolYearId}`);
