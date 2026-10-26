"use client";

import {
  ASSESSMENT_CLASS_STATUS_NAMES,
  ASSESSMENT_TYPE_NAMES,
  formatScore,
  SCORE_STATUS_NAMES,
  type ClassSummaryDto,
  type GradebookCellDto,
  type GradebookDto,
  type ScoreAverageDto,
  type StudentReportDto,
} from "@pvh/shared";
import { formatDate, formatDateTime } from "@/shared/lib/format";

export const smallButton = "rounded border border-black/20 px-3 py-1 text-sm disabled:opacity-50 dark:border-white/20";
// `relative`: chữ ẩn cho trình đọc màn hình (sr-only, định vị tuyệt đối) nằm trong khung cuộn, không làm trang tràn ngang.
export const tableWrap = "relative overflow-x-auto rounded border border-black/10 dark:border-white/15";
const th = "whitespace-nowrap px-2 py-2 font-medium";
const td = "whitespace-nowrap px-2 py-1.5";

// Điểm trung bình: "tạm tính" khi còn thiếu cột bắt buộc (lý do hiện khi rê chuột và cho trình đọc màn hình).
export function AverageCell({ average }: { average: ScoreAverageDto | null }) {
  if (!average || average.value === null) {
    return <span className="opacity-50" title={average?.missing.join("; ")}>–</span>;
  }
  return (
    <span title={average.missing.join("; ") || undefined}>
      <strong>{formatScore(average.value)}</strong>
      {average.provisional && <span className="ml-1 text-xs text-amber-700 dark:text-amber-400">(tạm tính)</span>}
      {average.provisional && <span className="sr-only">: {average.missing.join("; ")}</span>}
    </span>
  );
}

function cellText(c: GradebookCellDto): string {
  if (c.status === "GRADED") return formatScore(c.value);
  if (c.status) return SCORE_STATUS_NAMES[c.status];
  return "";
}

// Sổ điểm một lớp–môn–học kỳ: cột là các đợt thi (kèm mã), dòng là học sinh, cột cuối là ĐTB môn.
// onCell: giáo viên bấm ô đã khoá để gửi đề nghị điều chỉnh.
export function GradebookTable({
  g,
  onCell,
}: {
  g: GradebookDto;
  onCell?: (row: GradebookDto["rows"][number], columnIndex: number) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm">
        <strong>{g.subjectName}</strong> · lớp {g.className} · {g.semesterName} – {g.schoolYearName}
        {g.periodsPerWeek !== null && ` · ${g.periodsPerWeek} tiết/tuần`} · cần tối thiểu {g.requiredRegular} điểm thường xuyên
        {g.semesterLocked && <span className="ml-2 text-red-600">· Học kỳ đã khoá sổ</span>}
      </p>
      {g.publishedOnly && <p className="text-sm opacity-70">Chỉ hiện điểm đã được giáo viên công bố.</p>}
      {g.columns.length === 0 ? (
        <p className="text-sm opacity-70">Chưa có đợt kiểm tra nào{g.publishedOnly ? " được công bố" : ""}.</p>
      ) : (
        <div className={tableWrap}>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-black/10 dark:border-white/15">
              <tr>
                <th className={th}>STT</th>
                <th className={th}>Mã HS</th>
                <th className={th}>Họ và tên</th>
                {g.columns.map((c) => (
                  <th key={c.assessmentId} className={`${th} text-center`} title={`${c.code} · ${formatDate(c.testDate)}`}>
                    <span className="block">{ASSESSMENT_TYPE_NAMES[c.type]}</span>
                    <span className="block font-mono text-xs font-normal opacity-70">{c.code}</span>
                    <span className="block text-xs font-normal opacity-70">
                      {ASSESSMENT_CLASS_STATUS_NAMES[c.status]}
                      {c.locked ? " · đã khoá" : ""}
                    </span>
                  </th>
                ))}
                <th className={`${th} text-center`}>ĐTB môn</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r, i) => (
                <tr key={r.studentId} className="border-b border-black/5 dark:border-white/10">
                  <td className={td}>{i + 1}</td>
                  <td className={`${td} font-mono`}>{r.studentCode}</td>
                  <td className={td}>{r.fullName}</td>
                  {r.cells.map((c, ci) => {
                    const col = g.columns[ci]!;
                    const clickable = !!onCell && col.locked && c.status !== "EXEMPT";
                    const label = cellText(c);
                    return (
                      <td key={col.assessmentId} className={`${td} text-center`} title={c.note ?? undefined}>
                        {clickable ? (
                          <button
                            type="button"
                            className="min-w-10 rounded px-1 underline decoration-dotted hover:bg-black/5 dark:hover:bg-white/10"
                            onClick={() => onCell(r, ci)}
                            aria-label={`Đề nghị điều chỉnh điểm ${r.fullName}, đợt ${col.code}`}
                          >
                            {label || "–"}
                          </button>
                        ) : (
                          label
                        )}
                        {c.pendingAdjustmentId && (
                          <span className="ml-1 text-xs text-amber-700 dark:text-amber-400" title="Có đề nghị điều chỉnh đang chờ duyệt">
                            ⏳
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className={`${td} text-center`}>
                    <AverageCell average={r.average} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="max-w-3xl text-xs opacity-60">{g.formulaNote}</p>
    </div>
  );
}

// Bảng ĐTB mọi môn của một lớp (chỉ điểm đã công bố). onStudent: xem chi tiết điểm của một học sinh.
export function ClassSummaryTable({ s, onStudent }: { s: ClassSummaryDto; onStudent?: (studentId: string) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-sm">
        Lớp <strong>{s.className}</strong> · {s.periodName} – {s.schoolYearName} · chỉ điểm đã công bố
      </p>
      {s.subjects.length === 0 ? (
        <p className="text-sm opacity-70">Lớp chưa có môn nào có điểm.</p>
      ) : (
        <div className={tableWrap}>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-black/10 dark:border-white/15">
              <tr>
                <th className={th}>STT</th>
                <th className={th}>Mã HS</th>
                <th className={th}>Họ và tên</th>
                {s.subjects.map((sub) => (
                  <th key={sub.id} className={`${th} text-center`}>
                    {sub.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.rows.map((r, i) => (
                <tr key={r.studentId} className="border-b border-black/5 dark:border-white/10">
                  <td className={td}>{i + 1}</td>
                  <td className={`${td} font-mono`}>{r.studentCode}</td>
                  <td className={td}>
                    {onStudent ? (
                      <button type="button" className="underline" onClick={() => onStudent(r.studentId)}>
                        {r.fullName}
                      </button>
                    ) : (
                      r.fullName
                    )}
                  </td>
                  {r.averages.map((a, ai) => (
                    <td key={s.subjects[ai]!.id} className={`${td} text-center`}>
                      <AverageCell average={a} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="max-w-3xl text-xs opacity-60">{s.formulaNote}</p>
    </div>
  );
}

// Kết quả học tập của một học sinh trong năm học: từng học kỳ, từng môn (các cột điểm kèm mã đợt thi) và ĐTB.
export function StudentReportView({ report }: { report: StudentReportDto }) {
  const hasAny = report.semesters.some((s) => s.subjects.some((sub) => sub.entries.length > 0));
  return (
    <div className="space-y-5">
      <p className="text-sm">
        <strong>{report.fullName}</strong>
        {report.studentCode && <> · mã HS <span className="font-mono">{report.studentCode}</span></>}
        {report.className && <> · lớp {report.className}</>}
        {report.schoolYearName && <> · năm học {report.schoolYearName}</>}
      </p>
      {!report.publishedOnly && <p className="text-sm opacity-70">Gồm cả điểm chưa công bố (đánh dấu &quot;nháp&quot;).</p>}
      {!hasAny && <p className="text-sm opacity-70">Chưa có điểm nào{report.publishedOnly ? " được công bố" : ""}.</p>}

      {report.semesters.map((sem) => (
        <section key={sem.semesterId} className="space-y-2" aria-label={sem.semesterName}>
          <h2 className="text-lg font-semibold">{sem.semesterName}</h2>
          <div className={tableWrap}>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-black/10 dark:border-white/15">
                <tr>
                  <th className={th}>Môn</th>
                  <th className={th}>Các cột điểm</th>
                  <th className={`${th} text-center`}>ĐTB môn</th>
                </tr>
              </thead>
              <tbody>
                {sem.subjects.map((sub) => (
                  <tr key={sub.subjectId} className="border-b border-black/5 align-top dark:border-white/10">
                    <td className={td}>{sub.subjectName}</td>
                    <td className="px-2 py-1.5">
                      {sub.gradingType === "COMMENT" ? (
                        <span className="opacity-70">Đánh giá bằng nhận xét (Đạt/Chưa đạt)</span>
                      ) : sub.entries.length === 0 ? (
                        <span className="opacity-50">Chưa có điểm</span>
                      ) : (
                        <ul className="flex flex-wrap gap-2">
                          {sub.entries.map((e) => (
                            <li
                              key={e.assessmentId}
                              className="rounded border border-black/10 px-2 py-0.5 dark:border-white/15"
                              title={`${e.code} · ${formatDate(e.testDate)}${e.note ? ` · ${e.note}` : ""}`}
                            >
                              <span className="text-xs opacity-70">{ASSESSMENT_TYPE_NAMES[e.type]}: </span>
                              <strong>{e.status === "GRADED" ? formatScore(e.value) : SCORE_STATUS_NAMES[e.status]}</strong>
                              <span className="ml-1 font-mono text-xs opacity-60">{e.code}</span>
                              {!e.published && <span className="ml-1 text-xs text-amber-700 dark:text-amber-400">(nháp)</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className={`${td} text-center`}>{sub.gradingType === "SCORE" ? <AverageCell average={sub.average} /> : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {report.year.length > 0 && (
        <section className="space-y-2" aria-label="Cả năm">
          <h2 className="text-lg font-semibold">Cả năm</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {report.year.map((y) => (
              <li key={y.subjectId} className="flex justify-between gap-3 rounded border border-black/10 px-3 py-2 text-sm dark:border-white/15">
                <span>{y.subjectName}</span>
                <AverageCell average={y.average} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="max-w-3xl text-xs opacity-60">{report.formulaNote}</p>
    </div>
  );
}

export const deadlineText = (iso: string | null) => (iso ? formatDateTime(iso) : "không có");
