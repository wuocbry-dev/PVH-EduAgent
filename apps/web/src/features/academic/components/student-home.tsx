import Link from "next/link";
import { getCurrentUser } from "@/features/auth";
import { getMyAcademic } from "../api/get-my-academic";

// Lời chào ở trang chủ học sinh (thời khoá biểu hôm nay, thông báo, lịch đặt ở trang). Đọc phiên đăng nhập nên phải đặt trong <Suspense>.
export async function StudentHome() {
  const [user, me] = await Promise.all([getCurrentUser(), getMyAcademic()]);
  return (
    <section className="space-y-1" aria-label="Lời chào">
      <h2 className="text-2xl font-bold">Xin chào, {user.fullName}!</h2>
      <p className="opacity-80">
        {me.className ? `Lớp ${me.className}` : "Chưa xếp lớp"}
        {me.schoolYearName && ` · năm học ${me.schoolYearName}`}
        {me.homeroomTeacherName && ` · chủ nhiệm: ${me.homeroomTeacherName}`}
      </p>
      <p className="text-sm">
        <Link href="/hoc-sinh/diem" className="underline">
          Xem điểm của em
        </Link>
      </p>
    </section>
  );
}

// Hồ sơ học sinh (chỉ đọc): mọi thay đổi thông tin do nhà trường thực hiện. Đọc phiên đăng nhập nên đặt trong <Suspense>.
export async function StudentProfile() {
  const [user, me] = await Promise.all([getCurrentUser(), getMyAcademic()]);
  return (
    <div className="space-y-4">
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
        <dt className="opacity-70">Họ và tên</dt>
        <dd className="font-semibold">{user.fullName}</dd>
        <dt className="opacity-70">Mã học sinh (dùng để đăng nhập)</dt>
        <dd className="font-mono font-semibold">{me.studentCode ?? "—"}</dd>
        <dt className="opacity-70">Lớp</dt>
        <dd className="font-semibold">{me.className ?? "Chưa xếp lớp"}</dd>
        <dt className="opacity-70">Năm học</dt>
        <dd>{me.schoolYearName ?? "—"}</dd>
        <dt className="opacity-70">Giáo viên chủ nhiệm</dt>
        <dd>{me.homeroomTeacherName ?? "—"}</dd>
      </dl>
      <p className="max-w-2xl text-sm opacity-70">
        Thông tin sai thì em báo giáo viên chủ nhiệm để nhà trường sửa. Quên mật khẩu thì nhờ giáo viên chủ nhiệm cấp lại mã kích hoạt.
      </p>
      <Link href="/hoc-sinh/doi-mat-khau" className="inline-block rounded border border-black/20 px-4 py-2 dark:border-white/20">
        Đổi mật khẩu
      </Link>
    </div>
  );
}
