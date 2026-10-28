import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardCards, SchoolOverview } from "@/features/system";
import { DeadlineList } from "@/features/tasks";
import { Skeleton } from "@/shared/ui";

export const metadata: Metadata = { title: "Tổng quan" };

export default function PrincipalHomePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Tổng quan</h1>
      <Suspense fallback={<Skeleton />}>
        <SchoolOverview />
      </Suspense>
      <Suspense fallback={<Skeleton />}>
        <DashboardCards base="/bgh" groups={["content", "tasks"]} />
      </Suspense>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Hạn chót trong 48 giờ tới</h2>
        <Suspense fallback={<Skeleton />}>
          <DeadlineList />
        </Suspense>
      </section>
    </div>
  );
}
