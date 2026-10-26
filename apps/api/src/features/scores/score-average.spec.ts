import {
  bucketOf,
  DEFAULT_SCORE_FORMULA,
  requiredRegularCount,
  roundScore,
  subjectAverage,
  yearAverage,
  type ScoreAverageEntry,
  type ScoreFormula,
} from '@pvh/shared';
import { isLocked } from './score-calendar.service.js';
import { parseFormula } from './score-formula.js';

const tx = (value: number): ScoreAverageEntry => ({ type: 'THUONG_XUYEN', value, status: 'GRADED' });
const gk = (value: number): ScoreAverageEntry => ({ type: 'GIUA_KY', value, status: 'GRADED' });
const ck = (value: number): ScoreAverageEntry => ({ type: 'CUOI_KY', value, status: 'GRADED' });

describe('điểm trung bình môn học kỳ (Thông tư 22/2021, mặc định)', () => {
  it('đủ cột: (tổng TX + 2 × GK + 3 × CK) / (số TX + 5), làm tròn 1 chữ số', () => {
    // (8 + 7 + 9 + 2×6 + 3×7) / (3 + 5) = 57 / 8 = 7,125 → 7,1
    const r = subjectAverage([tx(8), tx(7), tx(9), gk(6), ck(7)], 2);
    expect(r).toEqual({ value: 7.1, provisional: false, missing: [] });
  });

  it('làm tròn nửa lên, không lệch do số thực', () => {
    // (8,25 + 2×8,25 + 3×8,25 + 8,25 + 8,25) / 7 = 8,25 → 8,3
    expect(subjectAverage([tx(8.25), tx(8.25), gk(8.25), ck(8.25)], 1).value).toBe(8.3);
    expect(roundScore(6.45, 1)).toBe(6.5);
    expect(roundScore(7.125, 2)).toBe(7.13);
    expect(roundScore(0.1 + 0.2, 1)).toBe(0.3);
  });

  it('số cột thường xuyên tối thiểu theo số tiết/tuần: 1 → 2, 2 → 3, từ 3 trở lên hoặc chưa rõ → 4', () => {
    expect(requiredRegularCount(DEFAULT_SCORE_FORMULA, 1)).toBe(2);
    expect(requiredRegularCount(DEFAULT_SCORE_FORMULA, 2)).toBe(3);
    expect(requiredRegularCount(DEFAULT_SCORE_FORMULA, 3)).toBe(4);
    expect(requiredRegularCount(DEFAULT_SCORE_FORMULA, null)).toBe(4);
  });

  it('thiếu cột: vẫn tính trên điểm đang có nhưng đánh dấu tạm tính và nêu lý do', () => {
    const r = subjectAverage([tx(8), gk(7)], 3);
    // (8 + 2×7) / 3 = 7,33 → 7,3
    expect(r.value).toBe(7.3);
    expect(r.provisional).toBe(true);
    expect(r.missing).toEqual(['Chưa có điểm cuối kỳ', 'Thiếu 3 điểm thường xuyên (cần tối thiểu 4)']);
  });

  it('vắng có lý do không tính là 0 (chờ kiểm tra bù); miễn thì bỏ khỏi tử và mẫu, không tính là thiếu', () => {
    const absent = subjectAverage([tx(8), tx(6), { type: 'GIUA_KY', value: null, status: 'ABSENT' }, ck(7)], 1);
    expect(absent.value).toBe(roundScore((8 + 6 + 3 * 7) / 5, 1)); // 7
    expect(absent.missing).toEqual(['Vắng kiểm tra giữa kỳ (chờ kiểm tra bù)']);

    const exempt = subjectAverage([tx(9), { type: 'THUONG_XUYEN', value: null, status: 'EXEMPT' }, gk(8), ck(8)], 1);
    expect(exempt).toEqual({ value: roundScore((9 + 16 + 24) / 6, 1), provisional: false, missing: [] }); // 8,2
  });

  it('chưa có điểm nào thì không có ĐTB', () => {
    expect(subjectAverage([], 2)).toEqual({
      value: null,
      provisional: true,
      missing: ['Chưa có điểm giữa kỳ', 'Chưa có điểm cuối kỳ', 'Thiếu 3 điểm thường xuyên (cần tối thiểu 3)'],
    });
  });

  it('công thức khác mặc định: hệ số, số cột, làm tròn 2 chữ số', () => {
    const custom: ScoreFormula = {
      weights: { THUONG_XUYEN: 1, GIUA_KY: 1, CUOI_KY: 2 },
      regularMin: [{ maxPeriodsPerWeek: 4, count: 1 }],
      regularMinOther: 2,
      yearWeights: [1, 1],
      decimals: 2,
    };
    // (8 + 6 + 2×7) / 4 = 7
    expect(subjectAverage([tx(8), gk(6), ck(7)], 3, custom)).toEqual({ value: 7, provisional: false, missing: [] });
    // (9 + 2×8) / 3 = 8,333… → 8,33
    expect(subjectAverage([tx(9), ck(8)], 5, custom).value).toBe(8.33);
  });
});

describe('điểm trung bình cả năm', () => {
  const ok = (value: number) => ({ value, provisional: false, missing: [] });

  it('(HK I + 2 × HK II) / 3, làm tròn 1 chữ số', () => {
    expect(yearAverage(ok(6.5), ok(8), DEFAULT_SCORE_FORMULA)).toEqual({ value: 7.5, provisional: false, missing: [] });
    expect(yearAverage(ok(7), ok(7.2)).value).toBe(7.1); // 21,4 / 3 = 7,133
  });

  it('thiếu một học kỳ thì chưa tính; học kỳ tạm tính thì cả năm cũng tạm tính', () => {
    expect(yearAverage(ok(7), null)).toEqual({ value: null, provisional: true, missing: ['Chưa có điểm trung bình học kỳ II'] });
    const r = yearAverage({ value: 6, provisional: true, missing: ['x'] }, ok(9));
    expect(r).toEqual({ value: 8, provisional: true, missing: ['Điểm trung bình học kỳ còn tạm tính'] });
  });
});

describe('phổ điểm, công thức lưu trong cấu hình, khoá điểm', () => {
  it('chia khoảng: dưới 3,5 | 3,5–<5 | 5–<6,5 | 6,5–<8 | từ 8', () => {
    expect([0, 3.4, 3.5, 4.9, 5, 6.4, 6.5, 7.9, 8, 10].map(bucketOf)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it('giá trị cấu hình hỏng hoặc sai kiểu thì dùng mặc định', () => {
    expect(parseFormula(null)).toEqual(DEFAULT_SCORE_FORMULA);
    expect(parseFormula('không phải JSON')).toEqual(DEFAULT_SCORE_FORMULA);
    expect(parseFormula(JSON.stringify({ ...DEFAULT_SCORE_FORMULA, decimals: 5 }))).toEqual(DEFAULT_SCORE_FORMULA);
    const custom = { ...DEFAULT_SCORE_FORMULA, yearWeights: [1, 1] };
    expect(parseFormula(JSON.stringify(custom))).toEqual(custom);
  });

  it('điểm bị khoá khi học kỳ đã khoá sổ hoặc qua hạn; hạn riêng của đợt ưu tiên hơn hạn chung', () => {
    const now = Date.parse('2026-11-20T00:00:00Z');
    const past = new Date('2026-11-15T00:00:00Z');
    const future = new Date('2026-12-15T00:00:00Z');
    const gate = (locked: boolean, deadline?: Date) => ({ locked, deadlines: new Map(deadline ? [['GIUA_KY' as const, deadline]] : []) });
    expect(isLocked({ type: 'GIUA_KY', entryDeadline: null }, undefined, now)).toBe(false);
    expect(isLocked({ type: 'GIUA_KY', entryDeadline: null }, gate(false, past), now)).toBe(true);
    expect(isLocked({ type: 'GIUA_KY', entryDeadline: future }, gate(false, past), now)).toBe(false); // hạn riêng còn
    expect(isLocked({ type: 'THUONG_XUYEN', entryDeadline: null }, gate(false, past), now)).toBe(false); // hạn chung khác loại
    expect(isLocked({ type: 'GIUA_KY', entryDeadline: future }, gate(true), now)).toBe(true); // khoá sổ thắng mọi hạn
  });
});
