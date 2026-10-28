import type { Metadata } from "next";
import { Suspense } from "react";
import { MonitoringCenter } from "@/features/monitoring";

export const metadata: Metadata = { title: "Lỗi và hàng đợi" };

export default function MonitoringPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Lỗi và hàng đợi</h1>
      <p className="max-w-3xl text-sm opacity-70">
        Cảnh báo, lỗi máy chủ và job thất bại, hàng đợi. Cảnh báo cũng được gửi qua Telegram cho người có quyền xem hệ thống.
      </p>
      {/* Đọc tham số URL (?tab=, ?user=) nên phải nằm trong Suspense. */}
      <Suspense fallback={<p className="text-sm opacity-60">Đang tải…</p>}>
        <MonitoringCenter section="system" />
      </Suspense>
    </div>
  );
}
