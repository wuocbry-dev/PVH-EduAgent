import type { EventDto } from "@pvh/shared";
import { cacheLife, cacheTag } from "next/cache";
import { load } from "@/shared/lib/public-api";

// Sự kiện sắp tới cho trang công khai. Làm mới ngay khi quản trị sửa lịch (tag "events").
export async function getUpcomingEvents(): Promise<EventDto[] | null> {
  "use cache";
  cacheTag("events");
  const { data } = await load<EventDto[]>("/events");
  if (data) cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  else cacheLife("seconds");
  return data;
}
