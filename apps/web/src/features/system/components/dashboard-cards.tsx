import Link from "next/link";
import { getDashboard } from "../api/get-dashboard";

function formatUptime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h} giờ ${m} phút` : `${m} phút`;
}

function Card({ label, value, href, alert }: { label: string; value: number; href: string; alert?: boolean }) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
    >
      <p className="text-sm opacity-70">{label}</p>
      <p className={`text-3xl font-bold ${alert && value > 0 ? "text-red-600" : ""}`}>{value.toLocaleString("vi-VN")}</p>
    </Link>
  );
}

// Thẻ thống kê và tình trạng hệ thống; mỗi nhóm chỉ hiện khi API trả (người dùng đủ quyền).
// Đọc phiên đăng nhập nên phải đặt trong <Suspense>.
export async function DashboardCards() {
  const d = await getDashboard();
  const hasCards =
    d.postsPendingReview !== undefined ||
    d.postsScheduled !== undefined ||
    d.tasksOverdue !== undefined ||
    d.contactsNew !== undefined;

  return (
    <div className="space-y-6">
      {hasCards && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {d.postsPendingReview !== undefined && (
            <li>
              <Card label="Bài chờ duyệt" value={d.postsPendingReview} href="/admin/bai-viet" />
            </li>
          )}
          {d.postsScheduled !== undefined && (
            <li>
              <Card label="Bài đã hẹn giờ" value={d.postsScheduled} href="/admin/bai-viet" />
            </li>
          )}
          {d.tasksOverdue !== undefined && (
            <li>
              <Card
                label={d.tasksOverdueScope === "own" ? "Việc của tôi quá hạn" : "Việc quá hạn"}
                value={d.tasksOverdue}
                href="/admin/cong-viec"
                alert
              />
            </li>
          )}
          {d.contactsNew !== undefined && (
            <li>
              <Card label="Liên hệ mới" value={d.contactsNew} href="/admin/lien-he" />
            </li>
          )}
        </ul>
      )}

      {d.system && (
        <section aria-label="Tình trạng hệ thống" className="rounded-lg border border-black/10 p-4 dark:border-white/15">
          <h2 className="mb-2 font-semibold">Tình trạng hệ thống</h2>
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="opacity-70">Cơ sở dữ liệu</dt>
              <dd className={d.system.database === "ok" ? "font-medium text-green-700" : "font-medium text-red-600"}>
                {d.system.database === "ok" ? "Hoạt động" : "Mất kết nối"}
              </dd>
            </div>
            <div>
              <dt className="opacity-70">Thời gian chạy</dt>
              <dd>{formatUptime(d.system.uptimeSec)}</dd>
            </div>
            <div>
              <dt className="opacity-70">Bộ nhớ</dt>
              <dd>{d.system.memoryMb} MB</dd>
            </div>
            <div>
              <dt className="opacity-70">Node.js</dt>
              <dd>{d.system.node}</dd>
            </div>
          </dl>
        </section>
      )}
    </div>
  );
}
