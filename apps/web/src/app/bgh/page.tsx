import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardCards, SchoolOverview } from "@/features/system";
import { DeadlineList } from "@/features/tasks";

export const metadata: Metadata = { title: "Tổng quan" };

export default function PrincipalHomePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Tổng quan</h1>
      <Suspense fallback={<p className="text-sm opacity-60">Đang tải…</p>}>
        <SchoolOverview />
      </Suspense>
      <Suspense fallback={<p className="text-sm opacity-60">Đang tải…</p>}>
        <DashboardCards base="/bgh" groups={["content", "tasks"]} />
      </Suspense>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Hạn chót trong 48 giờ tới</h2>
        <Suspense fallback={<p className="text-sm opacity-60">Đang tải…</p>}>
          <DeadlineList />
        </Suspense>
      </section>
    </div>
  );
}
