"use client";

import { TEACHING_ISSUE_NAMES, TEACHING_ISSUE_TYPES, type CopyAssignmentsResultDto, type TeachingIssueType } from "@pvh/shared";
import { useState } from "react";
import { errorClass, inputClass } from "@/shared/ui/form-styles";
import { useData } from "@/shared/lib/use-data";
import { copyAssignments, downloadSummary, listSemesterOptions } from "../api/teaching-api";
import { smallButton, type TeachingContext } from "./context";

// Học kỳ của năm học nguồn (chưa chọn năm thì không gọi API).
const loadSemesters = (yearId: string) => (yearId ? listSemesterOptions(yearId) : Promise.resolve([]));
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

// Cảnh báo và thống kê: theo lớp, theo tổ, toàn trường; xuất Excel; sao chép phân công từ năm học/học kỳ trước.
export function SummaryView({ ctx }: { ctx: TeachingContext }) {
  const { summary, scope } = ctx;
  const [filter, setFilter] = useState<TeachingIssueType | "">("");
  const [error, setError] = useState<string | null>(null);
  const [copyResult, setCopyResult] = useState<CopyAssignmentsResultDto | null>(null);
  const [fromYear, setFromYear] = useState("");
  const [fromSemester, setFromSemester] = useState("");
  const sourceSemesters = useData(loadSemesters, fromYear);
  const issues = summary.issues.filter((i) => !filter || i.type === filter);
  const t = summary.totals;
  const previous = ctx.years.filter((y) => y.id !== scope.schoolYearId);

  async function onCopy() {
    if (!fromYear) return;
    if (!confirm("Sao chép phân công từ năm học/học kỳ đã chọn sang phạm vi đang xem? Dòng đã có phân công sẽ được bỏ qua.")) return;
    setError(null);
    try {
      setCopyResult(
        await copyAssignments({
          from: { schoolYearId: fromYear, semesterId: fromSemester || null },
          to: { schoolYearId: scope.schoolYearId, semesterId: scope.semesterId || null },
        }),
      );
      ctx.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <section className="space-y-6" aria-label="Cảnh báo và thống kê">
      {error && <p className={errorClass}>{error}</p>}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Lớp", value: t.classes },
          { label: "Giáo viên", value: t.teachers },
          { label: "Tiết cần (định mức)", value: t.requiredPeriods },
          { label: "Tiết đã phân công", value: t.assignedPeriods },
          { label: "Lớp–môn chưa có người dạy", value: t.unassignedSubjects, alert: true },
        ].map((c) => (
          <li key={c.label} className="rounded-lg border border-black/10 p-3 dark:border-white/15">
            <p className="text-sm opacity-70">{c.label}</p>
            <p className={`text-2xl font-bold ${c.alert && c.value > 0 ? "text-red-600" : ""}`}>{c.value.toLocaleString("vi-VN")}</p>
          </li>
        ))}
      </ul>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">Cảnh báo ({issues.length})</h2>
          <select value={filter} onChange={(e) => setFilter(e.target.value as TeachingIssueType | "")} className={`${inputClass} w-auto`} aria-label="Lọc cảnh báo">
            <option value="">Mọi loại</option>
            {TEACHING_ISSUE_TYPES.map((k) => (
              <option key={k} value={k}>
                {TEACHING_ISSUE_NAMES[k]}
              </option>
            ))}
          </select>
          <button type="button" className={smallButton} onClick={() => downloadSummary(scope).catch((err) => setError(errorText(err)))}>
            Xuất Excel
          </button>
        </div>
        <ul className="max-h-96 space-y-1 overflow-y-auto text-sm">
          {issues.map((i, idx) => (
            <li key={idx} className={`rounded px-2 py-1 ${i.severity === "error" ? "bg-red-500/15" : "bg-yellow-500/15"}`}>
              <span className="mr-2 text-xs font-semibold uppercase">{TEACHING_ISSUE_NAMES[i.type]}</span>
              {i.message}
            </li>
          ))}
          {issues.length === 0 && <li className="opacity-70">Không có cảnh báo.</li>}
        </ul>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Theo tổ chuyên môn</h2>
        <table className="w-full max-w-2xl text-left text-sm">
          <thead className="border-b border-black/10 dark:border-white/15">
            <tr>
              <th className="py-2 pr-3">Tổ</th>
              <th className="py-2 pr-3">Giáo viên</th>
              <th className="py-2 pr-3">Tổng tiết</th>
              <th className="py-2">Tổng định mức</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10 dark:divide-white/15">
            {summary.departments.map((d) => (
              <tr key={d.departmentName}>
                <td className="py-1 pr-3">{d.departmentName}</td>
                <td className="py-1 pr-3">{d.teachers}</td>
                <td className="py-1 pr-3">{d.periods}</td>
                <td className="py-1">{d.quota}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Theo lớp</h2>
        <table className="w-full max-w-2xl text-left text-sm">
          <thead className="border-b border-black/10 dark:border-white/15">
            <tr>
              <th className="py-2 pr-3">Lớp</th>
              <th className="py-2 pr-3">Khối</th>
              <th className="py-2 pr-3">Cần</th>
              <th className="py-2">Đã phân công</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10 dark:divide-white/15">
            {summary.classes.map((c) => (
              <tr key={c.classId} className={c.assignedPeriods < c.requiredPeriods ? "bg-red-500/10" : ""}>
                <td className="py-1 pr-3">{c.className}</td>
                <td className="py-1 pr-3">{c.gradeLevel}</td>
                <td className="py-1 pr-3">{c.requiredPeriods}</td>
                <td className="py-1">{c.assignedPeriods}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!ctx.readOnly && (
        <div className="space-y-2 rounded border border-black/10 p-3 dark:border-white/15">
          <h2 className="text-lg font-semibold">Sao chép phân công từ năm học / học kỳ trước</h2>
          <div className="flex flex-wrap items-end gap-2">
            <label className="space-y-1 text-sm">
              <span>Từ năm học</span>
              <select value={fromYear} onChange={(e) => { setFromYear(e.target.value); setFromSemester(""); }} className={`${inputClass} w-auto`}>
                <option value="">— Chọn —</option>
                {previous.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span>Phạm vi nguồn</span>
              <select value={fromSemester} onChange={(e) => setFromSemester(e.target.value)} className={`${inputClass} w-auto`}>
                <option value="">Phân công cả năm</option>
                {sourceSemesters.data?.map((sem) => (
                  <option key={sem.id} value={sem.id}>
                    {sem.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" disabled={!fromYear} className={smallButton} onClick={onCopy}>
              Sao chép
            </button>
          </div>
          <p className="text-xs opacity-70">Đích là năm học và học kỳ đang chọn ở bộ lọc phía trên. Lớp ghép theo tên lớp.</p>
          {copyResult && (
            <div className="text-sm">
              <p>
                Đã sao chép <strong>{copyResult.copied}</strong> phân công, bỏ qua {copyResult.skipped.length}.
              </p>
              {copyResult.skipped.length > 0 && (
                <ul className="max-h-40 overflow-y-auto text-xs opacity-80">
                  {copyResult.skipped.map((s, i) => (
                    <li key={i}>
                      {s.className} · {s.subjectName}: {s.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
