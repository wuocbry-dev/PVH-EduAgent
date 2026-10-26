"use client";

import { SCORE_ADJUSTMENT_STATUS_NAMES, SCORE_ADJUSTMENT_STATUSES, type ScoreAdjustmentStatus } from "@pvh/shared";
import { useState } from "react";
import { errorText, useData } from "@/shared/lib/use-data";
import { errorClass, inputClass } from "@/shared/ui/form-styles";
import { approveAdjustment, listAdjustments, rejectAdjustment } from "../api/scores-api";
import { AdjustmentList } from "./adjustment-list";
import { smallButton } from "./score-views";

// Cổng BGH: duyệt hoặc từ chối (bắt buộc lý do) đề nghị điều chỉnh điểm sau hạn. Duyệt thì điểm mới được ghi kèm lịch sử
// (người đề nghị, người duyệt, lý do); nếu điểm đã đổi sau khi gửi đề nghị thì hệ thống từ chối áp dụng.
export function AdjustmentReview() {
  const [status, setStatus] = useState<ScoreAdjustmentStatus | "">("PENDING");
  const list = useData(listAdjustments, status);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      list.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <div className="space-y-4">
      <label className="block space-y-1 text-sm">
        <span>Trạng thái</span>
        <select value={status} onChange={(e) => setStatus(e.target.value as ScoreAdjustmentStatus | "")} className={`${inputClass} w-auto`}>
          <option value="">Tất cả</option>
          {SCORE_ADJUSTMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {SCORE_ADJUSTMENT_STATUS_NAMES[s]}
            </option>
          ))}
        </select>
      </label>
      {(error ?? list.error) && <p className={errorClass}>{error ?? list.error}</p>}
      {list.data && (
        <AdjustmentList
          items={list.data}
          actions={(a) =>
            a.status === "PENDING" ? (
              <>
                <button
                  type="button"
                  className={smallButton}
                  onClick={() => {
                    if (!window.confirm(`Duyệt điều chỉnh điểm của ${a.studentName} (${a.assessmentCode})?`)) return;
                    void run(() => approveAdjustment(a.id));
                  }}
                >
                  Duyệt
                </button>
                <button
                  type="button"
                  className={smallButton}
                  onClick={() => {
                    const note = window.prompt("Lý do từ chối:")?.trim();
                    if (note) void run(() => rejectAdjustment(a.id, note));
                  }}
                >
                  Từ chối
                </button>
              </>
            ) : null
          }
        />
      )}
    </div>
  );
}
