"use client";

import { useState, type FormEvent } from "react";
import { sendAgentMessage } from "../api/send-agent-message";

interface ChatLine {
  role: "user" | "agent" | "error";
  text: string;
}

const DEV_USERS = [
  { email: "bgh@pvh.edu.vn", label: "Ban giám hiệu" },
  { email: "bientap@pvh.edu.vn", label: "Biên tập viên" },
  { email: "gv.toan@pvh.edu.vn", label: "Giáo viên" },
];

export function AgentChat() {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [input, setInput] = useState("");
  const [devUserEmail, setDevUserEmail] = useState(DEV_USERS[0].email);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message || pending) return;

    setInput("");
    setLines((l) => [...l, { role: "user", text: message }]);
    setPending(true);
    try {
      const res = await sendAgentMessage({ message }, devUserEmail);
      setLines((l) => [...l, { role: "agent", text: res.reply }]);
    } catch (err) {
      setLines((l) => [...l, { role: "error", text: err instanceof Error ? err.message : String(err) }]);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center gap-2 text-sm">
        Thử với vai trò
        <select
          className="rounded border border-black/20 bg-transparent px-2 py-1 dark:border-white/20"
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

      <div className="min-h-64 space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
        {lines.length === 0 && (
          <p className="text-sm opacity-60">Ví dụ: “Hôm nay có việc nào sắp đến hạn không?”</p>
        )}
        {lines.map((line, i) => (
          <p
            key={i}
            className={`whitespace-pre-wrap text-sm ${
              line.role === "user" ? "font-medium" : line.role === "error" ? "text-red-600" : ""
            }`}
          >
            {line.role === "user" ? "Bạn: " : line.role === "agent" ? "Trợ lý: " : "Lỗi: "}
            {line.text}
          </p>
        ))}
        {pending && <p className="text-sm opacity-60">Trợ lý đang xử lý…</p>}
      </div>

      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          className="flex-1 rounded border border-black/20 bg-transparent px-3 py-2 dark:border-white/20"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Nhập yêu cầu cho trợ lý…"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-50"
        >
          Gửi
        </button>
      </form>
    </div>
  );
}
