import { ROLE_NAMES } from "@pvh/shared";
import Link from "next/link";
import { getCurrentUser } from "../api/get-current-user";

// Thông tin tài khoản đang đăng nhập (trang /admin/tai-khoan). Đọc phiên nên phải đặt trong <Suspense>.
export async function AccountInfo() {
  const user = await getCurrentUser();

  return (
    <section aria-label="Thông tin tài khoản" className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="opacity-70">Họ tên</dt>
        <dd className="font-medium">{user.fullName}</dd>
        <dt className="opacity-70">Email</dt>
        <dd className="break-all">{user.email ?? "Không có (đăng nhập bằng mã)"}</dd>
        <dt className="opacity-70">Vai trò</dt>
        <dd>{user.roles.map((r) => ROLE_NAMES[r]).join(", ")}</dd>
      </dl>
      <Link href="/admin/doi-mat-khau" className="inline-block text-sm underline">
        Đổi mật khẩu
      </Link>
    </section>
  );
}
