"use client";

import type { EventDto } from "@pvh/shared";
import { useState, type FormEvent } from "react";
import { fromDateTimeLocal, toDateTimeLocal } from "@/shared/lib/format";
import { buttonClass, errorClass, inputClass } from "@/shared/ui/form-styles";
import { createEvent, deleteEvent, updateEvent } from "../api/events-api";

interface Props {
  // Có `event` thì là sửa, không thì là thêm mới với giờ gợi ý `defaultStart` (datetime-local).
  event?: EventDto;
  defaultStart?: string;
  onSaved: () => void;
  onCancel: () => void;
}

export function EventForm({ event, defaultStart, onSaved, onCancel }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body = {
      title: String(form.get("title")),
      location: String(form.get("location")) || null,
      startAt: fromDateTimeLocal(String(form.get("startAt"))),
      endAt: fromDateTimeLocal(String(form.get("endAt"))),
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
    if (!event || !confirm(`Xóa sự kiện "${event.title}"?`)) return;
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
    <form onSubmit={onSubmit} className="max-w-xl space-y-4 rounded border border-black/10 p-4 dark:border-white/15">
      <h2 className="text-lg font-semibold">{event ? "Sửa sự kiện" : "Thêm sự kiện"}</h2>
      <label className="block space-y-1 text-sm">
        <span>Tên sự kiện</span>
        <input name="title" defaultValue={event?.title} required maxLength={255} className={inputClass} />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Địa điểm</span>
        <input name="location" defaultValue={event?.location ?? ""} maxLength={255} className={inputClass} />
      </label>
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
        <button type="button" onClick={onCancel} className="rounded border border-black/20 px-4 py-2 dark:border-white/20">
          Hủy
        </button>
        {event && (
          <button type="button" disabled={pending} onClick={remove} className="rounded border border-red-400 px-4 py-2 text-red-600">
            Xóa
          </button>
        )}
      </div>
    </form>
  );
}
