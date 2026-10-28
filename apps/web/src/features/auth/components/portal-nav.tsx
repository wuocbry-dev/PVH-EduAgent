import { PORTAL_INFO, type Portal } from "@pvh/shared";
import { getCurrentUser } from "../api/get-current-user";
import { PortalNavLinks } from "./portal-nav-links";

// Menu của cổng: chỉ hiện mục mà người dùng có quyền. Đọc phiên đăng nhập nên phải đặt trong <Suspense>.
export async function PortalNav({ portal }: { portal: Portal }) {
  const user = await getCurrentUser();
  const { path, nav, name } = PORTAL_INFO[portal];
  const items = nav.filter((item) => !item.permissions || item.permissions.some((p) => user.permissions.includes(p)));

  return (
    <nav aria-label={`Menu ${name}`}>
      <PortalNavLinks path={path} items={items} large={portal === "hoc-sinh"} />
    </nav>
  );
}
