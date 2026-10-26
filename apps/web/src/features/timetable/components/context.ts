import type { ClassDto, RoomDto, SemesterDto, TeacherOptionDto, TimetableFrameDto, TimetableVersionDto } from "@pvh/shared";

// Dữ liệu dùng chung giữa các tab của trình xếp thời khoá biểu.
export interface EditorContext {
  frame: TimetableFrameDto;
  versions: TimetableVersionDto[];
  version: TimetableVersionDto | null; // phiên bản đang chọn
  selectVersion: (id: string) => void;
  semesters: SemesterDto[];
  classes: ClassDto[];
  rooms: RoomDto[];
  teachers: TeacherOptionDto[];
  readOnly: boolean; // ADMIN: chỉ xem
  reload: () => void;
}

export const smallButton = "rounded border border-black/20 px-3 py-1 text-sm disabled:opacity-50 dark:border-white/20";
export const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
