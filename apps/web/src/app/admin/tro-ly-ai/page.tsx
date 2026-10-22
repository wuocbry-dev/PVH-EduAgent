import type { Metadata } from "next";
import { AgentChat } from "@/features/agent";

export const metadata: Metadata = { title: "Trợ lý AI" };

export default function AgentPage() {
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Trợ lý AI</h1>
      <p className="text-sm opacity-70">
        Cùng AI Agent với kênh Telegram: trợ lý chỉ làm được những việc mà vai trò của bạn được phép.
      </p>
      <AgentChat />
    </div>
  );
}
