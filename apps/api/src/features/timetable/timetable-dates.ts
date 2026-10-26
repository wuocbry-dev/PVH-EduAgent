// Tính ngày cho thời khoá biểu: mọi ngày là chuỗi YYYY-MM-DD theo giờ Việt Nam (Asia/Ho_Chi_Minh); thứ Hai = 1 … Chủ nhật = 7.

const DAY_MS = 24 * 60 * 60 * 1000;

const utcMidnight = (date: string) => Date.parse(`${date}T00:00:00Z`);
const format = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// Ngày hôm nay theo giờ Việt Nam.
export function vnToday(now: Date = new Date()): string {
  return format(now.getTime() + 7 * 60 * 60 * 1000);
}

export function addDays(date: string, days: number): string {
  return format(utcMidnight(date) + days * DAY_MS);
}

// 1 = thứ Hai … 7 = Chủ nhật.
export function isoDay(date: string): number {
  const d = new Date(utcMidnight(date)).getUTCDay();
  return d === 0 ? 7 : d;
}

export function weekStart(date: string): string {
  return addDays(date, 1 - isoDay(date));
}

// Ngày thật của các thứ trong tuần chứa `date` (thứ 1..6).
export function weekDates(date: string, days: readonly number[] = [1, 2, 3, 4, 5, 6]): { day: number; date: string }[] {
  const start = weekStart(date);
  return days.map((day) => ({ day, date: addDays(start, day - 1) }));
}

export interface VersionLike {
  id: string;
  semesterId: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  effectiveDate: string | null;
}

// Phiên bản có hiệu lực vào ngày D: bản đã công bố (hoặc đã lưu trữ) có ngày hiệu lực lớn nhất <= D. Bản nháp không bao giờ.
export function pickEffective<T extends VersionLike>(versions: readonly T[], date: string): T | null {
  let best: T | null = null;
  for (const v of versions) {
    if (v.status === 'DRAFT' || !v.effectiveDate || v.effectiveDate > date) continue;
    if (!best || v.effectiveDate > best.effectiveDate!) best = v;
  }
  return best;
}

// Bản đã công bố nhưng bị bản mới hơn thay thế (bản mới đã bắt đầu có hiệu lực, effective <= today) trong cùng học kỳ:
// cần chuyển ARCHIVED. Bản mới chưa tới ngày hiệu lực thì bản cũ vẫn có hiệu lực.
export function supersededIds(versions: readonly VersionLike[], today: string): string[] {
  const bySemester = new Map<string, VersionLike[]>();
  for (const v of versions) {
    if (v.status !== 'PUBLISHED' || !v.effectiveDate || v.effectiveDate > today) continue;
    bySemester.set(v.semesterId, [...(bySemester.get(v.semesterId) ?? []), v]);
  }
  const result: string[] = [];
  for (const list of bySemester.values()) {
    const latest = pickEffective(list, today);
    for (const v of list) if (v.id !== latest?.id) result.push(v.id);
  }
  return result;
}
