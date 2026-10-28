"use client";

import { CLASS_SESSION_NAMES, CLASS_SESSIONS, GENDER_NAMES, USER_STATUS_NAMES, type ClassSessions } from "@pvh/shared";
import { useState, type FormEvent } from "react";
import { errorClass, inputClass } from "@/shared/ui/form-styles";
import {
  createClass,
  deleteClass,
  listClasses,
  listClassStudents,
  listGrades,
  listSchoolYears,
  setSessionsBulk,
  listTeachers,
  transferStudent,
  updateClass,
} from "../api/academic-api";
import { errorText, useData } from "@/shared/lib/use-data";
import { Table, useConfirm } from "@/shared/ui";

const smallButton = "rounded-xl border border-border-strong px-3 py-1 text-sm";

export function ClassSection() {
  const ask = useConfirm();
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

      <Table>
        <thead className="border-b border-border">
          <tr>
            <th className="py-2 pr-4">Lớp</th>
            <th className="py-2 pr-4">Khối</th>
            <th className="py-2 pr-4">Tổ hợp môn</th>
            <th className="py-2 pr-4">Chủ nhiệm</th>
            <th className="py-2 pr-4">Sĩ số</th>
            <th className="py-2 pr-4">Buổi học</th>
            <th className="py-2">Thao tác</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
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
              <td className="py-2 pr-4">
                <select
                  aria-label={`Buổi học lớp ${c.name}`}
                  value={c.sessions}
                  onChange={(e) => run(() => updateClass(c.id, { sessions: e.target.value as ClassSessions }))}
                  className={`${inputClass} w-40`}
                >
                  {CLASS_SESSIONS.map((x) => (
                    <option key={x} value={x}>
                      {CLASS_SESSION_NAMES[x]}
                    </option>
                  ))}
                </select>
              </td>
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
                    onClick={async () => (await ask(`Xóa lớp ${c.name}?`)) && run(() => deleteClass(c.id))}
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
              <td colSpan={7} className="py-4 text-muted">
                Năm học này chưa có lớp.
              </td>
            </tr>
          )}
        </tbody>
      </Table>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          const grade = Number(data.get("grade"));
          if (await ask(`Đặt buổi học của mọi lớp khối ${grade} trong năm học đang chọn?`)) {
            void run(() => setSessionsBulk({ schoolYearId: yearId || undefined, gradeLevel: grade, sessions: String(data.get("sessions")) }));
          }
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <label className="space-y-1 text-sm">
          <span>Chỉnh buổi học hàng loạt: khối</span>
          <select name="grade" className={`${inputClass} w-auto`}>
            {[10, 11, 12].map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>học</span>
          <select name="sessions" defaultValue="BOTH" className={`${inputClass} w-auto`}>
            {CLASS_SESSIONS.map((x) => (
              <option key={x} value={x}>
                {CLASS_SESSION_NAMES[x]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-xl border border-border-strong px-4 py-2">
          Áp dụng cho cả khối
        </button>
      </form>

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
        <button type="submit" className="rounded-xl bg-primary px-4 py-2 text-primary-foreground">
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
    <div className="space-y-2 rounded-xl border border-border p-2 text-xs">
      {(error ?? students.error) && <p className={errorClass}>{error ?? students.error}</p>}
      {students.data?.length === 0 && <p className="text-muted">Lớp chưa có học sinh.</p>}
      <ul className="max-h-72 space-y-1 overflow-y-auto">
        {students.data?.map((s) => (
          <li key={s.userId} className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{s.studentCode}</span>
            <span>{s.fullName}</span>
            {s.gender && <span className="text-muted">{GENDER_NAMES[s.gender]}</span>}
            {s.status !== "ACTIVE" && <span className="text-muted">· {USER_STATUS_NAMES[s.status]}</span>}
            <select
              aria-label={`Chuyển ${s.fullName} sang lớp`}
              value=""
              onChange={(e) => move(s.userId, e.target.value)}
              className="ml-auto rounded-xl border border-border-strong bg-transparent px-1 py-0.5"
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
