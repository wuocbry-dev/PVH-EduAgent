import type { QueueStatusDto } from "@pvh/shared";
import Link from "next/link";
import { getDashboard } from "../api/get-dashboard";

function formatUptime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h} giờ ${m} phút` : `${m} phút`;
}

function QueueSummary({ queue }: { queue: QueueStatusDto }) {
  if (!queue.enabled) {
    return <span className="text-warning">Đang tắt (chưa cấu hình Redis): bài hẹn giờ chưa tự đăng</span>;
  }
  if (queue.error) return <span className="text-danger">{queue.error}</span>;
  const total = (key: "waiting" | "delayed" | "active" | "failed") => queue.queues.reduce((sum, q) => sum + q[key], 0);
  const failed = total("failed");
  return (
    <span>
      <span className="font-medium text-success">Hoạt động</span> · {total("delayed")} đã hẹn giờ · {total("waiting") + total("active")} đang chờ/chạy ·{" "}
      <span className={failed > 0 ? "font-semibold text-danger" : ""}>{failed} lỗi</span>
    </span>
  );
}

export type DashboardGroup = "content" | "tasks" | "system";

function Card({ label, value, href, alert }: { label: string; value: number; href: string; alert?: boolean }) {
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-border p-4 hover:bg-primary-soft"
    >
      <p className="text-sm text-muted">{label}</p>
      <p className={`text-3xl font-bold ${alert && value > 0 ? "text-danger" : ""}`}>{value.toLocaleString("vi-VN")}</p>
    </Link>
  );
}

// Thẻ thống kê và tình trạng hệ thống; mỗi nhóm chỉ hiện khi API trả (người dùng đủ quyền).
// Đọc phiên đăng nhập nên phải đặt trong <Suspense>.
// `base`: đường dẫn gốc của cổng (liên kết trên thẻ); `groups`: nhóm số liệu hiện ở cổng này (mặc định tất cả).
export async function DashboardCards({
  base,
  groups = ["content", "tasks", "system"],
}: {
  base: string;
  groups?: DashboardGroup[];
}) {
  const d = await getDashboard();
  const content = groups.includes("content");
  const tasks = groups.includes("tasks");
  const hasCards =
    (content && (d.postsPendingReview !== undefined || d.postsScheduled !== undefined || d.contactsNew !== undefined)) ||
    (tasks && d.tasksOverdue !== undefined);

  return (
    <div className="space-y-6">
      {hasCards && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {content && d.postsPendingReview !== undefined && (
            <li>
              <Card label="Bài chờ duyệt" value={d.postsPendingReview} href={`${base}/bai-viet`} />
            </li>
          )}
          {content && d.postsScheduled !== undefined && (
            <li>
              <Card label="Bài đã hẹn giờ" value={d.postsScheduled} href={`${base}/bai-viet`} />
            </li>
          )}
          {tasks && d.tasksOverdue !== undefined && (
            <li>
              <Card
                label={d.tasksOverdueScope === "own" ? "Việc của tôi quá hạn" : "Việc quá hạn"}
                value={d.tasksOverdue}
                href={`${base}/cong-viec`}
                alert
              />
            </li>
          )}
          {content && d.contactsNew !== undefined && (
            <li>
              <Card label="Liên hệ mới" value={d.contactsNew} href={`${base}/lien-he`} />
            </li>
          )}
        </ul>
      )}

      {groups.includes("system") && d.system && (
        <section aria-label="Tình trạng hệ thống" className="rounded-2xl bg-surface border border-border p-4">
          <h2 className="mb-2 font-semibold">Tình trạng hệ thống</h2>
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-muted">Cơ sở dữ liệu</dt>
              <dd className={d.system.database === "ok" ? "font-medium text-success" : "font-medium text-danger"}>
                {d.system.database === "ok" ? "Hoạt động" : "Mất kết nối"}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Thời gian chạy</dt>
              <dd>{formatUptime(d.system.uptimeSec)}</dd>
            </div>
            <div>
              <dt className="text-muted">Bộ nhớ</dt>
              <dd>{d.system.memoryMb} MB</dd>
            </div>
            <div>
              <dt className="text-muted">Node.js</dt>
              <dd>{d.system.node}</dd>
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <dt className="text-muted">Bộ lập lịch (hàng đợi)</dt>
              <dd>
                <QueueSummary queue={d.system.queue} />
              </dd>
            </div>
          </dl>
        </section>
      )}
    </div>
  );
}
