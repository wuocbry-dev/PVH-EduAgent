"use client";

import { useState } from "react";
import { errorText, useData } from "@/shared/lib/use-data";
import { errorClass, inputClass } from "@/shared/ui/form-styles";
import {
  cancelAdjustment,
  downloadClassSummary,
  downloadGradebook,
  getClassSummary,
  getGradebook,
  getScoreContext,
  getStudentReport,
  listAdjustments,
} from "../api/scores-api";
import { AdjustmentForm, type AdjustmentTarget } from "./adjustment-form";
import { AdjustmentList } from "./adjustment-list";
import { ClassSummaryTable, GradebookTable, smallButton, StudentReportView } from "./score-views";
import { EmptyState, Skeleton } from "@/shared/ui";

// Loader nhận khoá dạng chuỗi (ổn định cho useData); khoá rỗng = chưa chọn.
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

// Cổng giáo viên: sổ điểm các lớp–môn mình dạy (kèm ĐTB, đề nghị điều chỉnh điểm đã khoá), bảng điểm lớp chủ nhiệm
// (chỉ điểm đã công bố) và các đề nghị điều chỉnh của mình.
export function TeacherGradebook() {
  const ctx = useData(getScoreContext, undefined);
  const [semesterId, setSemesterId] = useState<string | null>(null);
  const [pair, setPair] = useState("");
  const [target, setTarget] = useState<AdjustmentTarget | null>(null);
  const [homeroomClass, setHomeroomClass] = useState<string | null>(null);
  const [period, setPeriod] = useState<string | null>(null);
  const [studentId, setStudentId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const semester = semesterId ?? ctx.data?.currentSemesterId ?? "";
  const pairs = (ctx.data?.pairs ?? []).filter((p) => p.semesterId === null || p.semesterId === semester);
  const gradebook = useData(loadGradebook, pair && semester ? `${pair}:${semester}` : "");
  const homeroomId = homeroomClass ?? ctx.data?.homeroomClasses[0]?.id ?? "";
  const summaryPeriod = period ?? semester;
  const summary = useData(loadSummary, homeroomId ? `${homeroomId}:${summaryPeriod}` : "");
  const report = useData(loadReport, studentId);
  const mine = useData(listAdjustments, "");

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorText(err));
    }
  }

  if (ctx.error) return <p className={errorClass}>{ctx.error}</p>;
  if (!ctx.data) return <Skeleton />;
  if (!ctx.data.schoolYearId) return <EmptyState>Chưa có năm học hiện hành.</EmptyState>;
  const { semesters, homeroomClasses } = ctx.data;

  return (
    <div className="space-y-8">
      {error && <p className={errorClass}>{error}</p>}

      <section className="space-y-3" aria-labelledby="so-diem-lop-day">
        <h2 id="so-diem-lop-day" className="text-xl font-semibold">
          Sổ điểm lớp tôi dạy
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-sm">
            <span>Học kỳ</span>
            <select value={semester} onChange={(e) => (setSemesterId(e.target.value), setPair(""), setTarget(null))} className={`${inputClass} w-auto`}>
              {semesters.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} – {ctx.data!.schoolYearName}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>Lớp – môn</span>
            <select value={pair} onChange={(e) => (setPair(e.target.value), setTarget(null))} className={`${inputClass} w-auto`}>
              <option value="">— Chọn —</option>
              {pairs.map((p) => (
                <option key={`${p.classId}:${p.subjectId}`} value={`${p.classId}:${p.subjectId}`}>
                  {p.className} – {p.subjectName}
                </option>
              ))}
            </select>
          </label>
          {gradebook.data && (
            <button
              type="button"
              className={smallButton}
              onClick={() => void run(() => downloadGradebook({ classId: gradebook.data!.classId, subjectId: gradebook.data!.subjectId, semesterId: semester }))}
            >
              Xuất Excel
            </button>
          )}
        </div>
        {pairs.length === 0 && <p className="text-sm text-muted">Bạn chưa được phân công lớp–môn tính điểm nào trong học kỳ này.</p>}
        {gradebook.error && <p className={errorClass}>{gradebook.error}</p>}
        {gradebook.data && (
          <>
            {gradebook.data.canRequestAdjustment && (
              <p className="text-sm">
                Một số đợt đã quá hạn nhập hoặc học kỳ đã khoá sổ: bấm vào ô điểm của đợt đó để gửi <strong>đề nghị điều chỉnh</strong> cho
                Ban giám hiệu duyệt.
              </p>
            )}
            <GradebookTable
              g={gradebook.data}
              onCell={gradebook.data.view === "TEACHER" ? (row, columnIndex) => setTarget({ gradebook: gradebook.data!, row, columnIndex }) : undefined}
            />
            {target && (
              <AdjustmentForm
                target={target}
                onCancel={() => setTarget(null)}
                onDone={() => {
                  setTarget(null);
                  gradebook.reload();
                  mine.reload();
                }}
              />
            )}
          </>
        )}
      </section>

      {homeroomClasses.length > 0 && (
        <section className="space-y-3" aria-labelledby="lop-chu-nhiem">
          <h2 id="lop-chu-nhiem" className="text-xl font-semibold">
            Bảng điểm lớp chủ nhiệm
          </h2>
          <div className="flex flex-wrap items-end gap-3">
            {homeroomClasses.length > 1 && (
              <label className="space-y-1 text-sm">
                <span>Lớp</span>
                <select value={homeroomId} onChange={(e) => (setHomeroomClass(e.target.value), setStudentId(""))} className={`${inputClass} w-auto`}>
                  {homeroomClasses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="space-y-1 text-sm">
              <span>Kỳ</span>
              <select value={summaryPeriod} onChange={(e) => setPeriod(e.target.value)} className={`${inputClass} w-auto`}>
                {semesters.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
                <option value="">Cả năm</option>
              </select>
            </label>
            {summary.data && (
              <button type="button" className={smallButton} onClick={() => void run(() => downloadClassSummary(homeroomId, summaryPeriod))}>
                Xuất Excel
              </button>
            )}
          </div>
          {summary.error && <p className={errorClass}>{summary.error}</p>}
          {summary.data && <ClassSummaryTable s={summary.data} onStudent={setStudentId} />}
          {studentId && (
            <div className="space-y-2 rounded-xl border border-border p-3">
              <button type="button" className={smallButton} onClick={() => setStudentId("")}>
                Đóng chi tiết
              </button>
              {report.error && <p className={errorClass}>{report.error}</p>}
              {report.data && <StudentReportView report={report.data} />}
            </div>
          )}
        </section>
      )}

      <section className="space-y-3" aria-labelledby="de-nghi-cua-toi">
        <h2 id="de-nghi-cua-toi" className="text-xl font-semibold">
          Đề nghị điều chỉnh của tôi
        </h2>
        {mine.error && <p className={errorClass}>{mine.error}</p>}
        {mine.data && (
          <AdjustmentList
            items={mine.data}
            actions={(a) =>
              a.status === "PENDING" ? (
                <button
                  type="button"
                  className={smallButton}
                  onClick={() =>
                    void run(async () => {
                      await cancelAdjustment(a.id);
                      mine.reload();
                      gradebook.reload();
                    })
                  }
                >
                  Rút lại đề nghị
                </button>
              ) : null
            }
          />
        )}
      </section>
    </div>
  );
}
