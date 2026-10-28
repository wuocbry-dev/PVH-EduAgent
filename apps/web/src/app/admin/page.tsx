import type { Metadata } from "next";
import { MonitoringDashboard } from "@/features/monitoring";

export const metadata: Metadata = { title: "Tổng quan hệ thống" };

// Bước 26: trung tâm điều khiển của quản trị hệ thống (dịch vụ, lỗi, hàng đợi, dung lượng kho, bảo mật).
export default function AdminHomePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Tổng quan hệ thống</h1>
      <MonitoringDashboard />
    </div>
  );
}
