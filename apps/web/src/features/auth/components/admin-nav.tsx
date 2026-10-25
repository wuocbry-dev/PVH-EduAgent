import type { Permission } from "@pvh/shared";
import Link from "next/link";
import { getCurrentUser } from "../api/get-current-user";

// permissions: hiện mục khi người dùng có ít nhất một quyền trong danh sách; không khai báo thì hiện cho mọi người.
const NAV: { href: string; label: string; permissions?: Permission[] }[] = [
  { href: "/admin", label: "Tổng quan" },
  { href: "/admin/bai-viet", label: "Bài viết", permissions: ["post:create"] },
  { href: "/admin/chuyen-muc", label: "Chuyên mục", permissions: ["post:approve"] },
  { href: "/admin/lien-he", label: "Liên hệ", permissions: ["post:approve"] },
  { href: "/admin/cong-viec", label: "Công việc", permissions: ["task:read:own", "task:read:all"] },
  { href: "/admin/lich", label: "Lịch sự kiện" },
  { href: "/admin/tro-ly-ai", label: "Trợ lý AI" },
  { href: "/admin/nguoi-dung", label: "Người dùng", permissions: ["user:manage"] },
  { href: "/admin/vai-tro", label: "Vai trò và quyền", permissions: ["user:manage"] },
];

// Menu quản trị: chỉ hiện mục mà người dùng có quyền. Đọc phiên đăng nhập nên phải đặt trong <Suspense>.
export async function AdminNav() {
  const user = await getCurrentUser();
  const items = NAV.filter((item) => !item.permissions || item.permissions.some((p) => user.permissions.includes(p)));

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
