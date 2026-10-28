import type { Metadata } from "next";
import { Suspense } from "react";
import { MonitoringCenter } from "@/features/monitoring";

export const metadata: Metadata = { title: "Bảo mật và đăng nhập" };

export default function MonitoringPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Bảo mật và đăng nhập</h1>
      <p className="max-w-3xl text-sm opacity-70">
        Đăng nhập sai, IP và tài khoản đang bị chặn tạm, phiên đăng nhập (thu hồi, buộc đăng xuất, khoá hàng loạt).
      </p>
      {/* Đọc tham số URL (?tab=, ?user=) nên phải nằm trong Suspense. */}
      <Suspense fallback={<p className="text-sm opacity-60">Đang tải…</p>}>
        <MonitoringCenter section="security" />
      </Suspense>
    </div>
  );
}
