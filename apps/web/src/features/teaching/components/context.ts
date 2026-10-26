import type {
  ClassDto,
  PeriodQuotasDto,
  SchoolYearDto,
  SemesterDto,
  SubjectDto,
  TeachingAssignmentDto,
  TeachingSummaryDto,
} from "@pvh/shared";
import type { Scope } from "../api/teaching-api";

// Dữ liệu dùng chung giữa các tab của trang phân công.
export interface TeachingContext {
  scope: Scope;
  years: SchoolYearDto[];
  semesters: SemesterDto[];
  classes: ClassDto[];
  subjects: SubjectDto[];
  summary: TeachingSummaryDto;
  assignments: TeachingAssignmentDto[];
  quotas: PeriodQuotasDto;
  readOnly: boolean;
  reload: () => void;
}

export const smallButton = "rounded border border-black/20 px-3 py-1 text-sm disabled:opacity-50 dark:border-white/20";
