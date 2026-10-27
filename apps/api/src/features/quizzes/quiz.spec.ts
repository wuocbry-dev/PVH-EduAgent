import { isAnswerCorrect, parseCorrectLetters, QUIZ_SUBMIT_GRACE_SEC, quizScore } from '@pvh/shared';
import { parseQuestionRow } from './quiz-import.service.js';
import { acceptsAnswers, canTake, distribution, grade, shuffled, teacherTargetProblem } from './quiz-rules.js';

describe('trắc nghiệm: chấm điểm', () => {
  it('câu một đáp án: đúng khi chọn đúng đáp án đó', () => {
    expect(isAnswerCorrect(['2'], ['2'])).toBe(true);
    expect(isAnswerCorrect(['1'], ['2'])).toBe(false);
    expect(isAnswerCorrect([], ['2'])).toBe(false);
    expect(isAnswerCorrect(['1', '2'], ['2'])).toBe(false); // chọn thừa
  });

  it('câu nhiều đáp án: phải đúng hết và không chọn sai mới được điểm', () => {
    expect(isAnswerCorrect(['1', '3'], ['3', '1'])).toBe(true);
    expect(isAnswerCorrect(['1'], ['1', '3'])).toBe(false); // thiếu
    expect(isAnswerCorrect(['1', '3', '4'], ['1', '3'])).toBe(false); // thừa
    expect(isAnswerCorrect(['1', '1', '3'], ['1', '3'])).toBe(true); // trùng lặp không tính
  });

  it('điểm thang 10 làm tròn 2 chữ số; chấm cả bài', () => {
    expect(quizScore(2, 3)).toBe(6.67);
    expect(quizScore(3, 3)).toBe(10);
    expect(quizScore(0, 0)).toBe(0);
    const r = grade([
      { questionId: 1n, selected: [11n], correct: [11n] },
      { questionId: 2n, selected: [21n], correct: [21n, 23n] },
      { questionId: 3n, selected: [], correct: [31n] },
    ]);
    expect(r.correctCount).toBe(1);
    expect([...r.perQuestion.entries()]).toEqual([['1', true], ['2', false], ['3', false]]);
    expect(distribution([0, 1.9, 2, 5, 7.99, 8, 10])).toEqual([2, 1, 1, 1, 2]);
  });
});

describe('trắc nghiệm: đối tượng làm bài và phạm vi giáo viên', () => {
  const quiz = (over: Partial<Parameters<typeof canTake>[1]>) => ({ status: 'PUBLISHED', audience: 'GRADE', gradeLevels: [10], classIds: [], ...over });
  const hs10 = { classId: 1n, gradeLevel: 10 };
  const hs11 = { classId: 2n, gradeLevel: 11 };

  it('học sinh chỉ làm bài toàn trường, khối mình, lớp mình; nháp/đã ẩn thì không', () => {
    expect(canTake(hs10, quiz({}))).toBe(true);
    expect(canTake(hs11, quiz({}))).toBe(false);
    expect(canTake(hs11, quiz({ audience: 'CLASS', classIds: [2n] }))).toBe(true);
    expect(canTake(hs10, quiz({ audience: 'CLASS', classIds: [2n] }))).toBe(false);
    expect(canTake(null, quiz({ audience: 'ALL' }))).toBe(true);
    expect(canTake(null, quiz({}))).toBe(false);
    for (const status of ['DRAFT', 'ARCHIVED']) expect(canTake(hs10, quiz({ status }))).toBe(false);
  });

  it('giáo viên chỉ soạn môn mình dạy, giao cho khối/lớp mình dạy môn đó, không giao toàn trường', () => {
    const toan = { grades: new Set([10]), classes: [{ id: 5n }] };
    const t = (over: object) => ({ audience: 'GRADE' as const, gradeLevel: 10, gradeLevels: [10], classIds: [], ...over });
    expect(teacherTargetProblem(toan, t({}))).toBeNull();
    expect(teacherTargetProblem(toan, t({ audience: 'CLASS', gradeLevels: [], classIds: [5n] }))).toBeNull();
    expect(teacherTargetProblem(undefined, t({}))).toMatch(/môn mình được phân công/);
    expect(teacherTargetProblem(toan, t({ gradeLevel: 11, gradeLevels: [11] }))).toMatch(/khối/);
    expect(teacherTargetProblem(toan, t({ gradeLevels: [10, 11] }))).toMatch(/khối mình dạy/);
    expect(teacherTargetProblem(toan, t({ audience: 'CLASS', classIds: [6n] }))).toMatch(/lớp mình dạy/);
    expect(teacherTargetProblem(toan, t({ audience: 'ALL' }))).toMatch(/khối hoặc lớp/);
  });
});

describe('trắc nghiệm: hạn nộp, xáo trộn', () => {
  it('nhận câu trả lời đến hạn + thời gian bù mạng; không có hạn thì luôn nhận', () => {
    const now = new Date('2026-10-28T08:00:00Z');
    expect(acceptsAnswers(null, now)).toBe(true);
    expect(acceptsAnswers(new Date(now.getTime() - (QUIZ_SUBMIT_GRACE_SEC - 1) * 1000), now)).toBe(true);
    expect(acceptsAnswers(new Date(now.getTime() - (QUIZ_SUBMIT_GRACE_SEC + 1) * 1000), now)).toBe(false);
  });

  it('xáo trộn giữ nguyên các phần tử', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const out = shuffled(items);
    expect([...out].sort((a, b) => a - b)).toEqual(items);
    expect(items).toEqual(Array.from({ length: 20 }, (_, i) => i)); // không sửa mảng gốc
  });
});

describe('trắc nghiệm: đọc dòng Excel', () => {
  const row = (cells: Record<string, string>, formula = false) => ({ row: 2, cells, formula });

  it('đáp án đúng "A, C" → hai đáp án đúng; nội dung câu hỏi được thoát HTML', () => {
    const { question, row: r } = parseQuestionRow(row({ question: 'Số nào <b>nguyên tố</b>?', A: '2', B: '4', C: '7', correct: 'a, c' }));
    expect(r).toMatchObject({ status: 'OK', optionCount: 3, correct: 'A, C' });
    expect(question!.content).toBe('<p>Số nào &lt;b&gt;nguyên tố&lt;/b&gt;?</p>');
    expect(question!.options.map((o) => o.correct)).toEqual([true, false, true]);
    expect(parseCorrectLetters('B;D', 4)).toEqual([1, 3]);
  });

  it('báo lỗi tiếng Việt cho dòng sai', () => {
    const err = (cells: Record<string, string>, formula = false) => parseQuestionRow(row(cells, formula)).row.message;
    expect(err({ question: '', A: '1', B: '2', correct: 'A' })).toMatch(/Thiếu nội dung/);
    expect(err({ question: 'X', A: '1', B: '', correct: 'A' })).toMatch(/A và B/);
    expect(err({ question: 'X', A: '1', B: '', C: '3', correct: 'A' })).toMatch(/liền nhau/);
    expect(err({ question: 'X', A: '1', B: '2', correct: 'C' })).toMatch(/Đáp án đúng/);
    expect(err({ question: 'X', A: '1', B: '2', correct: '' })).toMatch(/Đáp án đúng/);
    expect(err({ question: 'X', A: '1', B: '2', correct: 'A' }, true)).toMatch(/công thức/);
  });
});
