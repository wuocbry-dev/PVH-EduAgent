import { ROLE_NAMES } from "@pvh/shared";
import Link from "next/link";
import { getCurrentUser } from "../api/get-current-user";
import { LogoutButton } from "./logout-button";

// Đọc phiên đăng nhập nên phải đặt trong <Suspense>.
export async function UserMenu() {
  const user = await getCurrentUser();

  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">{user.fullName}</p>
      <p className="text-xs opacity-60">{user.roles.map((r) => ROLE_NAMES[r]).join(", ")}</p>
      <div className="flex gap-4 pt-1 md:flex-col md:gap-1">
        <Link href="/admin/tai-khoan" className="text-sm underline opacity-70">
          Tài khoản
        </Link>
        <LogoutButton />
      </div>
    </div>
  );
}
