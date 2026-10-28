import { formatDate } from "@/shared/lib/format";
import { getUpcomingEvents } from "../api/public-events";

const TIME_ZONE = "Asia/Ho_Chi_Minh";
const time = (iso: string) => new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE });
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
const part = (iso: string, options: Intl.DateTimeFormatOptions) =>
  new Date(iso).toLocaleDateString("vi-VN", { ...options, timeZone: TIME_ZONE });

// F15 – lịch sự kiện sắp tới trên website công khai. Đọc dữ liệu có cache nên đặt trong <Suspense>.
export async function UpcomingEvents() {
  const events = await getUpcomingEvents();

  if (events === null) {
    return <p className="text-sm text-muted">Không tải được lịch sự kiện lúc này, vui lòng thử lại sau.</p>;
  }
  if (events.length === 0) return <p className="text-muted">Hiện chưa có sự kiện sắp tới.</p>;

  return (
    <ol className="space-y-3">
      {events.map((e) => {
        const sameDay = dayKey(e.startAt) === dayKey(e.endAt);
        return (
          <li key={e.id} className="flex gap-4 rounded-2xl bg-surface border border-border p-4">
            <time dateTime={e.startAt} className="w-20 shrink-0 self-start rounded-xl bg-primary p-2 text-center text-primary-foreground">
              <span className="block text-2xl font-bold leading-none">{part(e.startAt, { day: "2-digit" })}</span>
              <span className="block text-xs">Tháng {part(e.startAt, { month: "numeric" })}</span>
            </time>
            <div className="space-y-1">
              <h3 className="font-semibold">{e.title}</h3>
              <p className="text-sm text-muted">
                {sameDay
                  ? `${formatDate(e.startAt)} · ${time(e.startAt)} – ${time(e.endAt)}`
                  : `${formatDate(e.startAt)} ${time(e.startAt)} – ${formatDate(e.endAt)} ${time(e.endAt)}`}
              </p>
              {e.location && <p className="text-sm text-muted">Địa điểm: {e.location}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
