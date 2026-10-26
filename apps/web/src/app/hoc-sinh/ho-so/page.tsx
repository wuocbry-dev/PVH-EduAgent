import type { Metadata } from "next";
import { Suspense } from "react";
import { StudentProfile } from "@/features/academic";

export const metadata: Metadata = { title: "Hồ sơ" };

export default function StudentProfilePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Hồ sơ của em</h1>
      <Suspense fallback={<p className="text-sm opacity-60">Đang tải…</p>}>
        <StudentProfile />
      </Suspense>
    </div>
  );
}
