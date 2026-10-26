"use client";

import { ASSESSMENT_CLASS_STATUS_NAMES, ASSESSMENT_TYPE_NAMES, type AssessmentDto, type ScoreTeachingPairDto } from "@pvh/shared";
import { useCallback, useRef, useState, type FormEvent } from "react";
import { formatDate } from "@/shared/lib/format";
import { errorText, useData } from "@/shared/lib/use-data";
import { errorClass, inputClass } from "@/shared/ui/form-styles";
import { createAssessment, deleteAssessment, getScoreContext, listAssessments } from "../api/scores-api";
import { SheetPanel } from "./sheet-panel";
import { UNSAVED_MESSAGE } from "./use-unsaved-warning";

const smallButton = "rounded border border-black/20 px-3 py-1 text-sm disabled:opacity-50 dark:border-white/20";
const vnToday = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });
const pairKey = (p: { classId: string; subjectId: string }) => `${p.classId}:${p.subjectId}`;
const loadAssessments = (key: string) => {
  const [semesterId, classId, subjectId] = key.split(":");
  return listAssessments({ semesterId, classId, subjectId });
};

// Cổng giáo viên: đợt kiểm tra theo lớp–môn mình dạy, tạo đợt thường xuyên, nhập điểm trên lưới hoặc từ Excel, công bố.
export function TeacherScores() {
  const ctx = useData(getScoreContext, undefined);
  const [semesterId, setSemesterId] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null); // id đợt đang mở bảng điểm
  const [error, setError] = useState<string | null>(null);
  const dirty = useRef(false);
  const onDirtyChange = useCallback((d: boolean) => {
    dirty.current = d;
  }, []);

  const semester = semesterId ?? ctx.data?.currentSemesterId ?? "";
  const pairs = (ctx.data?.pairs ?? []).filter((p) => p.semesterId === null || p.semesterId === semester);
  const pair: ScoreTeachingPairDto | undefined = pairs.find((p) => pairKey(p) === pick) ?? pairs[0];
  const assessments = useData(loadAssessments, pair ? `${semester}:${pair.classId}:${pair.subjectId}` : "");

  // Đổi lựa chọn khi lưới còn điểm chưa lưu thì hỏi lại.
  const guard = (fn: () => void) => () => {
    if (dirty.current && !window.confirm(UNSAVED_MESSAGE)) return;
    dirty.current = false;
    fn();
  };

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!pair) return;
    const form = e.currentTarget;
    const data = new FormData(form);
    setError(null);
    try {
      const created = await createAssessment({
        type: "THUONG_XUYEN",
        semesterId: semester,
        subjectId: pair.subjectId,
        classId: pair.classId,
        testDate: String(data.get("testDate")),
        description: String(data.get("description")).trim() || undefined,
      });
      form.reset();
      assessments.reload();
      setOpen(created.id);
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function onDelete(a: AssessmentDto) {
    if (!window.confirm(`Xoá đợt ${a.code}? Chỉ xoá được đợt chưa có điểm.`)) return;
    try {
      await deleteAssessment(a.id);
      if (open === a.id) setOpen(null);
      assessments.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  if (ctx.error) return <p className={errorClass}>{ctx.error}</p>;
  if (!ctx.data) return <p className="text-sm opacity-60">Đang tải…</p>;
  if (!ctx.data.schoolYearId) return <p className="text-sm opacity-70">Chưa có năm học hiện hành.</p>;

  const list = assessments.data ?? [];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span>Học kỳ</span>
          <select
            value={semester}
            onChange={(e) => guard(() => (setSemesterId(e.target.value), setOpen(null)))()}
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
          <span>Lớp – môn</span>
          <select
            value={pair ? pairKey(pair) : ""}
            onChange={(e) => guard(() => (setPick(e.target.value), setOpen(null)))()}
            className={`${inputClass} w-auto`}
            disabled={pairs.length === 0}
          >
            {pairs.map((p) => (
              <option key={pairKey(p)} value={pairKey(p)}>
                {p.className} – {p.subjectName}
              </option>
            ))}
          </select>
        </label>
      </div>

      {pairs.length === 0 && (
        <p className="text-sm opacity-70">Học kỳ này bạn chưa được phân công môn tính điểm nào. Liên hệ Ban giám hiệu nếu cần.</p>
      )}
      {(error ?? assessments.error) && <p className={errorClass}>{error ?? assessments.error}</p>}

      {pair && (
        <>
          <section className="space-y-2" aria-label="Đợt kiểm tra">
            <h2 className="text-lg font-semibold">
              Đợt kiểm tra lớp {pair.className} – {pair.subjectName}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-black/10 dark:border-white/15">
                  <tr>
                    <th className="py-2 pr-3">Mã đợt</th>
                    <th className="py-2 pr-3">Loại</th>
                    <th className="py-2 pr-3">Ngày</th>
                    <th className="py-2 pr-3">Đã nhập</th>
                    <th className="py-2 pr-3">Trạng thái</th>
                    <th className="py-2">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10 dark:divide-white/15">
                  {list.map((a) => {
                    const c = a.classes.find((x) => x.classId === pair.classId);
                    const own = a.type === "THUONG_XUYEN";
                    return (
                      <tr key={a.id} className={open === a.id ? "bg-black/5 dark:bg-white/10" : ""}>
                        <td className="py-2 pr-3 font-mono">{a.code}</td>
                        <td className="py-2 pr-3">{ASSESSMENT_TYPE_NAMES[a.type]}</td>
                        <td className="py-2 pr-3">{formatDate(a.testDate)}</td>
                        <td className="py-2 pr-3">
                          {c ? `${c.entered}/${c.students}` : ""}
                        </td>
                        <td className="py-2 pr-3">{c ? ASSESSMENT_CLASS_STATUS_NAMES[c.status] : ""}</td>
                        <td className="flex flex-wrap gap-2 py-2">
                          <button type="button" className={smallButton} onClick={guard(() => setOpen(open === a.id ? null : a.id))}>
                            {open === a.id ? "Đóng" : "Nhập điểm"}
                          </button>
                          {own && c?.entered === 0 && c.status === "DRAFT" && (
                            <button type="button" className={smallButton} onClick={() => onDelete(a)}>
                              Xoá
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {assessments.data && list.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-4 opacity-70">
                        Chưa có đợt kiểm tra nào. Tạo đợt thường xuyên bên dưới; đợt giữa kỳ/cuối kỳ do Ban giám hiệu tạo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {open && list.some((a) => a.id === open) && (
            <SheetPanel
              key={`${open}:${pair.classId}`}
              assessmentId={open}
              classId={pair.classId}
              onChanged={assessments.reload}
              onDirtyChange={onDirtyChange}
            />
          )}

          <form onSubmit={onCreate} className="flex flex-wrap items-end gap-3 border-t border-black/10 pt-4 dark:border-white/15">
            <span className="w-full text-sm font-medium">Tạo đợt kiểm tra thường xuyên (mã tự sinh)</span>
            <label className="space-y-1 text-sm">
              <span>Ngày kiểm tra</span>
              <input name="testDate" type="date" required defaultValue={vnToday()} className={`${inputClass} w-auto`} />
            </label>
            <label className="space-y-1 text-sm">
              <span>Mô tả (tuỳ chọn)</span>
              <input name="description" maxLength={500} placeholder="Kiểm tra 15 phút chương 1" className={`${inputClass} w-72`} />
            </label>
            <button type="submit" className="rounded bg-foreground px-4 py-2 text-sm text-background">
              Tạo đợt
            </button>
          </form>
        </>
      )}
    </div>
  );
}
