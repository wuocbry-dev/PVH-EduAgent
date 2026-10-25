import type { Permission } from "@pvh/shared";
import Link from "next/link";
import { getCurrentUser } from "../api/get-current-user";

const NAV: { href: string; label: string; permission?: Permission }[] = [
  { href: "/admin", label: "Tổng quan" },
  { href: "/admin/tro-ly-ai", label: "Trợ lý AI" },
  { href: "/admin/nguoi-dung", label: "Người dùng", permission: "user:manage" },
  { href: "/admin/vai-tro", label: "Vai trò và quyền", permission: "user:manage" },
];

// Menu quản trị: chỉ hiện mục mà người dùng có quyền. Đọc phiên đăng nhập nên phải đặt trong <Suspense>.
export async function AdminNav() {
  const user = await getCurrentUser();
  const items = NAV.filter((item) => !item.permission || user.permissions.includes(item.permission));

  return (
    <nav className="flex gap-4 md:flex-col md:gap-2">
      {items.map((item) => (
        <Link key={item.href} href={item.href} className="text-sm">
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
