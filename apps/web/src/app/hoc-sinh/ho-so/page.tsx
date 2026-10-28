import type { Metadata } from "next";
import { Suspense } from "react";
import { StudentProfile } from "@/features/academic";
import { Skeleton } from "@/shared/ui";

export const metadata: Metadata = { title: "Hồ sơ" };

export default function StudentProfilePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Hồ sơ của em</h1>
      <Suspense fallback={<Skeleton />}>
        <StudentProfile />
      </Suspense>
    </div>
  );
}
