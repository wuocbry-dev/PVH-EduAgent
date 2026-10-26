import { getCurrentUser } from "@/features/auth";
import { getMyAcademic } from "../api/get-my-academic";
import Link from "next/link";

const SHORTCUTS = [
  ["/giao-vien/thoi-khoa-bieu", "Thời khoá biểu của tôi"],
  ["/giao-vien/nhap-diem", "Nhập điểm"],
  ["/giao-vien/so-diem", "Sổ điểm"],
  ["/giao-vien/lop-chu-nhiem", "Lớp chủ nhiệm"],
  ["/giao-vien/thong-bao", "Thông báo"],
] as const;

// Phần dành riêng cho giáo viên ở trang tổng quan: lớp chủ nhiệm và lối tắt tới các chức năng.
// Đọc phiên đăng nhập nên phải đặt trong <Suspense>.
export async function TeacherHome() {
  const [user, me] = await Promise.all([getCurrentUser(), getMyAcademic()]);

  return (
    <div className="space-y-6">
      <p className="text-sm">
        Xin chào <strong>{user.fullName}</strong>
        {me.teacherCode ? <span className="opacity-70"> · mã giáo viên {me.teacherCode}</span> : null}
      </p>
      <section className="space-y-2" aria-label="Lớp chủ nhiệm">
        <h2 className="text-lg font-semibold">Lớp chủ nhiệm{me.schoolYearName ? ` (${me.schoolYearName})` : ""}</h2>
        {me.homeroomClasses.length === 0 ? (
          <p className="text-sm opacity-70">Bạn không chủ nhiệm lớp nào trong năm học hiện hành.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-3">
            {me.homeroomClasses.map((c) => (
              <li key={c.id} className="rounded-lg border border-black/10 p-4 dark:border-white/15">
                <p className="text-2xl font-bold">{c.name}</p>
                <p className="text-sm opacity-70">{c.studentCount} học sinh</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-2" aria-label="Lối tắt">
        <h2 className="text-lg font-semibold">Lối tắt</h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {SHORTCUTS.map(([href, label]) => (
            <li key={href}>
              <Link href={href} className="block rounded-lg border border-black/10 p-4 font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10">
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
