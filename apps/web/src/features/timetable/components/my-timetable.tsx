"use client";

import { TIMETABLE_DAY_NAMES } from "@pvh/shared";
import { useState } from "react";
import { useData } from "@/shared/lib/use-data";
import { errorClass } from "@/shared/ui/form-styles";
import { getMyUnavailability, getMyWeek, saveMyUnavailability } from "../api/timetable-api";
import { WeekGrid } from "./week-grid";

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

// Thời khoá biểu của tôi: giáo viên thấy các tiết mình dạy, học sinh thấy lịch lớp mình. `withUnavailability`: giáo viên đăng ký tiết bận.
export function MyTimetable({ withUnavailability = false }: { withUnavailability?: boolean }) {
  const [date, setDate] = useState("");
  const week = useData(getMyWeek, date);

  if (week.error) return <p className={errorClass}>{week.error}</p>;
  if (!week.data) return <p className="text-sm opacity-60">Đang tải…</p>;
  const current = week.data;

  return (
    <div className="space-y-8">
      <WeekGrid
        week={current}
        showClass={withUnavailability}
        onShift={(n) => setDate(addDays(date || current.weekStart, 7 * n))}
        onToday={() => setDate("")}
      />
      {withUnavailability && <UnavailabilityEditor frame={current.frame} />}
    </div>
  );
}

// Giáo viên đăng ký tiết bận: chỉ để Ban giám hiệu tham khảo khi xếp lịch (không chặn).
function UnavailabilityEditor({ frame }: { frame: { days: number[]; periods: { no: number }[] } }) {
  const mine = useData(getMyUnavailability, undefined);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = picked ?? new Set(mine.data?.map((u) => `${u.day}:${u.period}`) ?? []);

  function toggle(day: number, period: number) {
    const next = new Set(current);
    const key = `${day}:${period}`;
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setPicked(next);
    setMessage(null);
  }

  async function save() {
    setError(null);
    try {
      const slots = [...current].map((k) => {
        const [day, period] = k.split(":").map(Number);
        return { day: day!, period: period! };
      });
      await saveMyUnavailability(slots);
      setPicked(null);
      mine.reload();
      setMessage("Đã lưu tiết bận.");
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <section className="space-y-3 print:hidden" aria-label="Đăng ký tiết bận">
      <h2 className="text-lg font-semibold">Đăng ký tiết bận</h2>
      <p className="max-w-2xl text-sm opacity-70">
        Đánh dấu các tiết bạn không thể dạy. Thông tin này chỉ để Ban giám hiệu tham khảo khi xếp lịch; nếu cần xếp vào tiết bận, họ sẽ phải xác nhận
        và việc đó được ghi nhật ký.
      </p>
      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr>
              <th className="p-1" />
              {frame.days.map((d) => (
                <th key={d} className="p-1 font-medium">
                  {TIMETABLE_DAY_NAMES[d]?.replace("Thứ ", "T")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {frame.periods.map((p) => (
              <tr key={p.no}>
                <th className="p-1 text-left font-normal">Tiết {p.no}</th>
                {frame.days.map((d) => (
                  <td key={d} className="p-1 text-center">
                    <input
                      type="checkbox"
                      checked={current.has(`${d}:${p.no}`)}
                      onChange={() => toggle(d, p.no)}
                      aria-label={`${TIMETABLE_DAY_NAMES[d]} tiết ${p.no} bận`}
                      className="size-5"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className={errorClass}>{error}</p>}
      {message && <p className="text-sm text-green-700">{message}</p>}
      <button type="button" onClick={save} disabled={picked === null} className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-50">
        Lưu tiết bận
      </button>
    </section>
  );
}
