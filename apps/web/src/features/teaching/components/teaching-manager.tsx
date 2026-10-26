"use client";

import { TEACHING_SAMPLE_NOTE } from "@pvh/shared";
import { useState } from "react";
import { errorClass, inputClass } from "@/shared/ui/form-styles";
import { useData } from "@/shared/lib/use-data";
import {
  getAssignments,
  getQuotas,
  getSummary,
  listClassOptions,
  listSemesterOptions,
  listSubjectOptions,
  listYears,
  type Scope,
} from "../api/teaching-api";
import { ClassView } from "./class-view";
import type { TeachingContext } from "./context";
import { QuotaView } from "./quota-view";
import { SummaryView } from "./summary-view";
import { TeacherView } from "./teacher-view";

const TABS = [
  { id: "class", label: "Theo lớp" },
  { id: "teacher", label: "Theo giáo viên" },
  { id: "quota", label: "Định mức môn" },
  { id: "summary", label: "Cảnh báo và thống kê" },
] as const;

// Tải một phạm vi (năm học + học kỳ) rồi gom các dữ liệu cần cho mọi tab.
const loadAll = async (scope: Scope | null) => {
  if (!scope) return null;
  const [summary, assignments, quotas, classes, semesters] = await Promise.all([
    getSummary(scope),
    getAssignments(scope),
    getQuotas(scope.schoolYearId),
    listClassOptions(scope.schoolYearId),
    listSemesterOptions(scope.schoolYearId),
  ]);
  return { summary, assignments, quotas, classes, semesters };
};

// Trang phân công giảng dạy của Ban giám hiệu (sửa được) và ADMIN (chỉ xem).
export function TeachingManager({ readOnly = false }: { readOnly?: boolean }) {
  const years = useData(listYears, undefined);
  const subjects = useData(listSubjectOptions, undefined);
  const [yearId, setYearId] = useState("");
  const [semesterId, setSemesterId] = useState("");
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("class");
  const currentYear = years.data?.find((y) => y.isCurrent)?.id ?? years.data?.[0]?.id ?? "";
  const scope: Scope = { schoolYearId: yearId || currentYear, semesterId };
  const data = useData(loadAll, scope.schoolYearId ? scope : null);

  const error = years.error ?? subjects.error ?? data.error;
  // Đang tải lại phạm vi mới thì chưa hiện dữ liệu của phạm vi cũ.
  const ready = years.data && subjects.data && data.data && data.data.summary.schoolYearId === scope.schoolYearId;

  const ctx: TeachingContext | null = ready
    ? {
        scope,
        years: years.data!,
        semesters: data.data!.semesters,
        classes: data.data!.classes,
        subjects: subjects.data!,
        summary: data.data!.summary,
        assignments: data.data!.assignments,
        quotas: data.data!.quotas,
        readOnly,
        reload: data.reload,
      }
    : null;

  return (
    <div className="space-y-4">
      <p className="max-w-3xl rounded border border-yellow-600/40 bg-yellow-500/10 p-3 text-sm">
        <strong>Số liệu mẫu.</strong> {TEACHING_SAMPLE_NOTE}
        {readOnly && " Bạn chỉ có quyền xem; phân công là việc của Ban giám hiệu."}
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span>Năm học</span>
          <select
            value={scope.schoolYearId}
            onChange={(e) => {
              setYearId(e.target.value);
              setSemesterId("");
            }}
            className={`${inputClass} w-auto`}
          >
            {years.data?.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
                {y.isCurrent ? " (hiện hành)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>Phạm vi</span>
          <select value={semesterId} onChange={(e) => setSemesterId(e.target.value)} className={`${inputClass} w-auto`}>
            <option value="">Cả năm học</option>
            {ctx?.semesters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div role="tablist" aria-label="Phân công giảng dạy" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === tab}
            onClick={() => setTab(t.id)}
            className={`rounded border px-3 py-1 text-sm ${
              t.id === tab ? "border-foreground bg-foreground text-background" : "border-black/20 dark:border-white/20"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className={errorClass}>{error}</p>}
      {!ctx && !error && <p className="text-sm opacity-60">Đang tải…</p>}
      {ctx && tab === "class" && <ClassView key={ctx.scope.schoolYearId} ctx={ctx} />}
      {ctx && tab === "teacher" && <TeacherView ctx={ctx} />}
      {ctx && tab === "quota" && <QuotaView ctx={ctx} />}
      {ctx && tab === "summary" && <SummaryView ctx={ctx} />}
    </div>
  );
}
