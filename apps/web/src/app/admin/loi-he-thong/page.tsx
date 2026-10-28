import type { Metadata } from "next";
import { Suspense } from "react";
import { MonitoringCenter } from "@/features/monitoring";
import { Skeleton } from "@/shared/ui";

export const metadata: Metadata = { title: "Lỗi và hàng đợi" };

export default function MonitoringPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Lỗi và hàng đợi</h1>
      <p className="max-w-3xl text-sm text-muted">
        Cảnh báo, lỗi máy chủ và job thất bại, hàng đợi. Cảnh báo cũng được gửi qua Telegram cho người có quyền xem hệ thống.
      </p>
      {/* Đọc tham số URL (?tab=, ?user=) nên phải nằm trong Suspense. */}
      <Suspense fallback={<Skeleton />}>
        <MonitoringCenter section="system" />
      </Suspense>
    </div>
  );
}
