import Link from "next/link";
import { getCurrentUser } from "@/features/auth";
import { getMyAcademic } from "../api/get-my-academic";
import { ComingSoon } from "./coming-soon";

// Trang của học sinh: chữ to, không dùng thuật ngữ quản trị. Đọc phiên đăng nhập nên phải đặt trong <Suspense>.
export async function StudentHome() {
  const [user, me] = await Promise.all([getCurrentUser(), getMyAcademic()]);

  return (
    <div className="space-y-8">
      <section className="space-y-2" aria-label="Thông tin của em">
        <h2 className="text-2xl font-bold">Xin chào, {user.fullName}!</h2>
        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[auto_1fr]">
          <dt className="opacity-70">Mã học sinh</dt>
          <dd className="font-mono font-semibold">{me.studentCode ?? "—"}</dd>
          <dt className="opacity-70">Lớp</dt>
          <dd className="font-semibold">{me.className ?? "Chưa xếp lớp"}</dd>
          <dt className="opacity-70">Năm học</dt>
          <dd>{me.schoolYearName ?? "—"}</dd>
          {me.homeroomTeacherName && (
            <>
              <dt className="opacity-70">Giáo viên chủ nhiệm</dt>
              <dd>{me.homeroomTeacherName}</dd>
            </>
          )}
        </dl>
        <Link href="/hoc-sinh/doi-mat-khau" className="inline-block underline">
          Đổi mật khẩu
        </Link>
      </section>
      <section className="space-y-2" aria-label="Sắp có">
        <h2 className="text-xl font-semibold">Sắp có</h2>
        <ComingSoon items={["Thời khoá biểu", "Điểm số", "Thông báo của lớp"]} />
      </section>
    </div>
  );
}
