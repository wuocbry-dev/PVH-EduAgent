import { defaultTimetableFrame } from '@pvh/shared';
import { frameSchema, parseFrame } from './frame.js';
import { addDays, isoDay, pickEffective, supersededIds, vnToday, weekDates, weekStart, type VersionLike } from './timetable-dates.js';
import { countGaps, evaluatePlacement, type PlacementContext } from './timetable-rules.js';

describe('ngày trong thời khoá biểu (giờ Việt Nam)', () => {
  it('hôm nay theo giờ Việt Nam (UTC+7): 17:30 UTC đã là ngày hôm sau', () => {
    expect(vnToday(new Date('2026-10-26T16:59:00Z'))).toBe('2026-10-26');
    expect(vnToday(new Date('2026-10-26T17:00:00Z'))).toBe('2026-10-27');
  });

  it('thứ, đầu tuần và các ngày trong tuần', () => {
    expect(isoDay('2026-10-26')).toBe(1); // thứ Hai
    expect(isoDay('2026-11-01')).toBe(7); // Chủ nhật
    expect(weekStart('2026-10-29')).toBe('2026-10-26');
    expect(weekStart('2026-11-01')).toBe('2026-10-26');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(weekDates('2026-10-28')).toEqual([
      { day: 1, date: '2026-10-26' },
      { day: 2, date: '2026-10-27' },
      { day: 3, date: '2026-10-28' },
      { day: 4, date: '2026-10-29' },
      { day: 5, date: '2026-10-30' },
      { day: 6, date: '2026-10-31' },
    ]);
  });
});

const v = (id: string, status: VersionLike['status'], effectiveDate: string | null, semesterId = 's1'): VersionLike => ({ id, semesterId, status, effectiveDate });

describe('chọn phiên bản có hiệu lực', () => {
  const versions = [v('a', 'PUBLISHED', '2026-09-05'), v('b', 'PUBLISHED', '2026-11-02'), v('c', 'DRAFT', null), v('d', 'ARCHIVED', '2026-08-01')];

  it('ngày D dùng bản đã công bố có ngày hiệu lực lớn nhất <= D; bản nháp không bao giờ', () => {
    expect(pickEffective(versions, '2026-10-30')?.id).toBe('a'); // tuần này vẫn lịch cũ
    expect(pickEffective(versions, '2026-11-02')?.id).toBe('b'); // đúng ngày hiệu lực
    expect(pickEffective(versions, '2026-11-09')?.id).toBe('b'); // tuần sau thấy lịch mới
    expect(pickEffective(versions, '2026-08-15')?.id).toBe('d'); // lịch sử
    expect(pickEffective(versions, '2026-07-01')).toBeNull();
    expect(pickEffective([v('c', 'DRAFT', null)], '2027-01-01')).toBeNull();
  });

  it('chỉ lưu trữ bản cũ khi bản mới đã bắt đầu có hiệu lực', () => {
    expect(supersededIds(versions, '2026-10-30')).toEqual([]); // bản b chưa tới ngày
    expect(supersededIds(versions, '2026-11-02')).toEqual(['a']);
    expect(supersededIds(versions, '2026-12-01')).toEqual(['a']);
  });

  it('mỗi học kỳ tính riêng', () => {
    const mixed = [v('a', 'PUBLISHED', '2026-09-05', 's1'), v('x', 'PUBLISHED', '2027-01-18', 's2'), v('y', 'PUBLISHED', '2027-02-01', 's2')];
    expect(supersededIds(mixed, '2027-03-01')).toEqual(['x']);
  });
});

describe('khung tiết', () => {
  it('khung mặc định: 6 ngày, sáng 5 tiết từ 7:00, chiều 4 tiết từ 13:00, ra chơi dài sau tiết 2', () => {
    const f = defaultTimetableFrame();
    expect(f.days).toEqual([1, 2, 3, 4, 5, 6]);
    expect(f.periods).toHaveLength(9);
    expect(f.periods[0]).toEqual({ no: 1, session: 'MORNING', start: '07:00', end: '07:45' });
    expect(f.periods[1]).toMatchObject({ start: '07:50', end: '08:35' });
    expect(f.periods[2]).toMatchObject({ start: '08:55' }); // sau tiết 2: nghỉ 20 phút
    expect(f.periods[4]).toMatchObject({ session: 'MORNING' });
    expect(f.periods[5]).toEqual({ no: 6, session: 'AFTERNOON', start: '13:00', end: '13:45' });
    expect(frameSchema.safeParse(f).success).toBe(true);
  });

  it('từ chối khung sai: số tiết không liên tục, giờ ngược, sáng sau chiều, ngày trùng, quá nhiều tiết', () => {
    const ok = defaultTimetableFrame();
    const bad = (mutate: (f: ReturnType<typeof defaultTimetableFrame>) => void) => {
      const f = structuredClone(ok);
      mutate(f);
      return frameSchema.safeParse(f).success;
    };
    expect(bad((f) => (f.periods[1]!.no = 5))).toBe(false);
    expect(bad((f) => (f.periods[0]!.end = '06:00'))).toBe(false);
    expect(bad((f) => (f.periods[1]!.start = '07:30'))).toBe(false); // bắt đầu trước khi tiết trước kết thúc
    expect(bad((f) => (f.periods[2]!.session = 'AFTERNOON'))).toBe(false); // chiều rồi lại sáng
    expect(bad((f) => (f.days = [1, 1]))).toBe(false);
    expect(bad((f) => (f.days = []))).toBe(false);
    expect(bad((f) => (f.days = [7]))).toBe(false);
    expect(bad((f) => (f.periods[0]!.start = '7h'))).toBe(false);
    expect(bad((f) => (f.periods = []))).toBe(false);
  });

  it('giá trị lưu bị hỏng thì dùng khung mặc định', () => {
    expect(parseFrame('không phải json')).toEqual(defaultTimetableFrame());
    expect(parseFrame('{"days":[1],"periods":[]}')).toEqual(defaultTimetableFrame());
    expect(parseFrame(JSON.stringify({ days: [1, 2], periods: [{ no: 1, session: 'MORNING', start: '07:00', end: '07:45' }] })).days).toEqual([1, 2]);
  });
});

const ctx = (over: Partial<PlacementContext> = {}): PlacementContext => ({
  frame: defaultTimetableFrame(),
  assignmentInSemester: true,
  className: '10A1',
  gradeLevel: 10,
  sessions: 'BOTH',
  teacherName: 'Cô Toán',
  subjectName: 'Toán',
  periodsPerWeek: 3,
  placedCount: 0,
  fixed: [],
  classSlots: [],
  teacherSlots: [],
  homeroomClasses: [],
  room: null,
  unavailable: [],
  ...over,
});

describe('kiểm tra một ô trên lưới', () => {
  it('ô trống: đặt được, không cảnh báo', () => {
    expect(evaluatePlacement(ctx(), 2, 3)).toEqual({ blocking: [], warnings: [] });
  });

  it('giáo viên đã dạy lớp khác cùng tiết → chặn, nêu rõ lớp và môn', () => {
    const r = evaluatePlacement(ctx({ teacherSlots: [{ day: 2, period: 3, className: '10A2', subjectName: 'Toán' }] }), 2, 3);
    expect(r.blocking).toEqual(['Cô Toán đang dạy lớp 10A2 (Toán)']);
  });

  it('lớp đã có môn khác cùng tiết, phòng đang bận → chặn', () => {
    const r = evaluatePlacement(
      ctx({
        classSlots: [{ day: 2, period: 3, subjectName: 'Văn' }],
        room: { name: 'Phòng Tin 1', slots: [{ day: 2, period: 3, className: '10A5' }] },
      }),
      2,
      3,
    );
    expect(r.blocking).toEqual(['Lớp 10A1 đã có tiết Văn', 'Phòng Phòng Tin 1 đang được lớp 10A5 dùng']);
    // Ô khác thì không bị ảnh hưởng.
    expect(evaluatePlacement(ctx({ classSlots: [{ day: 2, period: 3, subjectName: 'Văn' }] }), 2, 4).blocking).toEqual([]);
  });

  it('tiết cố định: cả trường chặn mọi lớp, theo khối chỉ chặn khối đó', () => {
    const fixed = [
      { name: 'Chào cờ', kind: 'SCHOOL' as const, day: 1, period: 1, gradeLevel: null },
      { name: 'Giáo dục địa phương', kind: 'SCHOOL' as const, day: 3, period: 2, gradeLevel: 11 },
    ];
    expect(evaluatePlacement(ctx({ fixed }), 1, 1).blocking[0]).toContain('Chào cờ');
    expect(evaluatePlacement(ctx({ fixed }), 3, 2).blocking).toEqual([]); // lớp khối 10 không bị
    expect(evaluatePlacement(ctx({ fixed, gradeLevel: 11 }), 3, 2).blocking[0]).toContain('khối 11');
  });

  it('giáo viên chủ nhiệm bận ở tiết sinh hoạt lớp của lớp mình', () => {
    const fixed = [{ name: 'Sinh hoạt lớp', kind: 'CLASS_MEETING' as const, day: 6, period: 5, gradeLevel: null }];
    const r = evaluatePlacement(ctx({ fixed, homeroomClasses: [{ className: '10A3', gradeLevel: 10 }] }), 6, 5);
    expect(r.blocking.some((m) => m.includes('chủ nhiệm lớp 10A3'))).toBe(true);
  });

  it('lớp chỉ học buổi sáng không xếp được tiết chiều; ngoài khung tiết/ngày bị chặn', () => {
    expect(evaluatePlacement(ctx({ sessions: 'MORNING' }), 2, 6).blocking[0]).toContain('chỉ học buổi sáng');
    expect(evaluatePlacement(ctx({ sessions: 'AFTERNOON' }), 2, 1).blocking[0]).toContain('chỉ học buổi chiều');
    expect(evaluatePlacement(ctx(), 2, 12).blocking[0]).toContain('không nằm trong khung');
    expect(evaluatePlacement(ctx(), 7, 1).blocking[0]).toContain('không nằm trong khung');
  });

  it('phân công đã đủ số tiết/tuần thì không xếp thêm', () => {
    expect(evaluatePlacement(ctx({ placedCount: 3 }), 2, 3).blocking[0]).toContain('đã đủ 3 tiết/tuần');
    expect(evaluatePlacement(ctx({ placedCount: 2 }), 2, 3).blocking).toEqual([]);
  });

  it('giáo viên đăng ký bận chỉ là cảnh báo (kèm ghi chú), không chặn', () => {
    const r = evaluatePlacement(ctx({ unavailable: [{ day: 2, period: 3, note: 'họp tổ' }] }), 2, 3);
    expect(r.blocking).toEqual([]);
    expect(r.warnings).toEqual(['Cô Toán đăng ký bận Thứ Ba tiết 3 (họp tổ)']);
  });

  it('phân công không thuộc học kỳ của phiên bản: chặn mọi ô', () => {
    expect(evaluatePlacement(ctx({ assignmentInSemester: false }), 2, 3).blocking).toEqual(['Phân công không thuộc học kỳ của phiên bản này']);
  });

  it('đếm tiết trống xen kẽ trong ngày', () => {
    expect(countGaps([])).toBe(0);
    expect(countGaps([3])).toBe(0);
    expect(countGaps([1, 2, 3])).toBe(0);
    expect(countGaps([1, 3])).toBe(1);
    expect(countGaps([5, 1, 2])).toBe(2);
  });
});
