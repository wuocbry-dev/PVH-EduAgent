"use client";

import { TEACHING_SAMPLE_NOTE } from "@pvh/shared";
import { useState } from "react";
import { errorClass, inputClass } from "@/shared/ui/form-styles";
import { setClassQuota, setGradeQuota } from "../api/teaching-api";
import type { TeachingContext } from "./context";

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

// Định mức số tiết/tuần của môn theo khối (và ghi đè cho từng lớp). Ô trống = chưa đặt.
export function QuotaView({ ctx }: { ctx: TeachingContext }) {
  const [level, setLevel] = useState(10);
  const [classId, setClassId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const yearId = ctx.scope.schoolYearId;
  const cls = ctx.classes.find((c) => c.id === classId);

  const gradeValue = (lv: number, subjectId: string) =>
    ctx.quotas.grades.find((g) => g.gradeLevel === lv)?.quotas.find((q) => q.subjectId === subjectId)?.periodsPerWeek;
  const overrideValue = (subjectId: string) =>
    ctx.quotas.classOverrides.find((o) => o.classId === classId && o.subjectId === subjectId)?.periodsPerWeek;

  async function save(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      ctx.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  const parse = (v: string) => (v.trim() === "" ? null : Number(v));

  return (
    <section className="space-y-6" aria-label="Định mức môn">
      <p className="max-w-3xl rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm">{TEACHING_SAMPLE_NOTE}</p>
      {error && <p className={errorClass}>{error}</p>}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Số tiết/tuần theo khối</h2>
        <div className="flex gap-2" role="tablist" aria-label="Khối">
          {[10, 11, 12].map((lv) => (
            <button
              key={lv}
              type="button"
              role="tab"
              aria-selected={lv === level}
              onClick={() => setLevel(lv)}
              className={`rounded-xl border px-3 py-1 text-sm ${lv === level ? "border-primary bg-primary text-primary-foreground" : "border-border-strong"}`}
            >
              Khối {lv}
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ctx.subjects.map((s) => (
            <label key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-1 text-sm">
              <span>{s.name}</span>
              <input
                key={`${level}:${s.id}:${gradeValue(level, s.id) ?? ""}`}
                type="number"
                min={0}
                max={10}
                disabled={ctx.readOnly}
                defaultValue={gradeValue(level, s.id) ?? ""}
                aria-label={`Số tiết ${s.name} khối ${level}`}
                onBlur={(e) => {
                  const next = parse(e.target.value);
                  if (next !== (gradeValue(level, s.id) ?? null)) {
                    void save(() => setGradeQuota({ schoolYearId: yearId, gradeLevel: level, subjectId: s.id, periodsPerWeek: next }));
                  }
                }}
                className={`${inputClass} w-16`}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Ghi đè cho một lớp (lớp chuyên, tổ hợp khác)</h2>
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <span>Lớp</span>
          <select value={classId} onChange={(e) => setClassId(e.target.value)} className={`${inputClass} w-auto`}>
            <option value="">— Chọn lớp —</option>
            {ctx.classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {cls && (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ctx.subjects.map((s) => (
              <label key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-1 text-sm">
                <span>{s.name}</span>
                <input
                  key={`${classId}:${s.id}:${overrideValue(s.id) ?? ""}`}
                  type="number"
                  min={0}
                  max={10}
                  disabled={ctx.readOnly}
                  placeholder={String(gradeValue(cls.gradeLevel, s.id) ?? "—")}
                  defaultValue={overrideValue(s.id) ?? ""}
                  aria-label={`Số tiết ${s.name} lớp ${cls.name}`}
                  onBlur={(e) => {
                    const next = parse(e.target.value);
                    if (next !== (overrideValue(s.id) ?? null)) {
                      void save(() => setClassQuota({ classId, subjectId: s.id, periodsPerWeek: next }));
                    }
                  }}
                  className={`${inputClass} w-16`}
                />
              </label>
            ))}
          </div>
        )}
        {cls && <p className="text-xs text-muted">Ô trống dùng số của khối (hiện mờ trong ô). Nhập 0 nếu lớp không học môn đó.</p>}
      </div>
    </section>
  );
}
