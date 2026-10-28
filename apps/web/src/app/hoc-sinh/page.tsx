import type { Metadata } from "next";
import { Suspense } from "react";
import { StudentHome } from "@/features/academic";
import { Inbox } from "@/features/announcements";
import { UpcomingMyEvents } from "@/features/events";
import { TodayTimetable } from "@/features/timetable";
import { Skeleton } from "@/shared/ui";

export const metadata: Metadata = { title: "Trang của em" };

export default function StudentHomePage() {
  return (
    <div className="space-y-8">
      <Suspense fallback={<Skeleton />}>
        <StudentHome />
      </Suspense>
      <div className="grid gap-8 lg:grid-cols-2">
        <section className="space-y-2" aria-labelledby="hom-nay">
          <h2 id="hom-nay" className="text-xl font-semibold">
            Hôm nay học gì
          </h2>
          <TodayTimetable href="/hoc-sinh/thoi-khoa-bieu" />
        </section>
        <section className="space-y-2" aria-labelledby="su-kien">
          <h2 id="su-kien" className="text-xl font-semibold">
            Sự kiện sắp tới
          </h2>
          <UpcomingMyEvents limit={5} href="/hoc-sinh/lich" />
        </section>
      </div>
      <section className="space-y-2" aria-labelledby="thong-bao-moi">
        <h2 id="thong-bao-moi" className="text-xl font-semibold">
          Thông báo mới
        </h2>
        <Inbox limit={5} moreHref="/hoc-sinh/thong-bao" />
      </section>
    </div>
  );
}
