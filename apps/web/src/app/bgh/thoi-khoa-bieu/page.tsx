import type { Metadata } from "next";
import { TimetableManager } from "@/features/timetable";

export const metadata: Metadata = { title: "Thời khoá biểu" };

export default function TimetablePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold print:hidden">Thời khoá biểu</h1>
      <TimetableManager />
    </div>
  );
}
