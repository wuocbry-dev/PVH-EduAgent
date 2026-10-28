"use client";

import {
  ASSESSMENT_TYPE_NAMES,
  formatScore,
  SCORE_ADJUSTMENT_STATUS_NAMES,
  SCORE_STATUS_NAMES,
  type ScoreAdjustmentDto,
  type ScoreStatus,
} from "@pvh/shared";
import type { ReactNode } from "react";
import { formatDateTime } from "@/shared/lib/format";
import { EmptyState } from "@/shared/ui";

const scoreText = (value: string | null, status: ScoreStatus | null) =>
  status === "GRADED" ? formatScore(value) : status ? SCORE_STATUS_NAMES[status] : "(trống)";

// Danh sách đề nghị điều chỉnh: giáo viên (huỷ đề nghị của mình) và BGH (duyệt/từ chối) dùng chung.
export function AdjustmentList({
  items,
  actions,
}: {
  items: ScoreAdjustmentDto[];
  actions?: (a: ScoreAdjustmentDto) => ReactNode;
}) {
  if (items.length === 0) return <EmptyState>Không có đề nghị nào.</EmptyState>;
  return (
    <ul className="space-y-3">
      {items.map((a) => (
        <li key={a.id} className="space-y-1 rounded-xl border border-border p-3 text-sm">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <strong>{SCORE_ADJUSTMENT_STATUS_NAMES[a.status]}</strong>
            <span className="font-mono">{a.assessmentCode}</span>
            <span>
              {ASSESSMENT_TYPE_NAMES[a.assessmentType]} · {a.subjectName} · lớp {a.className} · {a.semesterName}
            </span>
          </div>
          <p>
            {a.studentName} ({a.studentCode}): <strong>{scoreText(a.oldValue, a.oldStatus)}</strong> →{" "}
            <strong>{scoreText(a.newValue, a.newStatus)}</strong>
            {a.newNote && <span className="text-muted"> · ghi chú: {a.newNote}</span>}
          </p>
          <p>Lý do: {a.reason}</p>
          <p className="text-muted">
            Gửi bởi {a.requestedByName} lúc {formatDateTime(a.requestedAt)}
            {a.reviewedAt && ` · ${a.reviewedByName ?? ""} xử lý lúc ${formatDateTime(a.reviewedAt)}`}
            {a.reviewNote && ` · ${a.reviewNote}`}
          </p>
          {actions && <div className="flex flex-wrap gap-2 pt-1">{actions(a)}</div>}
        </li>
      ))}
    </ul>
  );
}
