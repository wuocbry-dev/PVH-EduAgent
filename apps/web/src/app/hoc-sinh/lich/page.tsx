import type { Metadata } from "next";
import { Suspense } from "react";
import { EventCalendar } from "@/features/events";

export const metadata: Metadata = { title: "Lịch" };

export default function StudentCalendarPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Lịch sự kiện</h1>
      <p className="max-w-3xl text-sm opacity-70">Sự kiện của trường và các sự kiện dành riêng cho khối, lớp của em.</p>
      {/* Lịch dùng ngày giờ hiện tại khi dựng, nên phải nằm trong <Suspense>. */}
      <Suspense fallback={<p className="text-sm opacity-60">Đang tải…</p>}>
        <EventCalendar />
      </Suspense>
    </div>
  );
}
