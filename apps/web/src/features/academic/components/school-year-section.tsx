"use client";

import { useState, type FormEvent } from "react";
import { errorClass, inputClass } from "@/shared/ui/form-styles";
import {
  createSchoolYear,
  createSemester,
  deleteSchoolYear,
  deleteSemester,
  listSchoolYears,
  listSemesters,
  updateSchoolYear,
} from "../api/academic-api";
import { errorText, useData } from "@/shared/lib/use-data";
import { Table, useConfirm } from "@/shared/ui";

const fmt = (iso: string) => iso.split("-").reverse().join("/");
const smallButton = "rounded-xl border border-border-strong px-3 py-1 text-sm";

export function SchoolYearSection() {
  const ask = useConfirm();
  const years = useData(listSchoolYears, undefined);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeId = selected ?? years.data?.find((y) => y.isCurrent)?.id ?? years.data?.[0]?.id ?? "";
  const semesters = useData(listSemesters, activeId);

  async function run(action: () => Promise<unknown>, after: () => void = years.reload) {
    setError(null);
    try {
      await action();
      after();
    } catch (err) {
      setError(errorText(err));
    }
  }

  function onAddYear(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    void run(async () => {
      await createSchoolYear({
        name: String(data.get("name")).trim(),
        startDate: String(data.get("startDate")),
        endDate: String(data.get("endDate")),
      });
      form.reset();
    });
  }

  function onAddSemester(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    void run(async () => {
      await createSemester({
        schoolYearId: activeId,
        number: Number(data.get("number")),
        startDate: String(data.get("startDate")),
        endDate: String(data.get("endDate")),
      });
      form.reset();
    }, semesters.reload);
  }

  const shownError = error ?? years.error ?? semesters.error;
  const taken = new Set(semesters.data?.map((s) => s.number));

  return (
    <section className="space-y-6" aria-label="Năm học và học kỳ">
      {shownError && <p className={errorClass}>{shownError}</p>}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Năm học</h2>
        <Table>
          <thead className="border-b border-border">
            <tr>
              <th className="py-2 pr-4">Năm học</th>
              <th className="py-2 pr-4">Bắt đầu</th>
              <th className="py-2 pr-4">Kết thúc</th>
              <th className="py-2 pr-4">Hiện hành</th>
              <th className="py-2">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {years.data?.map((y) => (
              <tr key={y.id} className={y.id === activeId ? "bg-surface-muted" : ""}>
                <td className="py-2 pr-4 font-medium">{y.name}</td>
                <td className="py-2 pr-4">{fmt(y.startDate)}</td>
                <td className="py-2 pr-4">{fmt(y.endDate)}</td>
                <td className="py-2 pr-4">{y.isCurrent ? "Có" : ""}</td>
                <td className="py-2"><div className="flex flex-wrap gap-2">
                  <button type="button" className={smallButton} onClick={() => setSelected(y.id)}>
                    Xem học kỳ
                  </button>
                  {!y.isCurrent && (
                    <>
                      <button
                        type="button"
                        className={smallButton}
                        onClick={() => run(() => updateSchoolYear(y.id, { isCurrent: true }))}
                      >
                        Đặt làm hiện hành
                      </button>
                      <button
                        type="button"
                        className={smallButton}
                        onClick={async () => (await ask(`Xóa năm học ${y.name}?`)) && run(() => deleteSchoolYear(y.id))}
                      >
                        Xóa
                      </button>
                    </>
                  )}
                </div></td>
              </tr>
            ))}
          </tbody>
        </Table>
        <form onSubmit={onAddYear} className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-sm">
            <span>Tên (vd. 2027-2028)</span>
            <input name="name" required pattern="\d{4}-\d{4}" className={`${inputClass} w-40`} />
          </label>
          <label className="space-y-1 text-sm">
            <span>Bắt đầu</span>
            <input name="startDate" type="date" required className={`${inputClass} w-auto`} />
          </label>
          <label className="space-y-1 text-sm">
            <span>Kết thúc</span>
            <input name="endDate" type="date" required className={`${inputClass} w-auto`} />
          </label>
          <button type="submit" className="rounded-xl bg-primary px-4 py-2 text-primary-foreground">
            Thêm năm học
          </button>
        </form>
      </div>

      {activeId && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Học kỳ của năm {years.data?.find((y) => y.id === activeId)?.name}</h2>
          <ul className="space-y-1 text-sm">
            {semesters.data?.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3">
                <span className="font-medium">{s.name}</span>
                <span>
                  {fmt(s.startDate)} – {fmt(s.endDate)}
                </span>
                <button
                  type="button"
                  className="underline"
                  onClick={async () => (await ask(`Xóa ${s.name}?`)) && run(() => deleteSemester(s.id), semesters.reload)}
                >
                  Xóa
                </button>
              </li>
            ))}
            {semesters.data?.length === 0 && <li className="text-muted">Chưa có học kỳ.</li>}
          </ul>
          {taken.size < 2 && (
            <form onSubmit={onAddSemester} className="flex flex-wrap items-end gap-2">
              <label className="space-y-1 text-sm">
                <span>Học kỳ</span>
                <select name="number" className={`${inputClass} w-auto`}>
                  {[1, 2]
                    .filter((n) => !taken.has(n))
                    .map((n) => (
                      <option key={n} value={n}>
                        Học kỳ {n === 1 ? "I" : "II"}
                      </option>
                    ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span>Bắt đầu</span>
                <input name="startDate" type="date" required className={`${inputClass} w-auto`} />
              </label>
              <label className="space-y-1 text-sm">
                <span>Kết thúc</span>
                <input name="endDate" type="date" required className={`${inputClass} w-auto`} />
              </label>
              <button type="submit" className="rounded-xl bg-primary px-4 py-2 text-primary-foreground">
                Thêm học kỳ
              </button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
