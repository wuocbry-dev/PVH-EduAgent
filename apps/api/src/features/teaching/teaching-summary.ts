import type {
  ClassTeachingDto,
  DepartmentLoadDto,
  TeacherLoadDto,
  TeachingIssueDto,
  TeachingSummaryDto,
} from '@pvh/shared';

export interface SummaryInput {
  classes: { id: string; name: string; gradeLevel: number }[];
  subjects: { id: string; code: string; name: string; departmentName: string | null }[];
  gradeQuotas: Map<string, number>; // `${gradeLevel}:${subjectId}`
  classQuotas: Map<string, number>; // `${classId}:${subjectId}` (ghi đè theo lớp)
  assignments: { classId: string; subjectId: string; teacherId: string; periodsPerWeek: number }[];
  teachers: { id: string; code: string; name: string; departmentName: string | null; weeklyQuota: number | null }[];
  defaultQuota: number;
}

export type SummaryResult = Pick<TeachingSummaryDto, 'totals' | 'classes' | 'teachers' | 'departments' | 'issues'>;

const NO_DEPARTMENT = 'Chưa có tổ';

// Tính thống kê và cảnh báo phân công từ dữ liệu thô (không chạm CSDL nên kiểm thử trực tiếp được).
// Định mức của một lớp–môn = số đã ghi đè cho lớp, không có thì số của khối; môn không có định mức hoặc bằng 0 là "không học".
export function computeSummary(input: SummaryInput): SummaryResult {
  const subjectById = new Map(input.subjects.map((s) => [s.id, s]));
  const teacherById = new Map(input.teachers.map((t) => [t.id, t]));
  const issues: TeachingIssueDto[] = [];

  const requiredOf = (classId: string, gradeLevel: number, subjectId: string): number =>
    input.classQuotas.get(`${classId}:${subjectId}`) ?? input.gradeQuotas.get(`${gradeLevel}:${subjectId}`) ?? 0;

  const classes: ClassTeachingDto[] = input.classes.map((cls) => {
    const mine = input.assignments.filter((a) => a.classId === cls.id);
    const subjectIds = new Set<string>(mine.map((a) => a.subjectId));
    for (const s of input.subjects) if (requiredOf(cls.id, cls.gradeLevel, s.id) > 0) subjectIds.add(s.id);

    const subjects = [...subjectIds]
      .map((subjectId) => {
        const subject = subjectById.get(subjectId)!;
        const required = requiredOf(cls.id, cls.gradeLevel, subjectId);
        const rows = mine.filter((a) => a.subjectId === subjectId);
        const assigned = rows.reduce((sum, a) => sum + a.periodsPerWeek, 0);
        const label = `${cls.name} · ${subject.name}`;

        if (required > 0 && rows.length === 0) {
          issues.push({ type: 'SUBJECT_UNASSIGNED', severity: 'error', message: `${label}: chưa có giáo viên (cần ${required} tiết/tuần)`, classId: cls.id, subjectId });
        } else if (required > 0 && assigned < required) {
          issues.push({ type: 'PERIODS_SHORT', severity: 'error', message: `${label}: thiếu ${required - assigned} tiết (phân công ${assigned}/${required})`, classId: cls.id, subjectId });
        } else if (required > 0 && assigned > required) {
          issues.push({ type: 'PERIODS_EXCESS', severity: 'warning', message: `${label}: thừa ${assigned - required} tiết (phân công ${assigned}/${required})`, classId: cls.id, subjectId });
        } else if (required === 0 && rows.length > 0) {
          issues.push({ type: 'NO_QUOTA', severity: 'warning', message: `${label}: đã phân công ${assigned} tiết nhưng môn chưa có định mức ở khối ${cls.gradeLevel}`, classId: cls.id, subjectId });
        }
        for (const a of rows) {
          const teacher = teacherById.get(a.teacherId);
          if (teacher?.departmentName && subject.departmentName && teacher.departmentName !== subject.departmentName) {
            issues.push({
              type: 'CROSS_DEPARTMENT',
              severity: 'warning',
              message: `${label}: ${teacher.name} (${teacher.departmentName}) dạy môn của ${subject.departmentName}`,
              classId: cls.id,
              subjectId,
              teacherId: a.teacherId,
            });
          }
        }
        return {
          subjectId,
          subjectCode: subject.code,
          subjectName: subject.name,
          requiredPeriods: required,
          assignedPeriods: assigned,
          teachers: rows.map((a) => ({
            teacherId: a.teacherId,
            teacherName: teacherById.get(a.teacherId)?.name ?? '?',
            periodsPerWeek: a.periodsPerWeek,
          })),
        };
      })
      .sort((a, b) => a.subjectName.localeCompare(b.subjectName, 'vi'));

    return {
      classId: cls.id,
      className: cls.name,
      gradeLevel: cls.gradeLevel,
      requiredPeriods: subjects.reduce((sum, s) => sum + s.requiredPeriods, 0),
      // Chỉ tính tiết của môn có định mức vào tổng so sánh.
      assignedPeriods: subjects.filter((s) => s.requiredPeriods > 0).reduce((sum, s) => sum + s.assignedPeriods, 0),
      subjects,
    };
  });

  const classById = new Map(input.classes.map((c) => [c.id, c]));
  const teachers: TeacherLoadDto[] = input.teachers
    .map((t) => {
      const rows = input.assignments.filter((a) => a.teacherId === t.id);
      const periods = rows.reduce((sum, a) => sum + a.periodsPerWeek, 0);
      const quota = t.weeklyQuota ?? input.defaultQuota;
      if (periods > quota) {
        issues.push({ type: 'TEACHER_OVER', severity: 'error', message: `${t.name}: dạy ${periods} tiết, vượt định mức ${quota} (+${periods - quota})`, teacherId: t.id });
      } else if (periods < quota) {
        issues.push({ type: 'TEACHER_UNDER', severity: 'warning', message: `${t.name}: dạy ${periods} tiết, thiếu ${quota - periods} so với định mức ${quota}`, teacherId: t.id });
      }
      return {
        teacherId: t.id,
        teacherCode: t.code,
        teacherName: t.name,
        departmentName: t.departmentName,
        periods,
        quota,
        quotaOverridden: t.weeklyQuota !== null,
        delta: periods - quota,
        assignments: rows.map((a) => ({
          classId: a.classId,
          className: classById.get(a.classId)?.name ?? '?',
          subjectName: subjectById.get(a.subjectId)?.name ?? '?',
          periodsPerWeek: a.periodsPerWeek,
        })),
      };
    })
    .sort((a, b) => a.teacherName.localeCompare(b.teacherName, 'vi'));

  const byDepartment = new Map<string, DepartmentLoadDto>();
  for (const t of teachers) {
    const name = t.departmentName ?? NO_DEPARTMENT;
    const d = byDepartment.get(name) ?? { departmentName: name, teachers: 0, periods: 0, quota: 0 };
    d.teachers += 1;
    d.periods += t.periods;
    d.quota += t.quota;
    byDepartment.set(name, d);
  }

  const order = { error: 0, warning: 1 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    classes,
    teachers,
    departments: [...byDepartment.values()].sort((a, b) => a.departmentName.localeCompare(b.departmentName, 'vi')),
    issues,
    totals: {
      classes: classes.length,
      teachers: teachers.length,
      requiredPeriods: classes.reduce((sum, c) => sum + c.requiredPeriods, 0),
      assignedPeriods: classes.reduce((sum, c) => sum + c.assignedPeriods, 0),
      unassignedSubjects: issues.filter((i) => i.type === 'SUBJECT_UNASSIGNED').length,
    },
  };
}
