import type {
  MyAcademicDto,
  ClassDto,
  ClassStudentDto,
  DepartmentDto,
  GradeDto,
  GradingType,
  RoomDto,
  SchoolYearDto,
  SemesterDto,
  SubjectDto,
  TeacherOptionDto,
} from "@pvh/shared";
import { api } from "@/shared/lib/api-client";

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

// ── Năm học & học kỳ
export const listSchoolYears = () => api<SchoolYearDto[]>("/academic/school-years");
export const createSchoolYear = (body: { name: string; startDate: string; endDate: string; isCurrent?: boolean }) =>
  api<SchoolYearDto>("/academic/school-years", json("POST", body));
export const updateSchoolYear = (id: string, body: Partial<{ name: string; startDate: string; endDate: string; isCurrent: boolean }>) =>
  api<SchoolYearDto>(`/academic/school-years/${id}`, json("PATCH", body));
export const deleteSchoolYear = (id: string) => api<void>(`/academic/school-years/${id}`, json("DELETE"));

export const listSemesters = (schoolYearId: string) => api<SemesterDto[]>(`/academic/semesters?schoolYearId=${schoolYearId}`);
export const createSemester = (body: { schoolYearId: string; number: number; startDate: string; endDate: string }) =>
  api<SemesterDto>("/academic/semesters", json("POST", body));
export const updateSemester = (id: string, body: { startDate?: string; endDate?: string }) =>
  api<SemesterDto>(`/academic/semesters/${id}`, json("PATCH", body));
export const deleteSemester = (id: string) => api<void>(`/academic/semesters/${id}`, json("DELETE"));

// ── Lớp
export const listGrades = () => api<GradeDto[]>("/academic/grades");
export const listTeachers = () => api<TeacherOptionDto[]>("/academic/teachers");
export const listClasses = (schoolYearId?: string) =>
  api<ClassDto[]>(`/academic/classes${schoolYearId ? `?schoolYearId=${schoolYearId}` : ""}`);
export const createClass = (body: { name: string; gradeLevel: number; subjectCombo?: string | null; homeroomTeacherId?: string | null }) =>
  api<ClassDto>("/academic/classes", json("POST", body));
export const updateClass = (id: string, body: { name?: string; subjectCombo?: string | null; homeroomTeacherId?: string | null; sessions?: string }) =>
  api<ClassDto>(`/academic/classes/${id}`, json("PATCH", body));
export const deleteClass = (id: string) => api<void>(`/academic/classes/${id}`, json("DELETE"));
export const listClassStudents = (id: string) => api<ClassStudentDto[]>(`/academic/classes/${id}/students`);
// Thông tin học vụ của chính mình (dùng ở Client Component; Server Component dùng getMyAcademic).
export const getMyAcademicClient = () => api<MyAcademicDto>("/academic/me");
export const transferStudent = (userId: string, classId: string) =>
  api<void>(`/academic/students/${userId}/transfer`, json("POST", { classId }));

// ── Tổ, môn, phòng
export const listDepartments = () => api<DepartmentDto[]>("/academic/departments");
export const createDepartment = (name: string) => api<DepartmentDto>("/academic/departments", json("POST", { name }));
export const updateDepartment = (id: string, name: string) => api<DepartmentDto>(`/academic/departments/${id}`, json("PATCH", { name }));
export const deleteDepartment = (id: string) => api<void>(`/academic/departments/${id}`, json("DELETE"));

export const listSubjects = () => api<SubjectDto[]>("/academic/subjects");
export const createSubject = (body: { code: string; name: string; departmentId?: string | null; gradingType: GradingType }) =>
  api<SubjectDto>("/academic/subjects", json("POST", body));
export const updateSubject = (id: string, body: { name?: string; departmentId?: string | null; gradingType?: GradingType }) =>
  api<SubjectDto>(`/academic/subjects/${id}`, json("PATCH", body));
export const deleteSubject = (id: string) => api<void>(`/academic/subjects/${id}`, json("DELETE"));

export const listRooms = () => api<RoomDto[]>("/academic/rooms");
export const createRoom = (body: { name: string; kind?: string | null }) => api<RoomDto>("/academic/rooms", json("POST", body));
export const updateRoom = (id: string, body: { name?: string; kind?: string | null }) =>
  api<RoomDto>(`/academic/rooms/${id}`, json("PATCH", body));
export const deleteRoom = (id: string) => api<void>(`/academic/rooms/${id}`, json("DELETE"));

// Buổi học của lớp (thời khoá biểu): chỉnh hàng loạt theo khối.
export const setSessionsBulk = (body: { schoolYearId?: string; gradeLevel?: number; classIds?: string[]; sessions: string }) =>
  api<{ updated: number }>("/academic/classes/sessions", json("PATCH", body));
