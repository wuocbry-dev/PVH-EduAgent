import type { Metadata } from "next";
import { Suspense } from "react";
import { EventCalendar } from "@/features/events";
import { Skeleton } from "@/shared/ui";

export const metadata: Metadata = { title: "Lịch sự kiện" };

export default function CalendarPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Lịch sự kiện</h1>
      {/* Lịch dùng ngày giờ hiện tại khi dựng, nên phải nằm trong <Suspense>. */}
      <Suspense fallback={<Skeleton />}>
        <EventCalendar />
      </Suspense>
    </div>
  );
}
