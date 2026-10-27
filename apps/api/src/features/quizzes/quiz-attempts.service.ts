import { ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  libraryAudienceLabel,
  QUIZ_STARTS_PER_10_MIN,
  QUIZ_SUBMIT_GRACE_SEC,
  QUIZ_WRITES_PER_MINUTE,
  quizScore,
  type QuizAttemptDto,
  type QuizAvailableDto,
} from '@pvh/shared';
import type { AuthUser } from '../../common/types/auth-user.js';
import { parseId } from '../../common/utils/parse-id.js';
import { isUniqueViolation } from '../../common/utils/prisma-errors.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { RateLimitService } from '../../infrastructure/rate-limit/rate-limit.service.js';
import type { AnswerInput, AvailableQuery, SubmitInput } from './dto/quizzes.dto.js';
import { acceptsAnswers, canTake, grade, openQuizWhere, shuffled, type QuizStudent } from './quiz-rules.js';

const SUMMARY_INCLUDE = {
  subject: { select: { name: true } },
  libraryItem: { select: { title: true } },
  creator: { select: { fullName: true } },
  classes: { select: { classId: true, class: { select: { name: true } } } },
  _count: { select: { questions: true } },
} satisfies Prisma.QuizInclude;

type AttemptRow = Prisma.QuizAttemptGetPayload<{ include: { quiz: true; answers: true } }>;

// Trắc nghiệm ôn tập – phía học sinh (bước 22). Chấm ở server; đề gửi xuống không bao giờ có đáp án đúng. Hạn nộp tính ở
// server lúc bắt đầu; quá hạn (cộng thời gian bù mạng) thì bài tự nộp với các câu đã lưu, không nhận câu trả lời mới.
// Chỉ ghi quiz_attempts/quiz_answers: KHÔNG đụng bảng scores (điểm học tập chính thức).
@Injectable()
export class QuizAttemptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: RateLimitService,
  ) {}

  async available(user: AuthUser, query: AvailableQuery): Promise<QuizAvailableDto[]> {
    const student = await this.student(user);
    const uid = BigInt(user.id);
    await this.finalizeExpired({ studentId: uid });
    const rows = await this.prisma.quiz.findMany({
      where: { AND: [openQuizWhere(student), query.libraryItemId ? { libraryItemId: BigInt(query.libraryItemId) } : {}] },
      include: { ...SUMMARY_INCLUDE, attempts: { where: { studentId: uid }, orderBy: { startedAt: 'desc' } } },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: 200,
    });
    return rows.map((q) => {
      const open = q.attempts.find((a) => !a.submittedAt);
      return {
        id: q.id.toString(),
        title: q.title,
        description: q.description,
        subjectId: q.subjectId.toString(),
        subjectName: q.subject.name,
        gradeLevel: q.gradeLevel,
        audience: q.audience as QuizAvailableDto['audience'],
        audienceLabel: libraryAudienceLabel(q.audience, q.gradeLevels, q.classes.map((c) => c.class.name)),
        durationMinutes: q.durationMinutes,
        maxAttempts: q.maxAttempts,
        questionCount: q._count.questions,
        status: q.status,
        libraryItemId: q.libraryItemId?.toString() ?? null,
        libraryItemTitle: q.libraryItem?.title ?? null,
        createdByName: q.creator.fullName,
        updatedAt: q.updatedAt.toISOString(),
        attempts: q.attempts.map((a) => ({
          id: a.id.toString(),
          startedAt: a.startedAt.toISOString(),
          submittedAt: a.submittedAt?.toISOString() ?? null,
          score: a.score === null ? null : Number(a.score),
        })),
        inProgressId: open?.id.toString() ?? null,
        attemptsLeft: q.maxAttempts === null ? null : Math.max(0, q.maxAttempts - q.attempts.length),
      };
    });
  }

  // Bắt đầu (hoặc mở lại lần đang làm dở). Ngoài đối tượng → 403; hết số lần → 409.
  async start(user: AuthUser, quizId: string): Promise<QuizAttemptDto> {
    const student = await this.student(user);
    const uid = BigInt(user.id);
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: parseId(quizId) },
      include: { classes: { select: { classId: true } }, questions: { include: { options: { orderBy: { position: 'asc' } } }, orderBy: { position: 'asc' } } },
    });
    if (!quiz || quiz.status !== 'PUBLISHED') throw new NotFoundException('Không tìm thấy bài ôn tập');
    if (!canTake(student, { ...quiz, classIds: quiz.classes.map((c) => c.classId) })) throw new ForbiddenException('Bài ôn tập này không dành cho lớp của em');

    await this.finalizeExpired({ quizId: quiz.id, studentId: uid });
    const open = await this.prisma.quizAttempt.findFirst({ where: { quizId: quiz.id, studentId: uid, submittedAt: null } });
    if (open) return this.view(user, open.id.toString());

    const { count, retryAfterSec } = await this.limits.increment('quiz-start', user.id, 600);
    if (count > QUIZ_STARTS_PER_10_MIN) {
      throw new HttpException(`Em bắt đầu làm bài quá nhiều lần, thử lại sau ${Math.ceil(retryAfterSec / 60)} phút`, HttpStatus.TOO_MANY_REQUESTS);
    }
    if (quiz.maxAttempts !== null) {
      const used = await this.prisma.quizAttempt.count({ where: { quizId: quiz.id, studentId: uid } });
      if (used >= quiz.maxAttempts) throw new ConflictException(`Em đã làm hết ${quiz.maxAttempts} lần cho phép của bài này`);
    }
    if (quiz.questions.length === 0) throw new ConflictException('Bài ôn tập chưa có câu hỏi');

    const questions = quiz.shuffleQuestions ? shuffled(quiz.questions) : quiz.questions;
    const optionOrder = Object.fromEntries(
      questions.map((q) => [q.id.toString(), (quiz.shuffleOptions ? shuffled(q.options) : q.options).map((o) => o.id.toString())]),
    );
    const now = new Date();
    try {
      const attempt = await this.prisma.quizAttempt.create({
        data: {
          quizId: quiz.id,
          studentId: uid,
          startedAt: now,
          deadline: quiz.durationMinutes ? new Date(now.getTime() + quiz.durationMinutes * 60_000) : null,
          questionOrder: questions.map((q) => q.id),
          optionOrder,
          totalCount: questions.length,
        },
      });
      return this.view(user, attempt.id.toString());
    } catch (err) {
      // Bấm "Bắt đầu" hai lần cùng lúc: index duy nhất một phần chỉ cho một lần làm dở; trả lại lần đó.
      if (!isUniqueViolation(err)) throw err;
      const existing = await this.prisma.quizAttempt.findFirstOrThrow({ where: { quizId: quiz.id, studentId: uid, submittedAt: null } });
      return this.view(user, existing.id.toString());
    }
  }

  // Xem lần làm: đang làm thì trả đề (không có đáp án đúng) và câu đã chọn; đã nộp (hoặc vừa hết giờ) thì trả kết quả.
  async view(user: AuthUser, attemptId: string): Promise<QuizAttemptDto> {
    let attempt = await this.own(user, attemptId);
    if (!attempt.submittedAt && !acceptsAnswers(attempt.deadline)) attempt = await this.finalize(attempt.id, true);
    return this.toDto(attempt);
  }

  async saveAnswer(user: AuthUser, attemptId: string, input: AnswerInput): Promise<void> {
    await this.limitWrites(user);
    const attempt = await this.openOrFinalize(user, attemptId);
    await this.store(attempt, [input]);
  }

  // Nộp bài. Quá hạn thì không nhận câu trả lời gửi kèm: bài tự nộp với các câu đã lưu, trả 409 kèm thông báo.
  async submit(user: AuthUser, attemptId: string, input: SubmitInput): Promise<QuizAttemptDto> {
    await this.limitWrites(user);
    const current = await this.own(user, attemptId);
    if (current.submittedAt) return this.toDto(current);
    const attempt = await this.openOrFinalize(user, attemptId);
    await this.store(attempt, input.answers);
    return this.toDto(await this.finalize(attempt.id, false));
  }

  // Tự nộp các lần làm đã quá hạn (gọi khi xem danh sách, thống kê, bắt đầu lần mới).
  async finalizeExpired(where: Prisma.QuizAttemptWhereInput): Promise<void> {
    const expired = await this.prisma.quizAttempt.findMany({
      where: { ...where, submittedAt: null, deadline: { lt: new Date(Date.now() - QUIZ_SUBMIT_GRACE_SEC * 1000) } },
      select: { id: true },
      take: 500,
    });
    for (const a of expired) await this.finalize(a.id, true);
  }

  // ── Nội bộ ──

  // Chỉ học sinh làm bài ôn tập (giáo viên xem trước trong trang soạn). Học sinh chưa xếp lớp chỉ làm được bài toàn trường.
  private async student(user: AuthUser): Promise<QuizStudent | null> {
    if (!user.roles.includes('STUDENT')) throw new ForbiddenException('Chỉ học sinh làm bài ôn tập');
    const year = await this.prisma.schoolYear.findFirst({ where: { isCurrent: true }, select: { id: true } });
    if (!year) return null;
    const enrollment = await this.prisma.classEnrollment.findUnique({
      where: { studentId_schoolYearId: { studentId: BigInt(user.id), schoolYearId: year.id } },
      include: { class: { include: { grade: true } } },
    });
    return enrollment ? { classId: enrollment.classId, gradeLevel: enrollment.class.grade.level } : null;
  }

  private async own(user: AuthUser, attemptId: string): Promise<AttemptRow> {
    const attempt = await this.prisma.quizAttempt.findUnique({ where: { id: parseId(attemptId) }, include: { quiz: true, answers: true } });
    if (!attempt || attempt.studentId.toString() !== user.id) throw new NotFoundException('Không tìm thấy lần làm bài');
    return attempt;
  }

  private async openOrFinalize(user: AuthUser, attemptId: string): Promise<AttemptRow> {
    const attempt = await this.own(user, attemptId);
    if (attempt.submittedAt) throw new ConflictException('Bài đã nộp, không sửa được nữa');
    if (!acceptsAnswers(attempt.deadline)) {
      await this.finalize(attempt.id, true);
      throw new ConflictException('Đã hết giờ: bài đã được tự nộp với các câu em đã trả lời');
    }
    return attempt;
  }

  private async limitWrites(user: AuthUser) {
    const { count, retryAfterSec } = await this.limits.increment('quiz-write', user.id, 60);
    if (count > QUIZ_WRITES_PER_MINUTE) {
      throw new HttpException(`Thao tác quá nhanh, thử lại sau ${retryAfterSec} giây`, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  // Lưu câu trả lời: câu phải thuộc lần làm này, đáp án phải thuộc câu đó.
  private async store(attempt: AttemptRow, answers: AnswerInput[]): Promise<void> {
    if (answers.length === 0) return;
    const order = attempt.optionOrder as Record<string, string[]>;
    for (const a of answers) {
      const allowed = order[a.questionId];
      if (!allowed) throw new NotFoundException('Câu hỏi không thuộc bài này');
      if (a.optionIds.some((o) => !allowed.includes(o))) throw new ConflictException('Đáp án không thuộc câu hỏi này');
    }
    await this.prisma.$transaction(
      answers.map((a) => {
        const optionIds = [...new Set(a.optionIds)].map((o) => BigInt(o));
        const key = { attemptId: attempt.id, questionId: BigInt(a.questionId) };
        return this.prisma.quizAnswer.upsert({ where: { attemptId_questionId: key }, update: { optionIds }, create: { ...key, optionIds } });
      }),
    );
  }

  // Chấm và khoá lần làm (cập nhật có điều kiện: hai yêu cầu nộp cùng lúc chỉ chấm một lần).
  private async finalize(attemptId: bigint, auto: boolean): Promise<AttemptRow> {
    await this.prisma.$transaction(async (tx) => {
      const attempt = await tx.quizAttempt.findUniqueOrThrow({ where: { id: attemptId }, include: { answers: true } });
      if (attempt.submittedAt) return;
      const correct = await tx.quizOption.findMany({
        where: { questionId: { in: attempt.questionOrder }, isCorrect: true },
        select: { id: true, questionId: true },
      });
      const graded = grade(
        attempt.questionOrder.map((qid) => ({
          questionId: qid,
          selected: attempt.answers.find((a) => a.questionId === qid)?.optionIds ?? [],
          correct: correct.filter((c) => c.questionId === qid).map((c) => c.id),
        })),
      );
      const { count } = await tx.quizAttempt.updateMany({
        where: { id: attemptId, submittedAt: null },
        data: {
          submittedAt: new Date(),
          autoSubmitted: auto,
          correctCount: graded.correctCount,
          score: quizScore(graded.correctCount, attempt.totalCount),
        },
      });
      if (count !== 1) return;
      for (const a of attempt.answers) {
        await tx.quizAnswer.update({
          where: { attemptId_questionId: { attemptId, questionId: a.questionId } },
          data: { isCorrect: graded.perQuestion.get(a.questionId.toString()) ?? false },
        });
      }
    });
    return this.prisma.quizAttempt.findUniqueOrThrow({ where: { id: attemptId }, include: { quiz: true, answers: true } });
  }

  private async toDto(attempt: AttemptRow): Promise<QuizAttemptDto> {
    const questions = await this.prisma.quizQuestion.findMany({ where: { id: { in: attempt.questionOrder } }, include: { options: true } });
    const order = attempt.optionOrder as Record<string, string[]>;
    const ordered = attempt.questionOrder.map((qid) => questions.find((q) => q.id === qid)!).filter(Boolean);
    const selectedOf = (qid: bigint) => (attempt.answers.find((a) => a.questionId === qid)?.optionIds ?? []).map(String);
    const optionsOf = (q: (typeof questions)[number]) => (order[q.id.toString()] ?? []).map((oid) => q.options.find((o) => o.id.toString() === oid)!).filter(Boolean);
    const base = {
      id: attempt.id.toString(),
      quizId: attempt.quizId.toString(),
      quizTitle: attempt.quiz.title,
      startedAt: attempt.startedAt.toISOString(),
      deadline: attempt.deadline?.toISOString() ?? null,
      serverNow: new Date().toISOString(),
      submittedAt: attempt.submittedAt?.toISOString() ?? null,
      autoSubmitted: attempt.autoSubmitted,
    };
    if (!attempt.submittedAt) {
      return {
        ...base,
        // Đề đang làm: chỉ nội dung câu và đáp án, KHÔNG có cờ đúng/sai hay giải thích.
        questions: ordered.map((q) => ({
          id: q.id.toString(),
          content: q.content,
          multiple: q.options.filter((o) => o.isCorrect).length > 1,
          options: optionsOf(q).map((o) => ({ id: o.id.toString(), content: o.content })),
          selected: selectedOf(q.id),
        })),
      };
    }
    const show = attempt.quiz.showAnswers;
    return {
      ...base,
      score: Number(attempt.score),
      correctCount: attempt.correctCount ?? 0,
      totalCount: attempt.totalCount,
      showAnswers: show,
      results: ordered.map((q) => ({
        id: q.id.toString(),
        content: q.content,
        multiple: q.options.filter((o) => o.isCorrect).length > 1,
        options: optionsOf(q).map((o) => ({ id: o.id.toString(), content: o.content, ...(show ? { correct: o.isCorrect } : {}) })),
        selected: selectedOf(q.id),
        isCorrect: attempt.answers.find((a) => a.questionId === q.id)?.isCorrect ?? false,
        ...(show ? { explanation: q.explanation } : {}),
      })),
    };
  }
}
