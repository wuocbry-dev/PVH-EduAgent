import { PORTAL_INFO, ROLE_NAMES, type Portal } from "@pvh/shared";
import { CircleUserRound } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/shared/ui";
import { getCurrentUser } from "../api/get-current-user";
import { LogoutButton } from "./logout-button";
import { Avatar } from "./user-avatar";

// Đáy thanh bên: người đang đăng nhập, Tài khoản, nút gạt theme, Đăng xuất. Đọc phiên đăng nhập nên đặt trong <Suspense>.
export async function UserMenu({ portal }: { portal: Portal }) {
  const user = await getCurrentUser();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Avatar name={user.fullName} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{user.fullName}</p>
          <p className="truncate text-xs text-muted">{user.roles.map((r) => ROLE_NAMES[r]).join(", ")}</p>
        </div>
      </div>
      <ThemeToggle className="w-full justify-between" />
      <div className="flex flex-col gap-0.5">
        <Link
          href={`${PORTAL_INFO[portal].path}/tai-khoan`}
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          <CircleUserRound className="size-4" aria-hidden />
          Tài khoản
        </Link>
        <LogoutButton />
      </div>
    </div>
  );
}

// Avatar trên thanh trên của điện thoại (liên kết tới trang tài khoản).
export async function UserAvatarLink({ portal }: { portal: Portal }) {
  const user = await getCurrentUser();
  return (
    <Link href={`${PORTAL_INFO[portal].path}/tai-khoan`} aria-label={`Tài khoản: ${user.fullName}`} className="rounded-full focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none">
      <Avatar name={user.fullName} className="size-8 text-xs" />
    </Link>
  );
}
