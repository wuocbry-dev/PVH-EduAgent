"use client";

import { ASSESSMENT_TYPE_NAMES, ASSESSMENT_TYPES, type ScoreFormula, type ScoreLockDto } from "@pvh/shared";
import { useState, type FormEvent } from "react";
import { errorText, useData } from "@/shared/lib/use-data";
import { errorClass, inputClass } from "@/shared/ui/form-styles";
import { getScoreFormula, getScoreLocks, setScoreDeadline, setScoreFormula, setScoreLock } from "../api/scores-api";
import { deadlineText, smallButton } from "./score-views";
import { EmptyState, Skeleton, useConfirm, useToast } from "@/shared/ui";

// Hạn chọn theo ngày: hết ngày đó theo giờ Việt Nam.
const endOfDayVn = (date: string) => `${date}T23:59:59+07:00`;
const vnDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" }) : "");

function SemesterLocks({ s, onChange }: { s: ScoreLockDto; onChange: (action: () => Promise<ScoreLockDto[]>) => void }) {
  const ask = useConfirm();
  async function onLock(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const reason = String(new FormData(e.currentTarget).get("reason") ?? "").trim();
    if (!(await ask(`Khoá sổ điểm ${s.semesterName}? Giáo viên sẽ không sửa trực tiếp được nữa, chỉ gửi đề nghị điều chỉnh.`))) return;
    onChange(() => setScoreLock(s.semesterId, { locked: true, reason: reason || undefined }));
  }

  return (
    <section className="space-y-3 rounded-xl border border-border p-3" aria-label={s.semesterName}>
      <h3 className="font-semibold">{s.semesterName}</h3>
      <ul className="space-y-2">
        {ASSESSMENT_TYPES.map((type) => {
          const current = s.deadlines.find((d) => d.type === type)?.deadline ?? null;
          return (
            <li key={type} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-28">{ASSESSMENT_TYPE_NAMES[type]}</span>
              <span className="text-muted">Hạn hiện tại: {deadlineText(current)}</span>
              <input
                type="date"
                aria-label={`Hạn nhập điểm ${ASSESSMENT_TYPE_NAMES[type]}`}
                defaultValue={vnDate(current)}
                className={`${inputClass} w-auto`}
                onChange={(e) =>
                  e.target.value && onChange(() => setScoreDeadline({ semesterId: s.semesterId, type, deadline: endOfDayVn(e.target.value) }))
                }
              />
              {current && (
                <button type="button" className={smallButton} onClick={() => onChange(() => setScoreDeadline({ semesterId: s.semesterId, type, deadline: null }))}>
                  Bỏ hạn
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {s.locked ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-danger">
            Đã khoá sổ{s.lockedByName ? ` bởi ${s.lockedByName}` : ""}
            {s.lockedAt ? ` lúc ${deadlineText(s.lockedAt)}` : ""}
            {s.reason ? ` · ${s.reason}` : ""}
          </span>
          <button
            type="button"
            className={smallButton}
            onClick={async () => (await ask(`Mở khoá sổ ${s.semesterName}?`)) && onChange(() => setScoreLock(s.semesterId, { locked: false }))}
          >
            Mở khoá sổ
          </button>
        </div>
      ) : (
        <form onSubmit={onLock} className="flex flex-wrap items-end gap-2 text-sm">
          <label className="space-y-1">
            <span>Lý do khoá sổ (tuỳ chọn)</span>
            <input name="reason" maxLength={300} className={`${inputClass} w-72`} />
          </label>
          <button type="submit" className={smallButton}>
            Khoá sổ học kỳ
          </button>
        </form>
      )}
    </section>
  );
}

const num = (data: FormData, key: string) => Number(data.get(key));

function FormulaEditor() {
  const formula = useData(getScoreFormula, undefined);
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const next: ScoreFormula = {
      weights: { THUONG_XUYEN: num(data, "w_tx"), GIUA_KY: num(data, "w_gk"), CUOI_KY: num(data, "w_ck") },
      regularMin: [
        { maxPeriodsPerWeek: 1, count: num(data, "min1") },
        { maxPeriodsPerWeek: 2, count: num(data, "min2") },
      ],
      regularMinOther: num(data, "minOther"),
      yearWeights: [num(data, "y1"), num(data, "y2")],
      decimals: num(data, "decimals"),
    };
    setError(null);
    try {
      await setScoreFormula(next);
      formula.reload();
      toast.success("Đã lưu công thức.");
    } catch (err) {
      setError(errorText(err));
    }
  }

  if (formula.error) return <p className={errorClass}>{formula.error}</p>;
  if (!formula.data) return <Skeleton />;
  const f = formula.data;
  const min = (max: number) => f.regularMin.find((r) => r.maxPeriodsPerWeek === max)?.count ?? f.regularMinOther;
  const field = (name: string, label: string, value: number, maxValue = 10) => (
    <label className="space-y-1 text-sm">
      <span>{label}</span>
      <input name={name} type="number" min={name.startsWith("min") ? 0 : 1} max={maxValue} defaultValue={value} required className={`${inputClass} w-24`} />
    </label>
  );

  return (
    <form key={JSON.stringify(f)} onSubmit={onSubmit} className="space-y-3" aria-label="Công thức điểm trung bình">
      <p className="max-w-3xl text-sm text-muted">{f.note}</p>
      <p className="text-sm">{f.isDefault ? "Đang dùng công thức mặc định." : "Đang dùng công thức đã chỉnh."}</p>
      <div className="flex flex-wrap gap-3">
        {field("w_tx", "Hệ số thường xuyên", f.weights.THUONG_XUYEN)}
        {field("w_gk", "Hệ số giữa kỳ", f.weights.GIUA_KY)}
        {field("w_ck", "Hệ số cuối kỳ", f.weights.CUOI_KY)}
      </div>
      <div className="flex flex-wrap gap-3">
        {field("min1", "Số cột TX tối thiểu (1 tiết/tuần)", min(1))}
        {field("min2", "Số cột TX tối thiểu (2 tiết/tuần)", min(2))}
        {field("minOther", "Số cột TX tối thiểu (từ 3 tiết)", f.regularMinOther)}
      </div>
      <div className="flex flex-wrap gap-3">
        {field("y1", "Hệ số HK I (cả năm)", f.yearWeights[0])}
        {field("y2", "Hệ số HK II (cả năm)", f.yearWeights[1])}
        <label className="space-y-1 text-sm">
          <span>Làm tròn</span>
          <select name="decimals" defaultValue={f.decimals} className={`${inputClass} w-auto`}>
            <option value={1}>1 chữ số thập phân</option>
            <option value={2}>2 chữ số thập phân</option>
          </select>
        </label>
      </div>
      {error && <p className={errorClass}>{error}</p>}
      <button type="submit" className={smallButton}>
        Lưu công thức
      </button>
    </form>
  );
}

// Cổng BGH: hạn nhập điểm chung theo học kỳ–loại đợt (hạn riêng của đợt vẫn được ưu tiên), khoá/mở khoá sổ học kỳ,
// công thức điểm trung bình (mặc định Thông tư 22/2021).
export function ScoreLocksManager() {
  const locks = useData(getScoreLocks, undefined);
  const [error, setError] = useState<string | null>(null);

  function change(action: () => Promise<ScoreLockDto[]>) {
    setError(null);
    action()
      .then(() => locks.reload())
      .catch((err) => setError(errorText(err)));
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3" aria-labelledby="han-nhap">
        <h2 id="han-nhap" className="text-xl font-semibold">
          Hạn nhập điểm và khoá sổ
        </h2>
        <p className="max-w-3xl text-sm text-muted">
          Qua hạn (hoặc khi học kỳ đã khoá sổ) giáo viên không sửa điểm trực tiếp được; muốn sửa phải gửi đề nghị điều chỉnh kèm lý do để
          Ban giám hiệu duyệt. Hạn riêng đặt cho từng đợt thi được ưu tiên hơn hạn chung ở đây.
        </p>
        {(error ?? locks.error) && <p className={errorClass}>{error ?? locks.error}</p>}
        {locks.data?.length === 0 && <EmptyState>Chưa có năm học hiện hành.</EmptyState>}
        {locks.data?.map((s) => <SemesterLocks key={s.semesterId} s={s} onChange={change} />)}
      </section>
      <section className="space-y-3" aria-labelledby="cong-thuc">
        <h2 id="cong-thuc" className="text-xl font-semibold">
          Công thức điểm trung bình
        </h2>
        <FormulaEditor />
      </section>
    </div>
  );
}
