"use client";

import { useState } from "react";
import { ApiError } from "@/shared/lib/api-client";
import { errorClass, inputClass } from "@/shared/ui/form-styles";
import { createAssignment, deleteAssignment, updateAssignment } from "../api/teaching-api";
import type { TeachingContext } from "./context";

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

// Thao tác có thể cần xác nhận dạy chéo tổ: API trả 409 kèm lời nhắc, người dùng đồng ý thì gửi lại.
async function withCrossConfirm<T>(run: (confirmed: boolean) => Promise<T>): Promise<T | undefined> {
  try {
    return await run(false);
  } catch (err) {
    if (err instanceof ApiError && err.status === 409 && err.message.includes("confirmCrossDepartment")) {
      const message = err.message.replace(/ Gửi confirmCrossDepartment=true.*$/, "");
      if (!confirm(`${message}\n\nVẫn giao dạy chéo tổ?`)) return undefined;
      return run(true);
    }
    throw err;
  }
}

// Bảng phân công theo lớp: hàng là môn, cột là giáo viên và số tiết; ô thiếu/thừa tô màu cảnh báo.
export function ClassView({ ctx }: { ctx: TeachingContext }) {
  const { summary, assignments, readOnly, scope, semesters } = ctx;
  const [classId, setClassId] = useState(summary.classes[0]?.classId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [extraSubject, setExtraSubject] = useState("");
  const cls = summary.classes.find((c) => c.classId === classId);
  const semesterId = scope.semesterId || null;
  const semesterName = semesters.find((s) => s.id === scope.semesterId)?.name ?? "cả năm";

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      ctx.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  const rows = cls?.subjects ?? [];
  // Môn đã có dòng (định mức hoặc phân công) và môn có thể thêm.
  const listed = new Set(rows.map((r) => r.subjectId));
  const addable = ctx.subjects.filter((s) => !listed.has(s.id));
  const extra = ctx.subjects.find((s) => s.id === extraSubject);
  const shown =
    extra && !listed.has(extra.id)
      ? [...rows, { subjectId: extra.id, subjectCode: extra.code, subjectName: extra.name, requiredPeriods: 0, assignedPeriods: 0, teachers: [] }]
      : rows;

  return (
    <section className="space-y-3" aria-label="Phân công theo lớp">
      {error && <p className={errorClass}>{error}</p>}
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span>Lớp</span>
          <select value={classId} onChange={(e) => setClassId(e.target.value)} className={`${inputClass} w-auto`}>
            {summary.classes.map((c) => (
              <option key={c.classId} value={c.classId}>
                {c.className}
              </option>
            ))}
          </select>
        </label>
        {cls && (
          <p className="text-sm">
            Đã phân công <strong>{cls.assignedPeriods}</strong>/{cls.requiredPeriods} tiết/tuần ({semesterName})
          </p>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-black/10 dark:border-white/15">
            <tr>
              <th className="py-2 pr-3">Môn</th>
              <th className="py-2 pr-3">Định mức</th>
              <th className="py-2 pr-3">Giáo viên</th>
              <th className="py-2 pr-3">Số tiết</th>
              <th className="py-2 pr-3">Tình trạng</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10 dark:divide-white/15">
            {shown.map((row) => {
              const a = assignments.find(
                (x) => x.classId === classId && x.subjectId === row.subjectId && (x.semesterId === null || x.semesterId === semesterId),
              );
              const status =
                row.requiredPeriods > 0 && row.teachers.length === 0
                  ? { label: "Chưa có giáo viên", cls: "bg-red-500/15" }
                  : row.requiredPeriods > 0 && row.assignedPeriods < row.requiredPeriods
                    ? { label: `Thiếu ${row.requiredPeriods - row.assignedPeriods} tiết`, cls: "bg-red-500/15" }
                    : row.requiredPeriods > 0 && row.assignedPeriods > row.requiredPeriods
                      ? { label: `Thừa ${row.assignedPeriods - row.requiredPeriods} tiết`, cls: "bg-yellow-500/15" }
                      : row.requiredPeriods === 0 && a
                        ? { label: "Môn chưa có định mức", cls: "bg-yellow-500/15" }
                        : { label: row.requiredPeriods > 0 ? "Đủ" : "", cls: "" };
              return (
                <tr key={row.subjectId} className={status.cls}>
                  <td className="py-2 pr-3 font-medium">{row.subjectName}</td>
                  <td className="py-2 pr-3">{row.requiredPeriods || "—"}</td>
                  <td className="py-2 pr-3">
                    <select
                      disabled={readOnly}
                      aria-label={`Giáo viên môn ${row.subjectName}`}
                      value={a?.teacherId ?? ""}
                      onChange={(e) => {
                        const teacherId = e.target.value;
                        if (!teacherId) return;
                        void run(() =>
                          withCrossConfirm((confirmed) =>
                            a
                              ? updateAssignment(a.id, { teacherId, confirmCrossDepartment: confirmed })
                              : createAssignment({
                                  classId,
                                  subjectId: row.subjectId,
                                  teacherId,
                                  semesterId,
                                  periodsPerWeek: row.requiredPeriods || 2,
                                  confirmCrossDepartment: confirmed,
                                }),
                          ),
                        );
                      }}
                      className={`${inputClass} w-56`}
                    >
                      <option value="">— Chưa có —</option>
                      {summary.teachers.map((t) => (
                        <option key={t.teacherId} value={t.teacherId}>
                          {t.teacherName} ({t.teacherCode}){t.departmentName ? ` · ${t.departmentName}` : ""}
                        </option>
                      ))}
                    </select>
                    {a?.crossDepartment && <span className="ml-2 text-xs text-amber-700">dạy chéo tổ</span>}
                    {a && a.semesterId === null && semesterId && <span className="ml-2 text-xs opacity-60">(cả năm)</span>}
                  </td>
                  <td className="py-2 pr-3">
                    {a ? (
                      <input
                        key={`${a.id}:${a.periodsPerWeek}`}
                        type="number"
                        min={1}
                        max={10}
                        disabled={readOnly}
                        defaultValue={a.periodsPerWeek}
                        aria-label={`Số tiết môn ${row.subjectName}`}
                        onBlur={(e) => {
                          const value = Number(e.target.value);
                          if (value !== a.periodsPerWeek) void run(() => updateAssignment(a.id, { periodsPerWeek: value }));
                        }}
                        className={`${inputClass} w-20`}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 pr-3">{status.label}</td>
                  <td className="py-2">
                    {a && !readOnly && (
                      <button
                        type="button"
                        className="underline"
                        onClick={() => confirm(`Bỏ phân công ${row.subjectName} của lớp?`) && run(() => deleteAssignment(a.id))}
                      >
                        Bỏ
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 opacity-70">
                  Chưa có định mức môn cho khối này. Đặt ở tab «Định mức môn».
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!readOnly && addable.length > 0 && (
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <span>Giao thêm môn chưa có định mức:</span>
          <select value={extraSubject} onChange={(e) => setExtraSubject(e.target.value)} className={`${inputClass} w-auto`}>
            <option value="">— Chọn môn —</option>
            {addable.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </section>
  );
}
