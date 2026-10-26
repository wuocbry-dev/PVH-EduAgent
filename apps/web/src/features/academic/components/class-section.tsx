"use client";

import { GENDER_NAMES, USER_STATUS_NAMES } from "@pvh/shared";
import { useState, type FormEvent } from "react";
import { errorClass, inputClass } from "@/shared/ui/form-styles";
import {
  createClass,
  deleteClass,
  listClasses,
  listClassStudents,
  listGrades,
  listSchoolYears,
  listTeachers,
  transferStudent,
  updateClass,
} from "../api/academic-api";
import { errorText, useData } from "@/shared/lib/use-data";

const smallButton = "rounded border border-black/20 px-3 py-1 text-sm dark:border-white/20";

export function ClassSection() {
  const years = useData(listSchoolYears, undefined);
  const grades = useData(listGrades, undefined);
  const teachers = useData(listTeachers, undefined);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const yearId = selectedYear ?? years.data?.find((y) => y.isCurrent)?.id ?? "";
  const classes = useData(listClasses, yearId);
  const [openClass, setOpenClass] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      classes.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    void run(async () => {
      await createClass({
        name: String(data.get("name")).trim(),
        gradeLevel: Number(data.get("gradeLevel")),
        subjectCombo: String(data.get("subjectCombo")).trim() || null,
        homeroomTeacherId: String(data.get("homeroomTeacherId")) || null,
      });
      form.reset();
    });
  }

  const shownError = error ?? classes.error ?? years.error;

  return (
    <section className="space-y-4" aria-label="Lớp học">
      {shownError && <p className={errorClass}>{shownError}</p>}

      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span>Năm học</span>
        <select value={yearId} onChange={(e) => setSelectedYear(e.target.value)} className={`${inputClass} w-auto`}>
          {years.data?.map((y) => (
            <option key={y.id} value={y.id}>
              {y.name}
              {y.isCurrent ? " (hiện hành)" : ""}
            </option>
          ))}
        </select>
      </label>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-black/10 dark:border-white/15">
            <tr>
              <th className="py-2 pr-4">Lớp</th>
              <th className="py-2 pr-4">Khối</th>
              <th className="py-2 pr-4">Tổ hợp môn</th>
              <th className="py-2 pr-4">Chủ nhiệm</th>
              <th className="py-2 pr-4">Sĩ số</th>
              <th className="py-2">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10 dark:divide-white/15">
            {classes.data?.map((c) => (
              <tr key={c.id} className="align-top">
                <td className="py-2 pr-4 font-medium">{c.name}</td>
                <td className="py-2 pr-4">{c.gradeLevel}</td>
                <td className="py-2 pr-4">{c.subjectCombo ?? ""}</td>
                <td className="py-2 pr-4">
                  <select
                    aria-label={`Chủ nhiệm lớp ${c.name}`}
                    value={c.homeroomTeacherId ?? ""}
                    onChange={(e) => run(() => updateClass(c.id, { homeroomTeacherId: e.target.value || null }))}
                    className={`${inputClass} w-48`}
                  >
                    <option value="">— Chưa có —</option>
                    {teachers.data?.map((t) => (
                      <option key={t.userId} value={t.userId}>
                        {t.fullName} ({t.teacherCode})
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2 pr-4">{c.studentCount}</td>
                <td className="space-y-2 py-2">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={smallButton} onClick={() => setOpenClass(openClass === c.id ? null : c.id)}>
                      {openClass === c.id ? "Ẩn học sinh" : "Xem học sinh"}
                    </button>
                    <button
                      type="button"
                      className={smallButton}
                      onClick={() => {
                        const name = prompt("Tên lớp mới:", c.name)?.trim();
                        if (name && name !== c.name) void run(() => updateClass(c.id, { name }));
                      }}
                    >
                      Đổi tên
                    </button>
                    <button
                      type="button"
                      className={smallButton}
                      onClick={() => confirm(`Xóa lớp ${c.name}?`) && run(() => deleteClass(c.id))}
                    >
                      Xóa
                    </button>
                  </div>
                  {openClass === c.id && (
                    <ClassStudents classId={c.id} classes={classes.data ?? []} onChanged={classes.reload} />
                  )}
                </td>
              </tr>
            ))}
            {classes.data?.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 opacity-70">
                  Năm học này chưa có lớp.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <form onSubmit={onAdd} className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-sm">
          <span>Tên lớp</span>
          <input name="name" required maxLength={20} placeholder="10A1" className={`${inputClass} w-28`} />
        </label>
        <label className="space-y-1 text-sm">
          <span>Khối</span>
          <select name="gradeLevel" className={`${inputClass} w-auto`}>
            {grades.data?.map((g) => (
              <option key={g.id} value={g.level}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>Tổ hợp môn (tuỳ chọn)</span>
          <input name="subjectCombo" maxLength={100} className={`${inputClass} w-48`} />
        </label>
        <label className="space-y-1 text-sm">
          <span>Chủ nhiệm (tuỳ chọn)</span>
          <select name="homeroomTeacherId" className={`${inputClass} w-48`}>
            <option value="">— Chưa có —</option>
            {teachers.data?.map((t) => (
              <option key={t.userId} value={t.userId}>
                {t.fullName} ({t.teacherCode})
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded bg-foreground px-4 py-2 text-background">
          Thêm lớp (năm hiện hành)
        </button>
      </form>
    </section>
  );
}

function ClassStudents({
  classId,
  classes,
  onChanged,
}: {
  classId: string;
  classes: { id: string; name: string; schoolYearId: string }[];
  onChanged: () => void;
}) {
  const students = useData(listClassStudents, classId);
  const [error, setError] = useState<string | null>(null);
  const current = classes.find((c) => c.id === classId);
  const targets = classes.filter((c) => c.id !== classId && c.schoolYearId === current?.schoolYearId);

  async function move(userId: string, target: string) {
    if (!target) return;
    setError(null);
    try {
      await transferStudent(userId, target);
      students.reload();
      onChanged();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <div className="space-y-2 rounded border border-black/10 p-2 text-xs dark:border-white/15">
      {(error ?? students.error) && <p className={errorClass}>{error ?? students.error}</p>}
      {students.data?.length === 0 && <p className="opacity-70">Lớp chưa có học sinh.</p>}
      <ul className="max-h-72 space-y-1 overflow-y-auto">
        {students.data?.map((s) => (
          <li key={s.userId} className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{s.studentCode}</span>
            <span>{s.fullName}</span>
            {s.gender && <span className="opacity-60">{GENDER_NAMES[s.gender]}</span>}
            {s.status !== "ACTIVE" && <span className="opacity-60">· {USER_STATUS_NAMES[s.status]}</span>}
            <select
              aria-label={`Chuyển ${s.fullName} sang lớp`}
              value=""
              onChange={(e) => move(s.userId, e.target.value)}
              className="ml-auto rounded border border-black/20 bg-transparent px-1 py-0.5 dark:border-white/20"
            >
              <option value="">Chuyển lớp…</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </div>
  );
}
