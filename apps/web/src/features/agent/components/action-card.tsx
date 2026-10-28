"use client";

import type { AgentActionDto } from "@pvh/shared";
import { useEffect, useState } from "react";
import { cancelAction, confirmAction } from "../api/agent-actions-api";

const buttonClass = "rounded-xl bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50";
const secondaryClass = "rounded-xl border border-border-strong px-3 py-1.5 text-sm disabled:opacity-50";

function countdown(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function resultLine(action: AgentActionDto) {
  switch (action.status) {
    case "DONE":
      return { text: `✅ ${action.resultMessage ?? "Đã thực hiện"}`, className: "text-success" };
    case "FAILED":
      return { text: `⚠️ Không thực hiện được: ${action.resultMessage ?? ""}`, className: "text-danger" };
    case "CANCELLED":
      return { text: "❌ Đã huỷ", className: "text-muted" };
    case "EXPIRED":
      return { text: "⌛ Đã hết hạn, chưa thực hiện", className: "text-muted" };
    default:
      return null;
  }
}

// A08 – thẻ xác nhận cho một hành động nhạy cảm do agent đề xuất (giống nút Xác nhận/Huỷ trên Telegram).
export function ActionCard({ initial }: { initial: AgentActionDto }) {
  const [action, setAction] = useState(initial);
  // Đồng hồ chỉ chạy khi còn chờ; giờ hiện tại đặt trong effect để không đọc giờ lúc prerender.
  const [now, setNow] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const waiting = action.status === "PENDING";

  useEffect(() => {
    if (!waiting) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [waiting]);

  const remaining = new Date(action.expiresAt).getTime() - now;
  const expired = waiting && now > 0 && remaining <= 0;

  async function run(act: (id: string) => Promise<AgentActionDto>) {
    setPending(true);
    setError(null);
    try {
      setAction(await act(action.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  const result = resultLine(expired ? { ...action, status: "EXPIRED" } : action);

  return (
    <div className="space-y-2 rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm">
      <p className="whitespace-pre-line font-medium">Cần xác nhận: {action.description}</p>
      {waiting && !expired && (
        <>
          <p className="text-xs text-muted">
            Còn hiệu lực <span className="tabular-nums">{now > 0 ? countdown(remaining) : "10:00"}</span>
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => run(confirmAction)} disabled={pending} className={buttonClass}>
              Xác nhận
            </button>
            <button type="button" onClick={() => run(cancelAction)} disabled={pending} className={secondaryClass}>
              Huỷ
            </button>
          </div>
        </>
      )}
      {result && <p className={result.className}>{result.text}</p>}
      {action.status === "DONE" && action.resultSlug && (
        <a href={`/tin-tuc/${action.resultSlug}`} target="_blank" rel="noreferrer" className="underline">
          Xem bài trên website
        </a>
      )}
      {error && <p className="text-danger">{error}</p>}
    </div>
  );
}
