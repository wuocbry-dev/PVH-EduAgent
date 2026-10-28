import type { Metadata } from "next";
import { AgentMonitor } from "@/features/monitoring";

export const metadata: Metadata = { title: "Trợ lý AI" };

export default function AgentMonitorPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Trợ lý AI</h1>
      <p className="max-w-3xl text-sm opacity-70">
        Số lệnh, tool được gọi, thao tác chờ xác nhận, hạn mức và công tắc khẩn cấp. Chỉ có số lượng và tên tool, không có nội dung trò chuyện.
      </p>
      <AgentMonitor />
    </div>
  );
}
