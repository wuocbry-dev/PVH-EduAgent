import type { Metadata } from "next";
import { Suspense } from "react";
import { EventCalendar } from "@/features/events";
import { Skeleton } from "@/shared/ui";

export const metadata: Metadata = { title: "Lịch" };

export default function StudentCalendarPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Lịch sự kiện</h1>
      <p className="max-w-3xl text-sm text-muted">Sự kiện của trường và các sự kiện dành riêng cho khối, lớp của em.</p>
      {/* Lịch dùng ngày giờ hiện tại khi dựng, nên phải nằm trong <Suspense>. */}
      <Suspense fallback={<Skeleton />}>
        <EventCalendar />
      </Suspense>
    </div>
  );
}
