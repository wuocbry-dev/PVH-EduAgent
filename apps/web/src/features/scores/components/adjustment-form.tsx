"use client";

import { formatScore, parseScore, SCORE_REASON_MAX, SCORE_STATUS_NAMES, type GradebookDto } from "@pvh/shared";
import { useState, type FormEvent } from "react";
import { errorText } from "@/shared/lib/use-data";
import { errorClass, inputClass } from "@/shared/ui/form-styles";
import { createAdjustment } from "../api/scores-api";
import { smallButton } from "./score-views";

export interface AdjustmentTarget {
  gradebook: GradebookDto;
  row: GradebookDto["rows"][number];
  columnIndex: number;
}

// Đề nghị điều chỉnh một điểm đã khoá (quá hạn hoặc khoá sổ): điểm mới (hoặc vắng có lý do) + lý do bắt buộc; BGH duyệt.
export function AdjustmentForm({ target, onDone, onCancel }: { target: AdjustmentTarget; onDone: () => void; onCancel: () => void }) {
  const { gradebook: g, row, columnIndex } = target;
  const column = g.columns[columnIndex]!;
  const cell = row.cells[columnIndex]!;
  const [absent, setAbsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const value = String(data.get("value") ?? "").trim();
    if (!absent) {
      const parsed = parseScore(value);
      if (!parsed.ok) return setError(parsed.error);
    }
    setBusy(true);
    setError(null);
    try {
      await createAdjustment({
        assessmentId: column.assessmentId,
        classId: g.classId,
        studentId: row.studentId,
        value: absent || value === "" ? null : value,
        status: absent ? "ABSENT" : "GRADED",
        note: String(data.get("note") ?? "").trim() || null,
        reason: String(data.get("reason") ?? "").trim(),
      });
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const current = cell.status === "GRADED" ? formatScore(cell.value) : cell.status ? SCORE_STATUS_NAMES[cell.status] : "chưa có";
  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-3 rounded-xl border border-warning/40 p-3" aria-label="Đề nghị điều chỉnh điểm">
      <p className="text-sm">
        Đề nghị điều chỉnh điểm của <strong>{row.fullName}</strong> ({row.studentCode}), đợt <span className="font-mono">{column.code}</span>.
        Điểm hiện tại: <strong>{current}</strong>.
      </p>
      {cell.pendingAdjustmentId && <p className="text-sm text-warning">Học sinh này đã có một đề nghị đang chờ duyệt.</p>}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={absent} onChange={(e) => setAbsent(e.target.checked)} />
        Học sinh vắng có lý do (để trống điểm)
      </label>
      {!absent && (
        <label className="block space-y-1 text-sm">
          <span>Điểm mới (để trống = xoá điểm)</span>
          <input name="value" inputMode="decimal" className={`${inputClass} w-32`} placeholder="vd. 8,5" />
        </label>
      )}
      <label className="block space-y-1 text-sm">
        <span>{absent ? "Lý do vắng" : "Ghi chú cho ô điểm (tuỳ chọn)"}</span>
        <input name="note" maxLength={200} className={inputClass} required={absent} />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Lý do điều chỉnh (bắt buộc, Ban giám hiệu sẽ xem)</span>
        <textarea name="reason" required minLength={5} maxLength={SCORE_REASON_MAX} rows={3} className={inputClass} />
      </label>
      {error && <p className={errorClass}>{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={smallButton}>
          {busy ? "Đang gửi…" : "Gửi đề nghị"}
        </button>
        <button type="button" onClick={onCancel} className={smallButton}>
          Huỷ
        </button>
      </div>
    </form>
  );
}
