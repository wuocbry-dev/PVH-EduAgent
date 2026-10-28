import type { Metadata } from "next";
import { Suspense } from "react";
import { MonitoringCenter } from "@/features/monitoring";

export const metadata: Metadata = { title: "Giám sát và bảo mật" };

export default function MonitoringPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Giám sát và bảo mật</h1>
      <p className="max-w-3xl text-sm opacity-70">
        Cảnh báo, nhật ký lỗi, hàng đợi, đăng nhập bất thường và phiên đăng nhập. Cảnh báo cũng được gửi qua Telegram cho người có quyền xem hệ thống.
      </p>
      {/* Đọc tham số URL (?tab=, ?user=) nên phải nằm trong Suspense. */}
      <Suspense fallback={<p className="text-sm opacity-60">Đang tải…</p>}>
        <MonitoringCenter />
      </Suspense>
    </div>
  );
}
