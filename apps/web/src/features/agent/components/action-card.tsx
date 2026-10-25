"use client";

import type { AgentActionDto } from "@pvh/shared";
import { useEffect, useState } from "react";
import { cancelAction, confirmAction } from "../api/agent-actions-api";

const buttonClass = "rounded bg-foreground px-3 py-1.5 text-sm text-background disabled:opacity-50";
const secondaryClass = "rounded border border-black/20 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-white/20";

function countdown(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function resultLine(action: AgentActionDto) {
  switch (action.status) {
    case "DONE":
      return { text: `✅ ${action.resultMessage ?? "Đã thực hiện"}`, className: "text-green-700" };
    case "FAILED":
      return { text: `⚠️ Không thực hiện được: ${action.resultMessage ?? ""}`, className: "text-red-600" };
    case "CANCELLED":
      return { text: "❌ Đã huỷ", className: "opacity-70" };
    case "EXPIRED":
      return { text: "⌛ Đã hết hạn, chưa thực hiện", className: "opacity-70" };
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
    <div className="space-y-2 rounded border border-amber-500/50 bg-amber-500/5 p-3 text-sm">
      <p className="font-medium">Cần xác nhận: {action.description}</p>
      {waiting && !expired && (
        <>
          <p className="text-xs opacity-70">
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
      {error && <p className="text-red-600">{error}</p>}
    </div>
  );
}
