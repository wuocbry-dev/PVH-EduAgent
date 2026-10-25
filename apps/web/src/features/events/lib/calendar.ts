import type { EventDto } from "@pvh/shared";

export interface CalendarDay {
  date: Date;
  inMonth: boolean;
}

// Lưới lịch tháng 6 tuần × 7 ngày, tuần bắt đầu từ thứ Hai (giờ địa phương của trình duyệt).
export function monthGrid(year: number, month: number): CalendarDay[] {
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(year, month, 1 - offset + i);
    return { date, inMonth: date.getMonth() === month };
  });
}

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// Sự kiện diễn ra trong ngày `date` (kể cả sự kiện kéo dài nhiều ngày).
export function eventsOnDay(events: EventDto[], date: Date): EventDto[] {
  const start = dayStart(date);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
  return events.filter((e) => new Date(e.startAt) < end && new Date(e.endAt) > start);
}

export const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const;
