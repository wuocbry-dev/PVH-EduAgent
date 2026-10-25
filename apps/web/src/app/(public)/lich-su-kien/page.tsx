import type { Metadata } from "next";
import { Suspense } from "react";
import { UpcomingEvents } from "@/features/events";
import { Loading, PageShell } from "@/features/site";

export const metadata: Metadata = {
  title: "Lịch sự kiện",
  description: "Các sự kiện sắp tới của Trường THPT Phan Văn Hớn.",
  alternates: { canonical: "/lich-su-kien" },
};

// F15 – Lịch sự kiện của trường.
export default function EventsPage() {
  return (
    <PageShell title="Lịch sự kiện" description="Các hoạt động và sự kiện sắp tới của nhà trường.">
      <Suspense fallback={<Loading text="Đang tải lịch…" />}>
        <UpcomingEvents />
      </Suspense>
    </PageShell>
  );
}
