import {
  MEDIA_IMAGE_MIME_TYPES,
  QUIZ_AUDIENCES,
  QUIZ_MAX_OPTIONS,
  QUIZ_MAX_QUESTIONS,
  QUIZ_MIN_OPTIONS,
  QUIZ_OPTION_MAX,
  QUIZ_QUESTION_MAX,
  QUIZ_STATUSES,
  QUIZ_TITLE_MAX,
} from '@pvh/shared';
import { z } from 'zod';

const id = z.string().regex(/^\d{1,18}$/, 'Mã không hợp lệ');

export const quizSchema = z.object({
  title: z.string().trim().min(1, 'Chưa nhập tên bộ câu hỏi').max(QUIZ_TITLE_MAX),
  description: z
    .string()
    .trim()
    .max(2000)
    .nullish()
    .transform((v) => v || null),
  subjectId: id,
  gradeLevel: z.number().int().min(10).max(12),
  audience: z.enum(QUIZ_AUDIENCES).default('GRADE'),
  gradeLevels: z.array(z.number().int().min(10).max(12)).max(3).default([]),
  classIds: z.array(id).max(100).default([]),
  durationMinutes: z.number().int().min(1).max(300).nullish(),
  maxAttempts: z.number().int().min(1).max(100).nullish(),
  shuffleQuestions: z.boolean().default(false),
  shuffleOptions: z.boolean().default(false),
  showAnswers: z.boolean().default(true),
  libraryItemId: id.nullish(),
});
export type QuizInput = z.infer<typeof quizSchema>;

export const questionSchema = z.object({
  content: z.string().trim().min(1, 'Câu hỏi chưa có nội dung').max(QUIZ_QUESTION_MAX),
  explanation: z
    .string()
    .trim()
    .max(QUIZ_QUESTION_MAX)
    .nullish()
    .transform((v) => v || null),
  options: z
    .array(z.object({ content: z.string().trim().min(1, 'Có đáp án để trống').max(QUIZ_OPTION_MAX), correct: z.boolean() }))
    .min(QUIZ_MIN_OPTIONS, `Mỗi câu cần ít nhất ${QUIZ_MIN_OPTIONS} đáp án`)
    .max(QUIZ_MAX_OPTIONS, `Mỗi câu tối đa ${QUIZ_MAX_OPTIONS} đáp án`)
    .refine((o) => o.some((x) => x.correct), 'Mỗi câu phải có ít nhất một đáp án đúng'),
});

export const questionsSchema = z.object({
  questions: z.array(questionSchema).max(QUIZ_MAX_QUESTIONS, `Tối đa ${QUIZ_MAX_QUESTIONS} câu`),
});
export type QuestionsInput = z.infer<typeof questionsSchema>;

export const statusSchema = z.object({ status: z.enum(QUIZ_STATUSES) });
export type StatusInput = z.infer<typeof statusSchema>;

export const manageQuerySchema = z.object({
  scope: z.enum(['mine', 'all']).default('mine'),
  status: z.enum(QUIZ_STATUSES).optional(),
});
export type ManageQuery = z.infer<typeof manageQuerySchema>;

export const availableQuerySchema = z.object({ libraryItemId: id.optional() });
export type AvailableQuery = z.infer<typeof availableQuerySchema>;

export const answerSchema = z.object({
  questionId: id,
  optionIds: z.array(id).max(QUIZ_MAX_OPTIONS),
});
export type AnswerInput = z.infer<typeof answerSchema>;

export const submitSchema = z.object({ answers: z.array(answerSchema).max(QUIZ_MAX_QUESTIONS).default([]) });
export type SubmitInput = z.infer<typeof submitSchema>;

export const imagePresignSchema = z.object({
  mimeType: z.enum(MEDIA_IMAGE_MIME_TYPES, { error: 'Ảnh phải là JPEG, PNG, WebP hoặc GIF' }),
  size: z.number().int().positive(),
});
export type ImagePresignInput = z.infer<typeof imagePresignSchema>;
