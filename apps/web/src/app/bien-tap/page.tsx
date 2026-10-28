import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardCards } from "@/features/system";
import { Skeleton } from "@/shared/ui";

export const metadata: Metadata = { title: "Tổng quan" };

export default function EditorHomePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Tổng quan</h1>
      <Suspense fallback={<Skeleton />}>
        <DashboardCards base="/bien-tap" groups={["content"]} />
      </Suspense>
    </div>
  );
}
