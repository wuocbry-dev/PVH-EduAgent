import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  libraryAudienceLabel,
  QUIZ_MAX_QUESTIONS,
  QUIZ_STATUS_NAMES,
  type MediaDto,
  type MediaPresignDto,
  type QuizEditDto,
  type QuizFormOptionsDto,
  type QuizQuestionInput,
  type QuizStatsDto,
  type QuizSummaryDto,
} from '@pvh/shared';
import { assertPermission, can } from '../../common/guards/permission.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { parseId } from '../../common/utils/parse-id.js';
import { sanitizeContent, stripHtml } from '../../common/utils/sanitize-content.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { StorageService } from '../../infrastructure/storage/storage.service.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { MediaService } from '../media/media.service.js';
import type { ImagePresignInput, ManageQuery, QuestionsInput, QuizInput, StatusInput } from './dto/quizzes.dto.js';
import { distribution, teacherScope, teacherTargetProblem } from './quiz-rules.js';
import { QuizAttemptsService } from './quiz-attempts.service.js';

export const QUIZ_INCLUDE = {
  subject: { select: { name: true } },
  libraryItem: { select: { title: true } },
  creator: { select: { fullName: true } },
  classes: { select: { classId: true, class: { select: { name: true } } } },
  _count: { select: { questions: true, attempts: true } },
} satisfies Prisma.QuizInclude;
export type QuizRow = Prisma.QuizGetPayload<{ include: typeof QUIZ_INCLUDE }>;

export const canAuthor = (user: AuthUser) => {
  if (!can(user, 'quiz:create') && !can(user, 'quiz:manage')) assertPermission(user, 'quiz:create');
};

export function toSummary(q: QuizRow): QuizSummaryDto {
  return {
    id: q.id.toString(),
    title: q.title,
    description: q.description,
    subjectId: q.subjectId.toString(),
    subjectName: q.subject.name,
    gradeLevel: q.gradeLevel,
    audience: q.audience as QuizSummaryDto['audience'],
    audienceLabel: libraryAudienceLabel(q.audience, q.gradeLevels, q.classes.map((c) => c.class.name).sort()),
    durationMinutes: q.durationMinutes,
    maxAttempts: q.maxAttempts,
    questionCount: q._count.questions,
    status: q.status,
    libraryItemId: q.libraryItemId?.toString() ?? null,
    libraryItemTitle: q.libraryItem?.title ?? null,
    createdByName: q.creator.fullName,
    updatedAt: q.updatedAt.toISOString(),
  };
}

// Trắc nghiệm ôn tập – phía người soạn (bước 22). Giáo viên (quiz:create) chỉ soạn môn mình dạy, giao cho khối/lớp mình
// dạy môn đó, chỉ sửa quiz của mình; thủ thư/BGH (quiz:manage) quản lý mọi quiz. Câu hỏi khoá khi đã có lượt làm.
// Không đụng tới bảng scores: kết quả chỉ để ôn tập.
@Injectable()
export class QuizzesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly storage: StorageService,
    private readonly media: MediaService,
    private readonly attempts: QuizAttemptsService,
  ) {}

  async formOptions(user: AuthUser): Promise<QuizFormOptionsDto> {
    canAuthor(user);
    const manage = can(user, 'quiz:manage');
    const libraryItems = await this.prisma.libraryItem.findMany({
      where: { status: 'PUBLISHED' },
      select: { id: true, title: true },
      orderBy: { title: 'asc' },
      take: 500,
    });
    let subjects: QuizFormOptionsDto['subjects'];
    if (manage) {
      const year = await this.prisma.schoolYear.findFirst({ where: { isCurrent: true }, select: { id: true } });
      const [all, classes] = await Promise.all([
        this.prisma.subject.findMany({ orderBy: { name: 'asc' } }),
        year ? this.prisma.schoolClass.findMany({ where: { schoolYearId: year.id }, include: { grade: true }, orderBy: { name: 'asc' } }) : [],
      ]);
      const cls = classes.map((c) => ({ id: c.id.toString(), name: c.name, gradeLevel: c.grade.level }));
      subjects = all.map((s) => ({ id: s.id.toString(), name: s.name, grades: [10, 11, 12], classes: cls }));
    } else {
      const scope = await teacherScope(this.prisma, BigInt(user.id));
      subjects = [...scope.entries()]
        .map(([id, s]) => ({
          id,
          name: s.name,
          grades: [...s.grades].sort((a, b) => a - b),
          classes: s.classes.map((c) => ({ id: c.id.toString(), name: c.name, gradeLevel: c.gradeLevel })).sort((a, b) => a.name.localeCompare(b.name, 'vi')),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    }
    return { canManage: manage, subjects, libraryItems: libraryItems.map((i) => ({ id: i.id.toString(), title: i.title })) };
  }

  // Quiz của tôi; người quản lý xem được tất cả.
  async list(user: AuthUser, query: ManageQuery): Promise<QuizSummaryDto[]> {
    canAuthor(user);
    if (query.scope === 'all') assertPermission(user, 'quiz:manage');
    const rows = await this.prisma.quiz.findMany({
      where: { ...(query.scope === 'mine' ? { createdBy: BigInt(user.id) } : {}), ...(query.status ? { status: query.status } : {}) },
      include: QUIZ_INCLUDE,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 300,
    });
    return rows.map(toSummary);
  }

  // Bản đầy đủ có đáp án đúng: chỉ người soạn hoặc người quản lý.
  async get(user: AuthUser, id: string): Promise<QuizEditDto> {
    return this.toEdit(await this.editable(user, id));
  }

  async create(user: AuthUser, input: QuizInput, ip?: string): Promise<QuizEditDto> {
    canAuthor(user);
    const data = await this.fields(user, input);
    const row = await this.prisma.quiz.create({
      data: { ...data.scalars, createdBy: BigInt(user.id), classes: { create: data.classIds.map((classId) => ({ classId })) } },
      include: QUIZ_INCLUDE,
    });
    await this.record(user, 'quiz.create', row, ip);
    return this.toEdit(row);
  }

  async update(user: AuthUser, id: string, input: QuizInput, ip?: string): Promise<QuizEditDto> {
    const quiz = await this.editable(user, id);
    const data = await this.fields(user, input);
    if (quiz._count.attempts > 0 && (data.scalars.subjectId !== quiz.subjectId || data.scalars.gradeLevel !== quiz.gradeLevel)) {
      throw new ConflictException('Đã có học sinh làm bài nên không đổi được môn hoặc khối');
    }
    const row = await this.prisma.quiz.update({
      where: { id: quiz.id },
      data: { ...data.scalars, classes: { deleteMany: {}, create: data.classIds.map((classId) => ({ classId })) } },
      include: QUIZ_INCLUDE,
    });
    await this.record(user, 'quiz.update', row, ip);
    return this.toEdit(row);
  }

  // Thay toàn bộ câu hỏi. Đã có lượt làm thì khoá (đổi câu sẽ làm sai kết quả và thống kê đã có).
  async setQuestions(user: AuthUser, id: string, input: QuestionsInput, ip?: string): Promise<QuizEditDto> {
    const quiz = await this.editable(user, id);
    this.assertQuestionsEditable(quiz);
    const questions = input.questions.map((q) => this.cleanQuestion(q));
    await this.prisma.$transaction(async (tx) => {
      await tx.quizQuestion.deleteMany({ where: { quizId: quiz.id } });
      await this.insertQuestions(tx, quiz.id, questions, 0);
      await tx.quiz.update({ where: { id: quiz.id }, data: { updatedAt: new Date() } });
    });
    const row = await this.prisma.quiz.findUniqueOrThrow({ where: { id: quiz.id }, include: QUIZ_INCLUDE });
    await this.record(user, 'quiz.questions', row, ip, { questions: questions.length });
    return this.toEdit(row);
  }

  // Thêm câu hỏi vào cuối (nhập Excel). Gọi sau khi đã kiểm tra quyền và khoá.
  async appendQuestions(user: AuthUser, id: string, questions: QuizQuestionInput[], ip?: string): Promise<QuizEditDto> {
    const quiz = await this.editable(user, id);
    this.assertQuestionsEditable(quiz);
    if (quiz._count.questions + questions.length > QUIZ_MAX_QUESTIONS) throw new BadRequestException(`Tối đa ${QUIZ_MAX_QUESTIONS} câu mỗi bộ`);
    const cleaned = questions.map((q) => this.cleanQuestion(q));
    await this.prisma.$transaction(async (tx) => {
      const last = await tx.quizQuestion.aggregate({ where: { quizId: quiz.id }, _max: { position: true } });
      await this.insertQuestions(tx, quiz.id, cleaned, (last._max.position ?? 0));
      await tx.quiz.update({ where: { id: quiz.id }, data: { updatedAt: new Date() } });
    });
    const row = await this.prisma.quiz.findUniqueOrThrow({ where: { id: quiz.id }, include: QUIZ_INCLUDE });
    await this.record(user, 'quiz.import', row, ip, { added: cleaned.length });
    return this.toEdit(row);
  }

  async setStatus(user: AuthUser, id: string, input: StatusInput, ip?: string): Promise<QuizEditDto> {
    const quiz = await this.editable(user, id);
    if (quiz.status === input.status) return this.toEdit(quiz);
    if (input.status === 'PUBLISHED' && quiz._count.questions === 0) throw new BadRequestException('Chưa có câu hỏi nào để công bố');
    if (input.status === 'DRAFT' && quiz._count.attempts > 0) {
      throw new ConflictException('Đã có học sinh làm bài: hãy ẩn bộ câu hỏi thay vì chuyển về nháp');
    }
    const { count } = await this.prisma.quiz.updateMany({
      where: { id: quiz.id, status: quiz.status },
      data: { status: input.status, ...(input.status === 'PUBLISHED' && !quiz.publishedAt ? { publishedAt: new Date() } : {}) },
    });
    if (count !== 1) throw new ConflictException('Bộ câu hỏi vừa được người khác thay đổi, hãy tải lại');
    const row = await this.prisma.quiz.findUniqueOrThrow({ where: { id: quiz.id }, include: QUIZ_INCLUDE });
    const action = input.status === 'PUBLISHED' ? 'quiz.publish' : input.status === 'ARCHIVED' ? 'quiz.archive' : 'quiz.unpublish';
    await this.record(user, action, row, ip);
    return this.toEdit(row);
  }

  async remove(user: AuthUser, id: string, ip?: string): Promise<void> {
    const quiz = await this.editable(user, id);
    if (quiz._count.attempts > 0) throw new ConflictException('Đã có học sinh làm bài nên không xoá được, hãy ẩn bộ câu hỏi');
    await this.prisma.quiz.delete({ where: { id: quiz.id } });
    await this.record(user, 'quiz.delete', quiz, ip);
  }

  // Thống kê các lần đã nộp: số lượt, số học sinh, điểm trung bình, phổ điểm, câu sai nhiều nhất (bỏ trống tính là sai).
  async stats(user: AuthUser, id: string): Promise<QuizStatsDto> {
    const quiz = await this.editable(user, id);
    await this.attempts.finalizeExpired({ quizId: quiz.id });
    const [submitted, questions, answers] = await Promise.all([
      this.prisma.quizAttempt.findMany({ where: { quizId: quiz.id, submittedAt: { not: null } }, select: { studentId: true, score: true } }),
      this.prisma.quizQuestion.findMany({ where: { quizId: quiz.id }, orderBy: { position: 'asc' } }),
      this.prisma.quizAnswer.groupBy({
        by: ['questionId', 'isCorrect'],
        where: { attempt: { quizId: quiz.id, submittedAt: { not: null } }, NOT: { optionIds: { isEmpty: true } } },
        _count: { _all: true },
      }),
    ]);
    const scores = submitted.map((a) => Number(a.score));
    const total = submitted.length;
    const per = (qid: bigint, correct: boolean) =>
      answers.filter((a) => a.questionId === qid && a.isCorrect === correct).reduce((s, a) => s + a._count._all, 0);
    return {
      attempts: total,
      students: new Set(submitted.map((a) => a.studentId.toString())).size,
      average: total ? Math.round((scores.reduce((s, x) => s + x, 0) / total) * 100) / 100 : null,
      distribution: distribution(scores),
      questions: questions
        .map((q) => {
          const right = per(q.id, true);
          const answered = right + per(q.id, false);
          const wrong = total - right;
          return {
            id: q.id.toString(),
            position: q.position,
            content: stripHtml(q.content).slice(0, 200),
            answered,
            wrong,
            wrongRate: total ? Math.round((wrong / total) * 1000) / 10 : 0,
          };
        })
        .sort((a, b) => b.wrong - a.wrong || a.position - b.position),
    };
  }

  // Ảnh trong câu hỏi: luồng media công khai của bước 11 (người soạn quiz có thể không có quyền viết bài).
  presignImage(user: AuthUser, input: ImagePresignInput, ip?: string): Promise<MediaPresignDto> {
    canAuthor(user);
    return this.media.presign(user, { filename: 'cau-hoi', mimeType: input.mimeType, size: input.size }, { ip }, canAuthor);
  }

  async completeImage(user: AuthUser, id: string, ip?: string): Promise<MediaDto> {
    canAuthor(user);
    const media = await this.media.complete(user, id, { ip }, canAuthor);
    if (media.kind !== 'IMAGE') throw new BadRequestException('Chỉ chèn được ảnh vào câu hỏi');
    return media;
  }

  // ── Nội bộ ──

  // Người quản lý: mọi quiz. Giáo viên: chỉ quiz của mình VÀ môn mình còn dạy.
  async editable(user: AuthUser, id: string): Promise<QuizRow> {
    canAuthor(user);
    const quiz = await this.prisma.quiz.findUnique({ where: { id: parseId(id) }, include: QUIZ_INCLUDE });
    if (!quiz) throw new NotFoundException('Không tìm thấy bộ câu hỏi');
    if (can(user, 'quiz:manage')) return quiz;
    if (quiz.createdBy.toString() !== user.id) throw new ForbiddenException('Bạn chỉ sửa được bộ câu hỏi do mình soạn');
    const scope = await teacherScope(this.prisma, BigInt(user.id));
    if (!scope.has(quiz.subjectId.toString())) throw new ForbiddenException('Bạn không còn dạy môn của bộ câu hỏi này');
    return quiz;
  }

  private assertQuestionsEditable(quiz: QuizRow) {
    if (quiz._count.attempts > 0) {
      throw new ConflictException('Đã có học sinh làm bài nên không sửa câu hỏi được nữa (kết quả và thống kê sẽ sai). Hãy ẩn và soạn bộ mới.');
    }
  }

  private async fields(user: AuthUser, input: QuizInput) {
    const subjectId = BigInt(input.subjectId);
    const subject = await this.prisma.subject.findUnique({ where: { id: subjectId } });
    if (!subject) throw new BadRequestException('Môn học không tồn tại');
    const gradeLevels = input.audience === 'GRADE' ? [...new Set(input.gradeLevels)].sort((a, b) => a - b) : [];
    const classIds = input.audience === 'CLASS' ? [...new Set(input.classIds)].map((c) => BigInt(c)) : [];
    if (input.audience === 'GRADE' && gradeLevels.length === 0) throw new BadRequestException('Chưa chọn khối làm bài');
    if (input.audience === 'CLASS') {
      if (classIds.length === 0) throw new BadRequestException('Chưa chọn lớp làm bài');
      const year = await this.prisma.schoolYear.findFirst({ where: { isCurrent: true }, select: { id: true } });
      const found = year ? await this.prisma.schoolClass.count({ where: { id: { in: classIds }, schoolYearId: year.id } }) : 0;
      if (found !== classIds.length) throw new BadRequestException('Có lớp không thuộc năm học hiện hành');
    }
    if (!can(user, 'quiz:manage')) {
      const scope = await teacherScope(this.prisma, BigInt(user.id));
      const problem = teacherTargetProblem(scope.get(input.subjectId), { audience: input.audience, gradeLevel: input.gradeLevel, gradeLevels, classIds });
      if (problem) throw new ForbiddenException(problem);
    }
    const libraryItemId = input.libraryItemId ? BigInt(input.libraryItemId) : null;
    if (libraryItemId && !(await this.prisma.libraryItem.count({ where: { id: libraryItemId } }))) {
      throw new BadRequestException('Tài liệu thư viện không tồn tại');
    }
    return {
      scalars: {
        title: stripHtml(input.title),
        description: input.description ? stripHtml(input.description) : null,
        subjectId,
        gradeLevel: input.gradeLevel,
        audience: input.audience,
        gradeLevels,
        durationMinutes: input.durationMinutes ?? null,
        maxAttempts: input.maxAttempts ?? null,
        shuffleQuestions: input.shuffleQuestions,
        shuffleOptions: input.shuffleOptions,
        showAnswers: input.showAnswers,
        libraryItemId,
      },
      classIds,
    };
  }

  // Nội dung câu hỏi: HTML làm sạch, chỉ giữ ảnh/video thuộc kho của hệ thống. Đáp án, giải thích: văn bản thường.
  private cleanQuestion(q: QuizQuestionInput): QuizQuestionInput {
    const content = sanitizeContent(q.content, (url) => this.storage.mediaKindOfUrl(url));
    if (!stripHtml(content) && !/<img\b/i.test(content)) throw new BadRequestException('Có câu hỏi trống sau khi làm sạch nội dung');
    const options = q.options.map((o) => ({ content: stripHtml(o.content), correct: o.correct }));
    if (options.some((o) => !o.content)) throw new BadRequestException('Có đáp án để trống');
    if (!options.some((o) => o.correct)) throw new BadRequestException('Mỗi câu phải có ít nhất một đáp án đúng');
    return { content, explanation: q.explanation ? stripHtml(q.explanation) || null : null, options };
  }

  private async insertQuestions(tx: Prisma.TransactionClient, quizId: bigint, questions: QuizQuestionInput[], after: number) {
    for (const [i, q] of questions.entries()) {
      await tx.quizQuestion.create({
        data: {
          quizId,
          position: after + i + 1,
          content: q.content,
          explanation: q.explanation,
          options: { create: q.options.map((o, j) => ({ position: j + 1, content: o.content, isCorrect: o.correct })) },
        },
      });
    }
  }

  private async toEdit(row: QuizRow): Promise<QuizEditDto> {
    const questions = await this.prisma.quizQuestion.findMany({
      where: { quizId: row.id },
      include: { options: { orderBy: { position: 'asc' } } },
      orderBy: { position: 'asc' },
    });
    return {
      ...toSummary(row),
      questionCount: questions.length,
      gradeLevels: row.gradeLevels,
      classIds: row.classes.map((c) => c.classId.toString()),
      shuffleQuestions: row.shuffleQuestions,
      shuffleOptions: row.shuffleOptions,
      showAnswers: row.showAnswers,
      attemptCount: row._count.attempts,
      questions: questions.map((q) => ({
        id: q.id.toString(),
        content: q.content,
        explanation: q.explanation,
        options: q.options.map((o) => ({ id: o.id.toString(), content: o.content, correct: o.isCorrect })),
      })),
    };
  }

  private record(user: AuthUser, action: string, row: QuizRow, ip?: string, extra: Record<string, unknown> = {}) {
    return this.audit.record({
      userId: user.id,
      channel: 'web',
      action,
      targetType: 'quiz',
      targetId: row.id.toString(),
      params: { title: row.title, subject: row.subject.name, status: QUIZ_STATUS_NAMES[row.status], ...extra },
      ok: true,
      ip,
    });
  }
}
