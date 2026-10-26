import type { Metadata } from "next";
import { AcademicManager } from "@/features/academic";

export const metadata: Metadata = { title: "Học vụ" };

export default function AcademicPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Học vụ</h1>
      <AcademicManager />
    </div>
  );
}
