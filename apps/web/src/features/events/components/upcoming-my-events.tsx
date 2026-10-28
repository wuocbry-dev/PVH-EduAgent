"use client";

import { audienceLabel } from "@pvh/shared";
import Link from "next/link";
import { formatDateTime } from "@/shared/lib/format";
import { useData } from "@/shared/lib/use-data";
import { errorClass } from "@/shared/ui/form-styles";
import { listEvents } from "../api/events-api";
import { Skeleton } from "@/shared/ui";

// 60 ngày tới, tính từ lúc mở trang.
const loadUpcoming = (days: number) => {
  const now = new Date();
  return listEvents(now.toISOString(), new Date(now.getTime() + days * 86_400_000).toISOString());
};

// Sự kiện sắp tới trong cổng: toàn trường và sự kiện đúng đối tượng của người xem (khối/lớp/nhân sự).
export function UpcomingMyEvents({ limit, href }: { limit: number; href: string }) {
  const events = useData(loadUpcoming, 60);
  if (events.error) return <p className={errorClass}>{events.error}</p>;
  if (!events.data) return <Skeleton />;
  const items = events.data.slice(0, limit);
  return (
    <div className="space-y-2">
      {items.length === 0 ? (
        <p className="text-sm">Chưa có sự kiện nào trong 60 ngày tới.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((e) => (
            <li key={e.id} className="rounded-xl border border-border px-3 py-2 text-sm">
              <p className="font-medium">
                {e.audience !== "SCHOOL" && (
                  <span className="mr-1 text-xs text-primary">[{audienceLabel(e.audience, e.gradeLevel, e.className)}]</span>
                )}
                {e.title}
              </p>
              <p className="text-muted">
                {formatDateTime(e.startAt)}
                {e.location && ` · ${e.location}`}
              </p>
            </li>
          ))}
        </ul>
      )}
      <Link href={href} className="text-sm underline">
        Xem lịch tháng
      </Link>
    </div>
  );
}
