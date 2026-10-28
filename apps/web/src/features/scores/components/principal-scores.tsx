"use client";

import {
  ASSESSMENT_CLASS_STATUS_NAMES,
  ASSESSMENT_TYPE_NAMES,
  ASSESSMENT_TYPES,
  type AssessmentType,
  type ScoreProgressDto,
} from "@pvh/shared";
import { useState, type FormEvent } from "react";
import { formatDate, formatDateTime } from "@/shared/lib/format";
import { errorText, useData } from "@/shared/lib/use-data";
import { errorClass, inputClass } from "@/shared/ui/form-styles";
import { createAssessment, deleteAssessment, getProgress, getScoreContext, updateAssessment } from "../api/scores-api";
import { SheetPanel } from "./sheet-panel";
import { EmptyState, Skeleton, Table, useConfirm } from "@/shared/ui";

const smallButton = "rounded-xl border border-border-strong px-3 py-1 text-sm disabled:opacity-50";
// Hạn nhập điểm chọn theo ngày: hết ngày đó theo giờ Việt Nam.
const endOfDayVn = (date: string) => `${date}T23:59:59+07:00`;
const loadProgress = (key: string) => {
  const [semesterId, type, grade] = key.split(":");
  return getProgress({ semesterId, type: (type || "") as AssessmentType | "", gradeLevel: grade ? Number(grade) : "" });
};

type ProgressAssessment = ScoreProgressDto["assessments"][number];

// Cổng BGH: tạo đợt giữa kỳ/cuối kỳ dùng chung cho một khối, đặt hạn nhập điểm, xem tiến độ nhập điểm theo lớp,
// xem bảng điểm (chỉ xem) và đặt miễn kiểm tra. BGH không tự nhập điểm.
export function PrincipalScores() {
  const ask = useConfirm();
  const ctx = useData(getScoreContext, undefined);
  const [semesterId, setSemesterId] = useState<string | null>(null);
  const [type, setType] = useState<AssessmentType | "">("");
  const [grade, setGrade] = useState<number | "">("");
  const [open, setOpen] = useState<{ assessmentId: string; classId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const semester = semesterId ?? ctx.data?.currentSemesterId ?? "";
  const progress = useData(loadProgress, `${semester}:${type}:${grade}`);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      progress.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const deadline = String(data.get("deadline"));
    void run(async () => {
      await createAssessment({
        type: data.get("type") as "GIUA_KY" | "CUOI_KY",
        semesterId: semester,
        subjectId: String(data.get("subjectId")),
        gradeLevel: Number(data.get("gradeLevel")),
        testDate: String(data.get("testDate")),
        description: String(data.get("description")).trim() || undefined,
        code: String(data.get("code")).trim() || undefined,
        entryDeadline: deadline ? endOfDayVn(deadline) : null,
      });
      form.reset();
    });
  }

  function onDeadline(a: ProgressAssessment) {
    const current = a.entryDeadline ? new Date(a.entryDeadline).toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" }) : "";
    const value = window.prompt(`Hạn nhập điểm của ${a.code} (YYYY-MM-DD, để trống = không có hạn):`, current);
    if (value === null) return;
    const trimmed = value.trim();
    if (trimmed && !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return setError("Ngày phải có dạng YYYY-MM-DD");
    void run(() => updateAssessment(a.id, { entryDeadline: trimmed ? endOfDayVn(trimmed) : null }));
  }

  if (ctx.error) return <p className={errorClass}>{ctx.error}</p>;
  if (!ctx.data) return <Skeleton />;
  if (!ctx.data.schoolYearId) return <EmptyState>Chưa có năm học hiện hành.</EmptyState>;

  const totals = progress.data?.totals;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span>Học kỳ</span>
          <select value={semester} onChange={(e) => (setSemesterId(e.target.value), setOpen(null))} className={`${inputClass} w-auto`}>
            {ctx.data.semesters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} – {ctx.data!.schoolYearName}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>Loại</span>
          <select value={type} onChange={(e) => setType(e.target.value as AssessmentType | "")} className={`${inputClass} w-auto`}>
            <option value="">Tất cả</option>
            {ASSESSMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {ASSESSMENT_TYPE_NAMES[t]}
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

      {(error ?? progress.error) && <p className={errorClass}>{error ?? progress.error}</p>}

      {totals && (
        <p className="text-sm">
          {totals.assessments} đợt · {totals.classes} lượt lớp · <strong>{totals.complete}</strong> lớp đã nhập đủ ·{" "}
          <strong>{totals.published}</strong> lớp đã công bố
        </p>
      )}

      <div className="space-y-4">
        {progress.data?.assessments.map((a) => (
          <section key={a.id} className="space-y-2 rounded-xl border border-border p-3" aria-label={a.code}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="font-mono font-semibold">{a.code}</span>
              <span>
                {ASSESSMENT_TYPE_NAMES[a.type]} · {a.subjectName} · {formatDate(a.testDate)}
              </span>
              <span className="text-muted">Người tạo: {a.createdByName}</span>
              <span>Hạn nhập: {a.entryDeadline ? formatDateTime(a.entryDeadline) : "không có"}</span>
              <button type="button" className={smallButton} onClick={() => onDeadline(a)}>
                Đặt hạn
              </button>
              {a.classes.every((c) => c.entered === 0 && c.status === "DRAFT") && (
                <button
                  type="button"
                  className={smallButton}
                  onClick={async () => (await ask(`Xoá đợt ${a.code}?`)) && void run(() => deleteAssessment(a.id))}
                >
                  Xoá
                </button>
              )}
            </div>
            {a.description && <p className="text-sm text-muted">{a.description}</p>}
            <Table>
              <thead className="border-b border-border">
                <tr>
                  <th className="py-1 pr-3">Lớp</th>
                  <th className="py-1 pr-3">Giáo viên</th>
                  <th className="py-1 pr-3">Đã nhập</th>
                  <th className="py-1 pr-3">Trạng thái</th>
                  <th className="py-1">Bảng điểm</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {a.classes.map((c) => {
                  const full = c.students > 0 && c.entered >= c.students;
                  const isOpen = open?.assessmentId === a.id && open.classId === c.classId;
                  return (
                    <tr key={c.classId}>
                      <td className="py-1 pr-3 font-medium">{c.className}</td>
                      <td className="py-1 pr-3">{c.teacherName ?? <span className="text-warning">Chưa phân công</span>}</td>
                      <td className={`py-1 pr-3 ${full ? "text-success " : ""}`}>
                        {c.entered}/{c.students}
                      </td>
                      <td className="py-1 pr-3">{ASSESSMENT_CLASS_STATUS_NAMES[c.status]}</td>
                      <td className="py-1">
                        <button
                          type="button"
                          className={smallButton}
                          onClick={() => setOpen(isOpen ? null : { assessmentId: a.id, classId: c.classId })}
                        >
                          {isOpen ? "Đóng" : "Xem"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            {open?.assessmentId === a.id && (
              <SheetPanel key={`${open.assessmentId}:${open.classId}`} {...open} onChanged={progress.reload} />
            )}
          </section>
        ))}
        {progress.data?.assessments.length === 0 && <EmptyState>Chưa có đợt thi nào trong học kỳ này.</EmptyState>}
      </div>

      <form onSubmit={onCreate} className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
        <span className="w-full text-sm font-medium">Tạo đợt giữa kỳ/cuối kỳ dùng chung cho cả khối (áp cho mọi lớp của khối)</span>
        <label className="space-y-1 text-sm">
          <span>Loại</span>
          <select name="type" className={`${inputClass} w-auto`}>
            <option value="GIUA_KY">Giữa kỳ</option>
            <option value="CUOI_KY">Cuối kỳ</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>Khối</span>
          <select name="gradeLevel" className={`${inputClass} w-auto`}>
            {[10, 11, 12].map((g) => (
              <option key={g} value={g}>
                Khối {g}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>Môn</span>
          <select name="subjectId" required className={`${inputClass} w-auto`}>
            {ctx.data.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>Ngày thi</span>
          <input name="testDate" type="date" required className={`${inputClass} w-auto`} />
        </label>
        <label className="space-y-1 text-sm">
          <span>Hạn nhập điểm (tuỳ chọn)</span>
          <input name="deadline" type="date" className={`${inputClass} w-auto`} />
        </label>
        <label className="space-y-1 text-sm">
          <span>Mã đợt (để trống = tự sinh)</span>
          <input name="code" maxLength={40} placeholder="GK-2026-HK1-TOAN-K10" className={`${inputClass} w-56 uppercase`} />
        </label>
        <label className="space-y-1 text-sm">
          <span>Mô tả (tuỳ chọn)</span>
          <input name="description" maxLength={500} className={`${inputClass} w-64`} />
        </label>
        <button type="submit" className="rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground">
          Tạo đợt thi
        </button>
      </form>
    </div>
  );
}
