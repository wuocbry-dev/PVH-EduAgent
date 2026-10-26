import { PORTAL_INFO, type Portal } from "@pvh/shared";
import Link from "next/link";
import { getCurrentUser } from "../api/get-current-user";

// Menu của cổng: chỉ hiện mục mà người dùng có quyền. Đọc phiên đăng nhập nên phải đặt trong <Suspense>.
export async function PortalNav({ portal }: { portal: Portal }) {
  const user = await getCurrentUser();
  const { path, nav } = PORTAL_INFO[portal];
  const items = nav.filter((item) => !item.permissions || item.permissions.some((p) => user.permissions.includes(p)));
  const size = portal === "hoc-sinh" ? "text-base" : "text-sm";

  return (
    <nav aria-label={`Menu ${PORTAL_INFO[portal].name}`} className="flex flex-wrap gap-x-4 gap-y-2 md:flex-col md:gap-2">
      {items.map((item) => (
        <Link key={item.slug} href={item.slug ? `${path}/${item.slug}` : path} className={size}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
