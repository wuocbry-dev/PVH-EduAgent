"use client";

import type { AgentActionDto } from "@pvh/shared";
import { useEffect, useState, type FormEvent } from "react";
import { env } from "@/shared/config/env";
import { listPendingActions } from "../api/agent-actions-api";
import { sendAgentMessage } from "../api/send-agent-message";
import { ActionCard } from "./action-card";

type ChatLine =
  | { role: "user" | "agent" | "error"; text: string }
  | { role: "action"; action: AgentActionDto };

// Chỉ hiện khi chạy dev (NEXT_PUBLIC_DEV_AUTH=true, API bật DEV_AUTH=true).
const DEV_USERS = [
  { email: "", label: "Tài khoản đang đăng nhập" },
  { email: "bgh@pvh.edu.vn", label: "Ban giám hiệu" },
  { email: "bientap@pvh.edu.vn", label: "Biên tập viên" },
  { email: "gv.toan@pvh.edu.vn", label: "Giáo viên" },
];

export function AgentChat() {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [input, setInput] = useState("");
  const [devUserEmail, setDevUserEmail] = useState(DEV_USERS[0].email);
  const [pending, setPending] = useState(false);

  // Mở lại trang: dựng lại thẻ xác nhận cho các hành động còn chờ (vd. đề xuất từ Telegram hoặc lượt chat trước).
  useEffect(() => {
    let current = true;
    listPendingActions()
      .then((actions) => {
        if (current && actions.length) {
          setLines((l) => [...actions.map((action) => ({ role: "action" as const, action })), ...l]);
        }
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message || pending) return;

    setInput("");
    setLines((l) => [...l, { role: "user", text: message }]);
    setPending(true);
    try {
      const res = await sendAgentMessage({ message }, devUserEmail || undefined);
      setLines((l) => [
        ...l,
        { role: "agent", text: res.reply },
        ...res.pendingActions
          .filter((a) => !l.some((x) => x.role === "action" && x.action.id === a.id))
          .map((action) => ({ role: "action" as const, action })),
      ]);
    } catch (err) {
      setLines((l) => [...l, { role: "error", text: err instanceof Error ? err.message : String(err) }]);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {env.devAuth && (
        <label className="flex items-center gap-2 text-sm">
          Thử với vai trò
          <select
            className="rounded-xl border border-border-strong bg-transparent px-2 py-1"
            value={devUserEmail}
            onChange={(e) => setDevUserEmail(e.target.value)}
          >
            {DEV_USERS.map((u) => (
              <option key={u.email} value={u.email}>
                {u.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="min-h-64 space-y-3 rounded-2xl bg-surface border border-border p-4">
        {lines.length === 0 && (
          <p className="text-sm text-muted">Ví dụ: “Hôm nay có việc nào sắp đến hạn không?”</p>
        )}
        {lines.map((line, i) =>
          line.role === "action" ? (
            <ActionCard key={line.action.id} initial={line.action} />
          ) : (
            <p
              key={i}
              className={`whitespace-pre-wrap text-sm ${
                line.role === "user" ? "font-medium" : line.role === "error" ? "text-danger" : ""
              }`}
            >
              {line.role === "user" ? "Bạn: " : line.role === "agent" ? "Trợ lý: " : "Lỗi: "}
              {line.text}
            </p>
          ),
        )}
        {pending && <p className="text-sm text-muted">Trợ lý đang xử lý…</p>}
      </div>

      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          className="flex-1 rounded-xl border border-border-strong bg-transparent px-3 py-2"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Nhập yêu cầu cho trợ lý…"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        >
          Gửi
        </button>
      </form>
    </div>
  );
}
