import { computeSummary, type SummaryInput } from './teaching-summary.js';

const base = (over: Partial<SummaryInput> = {}): SummaryInput => ({
  classes: [
    { id: 'c1', name: '10A1', gradeLevel: 10 },
    { id: 'c2', name: '10A2', gradeLevel: 10 },
  ],
  subjects: [
    { id: 's1', code: 'TOAN', name: 'Toán', departmentName: 'Tổ Toán' },
    { id: 's2', code: 'VAN', name: 'Ngữ văn', departmentName: 'Tổ Văn' },
    { id: 's3', code: 'TIN', name: 'Tin học', departmentName: 'Tổ Toán' },
  ],
  gradeQuotas: new Map([
    ['10:s1', 3],
    ['10:s2', 3],
    ['10:s3', 0],
  ]),
  classQuotas: new Map(),
  assignments: [],
  teachers: [
    { id: 't1', code: 'GV1', name: 'Cô Toán', departmentName: 'Tổ Toán', weeklyQuota: null },
    { id: 't2', code: 'GV2', name: 'Thầy Văn', departmentName: 'Tổ Văn', weeklyQuota: 4 },
  ],
  defaultQuota: 6,
  ...over,
});

const issuesOf = (r: ReturnType<typeof computeSummary>, type: string) => r.issues.filter((i) => i.type === type);

describe('thống kê và cảnh báo phân công', () => {
  it('chưa phân công gì: mọi lớp–môn có định mức đều báo "chưa có giáo viên"; môn định mức 0 không báo', () => {
    const r = computeSummary(base());
    expect(issuesOf(r, 'SUBJECT_UNASSIGNED').map((i) => `${i.classId}:${i.subjectId}`).sort()).toEqual([
      'c1:s1',
      'c1:s2',
      'c2:s1',
      'c2:s2',
    ]);
    expect(r.totals).toMatchObject({ classes: 2, teachers: 2, requiredPeriods: 12, assignedPeriods: 0, unassignedSubjects: 4 });
    expect(r.classes[0]!.subjects.map((s) => s.subjectCode)).toEqual(['Ngữ văn', 'Toán'].map((n) => ({ 'Ngữ văn': 'VAN', Toán: 'TOAN' })[n]));
  });

  it('phân công đủ thì không cảnh báo lớp–môn; thiếu tiết và thừa tiết được tính đúng', () => {
    const r = computeSummary(
      base({
        assignments: [
          { classId: 'c1', subjectId: 's1', teacherId: 't1', periodsPerWeek: 3 }, // đủ
          { classId: 'c1', subjectId: 's2', teacherId: 't2', periodsPerWeek: 2 }, // thiếu 1
          { classId: 'c2', subjectId: 's1', teacherId: 't1', periodsPerWeek: 4 }, // thừa 1
        ],
      }),
    );
    const short = issuesOf(r, 'PERIODS_SHORT');
    expect(short).toHaveLength(1);
    expect(short[0]).toMatchObject({ classId: 'c1', subjectId: 's2', severity: 'error' });
    expect(short[0]!.message).toContain('thiếu 1 tiết');
    const excess = issuesOf(r, 'PERIODS_EXCESS');
    expect(excess).toHaveLength(1);
    expect(excess[0]).toMatchObject({ classId: 'c2', subjectId: 's1', severity: 'warning' });
    // c2–Văn vẫn chưa có người dạy.
    expect(issuesOf(r, 'SUBJECT_UNASSIGNED').map((i) => `${i.classId}:${i.subjectId}`)).toEqual(['c2:s2']);
    expect(r.classes[0]).toMatchObject({ requiredPeriods: 6, assignedPeriods: 5 });
  });

  it('ghi đè định mức theo lớp thắng định mức khối; 0 nghĩa là lớp đó không học môn', () => {
    const r = computeSummary(
      base({
        classQuotas: new Map([
          ['c1:s1', 5],
          ['c2:s2', 0],
        ]),
        assignments: [{ classId: 'c1', subjectId: 's1', teacherId: 't1', periodsPerWeek: 5 }],
      }),
    );
    expect(r.classes[0]!.subjects.find((s) => s.subjectCode === 'TOAN')).toMatchObject({ requiredPeriods: 5, assignedPeriods: 5 });
    expect(issuesOf(r, 'PERIODS_SHORT')).toHaveLength(0);
    expect(r.classes[1]!.subjects.map((s) => s.subjectCode)).toEqual(['TOAN']); // 10A2 không học Văn
  });

  it('phân công môn chưa có định mức được cảnh báo và không tính vào tổng tiết lớp', () => {
    const r = computeSummary(base({ assignments: [{ classId: 'c1', subjectId: 's3', teacherId: 't1', periodsPerWeek: 2 }] }));
    const noQuota = issuesOf(r, 'NO_QUOTA');
    expect(noQuota).toHaveLength(1);
    expect(noQuota[0]).toMatchObject({ classId: 'c1', subjectId: 's3', severity: 'warning' });
    expect(r.classes[0]!.assignedPeriods).toBe(0);
    expect(r.teachers.find((t) => t.teacherId === 't1')!.periods).toBe(2); // vẫn tính vào tải của giáo viên
  });

  it('giáo viên vượt/thiếu định mức; định mức riêng thắng mặc định; tính theo tổ', () => {
    const r = computeSummary(
      base({
        assignments: [
          { classId: 'c1', subjectId: 's1', teacherId: 't1', periodsPerWeek: 3 },
          { classId: 'c2', subjectId: 's1', teacherId: 't1', periodsPerWeek: 3 }, // 6/6: đúng
          { classId: 'c1', subjectId: 's2', teacherId: 't2', periodsPerWeek: 3 },
          { classId: 'c2', subjectId: 's2', teacherId: 't2', periodsPerWeek: 3 }, // 6 > 4 (riêng)
        ],
      }),
    );
    const t1 = r.teachers.find((t) => t.teacherId === 't1')!;
    const t2 = r.teachers.find((t) => t.teacherId === 't2')!;
    expect(t1).toMatchObject({ periods: 6, quota: 6, delta: 0, quotaOverridden: false });
    expect(t2).toMatchObject({ periods: 6, quota: 4, delta: 2, quotaOverridden: true });
    expect(issuesOf(r, 'TEACHER_OVER').map((i) => i.teacherId)).toEqual(['t2']);
    expect(issuesOf(r, 'TEACHER_UNDER')).toHaveLength(0);
    expect(r.departments).toEqual([
      { departmentName: 'Tổ Toán', teachers: 1, periods: 6, quota: 6 },
      { departmentName: 'Tổ Văn', teachers: 1, periods: 6, quota: 4 },
    ]);

    const idle = computeSummary(base());
    expect(issuesOf(idle, 'TEACHER_UNDER').map((i) => i.teacherId).sort((a, b) => String(a).localeCompare(String(b)))).toEqual(['t1', 't2']);
  });

  it('dạy chéo tổ chuyên môn được cảnh báo; lỗi xếp trước cảnh báo', () => {
    const r = computeSummary(
      base({ assignments: [{ classId: 'c1', subjectId: 's2', teacherId: 't1', periodsPerWeek: 3 }] }),
    );
    const cross = issuesOf(r, 'CROSS_DEPARTMENT');
    expect(cross).toHaveLength(1);
    expect(cross[0]).toMatchObject({ teacherId: 't1', subjectId: 's2', severity: 'warning' });
    const firstWarning = r.issues.findIndex((i) => i.severity === 'warning');
    expect(r.issues.slice(firstWarning).every((i) => i.severity === 'warning')).toBe(true);
  });

  it('giáo viên chưa có tổ gom vào "Chưa có tổ"', () => {
    const r = computeSummary(base({ teachers: [{ id: 't9', code: 'GV9', name: 'Chưa tổ', departmentName: null, weeklyQuota: null }] }));
    expect(r.departments).toEqual([{ departmentName: 'Chưa có tổ', teachers: 1, periods: 0, quota: 6 }]);
  });
});
