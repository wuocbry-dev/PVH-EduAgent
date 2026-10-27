import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import {
  parseCorrectLetters,
  QUIZ_IMPORT_MAX_ROWS,
  QUIZ_OPTION_LETTERS,
  QUIZ_OPTION_MAX,
  QUIZ_QUESTION_MAX,
  type QuizEditDto,
  type QuizImportPreviewDto,
  type QuizImportRowDto,
  type QuizQuestionInput,
} from '@pvh/shared';
import ExcelJS from 'exceljs';
import type { AuthUser } from '../../common/types/auth-user.js';
import { RedisService } from '../../infrastructure/queue/redis.service.js';
import { readSheet, type ColumnSpec, type RawRow } from '../roster/excel.js';
import { QuizzesService } from './quizzes.service.js';

const PREVIEW_TTL_SEC = 30 * 60;

const COLUMNS: ColumnSpec[] = [
  { key: 'question', label: 'Câu hỏi', aliases: ['cauhoi', 'noidung', 'noidungcauhoi'], required: true },
  ...QUIZ_OPTION_LETTERS.map((l, i) => ({
    key: l,
    label: `Đáp án ${l}`,
    aliases: [l.toLowerCase(), `dapan${l.toLowerCase()}`, `phuongan${l.toLowerCase()}`],
    required: i < 2,
  })),
  { key: 'correct', label: 'Đáp án đúng', aliases: ['dapandung', 'dapan', 'dung'], required: true },
  { key: 'explanation', label: 'Giải thích', aliases: ['giaithich', 'loigiai'], required: false },
];

interface StoredPreview {
  actorId: string;
  quizId: string;
  questions: QuizQuestionInput[];
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Kiểm tra một dòng: câu hỏi, các đáp án liền nhau từ A (ít nhất A, B), đáp án đúng là chữ cái của đáp án có nội dung.
export function parseQuestionRow(raw: RawRow): { question: QuizQuestionInput | null; row: QuizImportRowDto } {
  const c = raw.cells;
  const text = c.question ?? '';
  const filled = QUIZ_OPTION_LETTERS.map((l) => (c[l] ?? '').trim());
  const lastFilled = filled.reduce((last, v, i) => (v ? i : last), -1);
  const options = filled.slice(0, lastFilled + 1);
  const correct = parseCorrectLetters(c.correct ?? '', options.length);
  const fail = (message: string) => ({
    question: null,
    row: { row: raw.row, status: 'ERROR' as const, message, question: text.slice(0, 120), optionCount: options.length, correct: c.correct ?? '' },
  });
  if (raw.formula) return fail('Ô có công thức Excel (không được dùng công thức)');
  if (!text) return fail('Thiếu nội dung câu hỏi');
  if (text.length > QUIZ_QUESTION_MAX) return fail('Câu hỏi quá dài');
  if (options.length < 2) return fail('Cần ít nhất đáp án A và B');
  if (options.some((o) => !o)) return fail('Các đáp án phải liền nhau từ A (không bỏ trống ở giữa)');
  if (options.some((o) => o.length > QUIZ_OPTION_MAX)) return fail('Có đáp án quá dài');
  if (!correct) return fail(`Đáp án đúng phải là chữ cái trong ${QUIZ_OPTION_LETTERS.slice(0, options.length).join(', ')} (vd. "B" hoặc "A, C")`);
  return {
    question: {
      content: `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`,
      explanation: (c.explanation ?? '').trim() || null,
      options: options.map((o, i) => ({ content: o, correct: correct.includes(i) })),
    },
    row: {
      row: raw.row,
      status: 'OK',
      message: null,
      question: text.slice(0, 120),
      optionCount: options.length,
      correct: correct.map((i) => QUIZ_OPTION_LETTERS[i]).join(', '),
    },
  };
}

// Nhập câu hỏi từ Excel (bước 22), cùng luồng với bước 14/18: tải lên → xem trước từng dòng → xác nhận (dùng một lần,
// giữ 30 phút trong Redis). Công thức không được đánh giá. Câu nhập vào được thêm vào cuối bộ câu hỏi.
@Injectable()
export class QuizImportService {
  constructor(
    private readonly quizzes: QuizzesService,
    private readonly redis: RedisService,
  ) {}

  async template(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Cau hoi');
    sheet.addRow(COLUMNS.map((c) => c.label));
    sheet.addRow(['Đạo hàm của x² là gì?', 'x', '2x', 'x²', '2', '', '', 'B', '(x^n)\' = n·x^(n-1)']);
    sheet.addRow(['Những số nào là số nguyên tố?', '2', '4', '7', '9', '', '', 'A, C', 'Chỉ chia hết cho 1 và chính nó']);
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach((col, i) => (col.width = i === 0 ? 50 : i === 7 ? 14 : i === 8 ? 40 : 18));
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async preview(user: AuthUser, quizId: string, file: Buffer): Promise<QuizImportPreviewDto> {
    const client = this.redis.client;
    if (!client) throw new ServiceUnavailableException('Nhập câu hỏi từ Excel cần Redis (REDIS_URL)');
    await this.quizzes.editable(user, quizId);
    const parsed = (await readSheet(file, COLUMNS, QUIZ_IMPORT_MAX_ROWS)).map(parseQuestionRow);
    const questions = parsed.flatMap((p) => (p.question ? [p.question] : []));
    const previewId = randomUUID();
    const stored: StoredPreview = { actorId: user.id, quizId, questions };
    await client.set(this.redis.key('quiz', 'preview', previewId), JSON.stringify(stored), 'EX', PREVIEW_TTL_SEC);
    return {
      previewId,
      expiresAt: new Date(Date.now() + PREVIEW_TTL_SEC * 1000).toISOString(),
      rows: parsed.map((p) => p.row),
      okCount: questions.length,
      errorCount: parsed.length - questions.length,
    };
  }

  // Dùng một lần, chỉ người tải lên; kiểm tra lại quyền và khoá câu hỏi lúc xác nhận. Dòng lỗi bị bỏ qua.
  async confirm(user: AuthUser, previewId: string, ip?: string): Promise<QuizEditDto> {
    const client = this.redis.client;
    if (!client) throw new ServiceUnavailableException('Nhập câu hỏi từ Excel cần Redis (REDIS_URL)');
    if (!/^[0-9a-f-]{36}$/.test(previewId)) throw new NotFoundException('Bản xem trước không tồn tại hoặc đã hết hạn');
    const key = this.redis.key('quiz', 'preview', previewId);
    const peek = await client.get(key);
    const owner = peek ? (JSON.parse(peek) as StoredPreview).actorId : null;
    const json = owner === user.id ? await client.getdel(key) : null;
    const stored = json ? (JSON.parse(json) as StoredPreview) : null;
    if (!stored) throw new NotFoundException('Bản xem trước không tồn tại hoặc đã hết hạn, hãy tải file lên lại');
    if (stored.questions.length === 0) throw new NotFoundException('File không có câu hỏi hợp lệ nào');
    return this.quizzes.appendQuestions(user, stored.quizId, stored.questions, ip);
  }
}
