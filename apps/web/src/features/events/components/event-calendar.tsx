"use client";

import type { AuthMeDto, EventDto } from "@pvh/shared";
import { useEffect, useState } from "react";
import { api } from "@/shared/lib/api-client";
import { formatDateTime, toDateTimeLocal } from "@/shared/lib/format";
import { errorClass } from "@/shared/ui/form-styles";
import { listEvents } from "../api/events-api";
import { eventsOnDay, monthGrid, WEEKDAYS } from "../lib/calendar";
import { EventForm } from "./event-form";

type Editing = { mode: "create"; start: string } | { mode: "edit"; event: EventDto } | null;

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

// F15 – lịch tháng của trường. Ai đăng nhập cũng xem; người có post:approve thêm/sửa/xóa sự kiện.
export function EventCalendar() {
  const [today] = useState(() => new Date());
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [events, setEvents] = useState<EventDto[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [version, setVersion] = useState(0);

  const grid = monthGrid(cursor.year, cursor.month);

  useEffect(() => {
    let current = true;
    api<AuthMeDto>("/auth/me")
      .then((me) => current && setCanEdit(me.permissions.includes("post:approve")))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    let current = true;
    const days = monthGrid(cursor.year, cursor.month);
    const last = days[41].date;
    const from = days[0].date;
    const to = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
    listEvents(from.toISOString(), to.toISOString())
      .then((data) => {
        if (!current) return;
        setEvents(data);
        setError(null);
      })
      .catch((err) => current && setError(errorText(err)));
    return () => {
      current = false;
    };
  }, [cursor, version]);

  function go(delta: number) {
    const d = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
  }

  // Giờ gợi ý khi thêm sự kiện vào một ngày: 08:00.
  const startOf = (date: Date) =>
    toDateTimeLocal(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 8, 0).toISOString());

  const monthEvents = (events ?? []).filter((e) => {
    const start = new Date(cursor.year, cursor.month, 1);
    const end = new Date(cursor.year, cursor.month + 1, 1);
    return new Date(e.startAt) < end && new Date(e.endAt) > start;
  });

  const navButton = "rounded border border-black/20 px-3 py-1.5 dark:border-white/20";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => go(-1)} className={navButton} aria-label="Tháng trước">
            ←
          </button>
          <h2 className="min-w-36 text-center text-lg font-semibold">
            Tháng {cursor.month + 1}/{cursor.year}
          </h2>
          <button type="button" onClick={() => go(1)} className={navButton} aria-label="Tháng sau">
            →
          </button>
          <button
            type="button"
            onClick={() => setCursor({ year: today.getFullYear(), month: today.getMonth() })}
            className={`${navButton} text-sm`}
          >
            Hôm nay
          </button>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing({ mode: "create", start: startOf(today) })}
            className="rounded bg-foreground px-4 py-2 text-background"
          >
            Thêm sự kiện
          </button>
        )}
      </div>

      {editing && canEdit && (
        <EventForm
          key={editing.mode === "edit" ? editing.event.id : `new-${editing.start}`}
          event={editing.mode === "edit" ? editing.event : undefined}
          defaultStart={editing.mode === "create" ? editing.start : undefined}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setVersion((v) => v + 1);
          }}
        />
      )}

      {error && <p className={errorClass}>{error}</p>}
      {events === null && !error && <p className="text-sm opacity-60">Đang tải…</p>}

      {events && (
        <>
          {/* Màn hình vừa trở lên: lưới tháng. */}
          <div className="hidden sm:block">
            <div className="grid grid-cols-7 border-l border-t border-black/15 text-xs dark:border-white/20">
              {WEEKDAYS.map((d) => (
                <div
                  key={d}
                  className="border-b border-r border-black/15 bg-black/5 p-1 text-center font-semibold dark:border-white/20 dark:bg-white/10"
                >
                  {d}
                </div>
              ))}
              {grid.map(({ date, inMonth }) => (
                <div
                  key={date.toISOString()}
                  className={`min-h-24 space-y-1 border-b border-r border-black/15 p-1 dark:border-white/20 ${
                    inMonth ? "" : "bg-black/5 opacity-50 dark:bg-white/5"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`px-1 ${sameDay(date, today) ? "rounded bg-brand font-bold text-white" : ""}`}>
                      {date.getDate()}
                    </span>
                    {canEdit && (
                      <button
                        type="button"
                        title="Thêm sự kiện vào ngày này"
                        aria-label={`Thêm sự kiện ngày ${date.getDate()}/${date.getMonth() + 1}`}
                        onClick={() => setEditing({ mode: "create", start: startOf(date) })}
                        className="px-1 opacity-50 hover:opacity-100"
                      >
                        +
                      </button>
                    )}
                  </div>
                  {eventsOnDay(events, date).map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      disabled={!canEdit}
                      title={`${e.title}\n${formatDateTime(e.startAt)} – ${formatDateTime(e.endAt)}${e.location ? `\n${e.location}` : ""}`}
                      onClick={() => setEditing({ mode: "edit", event: e })}
                      className="block w-full truncate rounded bg-brand px-1 py-0.5 text-left text-white disabled:cursor-default"
                    >
                      {e.title}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Điện thoại: danh sách sự kiện trong tháng. */}
          <ul className="space-y-2 sm:hidden">
            {monthEvents.map((e) => (
              <li key={e.id} className="rounded border border-black/10 p-3 dark:border-white/15">
                <p className="font-medium">{e.title}</p>
                <p className="text-xs opacity-70">
                  {formatDateTime(e.startAt)} – {formatDateTime(e.endAt)}
                  {e.location ? ` · ${e.location}` : ""}
                </p>
                {canEdit && (
                  <button type="button" className="mt-1 text-sm underline" onClick={() => setEditing({ mode: "edit", event: e })}>
                    Sửa
                  </button>
                )}
              </li>
            ))}
            {monthEvents.length === 0 && <li className="text-sm opacity-70">Không có sự kiện nào trong tháng.</li>}
          </ul>
        </>
      )}
    </div>
  );
}
