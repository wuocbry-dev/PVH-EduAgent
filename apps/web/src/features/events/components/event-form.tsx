"use client";

import { AUDIENCE_NAMES, AUDIENCES, type Audience, type EventDto } from "@pvh/shared";
import { useState, type FormEvent } from "react";
import { useData } from "@/shared/lib/use-data";
import { fromDateTimeLocal, toDateTimeLocal } from "@/shared/lib/format";
import { buttonClass, errorClass, inputClass } from "@/shared/ui/form-styles";
import { createEvent, deleteEvent, getEventTargets, updateEvent } from "../api/events-api";
import { useConfirm } from "@/shared/ui";

interface Props {
  // Có `event` thì là sửa, không thì là thêm mới với giờ gợi ý `defaultStart` (datetime-local).
  event?: EventDto;
  defaultStart?: string;
  onSaved: () => void;
  onCancel: () => void;
}

export function EventForm({ event, defaultStart, onSaved, onCancel }: Props) {
  const ask = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [audience, setAudience] = useState<Audience>(event?.audience ?? "SCHOOL");
  const targets = useData(getEventTargets, undefined);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body = {
      title: String(form.get("title")),
      location: String(form.get("location")) || null,
      startAt: fromDateTimeLocal(String(form.get("startAt"))),
      endAt: fromDateTimeLocal(String(form.get("endAt"))),
      audience,
      gradeLevel: audience === "GRADE" ? Number(form.get("gradeLevel")) : null,
      classId: audience === "CLASS" ? String(form.get("classId")) : null,
    };
    setPending(true);
    setError(null);
    try {
      if (event) await updateEvent(event.id, body);
      else await createEvent(body);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!event || !(await ask(`Xóa sự kiện "${event.title}"?`))) return;
    setPending(true);
    setError(null);
    try {
      await deleteEvent(event.id);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-4 rounded-xl border border-border p-4">
      <h2 className="text-lg font-semibold">{event ? "Sửa sự kiện" : "Thêm sự kiện"}</h2>
      <label className="block space-y-1 text-sm">
        <span>Tên sự kiện</span>
        <input name="title" defaultValue={event?.title} required maxLength={255} className={inputClass} />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Địa điểm</span>
        <input name="location" defaultValue={event?.location ?? ""} maxLength={255} className={inputClass} />
      </label>
      <div className="flex flex-wrap gap-4">
        <label className="block space-y-1 text-sm">
          <span>Dành cho</span>
          <select value={audience} onChange={(e) => setAudience(e.target.value as Audience)} className={`${inputClass} w-auto`}>
            {AUDIENCES.map((a) => (
              <option key={a} value={a}>
                {AUDIENCE_NAMES[a]}
              </option>
            ))}
          </select>
        </label>
        {audience === "GRADE" && (
          <label className="block space-y-1 text-sm">
            <span>Khối</span>
            <select name="gradeLevel" defaultValue={event?.gradeLevel ?? 10} className={`${inputClass} w-auto`}>
              {[10, 11, 12].map((g) => (
                <option key={g} value={g}>
                  Khối {g}
                </option>
              ))}
            </select>
          </label>
        )}
        {audience === "CLASS" && (
          <label className="block space-y-1 text-sm">
            <span>Lớp</span>
            <select name="classId" required defaultValue={event?.classId ?? undefined} className={`${inputClass} w-auto`}>
              {targets.data?.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {audience !== "SCHOOL" && <p className="text-xs text-muted">Sự kiện này chỉ hiện trong cổng của đúng đối tượng, không hiện trên website công khai.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">
          <span>Bắt đầu</span>
          <input
            name="startAt"
            type="datetime-local"
            defaultValue={event ? toDateTimeLocal(event.startAt) : defaultStart}
            required
            className={inputClass}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span>Kết thúc</span>
          <input
            name="endAt"
            type="datetime-local"
            defaultValue={event ? toDateTimeLocal(event.endAt) : undefined}
            required
            className={inputClass}
          />
        </label>
      </div>
      {error && <p className={errorClass}>{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={`${buttonClass} w-auto`}>
          {event ? "Lưu thay đổi" : "Thêm sự kiện"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-xl border border-border-strong px-4 py-2">
          Hủy
        </button>
        {event && (
          <button type="button" disabled={pending} onClick={remove} className="rounded-xl border border-danger/40 px-4 py-2 text-danger">
            Xóa
          </button>
        )}
      </div>
    </form>
  );
}
