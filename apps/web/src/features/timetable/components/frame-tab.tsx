"use client";

import { FIXED_PERIOD_KIND_NAMES, FIXED_PERIOD_KINDS, TIMETABLE_DAY_NAMES, type FixedPeriodKind, type TimetableFrameDto } from "@pvh/shared";
import { useState, type FormEvent } from "react";
import { useData } from "@/shared/lib/use-data";
import { errorClass, inputClass } from "@/shared/ui/form-styles";
import { createFixed, deleteFixed, listFixed, saveFrame } from "../api/timetable-api";
import { errorText, smallButton, type EditorContext } from "./context";
import { Table, useConfirm, useToast } from "@/shared/ui";

// Khung tiết học (BGH và ADMIN sửa được) và tiết cố định (Chào cờ, Sinh hoạt lớp…; chỉ BGH).
export function FrameTab({ ctx }: { ctx: EditorContext }) {
  const ask = useConfirm();
  const [draft, setDraft] = useState<TimetableFrameDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const fixed = useData(listFixed, undefined);
  const frame = draft ?? ctx.frame;

  function update(change: (f: TimetableFrameDto) => void) {
    const next = structuredClone(frame);
    change(next);
    next.periods.forEach((p, i) => (p.no = i + 1));
    setDraft(next);
  }

  async function onSave() {
    setError(null);
    try {
      await saveFrame(frame);
      setDraft(null);
      toast.success("Đã lưu khung tiết.");
      ctx.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function onAddFixed(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setError(null);
    try {
      await createFixed({
        name: String(data.get("name")).trim(),
        kind: String(data.get("kind")) as FixedPeriodKind,
        day: Number(data.get("day")),
        period: Number(data.get("period")),
        gradeLevel: data.get("gradeLevel") ? Number(data.get("gradeLevel")) : null,
      });
      form.reset();
      fixed.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <section className="space-y-8" aria-label="Khung tiết và tiết cố định">
      {(error ?? fixed.error) && <p className={errorClass}>{error ?? fixed.error}</p>}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Khung tiết học</h2>
        <fieldset className="flex flex-wrap gap-3 text-sm">
          <legend className="mb-1">Các ngày học</legend>
          {[1, 2, 3, 4, 5, 6].map((d) => (
            <label key={d} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={frame.days.includes(d)}
                onChange={() => update((f) => (f.days = f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d].sort((a, b) => a - b)))}
              />
              {TIMETABLE_DAY_NAMES[d]}
            </label>
          ))}
        </fieldset>
        <Table className="w-auto" wrapperClassName="w-fit max-w-full" maxHeight="none">
          <thead>
            <tr>
              <th className="p-1 text-left">Tiết</th>
              <th className="p-1 text-left">Buổi</th>
              <th className="p-1 text-left">Bắt đầu</th>
              <th className="p-1 text-left">Kết thúc</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {frame.periods.map((p, i) => (
              <tr key={i}>
                <td className="p-1">{p.no}</td>
                <td className="p-1">
                  <select value={p.session} onChange={(e) => update((f) => (f.periods[i]!.session = e.target.value as "MORNING" | "AFTERNOON"))} className={`${inputClass} w-auto`}>
                    <option value="MORNING">Sáng</option>
                    <option value="AFTERNOON">Chiều</option>
                  </select>
                </td>
                <td className="p-1">
                  <input type="time" value={p.start} onChange={(e) => update((f) => (f.periods[i]!.start = e.target.value))} className={`${inputClass} w-auto`} />
                </td>
                <td className="p-1">
                  <input type="time" value={p.end} onChange={(e) => update((f) => (f.periods[i]!.end = e.target.value))} className={`${inputClass} w-auto`} />
                </td>
                <td className="p-1">
                  <button type="button" className="underline" onClick={() => update((f) => f.periods.splice(i, 1))}>
                    Bỏ tiết
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={smallButton}
            onClick={() => {
              const last = frame.periods[frame.periods.length - 1];
              update((f) => f.periods.push({ no: f.periods.length + 1, session: last?.session ?? "MORNING", start: last?.end ?? "07:00", end: last?.end ?? "07:45" }));
            }}
          >
            Thêm tiết
          </button>
          <button type="button" className="rounded-xl bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50" disabled={!draft} onClick={onSave}>
            Lưu khung tiết
          </button>
          {draft && (
            <button type="button" className={smallButton} onClick={() => setDraft(null)}>
              Bỏ thay đổi
            </button>
          )}
        </div>
        <p className="text-xs text-muted">Không thu hẹp khung khi đang có tiết xếp ngoài khung mới (hệ thống sẽ báo). Chỉnh buổi học của từng lớp ở trang Học vụ.</p>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Tiết cố định</h2>
        <ul className="space-y-1 text-sm">
          {fixed.data?.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-3">
              <span className="font-medium">{f.name}</span>
              <span>
                {TIMETABLE_DAY_NAMES[f.day]} tiết {f.period} · {f.gradeLevel ? `khối ${f.gradeLevel}` : "cả trường"} · {FIXED_PERIOD_KIND_NAMES[f.kind]}
              </span>
              {!ctx.readOnly && (
                <button
                  type="button"
                  className="underline"
                  onClick={async () => (await ask(`Xoá tiết cố định ${f.name}?`)) && deleteFixed(f.id).then(fixed.reload).catch((err) => setError(errorText(err)))}
                >
                  Xoá
                </button>
              )}
            </li>
          ))}
          {fixed.data?.length === 0 && <li className="text-muted">Chưa có tiết cố định.</li>}
        </ul>
        {!ctx.readOnly && (
          <form onSubmit={onAddFixed} className="flex flex-wrap items-end gap-2">
            <label className="space-y-1 text-sm">
              <span>Tên</span>
              <input name="name" required maxLength={80} placeholder="Chào cờ" className={`${inputClass} w-40`} />
            </label>
            <label className="space-y-1 text-sm">
              <span>Loại</span>
              <select name="kind" className={`${inputClass} w-auto`}>
                {FIXED_PERIOD_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {FIXED_PERIOD_KIND_NAMES[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span>Thứ</span>
              <select name="day" className={`${inputClass} w-auto`}>
                {ctx.frame.days.map((d) => (
                  <option key={d} value={d}>
                    {TIMETABLE_DAY_NAMES[d]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span>Tiết</span>
              <select name="period" className={`${inputClass} w-auto`}>
                {ctx.frame.periods.map((p) => (
                  <option key={p.no} value={p.no}>
                    {p.no}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span>Áp dụng</span>
              <select name="gradeLevel" className={`${inputClass} w-auto`}>
                <option value="">Cả trường</option>
                {[10, 11, 12].map((g) => (
                  <option key={g} value={g}>
                    Khối {g}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="rounded-xl bg-primary px-4 py-2 text-primary-foreground">
              Thêm tiết cố định
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
