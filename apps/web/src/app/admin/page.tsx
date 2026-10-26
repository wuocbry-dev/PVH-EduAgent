import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardCards } from "@/features/system";

export const metadata: Metadata = { title: "Tổng quan hệ thống" };

export default function AdminHomePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Tổng quan hệ thống</h1>
      <Suspense fallback={<p className="text-sm opacity-60">Đang tải…</p>}>
        <DashboardCards base="/admin" groups={["system"]} />
      </Suspense>
    </div>
  );
}
