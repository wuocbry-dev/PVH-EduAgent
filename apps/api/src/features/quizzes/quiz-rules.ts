import { randomInt } from 'node:crypto';
import { isAnswerCorrect, QUIZ_SUBMIT_GRACE_SEC, type QuizAudience } from '@pvh/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../infrastructure/database/prisma.service.js';

// Hàm thuần của trắc nghiệm ôn tập (bước 22): đối tượng làm bài, phạm vi soạn của giáo viên, xáo trộn, chấm, hạn nộp.

export interface QuizStudent {
  classId: bigint;
  gradeLevel: number;
}

// Quiz đang mở mà học sinh này được làm (cùng mô hình đối tượng với thư viện số: toàn trường, khối mình, lớp mình).
export function openQuizWhere(student: QuizStudent | null): Prisma.QuizWhereInput {
  const or: Prisma.QuizWhereInput[] = [{ audience: 'ALL' }];
  if (student) {
    or.push(
      { audience: 'GRADE', gradeLevels: { has: student.gradeLevel } },
      { audience: 'CLASS', classes: { some: { classId: student.classId } } },
    );
  }
  return { AND: [{ status: 'PUBLISHED' }, { OR: or }] };
}

export function canTake(
  student: QuizStudent | null,
  quiz: { status: string; audience: string; gradeLevels: number[]; classIds: bigint[] },
): boolean {
  if (quiz.status !== 'PUBLISHED') return false;
  if (quiz.audience === 'ALL') return true;
  if (!student) return false;
  if (quiz.audience === 'GRADE') return quiz.gradeLevels.includes(student.gradeLevel);
  if (quiz.audience === 'CLASS') return quiz.classIds.some((c) => c === student.classId);
  return false;
}

export type TeacherScope = Map<string, { name: string; grades: Set<number>; classes: { id: bigint; name: string; gradeLevel: number }[] }>;

// Môn giáo viên dạy ở năm học hiện hành (theo phân công bước 16), kèm khối và lớp của từng môn.
export async function teacherScope(prisma: Pick<PrismaService, 'schoolYear' | 'teachingAssignment'>, teacherId: bigint): Promise<TeacherScope> {
  const scope: TeacherScope = new Map();
  const year = await prisma.schoolYear.findFirst({ where: { isCurrent: true }, select: { id: true } });
  if (!year) return scope;
  const rows = await prisma.teachingAssignment.findMany({
    where: { teacherId, schoolYearId: year.id },
    include: { subject: { select: { name: true } }, class: { include: { grade: true } } },
  });
  for (const r of rows) {
    const key = r.subjectId.toString();
    const entry = scope.get(key) ?? { name: r.subject.name, grades: new Set<number>(), classes: [] };
    entry.grades.add(r.class.grade.level);
    if (!entry.classes.some((c) => c.id === r.classId)) entry.classes.push({ id: r.classId, name: r.class.name, gradeLevel: r.class.grade.level });
    scope.set(key, entry);
  }
  return scope;
}

export interface TargetCheck {
  audience: QuizAudience;
  gradeLevel: number;
  gradeLevels: number[];
  classIds: bigint[];
}

// Giáo viên chỉ giao cho khối/lớp mình dạy môn đó (không giao toàn trường); trả lý do nếu không hợp lệ.
export function teacherTargetProblem(subject: { grades: Set<number>; classes: { id: bigint }[] } | undefined, t: TargetCheck): string | null {
  if (!subject) return 'Bạn chỉ soạn được trắc nghiệm cho môn mình được phân công dạy';
  if (!subject.grades.has(t.gradeLevel)) return 'Bạn không dạy môn này ở khối đã chọn';
  if (t.audience === 'ALL') return 'Giáo viên chỉ giao trắc nghiệm cho khối hoặc lớp mình dạy';
  if (t.audience === 'GRADE' && t.gradeLevels.some((g) => !subject.grades.has(g))) return 'Bạn chỉ giao được cho khối mình dạy môn này';
  if (t.audience === 'CLASS' && t.classIds.some((c) => !subject.classes.some((x) => x.id === c))) return 'Bạn chỉ giao được cho lớp mình dạy môn này';
  return null;
}

// Fisher–Yates với nguồn ngẫu nhiên an toàn (học sinh không đoán được thứ tự).
export function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Hết hạn nhận câu trả lời: sau hạn nộp + thời gian bù độ trễ mạng.
export const acceptsAnswers = (deadline: Date | null, now = new Date()): boolean =>
  !deadline || now.getTime() <= deadline.getTime() + QUIZ_SUBMIT_GRACE_SEC * 1000;

export interface GradedQuestion {
  questionId: bigint;
  selected: bigint[];
  correct: bigint[];
}

// Chấm cả bài: câu đúng khi chọn đủ và chỉ đúng các đáp án đúng; câu bỏ trống là sai.
export function grade(questions: GradedQuestion[]): { perQuestion: Map<string, boolean>; correctCount: number } {
  const perQuestion = new Map<string, boolean>();
  let correctCount = 0;
  for (const q of questions) {
    const ok = isAnswerCorrect(q.selected.map(String), q.correct.map(String));
    perQuestion.set(q.questionId.toString(), ok);
    if (ok) correctCount++;
  }
  return { perQuestion, correctCount };
}

// Phổ điểm theo 5 khoảng [0,2) [2,4) [4,6) [6,8) [8,10].
export function distribution(scores: number[]): number[] {
  const bins = [0, 0, 0, 0, 0];
  for (const s of scores) bins[Math.min(4, Math.floor(s / 2))]++;
  return bins;
}
