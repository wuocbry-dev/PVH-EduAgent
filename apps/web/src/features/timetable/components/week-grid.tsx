"use client";

import { TIMETABLE_DAY_NAMES, type ViewSlotDto, type WeekViewDto } from "@pvh/shared";
import { useState } from "react";
import { Table } from "@/shared/ui";

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const fmt = (date: string) => date.split("-").reverse().slice(0, 2).join("/");

function SlotText({ s, showClass }: { s: ViewSlotDto; showClass: boolean }) {
  if (s.fixedName) {
    return (
      <p className="italic text-muted">
        {s.fixedName}
        {showClass && s.className ? ` · ${s.className}` : ""}
      </p>
    );
  }
  return (
    <div className="leading-tight">
      <p className="font-medium">{s.subjectName}</p>
      <p className="text-xs text-muted">
        {showClass ? `${s.className}` : ""}
        {showClass && s.teacherName ? " · " : ""}
        {s.teacherName ?? ""}
        {s.roomName ? ` · ${s.roomName}` : ""}
      </p>
    </div>
  );
}

// Lịch tuần: bảng thứ × tiết trên máy tính (ngày hôm nay được làm nổi bật), danh sách theo từng ngày trên điện thoại.
// `showClass`: hiện tên lớp trong ô (lịch giáo viên); lịch của lớp thì hiện tên giáo viên. Có nút chuyển tuần và in.
export function WeekGrid({
  week,
  showClass,
  onShift,
  onToday,
}: {
  week: WeekViewDto;
  showClass: boolean;
  onShift: (weeks: number) => void;
  onToday: () => void;
}) {
  const todayDay = week.days.find((d) => d.date === week.today)?.day;
  const [picked, setPicked] = useState<number | null>(null);
  const selectedDay = picked ?? todayDay ?? week.days[0]?.day ?? 1;
  const versions = [...new Set(week.days.map((d) => d.versionName).filter(Boolean))];
  const end = addDays(week.weekStart, 5);

  return (
    <section className="space-y-3" aria-label={week.title}>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <button type="button" onClick={() => onShift(-1)} className="rounded-xl border border-border-strong px-3 py-1 text-sm">
          ← Tuần trước
        </button>
        <button type="button" onClick={onToday} className="rounded-xl border border-border-strong px-3 py-1 text-sm">
          Tuần này
        </button>
        <button type="button" onClick={() => onShift(1)} className="rounded-xl border border-border-strong px-3 py-1 text-sm">
          Tuần sau →
        </button>
        <button type="button" onClick={() => window.print()} className="ml-auto rounded-xl border border-border-strong px-3 py-1 text-sm">
          In lịch
        </button>
      </div>
      <h2 className="text-lg font-semibold">{week.title}</h2>
      <p className="text-sm text-muted">
        Tuần {fmt(week.weekStart)} – {fmt(end)}
        {versions.length > 0 ? ` · ${versions.join(" → ")}` : " · chưa có thời khoá biểu được công bố"}
      </p>

      {/* Máy tính / in: bảng thứ × tiết */}
      <Table className="min-w-[640px] table-fixed" wrapperClassName="hidden md:block print:block" stickyFirstColumn>
        <thead>
          <tr>
            <th className="w-28 border border-border p-2" />
            {week.days.map((d) => (
              <th
                key={d.day}
                className={`border border-border p-2 ${d.date === week.today ? "bg-warning-soft" : ""}`}
              >
                {TIMETABLE_DAY_NAMES[d.day]}
                <span className="block text-xs font-normal text-muted">{fmt(d.date)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {week.frame.periods.map((p) => (
            <tr key={p.no}>
              <th className="border border-border p-2 align-top font-normal">
                <span className="font-medium">Tiết {p.no}</span>
                <span className="block text-xs text-muted">
                  {p.start}–{p.end}
                </span>
              </th>
              {week.days.map((d) => (
                <td
                  key={d.day}
                  className={`border border-border p-2 align-top ${d.date === week.today ? "bg-warning-soft" : ""}`}
                >
                  {d.slots
                    .filter((s) => s.period === p.no)
                    .map((s, i) => (
                      <SlotText key={i} s={s} showClass={showClass} />
                    ))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>

      {/* Điện thoại: từng ngày */}
      <div className="space-y-3 md:hidden print:hidden">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Chọn ngày">
          {week.days.map((d) => (
            <button
              key={d.day}
              type="button"
              role="tab"
              aria-selected={d.day === selectedDay}
              onClick={() => setPicked(d.day)}
              className={`rounded-full border px-3 py-1 text-sm ${
                d.day === selectedDay ? "border-primary bg-primary text-primary-foreground" : "border-border-strong"
              } ${d.date === week.today ? "ring-2 ring-warning" : ""}`}
            >
              {TIMETABLE_DAY_NAMES[d.day]?.replace("Thứ ", "T")}
              <span className="ml-1 text-xs text-muted">{fmt(d.date)}</span>
            </button>
          ))}
        </div>
        <ul className="space-y-2">
          {week.frame.periods.map((p) => {
            const slots = week.days.find((d) => d.day === selectedDay)?.slots.filter((s) => s.period === p.no) ?? [];
            return (
              <li key={p.no} className="flex gap-3 rounded-xl border border-border p-2">
                <div className="w-20 shrink-0 text-sm">
                  <p className="font-medium">Tiết {p.no}</p>
                  <p className="text-xs text-muted">
                    {p.start}–{p.end}
                  </p>
                </div>
                <div className="flex-1 text-sm">
                  {slots.length === 0 ? <p className="opacity-40">—</p> : slots.map((s, i) => <SlotText key={i} s={s} showClass={showClass} />)}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
