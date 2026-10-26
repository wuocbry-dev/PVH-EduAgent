import type { Metadata } from "next";
import { MyTimetable } from "@/features/timetable";

export const metadata: Metadata = { title: "Thời khoá biểu" };

export default function TimetablePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold print:hidden">Thời khoá biểu của tôi</h1>
      <MyTimetable withUnavailability />
    </div>
  );
}
