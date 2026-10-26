"use client";

import { TIMETABLE_DAY_NAMES } from "@pvh/shared";
import Link from "next/link";
import { useData } from "@/shared/lib/use-data";
import { errorClass } from "@/shared/ui/form-styles";
import { getMyWeek } from "../api/timetable-api";

// Hôm nay học (dạy) gì: lấy tuần hiện tại từ thời khoá biểu đã công bố có hiệu lực, chỉ hiện ngày hôm nay.
export function TodayTimetable({ href }: { href: string }) {
  const week = useData(getMyWeek, "");
  if (week.error) return <p className={errorClass}>{week.error}</p>;
  if (!week.data) return <p className="text-sm opacity-60">Đang tải…</p>;
  const { today, days, frame } = week.data;
  const day = days.find((d) => d.date === today);
  const slots = [...(day?.slots ?? [])].sort((a, b) => a.period - b.period);
  const timeOf = (period: number) => frame.periods.find((p) => p.no === period);

  return (
    <div className="space-y-2">
      <p className="text-sm opacity-70">
        {day ? TIMETABLE_DAY_NAMES[day.day] : "Hôm nay"} · {new Date(`${today}T00:00:00`).toLocaleDateString("vi-VN")}
      </p>
      {slots.length === 0 ? (
        <p className="text-sm">Hôm nay không có tiết học nào trên thời khoá biểu.</p>
      ) : (
        <ul className="divide-y divide-black/10 rounded border border-black/10 dark:divide-white/15 dark:border-white/15">
          {slots.map((s) => {
            const t = timeOf(s.period);
            return (
              <li key={`${s.period}-${s.className}`} className="flex flex-wrap gap-x-3 px-3 py-2 text-sm">
                <span className="w-24 font-mono opacity-70">
                  Tiết {s.period}
                  {t ? ` · ${t.start}` : ""}
                </span>
                <span className="font-medium">{s.subjectName ?? s.fixedName}</span>
                {s.teacherName && <span className="opacity-70">{s.teacherName}</span>}
                {s.roomName && <span className="opacity-70">· {s.roomName}</span>}
              </li>
            );
          })}
        </ul>
      )}
      <Link href={href} className="text-sm underline">
        Xem cả tuần
      </Link>
    </div>
  );
}
