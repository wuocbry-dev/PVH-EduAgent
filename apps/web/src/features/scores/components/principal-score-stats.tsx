"use client";

import { formatScore, SCORE_BUCKETS, type ScoreStatGroupDto } from "@pvh/shared";
import { useState } from "react";
import { errorText, useData } from "@/shared/lib/use-data";
import { errorClass, inputClass } from "@/shared/ui/form-styles";
import {
  downloadClassSummary,
  downloadGradebook,
  getClassSummary,
  getGradebook,
  getScoreContext,
  getScoreStats,
  getStudentReport,
} from "../api/scores-api";
import { ClassSummaryTable, GradebookTable, smallButton, StudentReportView, tableWrap } from "./score-views";

const loadStats = (key: string) => {
  const [semesterId, grade] = key.split(":");
  return semesterId ? getScoreStats({ semesterId, gradeLevel: grade ? Number(grade) : "" }) : Promise.resolve(null);
};
const loadGradebook = (key: string) => {
  if (!key) return Promise.resolve(null);
  const [classId, subjectId, semesterId] = key.split(":") as [string, string, string];
  return getGradebook({ classId, subjectId, semesterId });
};
const loadSummary = (key: string) => {
  if (!key) return Promise.resolve(null);
  const [classId, semesterId = ""] = key.split(":") as [string, string?];
  return getClassSummary({ classId, semesterId });
};
const loadReport = (studentId: string) => (studentId ? getStudentReport(studentId) : Promise.resolve(null));

const pct = (n: number, total: number) => (total ? `${Math.round((n / total) * 1000) / 10}%` : "–");

// Bảng thống kê: mỗi dòng một nhóm (lớp–môn, môn–khối, lớp, khối) với số HS có ĐTB, ĐTB nhóm, tỉ lệ dưới 5 và phổ điểm.
function StatsTable({ title, rows, onRow }: { title: string; rows: ScoreStatGroupDto[]; onRow?: (row: ScoreStatGroupDto) => void }) {
  if (rows.length === 0) return null;
  return (
    <section className="space-y-2" aria-label={title}>
      <h3 className="font-semibold">{title}</h3>
      <div className={tableWrap}>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-black/10 dark:border-white/15">
            <tr>
              <th className="px-2 py-2">Nhóm</th>
              <th className="px-2 py-2 text-right">Số HS có ĐTB</th>
              <th className="px-2 py-2 text-right">ĐTB</th>
              <th className="px-2 py-2 text-right">Dưới 5</th>
              {SCORE_BUCKETS.map((b) => (
                <th key={b.label} className="whitespace-nowrap px-2 py-2 text-right">
                  {b.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-black/5 dark:border-white/10">
                <td className="whitespace-nowrap px-2 py-1.5">
                  {onRow ? (
                    <button type="button" className="underline" onClick={() => onRow(r)}>
                      {r.label}
                    </button>
                  ) : (
                    r.label
                  )}
                </td>
                <td className="px-2 py-1.5 text-right">
                  {r.averaged}
                  {r.provisional > 0 && <span className="ml-1 text-xs opacity-60">({r.provisional} tạm tính)</span>}
                </td>
                <td className="px-2 py-1.5 text-right">{r.mean === null ? "–" : formatScore(r.mean)}</td>
                <td className="px-2 py-1.5 text-right">
                  {r.below5} <span className="text-xs opacity-60">({pct(r.below5, r.averaged)})</span>
                </td>
                {r.buckets.map((n, i) => (
                  <td key={SCORE_BUCKETS[i]!.label} className="px-2 py-1.5 text-right">
                    {n} <span className="text-xs opacity-60">({pct(n, r.averaged)})</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// Cổng BGH: thống kê toàn trường theo điểm đã công bố (phổ điểm, tỉ lệ dưới 5, so sánh lớp/môn/khối), bấm một nhóm để
// xem sổ điểm lớp–môn hoặc bảng điểm lớp, bấm tên học sinh để xem kết quả học tập. Có xuất Excel.
export function PrincipalScoreStats() {
  const ctx = useData(getScoreContext, undefined);
  const [semesterId, setSemesterId] = useState<string | null>(null);
  const [grade, setGrade] = useState<number | "">("");
  const [gradebookKey, setGradebookKey] = useState("");
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const semester = semesterId ?? ctx.data?.currentSemesterId ?? "";
  const stats = useData(loadStats, `${semester}:${grade}`);
  const gradebook = useData(loadGradebook, gradebookKey);
  const summary = useData(loadSummary, classId ? `${classId}:${semester}` : "");
  const report = useData(loadReport, studentId);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorText(err));
    }
  }

  if (ctx.error) return <p className={errorClass}>{ctx.error}</p>;
  if (!ctx.data) return <p className="text-sm opacity-60">Đang tải…</p>;
  if (!ctx.data.schoolYearId) return <p className="text-sm opacity-70">Chưa có năm học hiện hành.</p>;

  const openClass = (id: string) => (setClassId(id), setGradebookKey(""), setStudentId(""));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span>Học kỳ</span>
          <select
            value={semester}
            onChange={(e) => (setSemesterId(e.target.value), setGradebookKey(""), setClassId(""), setStudentId(""))}
            className={`${inputClass} w-auto`}
          >
            {ctx.data.semesters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} – {ctx.data!.schoolYearName}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>Khối</span>
          <select value={grade} onChange={(e) => setGrade(e.target.value ? Number(e.target.value) : "")} className={`${inputClass} w-auto`}>
            <option value="">Tất cả</option>
            {[10, 11, 12].map((g) => (
              <option key={g} value={g}>
                Khối {g}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="max-w-3xl text-sm opacity-70">
        Thống kê chỉ dùng điểm đã công bố, tính theo ĐTB môn học kỳ của từng học sinh. Bấm vào một dòng để xem chi tiết.
      </p>
      {(error ?? stats.error) && <p className={errorClass}>{error ?? stats.error}</p>}

      {stats.data &&
        (stats.data.byClassSubject.length === 0 ? (
          <p className="text-sm opacity-70">Chưa có điểm nào được công bố trong học kỳ này.</p>
        ) : (
          <div className="space-y-6">
            <StatsTable title="Theo khối" rows={stats.data.byGrade} />
            <StatsTable title="Theo môn trong từng khối" rows={stats.data.bySubject} />
            <StatsTable title="Theo lớp (gộp mọi môn)" rows={stats.data.byClass} onRow={(r) => r.classId && openClass(r.classId)} />
            <StatsTable
              title="Theo lớp – môn"
              rows={stats.data.byClassSubject}
              onRow={(r) => (setGradebookKey(`${r.classId}:${r.subjectId}:${semester}`), setClassId(""), setStudentId(""))}
            />
          </div>
        ))}

      {gradebook.error && <p className={errorClass}>{gradebook.error}</p>}
      {gradebookKey && gradebook.data && (
        <section className="space-y-2 rounded border border-black/10 p-3 dark:border-white/15" aria-label="Sổ điểm lớp – môn">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={smallButton} onClick={() => setGradebookKey("")}>
              Đóng
            </button>
            <button
              type="button"
              className={smallButton}
              onClick={() => void run(() => downloadGradebook({ classId: gradebook.data!.classId, subjectId: gradebook.data!.subjectId, semesterId: semester }))}
            >
              Xuất Excel
            </button>
          </div>
          <GradebookTable g={gradebook.data} />
        </section>
      )}

      {summary.error && <p className={errorClass}>{summary.error}</p>}
      {classId && summary.data && (
        <section className="space-y-2 rounded border border-black/10 p-3 dark:border-white/15" aria-label="Bảng điểm lớp">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={smallButton} onClick={() => (setClassId(""), setStudentId(""))}>
              Đóng
            </button>
            <button type="button" className={smallButton} onClick={() => void run(() => downloadClassSummary(classId, semester))}>
              Xuất Excel
            </button>
          </div>
          <ClassSummaryTable s={summary.data} onStudent={setStudentId} />
        </section>
      )}

      {studentId && (
        <section className="space-y-2 rounded border border-black/10 p-3 dark:border-white/15" aria-label="Kết quả học tập của học sinh">
          <button type="button" className={smallButton} onClick={() => setStudentId("")}>
            Đóng chi tiết học sinh
          </button>
          {report.error && <p className={errorClass}>{report.error}</p>}
          {report.data && <StudentReportView report={report.data} />}
        </section>
      )}
    </div>
  );
}
