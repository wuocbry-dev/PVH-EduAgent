import type { Metadata } from "next";
import { Suspense } from "react";
import { StudentHome } from "@/features/academic";

export const metadata: Metadata = { title: "Trang của em" };

export default function StudentHomePage() {
  return (
    <Suspense fallback={<p className="text-sm opacity-60">Đang tải…</p>}>
      <StudentHome />
    </Suspense>
  );
}
